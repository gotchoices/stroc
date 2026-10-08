import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { documentCid, fromPlain } from '@stroc/core'
import { stringifyDocument } from '@stroc/yaml'
import { compose, HttpResolver, AuthorChecker } from '@stroc/compose'
import { startServer, parseServeArgs } from '../src/index.js'

const contracts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../contracts')
const TALLY = 'baguqeerax7desqybsjlnvrs6p4y4o56prwmlesdwr2xqaegw4fm7n7aqmfka'

describe('stroc serve on the sample library', () => {
  let server: Awaited<ReturnType<typeof startServer>>
  beforeAll(async () => { server = await startServer({ folder: contracts, port: 0 }) })
  afterAll(() => server.close())

  it('serves documents by CID in the trustless gateway form', async () => {
    const res = await fetch(`${server.url}/ipfs/${TALLY}?format=raw`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/vnd.ipld.raw')
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
  it('accepts any spelling of a CID', async () => {
    const { CID } = await import('multiformats/cid')
    const { base58btc } = await import('multiformats/bases/base58')
    const other = CID.parse(TALLY).toString(base58btc)
    expect((await fetch(`${server.url}/ipfs/${other}`)).status).toBe(200)
  })
  it('answers everything else with an error, never a file', async () => {
    expect((await fetch(`${server.url}/ipfs/not-a-cid`)).status).toBe(400)
    expect((await fetch(`${server.url}/ipfs/baguqeeracqxwoqi4pg3ab52w46ilo7rshuk7l2agc7erux64ocjkiqk22zeq`)).status).toBe(404)
    expect((await fetch(`${server.url}/ipfs/${TALLY}?format=car`)).status).toBe(406)
    expect((await fetch(`${server.url}/Tally_Contract.yaml`)).status).toBe(404)
    expect((await fetch(`${server.url}/.stroc.yaml`)).status).toBe(404)
    expect((await fetch(`${server.url}/editor/`)).status).toBe(404)
    expect((await fetch(`${server.url}/cid`, { method: 'POST' })).status).toBe(404)
  })
  it('sends a browser the readable document, and everyone else the bytes', async () => {
    const page = await fetch(`${server.url}/ipfs/${TALLY}`, { headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } })
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(page.headers.get('vary')).toBe('Accept')
    const html = await page.text()
    expect(html).toContain('<h1>MyCHIPS Tally Agreement</h1>')
    expect(html).toContain('issued by mychips.org (current)')
    expect(html).toContain(`/ipfs/${TALLY}?format=raw`)
    expect((await fetch(`${server.url}/ipfs/${TALLY}`)).headers.get('content-type')).toBe('application/vnd.ipld.dag-json')
    expect((await fetch(`${server.url}/ipfs/${TALLY}?format=raw`, { headers: { Accept: 'text/html' } })).headers.get('content-type')).toBe('application/vnd.ipld.raw')
  })
  it('serves a catalog for the configured domain', async () => {
    const catalog = await (await fetch(`${server.url}/.well-known/stroc/catalog.json`)).json()
    expect(catalog.domain).toBe('mychips.org')
    expect(catalog.entries).toHaveLength(13)
    expect(catalog.entries.every((e: { role: string, status: string }) => e.role === 'author' && e.status === 'current')).toBe(true)
  })
  it('serves an index page', async () => {
    const html = await (await fetch(server.url)).text()
    expect(html).toContain('Stroc documents served for mychips.org')
    expect(html).toContain(`/ipfs/${TALLY}`)
  })
  it('supplies a whole contract to compose over HTTP', async () => {
    const c = await compose(TALLY, new HttpResolver(server.url))
    expect(c.problems).toEqual([])
    expect(c.sections).toHaveLength(9)
  })
  it('confirms authors against its catalog', async () => {
    const checker = new AuthorChecker({ catalogUrl: () => `${server.url}/.well-known/stroc/catalog.json`, now: () => new Date('2026-10-07T12:00:00Z') })
    const c = await compose(TALLY, new HttpResolver(server.url))
    const r = await checker.check(c.document!, c.cid)
    expect(r).toMatchObject({ status: 'confirmed', domain: 'mychips.org', checked: '2026-10-07T12:00:00.000Z' })
    expect(r.entry?.status).toBe('current')
  })
})

describe('catalog roles and status', () => {
  let dir: string
  let server: Awaited<ReturnType<typeof startServer>>
  const base = { stroc: '1.0', language: 'en' }
  const cids: Record<string, string> = {}

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'stroc-serve-'))
    const v1 = { ...base, title: 'Ours v1', author: 'example.org' }
    cids.v1 = String((await documentCid(v1)).cid)
    const v2 = fromPlain({ ...base, title: 'Ours v2', author: 'example.org', replaces: [{ '/': cids.v1 }] }).value
    const theirs = { ...base, title: 'Theirs', author: 'other.org' }
    const hosted = { ...base, title: 'Hosted', author: 'Bob Anderson' }
    const old = { ...base, title: 'Old', author: 'example.org' }
    for (const [k, d] of Object.entries({ v1, v2, theirs, hosted, old })) {
      cids[k] = String((await documentCid(d)).cid)
      writeFileSync(path.join(dir, `${k}.yaml`), stringifyDocument(d))
    }
    writeFileSync(path.join(dir, 'broken.yaml'), 'stroc: 1.0\ntitle: missing things\n')
    writeFileSync(path.join(dir, '.stroc.yaml'), `domain: example.org\nendorse: [${cids.theirs}]\nwithdrawn: [${cids.old}]\n`)
    server = await startServer({ folder: dir, port: 0 })
  })
  afterAll(() => { server.close(); rmSync(dir, { recursive: true }) })

  it('derives roles and status', async () => {
    const catalog = await (await fetch(`${server.url}/.well-known/stroc/catalog.json`)).json()
    const by = Object.fromEntries(catalog.entries.map((e: { cid: string }) => [e.cid, e]))
    expect(by[cids.v1]).toMatchObject({ role: 'author', status: 'superseded' })
    expect(by[cids.v2]).toMatchObject({ role: 'author', status: 'current', replaces: [cids.v1] })
    expect(by[cids.theirs]).toMatchObject({ role: 'endorse', status: 'current' })
    expect(by[cids.hosted]).toMatchObject({ role: 'mirror' })
    expect(by[cids.old]).toMatchObject({ role: 'author', status: 'withdrawn' })
  })
  it('skips invalid files instead of serving them', () => {
    expect(server.library().skipped.map(s => s.file)).toEqual(['broken.yaml'])
    expect(server.library().documents.size).toBe(5)
  })
  it('reports endorsements and mirrors as not confirming authorship', async () => {
    const checker = new AuthorChecker({ catalogUrl: () => `${server.url}/.well-known/stroc/catalog.json` })
    const doc = (title: string, author: string) => ({ ...base, title, author })
    expect((await checker.check(doc('Theirs', 'example.org'), cids.theirs)).status).toBe('endorsed')
    expect((await checker.check(doc('Hosted', 'example.org'), cids.hosted)).status).toBe('mirrored')
  })
  it('rejects a catalog that speaks for another domain', async () => {
    const checker = new AuthorChecker({ catalogUrl: () => `${server.url}/.well-known/stroc/catalog.json` })
    const r = await checker.check({ ...base, title: 'Theirs', author: 'other.org' }, cids.theirs)
    expect(r.status).toBe('unreachable')
    expect(r.reason).toContain('example.org')
  })
  it('picks up changes on reload', async () => {
    writeFileSync(path.join(dir, 'new.yaml'), stringifyDocument({ ...base, title: 'New', author: 'example.org' }))
    await server.reload()
    expect(server.library().documents.size).toBe(6)
  })
})

describe('editor hosting (development)', () => {
  it('is only present with --editor', async () => {
    const server = await startServer({ folder: contracts, port: 0, editor: true })
    try {
      expect((await fetch(`${server.url}/editor/`)).status).toBe(200)
      expect((await fetch(`${server.url}/editor/stroc-editor.js`)).status).toBe(200)
    } finally { server.close() }
  })
})

describe('parseServeArgs', () => {
  it('reads options and environment', () => {
    expect(parseServeArgs(['docs', '--port', '8080', '--watch'], { STROC_DOMAIN: 'sereus.org' })).toEqual({
      folder: 'docs', port: 8080, host: 'localhost', domain: 'sereus.org', watch: true, editor: false,
    })
    expect(parseServeArgs(['--domain', 'a.org', 'docs']).folder).toBe('docs')
  })
})
