#!/usr/bin/env node
// Browser smoke test for the editor: starts a document server on contracts/, drives headless
// Chrome over the DevTools protocol with real keyboard input, and checks what the editor does.
// Run with `yarn build && yarn test:browser`. Set CHROME to the Chrome binary if it is not in the
// usual place; without Chrome the test is skipped.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { startServer } = await import(path.join(root, 'packages/server/dist/src/index.js'))
const TALLY = 'baguqeera56bfnrqnf54kmd3c6ovga3mbinfdkwrdqwks6mntqpez22cjszea'

const chromePath = process.env.CHROME ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => existsSync(p))
if (!chromePath) { console.log('browser test skipped: Chrome not found (set CHROME)'); process.exit(0) }

const sleep = ms => new Promise(r => setTimeout(r, ms))
const server = await startServer({ folder: path.join(root, 'contracts'), port: 0, editor: true })
const profile = mkdtempSync(path.join(tmpdir(), 'stroc-chrome-'))
const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1100,1000', 'about:blank'], { stdio: 'ignore' })

let failures = 0
const results = []
function check(name, ok, detail = '') {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`)
  if (!ok) failures++
}

try {
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page') } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Chrome did not start')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  const js = async expr => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { const e = document.querySelector('stroc-editor'); const r = e?.shadowRoot; ${expr} })()`, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
    return r.result?.result?.value
  }
  const type = text => send('Input.insertText', { text })
  const key = async (k, modifiers = 0) => {
    const codes = { Enter: 13, Backspace: 8, Tab: 9, b: 66, k: 75, e: 69 }
    const base = { key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, windowsVirtualKeyCode: codes[k], modifiers }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(k === 'Enter' ? { text: '\r' } : {}) })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  }
  const META = process.platform === 'darwin' ? 4 : 2, SHIFT = 8
  const waitFor = async (expr, ms = 5000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(100)) if (await js(`return ${expr}`)) return true; return false }

  await send('Runtime.enable')
  await send('Page.navigate', { url: `${server.url}/editor/?cid=${TALLY}` })
  await sleep(500)

  // 1. Opening by CID, includes, validity
  check('opens a document by CID and shows its CID', await waitFor(`e?.cid === '${TALLY}'`))
  check('loads and verifies all nine includes', await waitFor(`r.querySelectorAll('.inc-info .badge.good').length >= 9`, 8000))

  // 2. Typing changes the document and its CID
  await js(`r.querySelector('stroc-paragraph[data-key=doc]').focusAt('end')`)
  await type(' Added.')
  check('typing updates the document', await waitFor(`e.doc.text.endsWith('Parties. Added.')`))
  check('the CID follows the text', await waitFor(`e.cid && e.cid !== '${TALLY}'`))

  // 3. Enter splits, Backspace at the start joins
  const before = await js(`return e.doc.sections.length`)
  await key('Enter')
  await type('New paragraph.')
  check('Enter starts a new paragraph section', await waitFor(`e.doc.sections.length === ${before + 1} && e.doc.sections[0].text === 'New paragraph.'`))
  await sleep(300)
  await js(`r.querySelector('stroc-paragraph[data-key="' + e.doc.sections[0].key + '"]').focusAt('start')`)
  await key('Backspace')
  check('Backspace at the start joins it to the paragraph before', await waitFor(`e.doc.sections.length === ${before} && e.doc.text.endsWith('Added. New paragraph.')`))

  // 4. Bold through the keyboard is saved as canonical markup
  await js(`e.doc.sections.push({ key: 't1', title: 'Terms', text: 'Pay within ten days.', sections: [] }, { key: 't2', text: 'Second paragraph.', sections: [] }); e.version++`)
  await sleep(200)
  await js(`const box = r.querySelector('stroc-paragraph[data-key=t1] .para'); box.focus(); const t = box.firstChild; const range = document.createRange(); range.setStart(t, 11); range.setEnd(t, 19); const sel = r.getSelection?.() ?? document.getSelection(); sel.removeAllRanges(); sel.addRange(range)`)
  await key('b', META)
  check('⌘B bolds the selection as canonical markup', await waitFor(`e.doc.sections.find(s => s.key === 't1').text === 'Pay within <b>ten days</b>.'`))

  // 5. Tab indents, Shift+Tab outdents
  await js(`r.querySelector('stroc-paragraph[data-key=t2]').focusAt('end')`)
  await key('Tab')
  check('Tab indents under the section above', await waitFor(`e.doc.sections.find(s => s.key === 't1').sections[0]?.key === 't2'`))
  await sleep(300)   // the editor returns the caret to the moved paragraph
  await key('Tab', SHIFT)
  check('Shift+Tab outdents', await waitFor(`e.doc.sections.at(-1).key === 't2'`))
  await sleep(300)

  // 6. The reference picker inserts a reference with its live number
  await key('k', META)
  check('⌘K opens the reference picker', await waitFor(`r.querySelector('.dialog h2')?.textContent.includes('Insert a reference')`))
  await js(`[...r.querySelectorAll('.dialog tbody tr')].find(tr => tr.cells[1].innerText.trim() === 'Terms').click()`)
  const picked = await waitFor(`e.doc.sections.find(s => s.key === 't1').id === 'terms' && e.doc.sections.at(-1).text.includes('<ref:terms>')`)
  check('picking a section gives it an id and inserts the reference', picked, picked ? '' : JSON.stringify(await js(`return [e.doc.sections.find(s => s.key === 't1').id, e.doc.sections.at(-1).key, e.doc.sections.at(-1).text]`)))
  check('the reference shows its live number', await waitFor(`/Section \\d+/.test(r.querySelector('stroc-paragraph[data-key=t2]').innerText)`))
  check('the document is still valid', await waitFor(`r.querySelector('.status').innerText.includes('Valid')`))

  // 7. Preview hides the editing controls
  await key('e', META)
  check('Preview hides the editing controls', await waitFor(`e.hasAttribute('preview') && !r.querySelector('.formatbar') && r.querySelector('.para').contentEditable === 'false'`))
  await key('e', META)

  // 8. Open from Sources lists the catalog
  await js(`e.showOpen('open')`)
  check('Open from Sources lists the catalog', await waitFor(`r.querySelectorAll('.dialog tbody tr').length === 13`))

  ws.close()
} catch (err) {
  check('browser test ran', false, err.message)
} finally {
  chrome.kill()
  server.close()
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
}

console.log(results.join('\n'))
console.log(failures ? `${failures} failed` : `all ${results.length} passed`)
process.exit(failures ? 1 : 0)
