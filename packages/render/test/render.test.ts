import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fromPlain } from '@stroc/core'
import { MemoryStore, compose } from '@stroc/compose'
import { lintYaml } from '@stroc/yaml'
import { checkData, layout, toHtml, qrModules, documentUrl, type LayoutBlock } from '../src/index.js'

const fixture = (name: string) => fromPlain(JSON.parse(readFileSync(
  new URL(`../../core/test/fixtures/${name}.json`, import.meta.url), 'utf8'))).value

async function contract() {
  const store = new MemoryStore()
  await store.putDocument(fixture('clause'))
  return compose(await store.putDocument(fixture('contract')), store)
}

const DATA = { 'stock-name': 'Acme Widgets LLC', 'foil-name': 'Jane Doe' }

describe('checkData', () => {
  it('accepts complete data, using defaults for the rest', async () => {
    expect(checkData(await contract(), DATA)).toEqual([])
  })
  it('reports missing, unknown and bad values', async () => {
    const problems = checkData(await contract(), { 'stock-name': '', extra: 'x' })
    expect(problems.map(p => `${p.path[0]}:${p.code}`)).toEqual([
      'stock-name:bad-value', 'extra:unknown-parameter', 'foil-name:missing-value',
    ])
  })
})

describe('layout', () => {
  it('refuses to render with problems unless draft', async () => {
    const doc = await contract()
    expect(layout(doc).layout).toBeUndefined()
    const draft = layout(doc, { options: { draft: true } })
    expect(draft.layout?.draft).toBe(true)
    expect(draft.problems.map(p => p.code)).toEqual(['missing-value', 'missing-value'])
  })

  it('lays out title, particulars, preamble and numbered sections', async () => {
    const l = layout(await contract(), { data: DATA }).layout!
    const kinds = l.blocks.map(b => b.kind)
    expect(kinds.slice(0, 3)).toEqual(['title', 'particulars', 'preamble'])
    const particulars = l.blocks[1] as Extract<LayoutBlock, { kind: 'particulars' }>
    expect(particulars.groups[0].rows).toEqual([
      { label: 'Stock Holder', value: 'Acme Widgets LLC', supplied: true },
      { label: 'Foil Holder', value: 'Jane Doe', supplied: true },
      { label: 'Maximum Balance', value: '24', supplied: false },
    ])
    const sections = l.blocks.filter(b => b.kind === 'section') as Extract<LayoutBlock, { kind: 'section' }>[]
    expect(sections.map(s => s.number)).toEqual(['1.', '1.1.', '1.2.', '1.3.', '1.4.', '2.'])
    expect(sections[0]).toMatchObject({ title: 'Duties of the Parties', depth: 1, cid: 'baguqeerarfba72wstizzz3quu2bhl4lpk2oisbwmwe6zahewpa4ewtuzub6q' })
    expect(sections[1].depth).toBe(2)
  })

  it('renders references as section numbers and keeps emphasis', async () => {
    const l = layout(await contract(), { data: DATA }).layout!
    const preamble = l.blocks[2] as Extract<LayoutBlock, { kind: 'preamble' }>
    expect(preamble.runs.at(-2)).toEqual({ text: 'Section\u00A01.2', ref: true })
    const cure = l.blocks.find(b => b.kind === 'section' && b.number === '1.3.') as Extract<LayoutBlock, { kind: 'section' }>
    expect(cure.runs).toContainEqual({ text: 'Section\u00A01.2', ref: true })
    expect(cure.runs).toContainEqual({ text: '10 days', bold: true })
  })

  it('uses supplied labels', async () => {
    const l = layout(await contract(), { data: DATA, options: { labels: { section: 'Article' } } }).layout!
    expect(JSON.stringify(l.blocks)).toContain('Article\u00A01.2')
  })

  it('places app blocks after the document, and the CID QR last', async () => {
    const l = layout(await contract(), {
      data: DATA,
      blocks: [{ kind: 'table', title: 'Signatures', rows: [['Stock', 'sig1']] }, { kind: 'qr', value: 'sig1', caption: 'Stock signature' }],
      options: { cidQr: true },
    }).layout!
    expect(l.blocks.slice(-3).map(b => b.kind)).toEqual(['app-table', 'qr', 'qr'])
    const last = l.blocks.at(-1) as Extract<LayoutBlock, { kind: 'qr' }>
    expect(last.value).toBe(l.cid)
  })
})

