import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const TALLY = 'baguqeera56bfnrqnf54kmd3c6ovga3mbinfdkwrdqwks6mntqpez22cjszea'

// Read state from the editor component.
const doc = (page: Page) => page.evaluate(() => (document.querySelector('stroc-editor') as unknown as { doc: { text?: string, sections: { key: string, id?: string, title?: string, text?: string, sections: unknown[] }[] } }).doc)
const cid = (page: Page) => page.evaluate(() => (document.querySelector('stroc-editor') as unknown as { cid?: string }).cid)
const para = (page: Page, key: string) => page.locator(`stroc-paragraph[data-key="${key}"] [data-test="text"]`)

// Put the caret in a paragraph (then type with the real keyboard).
async function caret(page: Page, key: string, where: 'start' | 'end') {
  await para(page, key).click()
  await page.evaluate(([k, w]) => {
    const p = document.querySelector(`stroc-paragraph[data-key="${k}"]`) as unknown as { focusAt(w: string): void }
    p.focusAt(w)
  }, [key, where] as const)
}

// Add plain sections for a test, keyed so they can be found.
async function seed(page: Page, sections: { key: string, title?: string, text?: string }[]) {
  await page.evaluate(s => {
    const e = document.querySelector('stroc-editor') as unknown as { doc: { sections: unknown[] }, version: number }
    e.doc.sections.push(...s.map(x => ({ ...x, sections: [] })))
    e.version++
  }, sections)
  await expect(para(page, sections[0].key)).toBeVisible()
}

