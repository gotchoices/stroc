// stroc export: the static form of the server. Served by a plain file server (which, like any
// static host, ignores the query string), it must give clients what the live server gives them.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compose, HttpResolver, AuthorChecker } from '@stroc/compose'
import { startServer, loadLibrary, exportLibrary } from '../src/index.js'

const contracts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../contracts')
const TALLY = 'baguqeerax7desqybsjlnvrs6p4y4o56prwmlesdwr2xqaegw4fm7n7aqmfka'

// A static host: the file at the path, or 404.
function staticHost(root: string): Promise<{ url: string, close: () => void }> {
  const server: Server = createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url!, 'http://x').pathname))
    if (!file.startsWith(root) || !existsSync(file) || !/[^/]$/.test(file)) { res.statusCode = 404; res.end(); return }
    res.end(readFileSync(file))
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as { port: number }
    resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() })
  }))
}

describe('stroc export of the sample library', () => {
  let out: string, host: Awaited<ReturnType<typeof staticHost>>, live: Awaited<ReturnType<typeof startServer>>
  beforeAll(async () => {
    out = mkdtempSync(path.join(tmpdir(), 'stroc-export-'))
    await exportLibrary(await loadLibrary(contracts), out)
    host = await staticHost(out)
    live = await startServer({ folder: contracts, port: 0 })
  })
  afterAll(() => { host.close(); live.close(); rmSync(out, { recursive: true, force: true }) })

  it('gives clients the same documents, composition and catalog as the server', async () => {
    const fromStatic = await compose(TALLY, new HttpResolver(host.url))
    expect(fromStatic.problems).toEqual([])
    expect(JSON.stringify(fromStatic)).toBe(JSON.stringify(await compose(TALLY, new HttpResolver(live.url))))
    const catalog = async (base: string) => (await fetch(`${base}/.well-known/stroc/catalog.json`)).json()
    expect(await catalog(host.url)).toEqual(await catalog(live.url))
  })
  it('confirms the author from the exported catalog', async () => {
    const composed = await compose(TALLY, new HttpResolver(host.url))
    const checker = new AuthorChecker({ catalogUrl: () => `${host.url}/.well-known/stroc/catalog.json` })
    expect((await checker.check(composed.document!, TALLY)).status).toBe('confirmed')
  })
  it('writes a page for each document and an index, with relative links', () => {
    const files = readdirSync(path.join(out, 'ipfs'))
    expect(files.filter(f => f.endsWith('.html'))).toHaveLength(13)
    const page = readFileSync(path.join(out, 'ipfs', `${TALLY}.html`), 'utf8')
    expect(page).toContain('MyCHIPS Tally Agreement')
    expect(page).toContain(`href="${TALLY}?format=raw"`)
    expect(page).toContain('href="../.well-known/stroc/catalog.json"')
    const index = readFileSync(path.join(out, 'index.html'), 'utf8')
    expect(index).toContain(`href="ipfs/${TALLY}.html"`)
    expect(index).not.toContain('href="/')
  })
  it('writes headers for Apache, Netlify and Cloudflare Pages, and keeps .well-known on GitHub Pages', () => {
    const apache = readFileSync(path.join(out, 'ipfs', '.htaccess'), 'utf8')
    expect(apache).toContain('Access-Control-Allow-Origin "*"')
    expect(apache).toContain('RewriteCond %{QUERY_STRING} !(^|&)format=')
    expect(readFileSync(path.join(out, '.well-known', 'stroc', '.htaccess'), 'utf8')).toContain('Access-Control-Allow-Origin')
    expect(readFileSync(path.join(out, '_headers'), 'utf8')).toContain('/.well-known/stroc/*')
    expect(existsSync(path.join(out, '.nojekyll'))).toBe(true)
  })
})

describe('stroc export never loses a document', () => {
  let folder: string, out: string
  const doc = (title: string) => `stroc: '1.0'\nlanguage: en\ntitle: ${title}\nauthor: example.org\n`
  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), 'stroc-export-src-'))
    out = mkdtempSync(path.join(tmpdir(), 'stroc-export-out-'))
    writeFileSync(path.join(folder, '.stroc.yaml'), 'domain: example.org\n')
    writeFileSync(path.join(folder, 'a.yaml'), doc('First'))
  })
  afterEach(() => { rmSync(folder, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }) })
  const cids = () => readdirSync(path.join(out, 'ipfs')).filter(f => /^b[a-z2-7]+$/.test(f))

  it('keeps documents the folder no longer has, and reports them', async () => {
    const first = await exportLibrary(await loadLibrary(folder), out)
    expect(first.added).toHaveLength(1)
    writeFileSync(path.join(folder, 'a.yaml'), doc('Second'))
    const second = await exportLibrary(await loadLibrary(folder), out)
    expect(second.added).toHaveLength(1)
    expect(second.kept).toEqual(first.added)
    expect(cids().sort()).toEqual([...first.added, ...second.added].sort())
    const again = await exportLibrary(await loadLibrary(folder), out)
    expect(again.added).toEqual([])
  })
  it('refuses a file under a document\'s CID that holds other bytes, before writing anything', async () => {
    const { added: [cid] } = await exportLibrary(await loadLibrary(folder), out)
    writeFileSync(path.join(out, 'ipfs', cid), 'damaged')
    rmSync(path.join(out, '.well-known'), { recursive: true })
    await expect(exportLibrary(await loadLibrary(folder), out)).rejects.toThrow('different content')
    expect(existsSync(path.join(out, '.well-known'))).toBe(false)
  })
  it('leaves the site\'s own index.html and _headers alone, and rewrites its own', async () => {
    writeFileSync(path.join(out, 'index.html'), '<p>The site home page</p>')
    writeFileSync(path.join(out, '_headers'), '/*\n  X-Frame-Options: DENY\n')
    const r = await exportLibrary(await loadLibrary(folder), out)
    expect(r.notWritten.sort()).toEqual(['_headers', 'index.html'])
    expect(readFileSync(path.join(out, 'index.html'), 'utf8')).toBe('<p>The site home page</p>')
    rmSync(path.join(out, 'index.html'))
    await exportLibrary(await loadLibrary(folder), out)
    writeFileSync(path.join(folder, 'b.yaml'), doc('Another'))
    const again = await exportLibrary(await loadLibrary(folder), out)
    expect(again.notWritten).toEqual(['_headers'])
    expect(readFileSync(path.join(out, 'index.html'), 'utf8')).toContain('Another')
  })
  it('needs a domain, and an output folder other than the documents\' own', async () => {
    rmSync(path.join(folder, '.stroc.yaml'))
    await expect(exportLibrary(await loadLibrary(folder), out)).rejects.toThrow('no domain')
    await expect(exportLibrary(await loadLibrary(folder, { domain: 'example.org' }), folder)).rejects.toThrow('different folder')
  })
})