describe('toHtml', () => {
  it('produces a standalone page with the CID in the footer', async () => {
    const l = layout(await contract(), { data: DATA }).layout!
    const html = toHtml(l)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<h1>Tally Agreement</h1>')
    expect(html).toContain('<span class="ref">Section\u00A01.2</span>')
    expect(html).toContain('<strong>10 days</strong>')
    expect(html).toContain(`<footer class="stroc-footer">Document ${l.cid}</footer>`)
    expect(html).toContain('<td class="supplied">Acme Widgets LLC</td>')
  })
  it('escapes everything from documents and data', async () => {
    const store = new MemoryStore()
    const root = await store.putDocument({ stroc: '1.0', language: 'en', title: 'A <script>x</script> title', text: 'Literal \\< and & "quotes"' })
    const html = toHtml(layout(await compose(root, store), { data: {} }).layout!)
    expect(html).not.toContain('<script>')
    expect(html).toContain('A &lt;script&gt;x&lt;/script&gt; title')
    expect(html).toContain('Literal &lt; and &amp; &quot;quotes&quot;')
  })
})

describe('template view', () => {
  it('prints missing required values as blanks instead of refusing', async () => {
    const r = layout(await contract(), { options: { template: true } })
    expect(r.problems).toEqual([])
    const p = r.layout!.blocks[1] as Extract<LayoutBlock, { kind: 'particulars' }>
    expect(p.groups[0].rows[0]).toEqual({ label: 'Stock Holder', value: '________________', supplied: false })
    expect(r.layout!.draft).toBe(false)
  })
  it('still refuses composition problems', async () => {
    const store = new MemoryStore()
    const c = await compose(await store.putDocument(fixture('contract')), store)   // clause missing
    expect(layout(c, { options: { template: true } }).layout).toBeUndefined()
  })
})

describe('documentUrl and the closing QR', () => {
  const cid = 'baguqeerax7desqybsjlnvrs6p4y4o56prwmlesdwr2xqaegw4fm7n7aqmfka'
  it('fetches from the author domain when there is one', () => {
    expect(documentUrl(cid, 'mychips.org')).toBe(`https://mychips.org/ipfs/${cid}`)
    expect(documentUrl(cid, 'Bob Anderson')).toBeUndefined()
    expect(documentUrl(cid, 'Bob Anderson', 'https://ipfs.io/')).toBe(`https://ipfs.io/ipfs/${cid}`)
  })
  it('puts the URL in the QR code for a domain author', async () => {
    const store = new MemoryStore()
    const root = await store.putDocument({ stroc: '1.0', language: 'en', title: 'T', author: 'example.org' })
    const l = layout(await compose(root, store), { options: { cidQr: true } }).layout!
    const qr = l.blocks.at(-1) as Extract<LayoutBlock, { kind: 'qr' }>
    expect(qr.value).toBe(`https://example.org/ipfs/${l.cid}`)
  })
})

describe('qrModules', () => {
  it('produces a square matrix', () => {
    const m = qrModules('baguqeerax7desqybsjlnvrs6p4y4o56prwmlesdwr2xqaegw4fm7n7aqmfka')
    expect(m.length).toBeGreaterThan(20)
    expect(m.every(row => row.length === m.length)).toBe(true)
  })
})

