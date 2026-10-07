// Development server: hosts the editor and exposes validation and CID helpers.
// Not part of the Stroc library; no app needs it.
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { fromPlain, documentCid } from '@stroc/core'

const require = createRequire(import.meta.url)

// The package root, whether running from src/ (ts-node) or dist/src/ (compiled).
function packageRoot(start: string): string {
  let dir = start
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error(`no package.json above ${start}`)
    dir = parent
  }
  return dir
}

const serverRoot = packageRoot(path.dirname(fileURLToPath(import.meta.url)))
const uiRoot = path.dirname(require.resolve('@stroc/ui/package.json'))

const app = express()
app.use(express.json({ limit: '1mb' }))

// The page and the editor change constantly during development; never let a browser cache them.
const noCache = { etag: false, lastModified: false, setHeaders: (res: express.Response) => res.set('Cache-Control', 'no-store') }
app.use(express.static(path.join(serverRoot, 'public'), noCache))
app.use('/static/ui', express.static(path.join(uiRoot, 'dist/src'), noCache))

// Lit and its dependencies, served from their real paths for the import map in index.html.
const litPackages: [string, string][] = [
  ['/static/lit', 'lit'],
  ['/static/lit-html', 'lit-html'],
  ['/static/reactive-element', '@lit/reactive-element'],
  ['/static/lit-element', 'lit-element'],
  ['/static/ssr-shim', '@lit-labs/ssr-dom-shim'],
]
for (const [mount, pkg] of litPackages) {
  app.use(mount, express.static(path.dirname(require.resolve(pkg))))
}
// The YAML parser's browser build, for opening .yaml files in the editor.
app.use('/static/yaml', express.static(path.resolve(path.dirname(require.resolve('yaml')), '../browser')))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Body: a document as plain JSON (links written {"/": "<cid>"}).
// Response: { valid, cid?, problems, warnings }. Never a stack trace.
async function check(body: unknown) {
  const plain = fromPlain(body)
  const result = await documentCid(plain.value)
  const problems = [...plain.problems, ...result.validation.problems]
  return {
    valid: problems.length === 0,
    ...(problems.length === 0 && result.cid ? { cid: result.cid.toString() } : {}),
    problems,
    warnings: result.validation.warnings,
  }
}

app.post(['/validate', '/cid'], async (req, res) => {
  try {
    const out = await check(req.body)
    res.status(out.valid ? 200 : 400).json(out)
  } catch (err) {
    console.error(err)
    res.status(500).json({ valid: false, problems: [{ path: [], code: 'internal', message: 'internal error' }] })
  }
})

// Malformed JSON bodies: report, don't dump a stack trace.
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError) {
    res.status(400).json({ valid: false, problems: [{ path: [], code: 'bad-json', message: 'request body is not valid JSON' }] })
    return
  }
  next(err)
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Stroc development server on http://localhost:${port}`)
})
