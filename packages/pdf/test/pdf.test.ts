import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fromPlain } from '@stroc/core'
import { MemoryStore, compose } from '@stroc/compose'
import { layout, toPdfDefinition, type Layout } from '@stroc/render'
import { toPdf } from '../src/index.js'

const fixture = (name: string) => fromPlain(JSON.parse(readFileSync(
  new URL(`../../core/test/fixtures/${name}.json`, import.meta.url), 'utf8'))).value

async function contractLayout(options = {}): Promise<Layout> {
  const store = new MemoryStore()
  await store.putDocument(fixture('clause'))
  const c = await compose(await store.putDocument(fixture('contract')), store)
  return layout(c, { data: { 'stock-name': 'Acme Widgets LLC', 'foil-name': 'Jane Doe' }, options }).layout!
}

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')

describe('toPdfDefinition', () => {
  it('lays out every block, sections with their numbers', async () => {
    const def = toPdfDefinition(await contractLayout())
    const json = JSON.stringify(def.content)
    expect(json).toContain('"style":"title"')
    expect(json).toContain('"style":"particularsHeading"')
    for (const n of ['1.', '1.1.', '1.2.', '1.3.', '1.4.', '2.']) expect(json).toContain(`"text":"${n}"`)
    expect(json).toContain('"text":"Section 1.2"')
    expect(json).toContain('"text":"10 days","bold":true')
  })
  it('puts the document CID and page numbers in every footer', async () => {
    const l = await contractLayout()
    const footer = JSON.stringify(toPdfDefinition(l).footer(3, 8))
    expect(footer).toContain(l.cid)
    expect(footer).toContain('3 / 8')
  })
  it('marks drafts and honours the page size', async () => {
    expect(toPdfDefinition(await contractLayout()).watermark).toBeUndefined()
    expect(toPdfDefinition(await contractLayout({ draft: true })).watermark).toMatchObject({ text: 'DRAFT' })
    expect(toPdfDefinition(await contractLayout(), { pageSize: 'A4' }).pageSize).toBe('A4')
  })
  it('refers to no external resources', async () => {
    const json = JSON.stringify(toPdfDefinition(await contractLayout({ cidQr: true })).content)
      .replaceAll('xmlns=\\"http://www.w3.org/2000/svg\\"', '')   // the SVG namespace is a name, never fetched
    expect(json).toContain('"svg"')
    expect(json).not.toMatch(/https?:|file:|"image"/)
  })
})

describe('toPdf', () => {
  it('writes a PDF with the document metadata', async () => {
    const l = await contractLayout({ cidQr: true })
    const pdf = text(await toPdf(l))
    expect(pdf.startsWith('%PDF-')).toBe(true)
    expect(pdf).toContain(`Stroc document ${l.cid}`)
    expect(pdf.match(/\/Type \/Page\b/g)?.length).toBe(1)
    expect(pdf).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSerif-Bold/)   // embedded (subset) by default
    expect(pdf).toContain('NotoSansMono')
  })
  it('can use the non-embedded standard fonts instead', async () => {
    const pdf = text(await toPdf(await contractLayout(), { standardFonts: true }))
    expect(pdf).toContain('/BaseFont /Times-Bold')
    expect(pdf).not.toContain('NotoSerif')
  })
  it('paginates a long contract', async () => {
    const { lintYaml } = await import('@stroc/yaml')
    const dir = new URL('../../../contracts/', import.meta.url)
    const store = new MemoryStore()
    const { readdirSync } = await import('node:fs')
    for (const f of readdirSync(dir).filter(f => f.endsWith('.yaml') && !f.startsWith('.'))) {
      await store.putDocument(lintYaml(readFileSync(new URL(f, dir), 'utf8')).value)
    }
    const c = await compose('baguqeera56bfnrqnf54kmd3c6ovga3mbinfdkwrdqwks6mntqpez22cjszea', store)
    const pdf = text(await toPdf(layout(c).layout!))
    expect(pdf.match(/\/Type \/Page\b/g)!.length).toBeGreaterThanOrEqual(7)
  })
})