test.describe('the editor', () => {
  test('opens a document by CID, with its includes verified', async ({ page }) => {
    await page.goto(`/editor/?cid=${TALLY}`)
    await expect.poll(() => cid(page)).toBe(TALLY)
    await expect(page.getByTestId('include-verified')).toHaveCount(9)
    await expect(page.getByTestId('valid')).toBeVisible()
  })

  test('typing, Enter and Backspace edit the text and the CID follows', async ({ page }) => {
    await page.goto(`/editor/?cid=${TALLY}`)
    await expect.poll(() => cid(page)).toBe(TALLY)
    await caret(page, 'doc', 'end')
    await page.keyboard.type(' Added.')
    await expect.poll(async () => (await doc(page)).text?.endsWith('Parties. Added.')).toBe(true)
    await expect.poll(() => cid(page)).not.toBe(TALLY)

    const count = (await doc(page)).sections.length
    await page.keyboard.press('Enter')
    await page.keyboard.type('New paragraph.')
    await expect.poll(async () => (await doc(page)).sections[0].text).toBe('New paragraph.')
    expect((await doc(page)).sections.length).toBe(count + 1)

    await caret(page, (await doc(page)).sections[0].key, 'start')
    await page.keyboard.press('Backspace')
    await expect.poll(async () => (await doc(page)).sections.length).toBe(count)
    expect((await doc(page)).text).toMatch(/Added\. New paragraph\.$/)
  })

  test('bold from the keyboard is saved as canonical markup', async ({ page }) => {
    await page.goto('/editor/')
    await seed(page, [{ key: 't1', title: 'Terms', text: 'Pay within ten days.' }])
    await para(page, 't1').click()
    await page.evaluate(() => {
      const box = document.querySelector('stroc-paragraph[data-key="t1"] [data-test="text"]')!
      const range = document.createRange()
      range.setStart(box.firstChild!, 11)
      range.setEnd(box.firstChild!, 19)
      const sel = document.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
    })
    await page.keyboard.press('ControlOrMeta+b')
    await expect.poll(async () => (await doc(page)).sections[0].text).toBe('Pay within <b>ten days</b>.')
  })

  test('Tab and Shift+Tab indent and outdent', async ({ page }) => {
    await page.goto('/editor/')
    await seed(page, [{ key: 'a', title: 'A', text: 'Alpha.' }, { key: 'b', text: 'Beta.' }])
    await caret(page, 'b', 'end')
    await page.keyboard.press('Tab')
    await expect.poll(async () => (await doc(page)).sections.length).toBe(1)
    await expect(para(page, 'b')).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect.poll(async () => (await doc(page)).sections.map(s => s.key)).toEqual(['a', 'b'])
  })

  test('dragging a section by its grip moves it', async ({ page }) => {
    await page.goto('/editor/')
    await seed(page, [{ key: 'a', title: 'A', text: 'Alpha.' }, { key: 'b', title: 'B', text: 'Beta.' }, { key: 'c', title: 'C', text: 'Gamma.' }])
    await para(page, 'c').click()       // makes c active, so its grip is the one being dragged
    const grip = page.locator('[data-sec="c"]').getByTestId('grip')
    const target = page.locator('[data-sec="a"]').getByTestId('section-row')
    const box = (await target.boundingBox())!
    await grip.dragTo(target, { targetPosition: { x: 40, y: 3 } })    // upper third: before A
    await expect.poll(async () => (await doc(page)).sections.map(s => s.key)).toEqual(['c', 'a', 'b'])
    expect(box.height).toBeGreaterThan(0)
  })

  test('the reference picker inserts a live reference and assigns an id', async ({ page }) => {
    await page.goto('/editor/')
    await seed(page, [{ key: 't1', title: 'Terms', text: 'Pay promptly.' }, { key: 't2', text: 'As stated in' }])
    await caret(page, 't2', 'end')
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByTestId('dialog-reference')).toBeVisible()
    await page.locator('[data-test="ref-row"][data-label="Terms"]').click()
    await expect.poll(async () => (await doc(page)).sections[1].text).toBe('As stated in <ref:terms>')
    expect((await doc(page)).sections[0].id).toBe('terms')
    await expect(para(page, 't2')).toContainText('Section 1')
  })

  test('undo and redo cover typing and structure, and typing undoes as one step', async ({ page }) => {
    await page.goto('/editor/')
    await seed(page, [{ key: 'a', title: 'A', text: 'Alpha.' }, { key: 'b', text: 'Beta.' }])
    await page.evaluate(() => (document.querySelector('stroc-editor') as unknown as { record(): void }).record())   // seeded state
    await caret(page, 'b', 'end')
    await page.keyboard.type(' More text typed here.')
    await expect.poll(async () => (await doc(page)).sections[1].text).toBe('Beta. More text typed here.')
    await page.keyboard.press('Tab')
    await expect.poll(async () => (await doc(page)).sections.length).toBe(1)

    await page.keyboard.press('ControlOrMeta+z')          // undo the indent
    await expect.poll(async () => (await doc(page)).sections.map(s => s.key)).toEqual(['a', 'b'])
    expect((await doc(page)).sections[1].text).toBe('Beta. More text typed here.')
    await page.keyboard.press('ControlOrMeta+z')          // undo the typing, as one step
    await expect.poll(async () => (await doc(page)).sections[1].text).toBe('Beta.')
    await expect(para(page, 'b')).toHaveText('Beta.')

    await page.keyboard.press('ControlOrMeta+Shift+z')    // redo the typing
    await expect.poll(async () => (await doc(page)).sections[1].text).toBe('Beta. More text typed here.')
    await page.keyboard.press('ControlOrMeta+Shift+z')    // redo the indent
    await expect.poll(async () => (await doc(page)).sections.length).toBe(1)
  })

  // Paste through a synthetic clipboard event (the system clipboard is not available to all engines).
  async function paste(page: Page, data: Record<string, string>) {
    await page.evaluate(d => {
      // Engines differ in what synthetic clipboard data they allow; the editor only calls getData.
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'clipboardData', { value: { getData: (t: string) => d[t] ?? '' } })
      document.activeElement!.dispatchEvent(ev)
    }, data)
  }

  test('paste keeps bold, italic and underline, and drops the rest', async ({ page }) => {
    await page.goto('/editor/')
    await seed(page, [{ key: 'a', text: 'Start:' }])
    await caret(page, 'a', 'end')
    await paste(page, { 'text/html': '<span style="color:red"> the <strong>Stock Holder</strong> shall <em>not</em> <a href="x">transfer</a> <font face="Arial"><u>anything</u></font>.</span>', 'text/plain': 'x' })
    await expect.poll(async () => (await doc(page)).sections[0].text).toBe('Start: the <b>Stock Holder</b> shall <i>not</i> transfer <u>anything</u>.')
  })

  test('pasting several paragraphs creates paragraph sections', async ({ page }) => {
    await page.goto('/editor/')
    await seed(page, [{ key: 'a', text: 'Before after.' }, { key: 'z', text: 'Last.' }])
    await caret(page, 'a', 'start')
    // Pasted text joins exactly where the caret is, as in a word processor: no spaces are invented.
    await page.evaluate(() => (document.querySelector('stroc-paragraph[data-key="a"]') as unknown as { focusAt(n: number): void }).focusAt(7))   // "Before |after."
    await paste(page, { 'text/html': '<p>One <b>bold</b>.</p><p>Two.</p><p>Three</p>' })
    await expect.poll(async () => (await doc(page)).sections.map(s => s.text)).toEqual(['Before One <b>bold</b>.', 'Two.', 'Threeafter.', 'Last.'])
    await paste(page, { 'text/plain': 'Line one\nLine two' })
    await expect.poll(async () => (await doc(page)).sections.length).toBe(5)
  })

  test('exports the composed document as PDF', async ({ page }) => {
    await page.goto(`/editor/?cid=${TALLY}`)
    await expect(page.getByTestId('include-verified')).toHaveCount(9)
    await page.getByTestId('menu-file').click()
    const download = page.waitForEvent('download')
    await page.getByTestId('cmd-pdf-a4').click()
    const file = await download
    expect(file.suggestedFilename()).toBe('MyCHIPS_Tally_Agreement.pdf')
    const pdf = readFileSync((await file.path())!).toString('latin1')
    expect(pdf.startsWith('%PDF-')).toBe(true)
    expect(pdf).toContain(TALLY)
    expect(pdf.match(/\/Type \/Page\b/g)!.length).toBeGreaterThanOrEqual(8)
    expect(pdf).toMatch(/NotoSerif/)
  })

  test('Preview hides the editing controls', async ({ page }) => {
    await page.goto('/editor/')
    await seed(page, [{ key: 'a', title: 'A', text: 'Alpha.' }])
    await page.keyboard.press('ControlOrMeta+e')
    await expect(page.locator('stroc-editor')).toHaveAttribute('preview', '')
    await expect(page.getByTestId('formatbar')).toHaveCount(0)
    await expect(para(page, 'a')).toHaveAttribute('contenteditable', 'false')
    // The layout keeps its width: the paragraph spans most of the document column.
    const width = (l: ReturnType<Page['locator']>) => l.first().evaluate(el => el.getBoundingClientRect().width)
    expect(await width(para(page, 'a'))).toBeGreaterThan(0.8 * await width(page.getByTestId('doc-title')))
  })

  test('Open from Sources lists the catalog and opens a document', async ({ page }) => {
    await page.goto('/editor/')
    await page.getByTestId('menu-file').click()
    await page.getByTestId('cmd-open-sources').click()
    await expect(page.getByTestId('catalog-row')).toHaveCount(13)
    await page.getByTestId('catalog-row').filter({ hasText: 'Ethical Conduct' }).click()
    await expect(page.getByTestId('doc-title')).toHaveValue('Ethical Conduct')
    expect(new URL(page.url()).searchParams.get('cid')).toMatch(/^baguqeera/)
  })
})
