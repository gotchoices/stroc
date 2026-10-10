// The Stroc document server: serves a folder of documents in the IPFS trustless-gateway layout,
// with a catalog and an index page. Read-only, strict paths, suitable for production behind an
// HTTPS proxy. Optionally hosts the editor for development.

import express from 'express'
import { watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { CID } from 'multiformats/cid'
import { CATALOG_PATH } from '@stroc/compose'
import { documentPage, libraryStore } from './views.js'
import { loadLibrary, buildCatalog, type Library, type FolderConfig } from './library.js'

const emptyLibrary = (): Library => ({ folder: '', config: {}, documents: new Map(), skipped: [], collections: new Map(), loaded: new Date() })
import { indexPage } from './index-page.js'

const require = createRequire(import.meta.url)

export interface ServerOptions {
  folder?: string          // optional only with editor: an editor host that serves no documents
  domain?: string          // overrides .stroc.yaml
  watch?: boolean          // reload when the folder changes (development)
  editor?: boolean         // also host the editor at /editor (development)
  log?: (message: string) => void
}

export interface DocumentServer {
  app: express.Express
  library: () => Library
  reload: () => Promise<void>
  close: () => void
}

const IMMUTABLE = 'public, max-age=31536000, immutable'

export async function createDocumentServer(options: ServerOptions): Promise<DocumentServer> {
  const log = options.log ?? (() => undefined)
  const overrides: FolderConfig = { domain: options.domain }
  if (!options.folder && !options.editor) throw new Error('a folder to serve is required (or --editor alone to host only the editor)')
  const load = () => options.folder ? loadLibrary(options.folder, overrides) : Promise.resolve(emptyLibrary())
  let lib = await load()
  const report = () => {
    if (!options.folder) { log('editor only: no documents served'); return }
    log(`${lib.documents.size} documents from ${lib.folder}` + (lib.config.domain ? ` for ${lib.config.domain}` : ''))
    for (const s of lib.skipped) log(`  skipped ${s.file}: ${s.problems[0]?.message ?? 'invalid'}${s.problems.length > 1 ? ` (+${s.problems.length - 1} more)` : ''}`)
  }
  report()
  const reload = async () => { lib = await load(); report() }

  const app = express()
  app.disable('x-powered-by')
  app.set('etag', false)

  const publicData = (res: express.Response) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('X-Content-Type-Options', 'nosniff')
  }

  app.get('/ipfs/:cid', (req, res) => {
    publicData(res)
    let key: string
    try { key = CID.parse(req.params.cid).toString() } catch {
      res.status(400).type('text/plain').send('not a CID\n')
      return
    }
    const wantsCar = req.query.format === 'car' || /application\/vnd\.ipld\.car/.test(req.get('accept') ?? '')
    if (wantsCar) {
      res.status(406).type('text/plain').send('CAR bundles are not served yet; fetch documents individually\n')
      return
    }
    const doc = lib.documents.get(key)
    if (!doc) { res.status(404).type('text/plain').send('not found\n'); return }
    res.set('Vary', 'Accept')
    // A browser (no explicit format, HTML preferred) gets the composed document as a page, e.g.
    // after scanning a QR code; every other client gets the bytes.
    if (req.query.format === undefined && req.accepts(['application/vnd.ipld.raw', 'application/vnd.ipld.dag-json', 'application/json', 'text/html']) === 'text/html') {
      htmlView(key).then(html => {
        res.set('Cache-Control', 'public, max-age=300')
        res.type('html').send(html)
      }, () => res.status(500).type('text/plain').send('could not render\n'))
      return
    }
    const raw = req.query.format === 'raw' || /application\/vnd\.ipld\.raw/.test(req.get('accept') ?? '')
    res.set('Content-Type', raw ? 'application/vnd.ipld.raw' : 'application/vnd.ipld.dag-json')
    res.set('Cache-Control', IMMUTABLE)
    res.set('ETag', `"${key}"`)
    res.send(Buffer.from(doc.bytes))
  })

  // The document as a readable page, composed from this server's own library.
  async function htmlView(key: string): Promise<string> {
    return documentPage(lib, buildCatalog(lib), await libraryStore(lib), key,
      { bytes: `/ipfs/${key}?format=raw`, catalog: CATALOG_PATH, index: '/' })
  }

  app.get(CATALOG_PATH, (_req, res) => {
    publicData(res)
    res.set('Cache-Control', 'public, max-age=300')
    res.json(buildCatalog(lib))
  })

  app.get('/', (_req, res) => {
    if (!options.folder) { res.redirect('/editor/'); return }
    res.set('Cache-Control', 'no-cache')
    res.type('html').send(indexPage(lib, buildCatalog(lib), { editor: options.editor }))
  })

  if (options.editor) mountEditor(app)

  app.use((_req, res) => { res.status(404).type('text/plain').send('not found\n') })

  let watcher: FSWatcher | undefined
  if (options.watch && options.folder) {
    let timer: ReturnType<typeof setTimeout> | undefined
    watcher = watch(options.folder!, () => {
      clearTimeout(timer)
      timer = setTimeout(() => { reload().catch(err => log(`reload failed: ${err.message}`)) }, 200)
    })
  }

  return { app, library: () => lib, reload, close: () => watcher?.close() }
}

// Development only: the editor page and its bundle. The editor validates and computes CIDs itself.
function mountEditor(app: express.Express) {
  const noCache = { etag: false, lastModified: false, setHeaders: (res: express.Response) => res.set('Cache-Control', 'no-store') }
  const serverRoot = path.dirname(require.resolve('@stroc/server/package.json'))
  const uiRoot = path.dirname(require.resolve('@stroc/ui/package.json'))
  app.get(/^\/editor$/, (_req, res) => res.redirect('/editor/'))
  app.use('/editor/', express.static(path.join(serverRoot, 'public'), noCache))
  app.use('/editor/', express.static(path.join(uiRoot, 'dist'), noCache))

}

export async function startServer(options: ServerOptions & { port?: number, host?: string }): Promise<DocumentServer & { url: string }> {
  const server = await createDocumentServer(options)
  const port = options.port ?? 3000
  const host = options.host ?? 'localhost'
  return new Promise((resolve, reject) => {
    const http = server.app.listen(port, host, () => {
      const address = http.address()
      const url = `http://${host}:${typeof address === 'object' && address ? address.port : port}`
      options.log?.(`serving on ${url}` + (options.editor ? ` (editor at ${url}/editor/)` : ''))
      resolve({ ...server, url, close: () => { server.close(); http.close() } })
    })
    http.on('error', (err: NodeJS.ErrnoException) => {
      server.close()
      reject(err.code === 'EADDRINUSE'
        ? new Error(`port ${port} is already in use (another stroc serve or yarn dev?); choose another with --port`)
        : err)
    })
  })
}
