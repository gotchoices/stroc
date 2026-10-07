// The sample library in contracts/: every document is valid, and every include links to the
// current CID of another document in the folder (what `stroc status` will report on in general).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { documentCid, type StrocSection } from '@stroc/core'
import { lintYaml } from '../src/index.js'

const dir = new URL('../../../contracts/', import.meta.url)
const files = readdirSync(dir).filter(f => f.endsWith('.yaml') && !f.startsWith('.')).sort()

describe('sample library (contracts/)', () => {
  it('has the converted MyCHIPs documents', () => {
    expect(files.length).toBe(13)
  })

  const docs = new Map<string, unknown>()
  for (const file of files) {
    it(`${file} is valid`, () => {
      const r = lintYaml(readFileSync(new URL(file, dir), 'utf8'))
      expect(r.problems).toEqual([])
      docs.set(file, r.value)
    })
  }

  it('every include links to the current CID of a document in the folder', async () => {
    const cids = new Map<string, string>()
    for (const [file, doc] of docs) cids.set(String((await documentCid(doc)).cid), file)
    const links: string[] = []
    const walk = (secs?: StrocSection[]) => secs?.forEach(s =>
      'source' in s ? links.push(String(s.source)) : walk(s.sections))
    for (const doc of docs.values()) walk((doc as { sections?: StrocSection[] }).sections)
    expect(links.length).toBe(15)
    for (const link of links) expect(cids.has(link), `no document in contracts/ has CID ${link}`).toBe(true)
  })
})
