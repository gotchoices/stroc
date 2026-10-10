// Collections: the publisher's named lists in the catalog, so an app can tell the contracts it
// should offer from the clauses they include.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { documentCid, fromPlain } from '@stroc/core'
import { stringifyDocument } from '@stroc/yaml'
import { fetchCatalog, collectionEntries, parseCatalog } from '@stroc/compose'
import { startServer, loadLibrary, buildCatalog } from '../src/index.js'

const base = { stroc: '1.0', language: 'en' }
const cidOf = async (d: unknown) => String((await documentCid(d)).cid)

describe('collections in the catalog', () => {
  let dir: string
  let server: Awaited<ReturnType<typeof startServer>>
  const c: Record<string, string> = {}

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'stroc-collections-'))
    const clause = { ...base, title: 'A Clause', author: 'example.org', text: 'Shared terms.' }
    c.clause = await cidOf(clause)
    // The contract's history: v1 (only in the folder tools' record and archive), v2 (named by
    // v3's replaces, also archived), v3 (the file as it is now).
    const v1 = { ...base, title: 'Contract', author: 'example.org', text: 'First wording.' }
    const v2 = { ...base, title: 'Contract', author: 'example.org', text: 'Second wording.' }
    c.v1 = await cidOf(v1); c.v2 = await cidOf(v2)
    const v3 = fromPlain({ ...base, title: 'Contract', author: 'example.org', text: 'Third wording.',
      replaces: [{ '/': c.v2 }], sections: [{ id: 'clause', source: { '/': c.clause } }] }).value
    c.v3 = await cidOf(v3)
    const theirs = { ...base, title: 'Their Contract', author: 'other.org' }
    const retired = { ...base, title: 'Retired Contract', author: 'example.org' }
    c.theirs = await cidOf(theirs); c.retired = await cidOf(retired)

    writeFileSync(path.join(dir, 'clause.yaml'), stringifyDocument(clause))
    writeFileSync(path.join(dir, 'contract.yaml'), stringifyDocument(v3))
    writeFileSync(path.join(dir, 'theirs.yaml'), stringifyDocument(theirs))
    writeFileSync(path.join(dir, 'retired.yaml'), stringifyDocument(retired))
    mkdirSync(path.join(dir, '.stroc-archive'))
    for (const v of [v1, v2]) {
      const { cid, bytes } = await documentCid(v)
      writeFileSync(path.join(dir, '.stroc-archive', `${cid}.json`), bytes!)
    }
    writeFileSync(path.join(dir, '.stroc-record.json'), JSON.stringify({ files: { 'contract.yaml': { cid: c.v3, previous: [c.v1, c.v2] } } }))
    writeFileSync(path.join(dir, '.stroc.yaml'), [
      'domain: example.org',
      `endorse: [${c.theirs}]`,
      `withdrawn: [${c.retired}]`,
      'collections:',
      `  tally-contracts: [contract.yaml, ${c.theirs}, retired.yaml]`,
      '  examples: [contract.yaml]',
    ].join('\n') + '\n')
    server = await startServer({ folder: dir, port: 0 })
  })
  afterAll(() => { server.close(); rmSync(dir, { recursive: true }) })

  it('lists the contracts to offer, and not the clauses they include', async () => {
    const { catalog, error } = await fetchCatalog(server.url)
    expect(error).toBeUndefined()
    expect(catalog!['stroc-catalog']).toBe('1.1')
    expect(collectionEntries(catalog!, 'tally-contracts').map(e => e.cid).sort()).toEqual([c.v3, c.theirs].sort())
    expect(catalog!.entries.find(e => e.cid === c.clause)?.collections).toBeUndefined()
    expect(collectionEntries(catalog!, 'nothing-here')).toEqual([])
  })
  it('keeps earlier versions in the collection, marked superseded', async () => {
    const { catalog } = await fetchCatalog(server.url)
    const all = collectionEntries(catalog!, 'tally-contracts', { all: true })
    const by = Object.fromEntries(all.map(e => [e.cid, e]))
    expect(Object.keys(by).sort()).toEqual([c.v1, c.v2, c.v3, c.theirs, c.retired].sort())
    expect(by[c.v1]).toMatchObject({ status: 'superseded', collections: ['examples', 'tally-contracts'] })
    expect(by[c.v2].status).toBe('superseded')
    expect(by[c.retired].status).toBe('withdrawn')
    expect(by[c.theirs].role).toBe('endorse')
  })
  it('shows collections on the index page', async () => {
    const html = await (await fetch(server.url)).text()
    expect(html).toContain('examples, tally-contracts')
  })
})

describe('collection configuration errors', () => {
  const folder = async (config: string) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'stroc-collections-bad-'))
    writeFileSync(path.join(dir, 'a.yaml'), stringifyDocument({ ...base, title: 'A', author: 'example.org' }))
    writeFileSync(path.join(dir, '.stroc.yaml'), `domain: example.org\n${config}`)
    try { return await loadLibrary(dir) } finally { rmSync(dir, { recursive: true }) }
  }
  it('names the problem', async () => {
    await expect(folder('collections:\n  Tally: [a.yaml]\n')).rejects.toThrow('lowercase letters')
    await expect(folder('collections:\n  tally: a.yaml\n')).rejects.toThrow('list of files or CIDs')
    await expect(folder('collections:\n  tally: [missing.yaml]\n')).rejects.toThrow('not a valid document in this folder')
    await expect(folder('collections:\n  tally: [not-a-cid]\n')).rejects.toThrow('neither a file nor a CID')
    const other = await cidOf({ ...base, title: 'Elsewhere' })
    await expect(folder(`collections:\n  tally: [${other}]\n`)).rejects.toThrow('does not have')
    const lib = await folder('collections:\n  tally: [a.yaml]\n')
    expect(buildCatalog(lib).entries[0].collections).toEqual(['tally'])
  })
})

describe('parseCatalog and collections', () => {
  const entry = { cid: 'baguqeera', role: 'author', status: 'current' }
  const catalog = (e: object) => ({ 'stroc-catalog': '1.1', domain: 'example.org', entries: [e] })
  it('accepts entries with or without collections, and rejects malformed ones', () => {
    expect(parseCatalog(catalog(entry)).catalog).toBeDefined()
    expect(parseCatalog(catalog({ ...entry, collections: ['tally-contracts'] })).catalog).toBeDefined()
    expect(parseCatalog(catalog({ ...entry, collections: 'tally-contracts' })).error).toContain('collections')
    expect(parseCatalog(catalog({ ...entry, collections: ['Tally Contracts'] })).error).toContain('collections')
  })
  it('reads a 1.0 catalog (no collections) as before', () => {
    expect(parseCatalog({ 'stroc-catalog': '1.0', domain: 'example.org', entries: [entry] }).catalog).toBeDefined()
  })
})