describe('the sample Tally Contract', () => {
  it('composes and renders with all nine includes', async () => {
    const dir = new URL('../../../contracts/', import.meta.url)
    const store = new MemoryStore()
    for (const f of readdirSync(dir).filter(f => f.endsWith('.yaml') && !f.startsWith('.'))) {
      await store.putDocument(lintYaml(readFileSync(new URL(f, dir), 'utf8')).value)
    }
    const root = await store.putDocument(lintYaml(readFileSync(new URL('Tally_Contract.yaml', dir), 'utf8')).value)
    expect(root.toString()).toBe('baguqeerax7desqybsjlnvrs6p4y4o56prwmlesdwr2xqaegw4fm7n7aqmfka')
    const c = await compose(root, store)
    expect(c.problems).toEqual([])
    expect(c.sections.map(s => s.title)).toEqual([
      'Purpose of The Contract', 'Community Values', 'What a Tally is and How it Works', 'Defining a CHIP',
      'Ethical Conduct', 'Duties of the Parties to Each Other', 'General Representations of the Parties',
      'Contract Breaches and Conditions of Default', 'Credit Terms and Conditions',
    ])
    const html = toHtml(layout(c).layout!)
    expect(html.match(/class="section"/g)?.length).toBe(94)
  })

  // REGRESSION: the semantic outline of the rendered sample contract. A change here means
  // composition, numbering, titles or include CIDs changed; review the diff and, if intended,
  // update with `yarn workspace @stroc/render test -u`. Styling changes cannot affect it.
  it('lays out the same outline as before', async () => {
    const dir = new URL('../../../contracts/', import.meta.url)
    const store = new MemoryStore()
    for (const f of readdirSync(dir).filter(f => f.endsWith('.yaml') && !f.startsWith('.'))) {
      await store.putDocument(lintYaml(readFileSync(new URL(f, dir), 'utf8')).value)
    }
    const c = await compose('baguqeerax7desqybsjlnvrs6p4y4o56prwmlesdwr2xqaegw4fm7n7aqmfka', store)
    const outline = layout(c, { options: { cidQr: true } }).layout!.blocks.map(b =>
      b.kind === 'section' ? `${b.number} ${b.title ?? '¶'}${b.cid ? ` [${b.cid}]` : ''}${b.runs?.some(r => r.ref) ? ' (refs)' : ''}`
      : b.kind === 'qr' ? `qr ${b.value}`
      : b.kind)
    expect(outline).toMatchSnapshot()
  })
})

describe('placeholders', () => {
  async function template() {
    const store = new MemoryStore()
    return compose(await store.putDocument(fixture('template')), store)
  }
  const runsOf = (l: { blocks: LayoutBlock[] }) => l.blocks.flatMap(b => b.kind === 'preamble' || (b.kind === 'section' && b.runs) ? (b as { runs: { text: string, param?: string, bold?: boolean }[] }).runs : [])

  it('shows supplied values and defaults in place, marked', async () => {
    const l = layout(await template(), { data: { owner: 'Acme Rentals', renter: 'Jane Doe', 'weekly-rent': '$120' } }).layout!
    const params = runsOf(l).filter(r => r.param)
    expect(params).toEqual([
      { text: 'Acme Rentals', param: 'supplied' },
      { text: 'Jane Doe', param: 'supplied' },
      { text: '$120', param: 'supplied', bold: true },
      { text: '$500', param: 'default' },
    ])
    expect(toHtml(l)).toContain('<strong><span class="param supplied">$120</span></strong>')
  })
  it('shows [Label] where a template has no value', async () => {
    const l = layout(await template(), { options: { template: true } }).layout!
    expect(runsOf(l).filter(r => r.param).map(r => r.text)).toEqual(['[Owner]', '[Renter]', '[Weekly Rent]', '$500'])
  })
  it('fills a placeholder in an included clause by its path', async () => {
    const store = new MemoryStore()
    const clause = await store.putDocument(fixture('template'))
    const root = await store.putDocument({ stroc: '1.0', language: 'en', title: 'Master', sections: [{ id: 'rental', source: clause }] })
    const l = layout(await compose(root, store), { data: { 'rental/owner': 'A', 'rental/renter': 'B', 'rental/weekly-rent': 'C' } }).layout!
    expect(runsOf(l).filter(r => r.param).map(r => r.text)).toEqual(['A', 'B', 'C', '$500'])
  })
})
