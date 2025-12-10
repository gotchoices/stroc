import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { cidFromDocument, normalizeDocument, validateDocument } from '@stroc/core'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json({ limit: '1mb' }))

// Serve static stub UI
const publicDir = path.resolve(__dirname, '../public')
app.use(express.static(publicDir))
// Serve UI bundle from workspace dist
const uiDistDir = path.resolve(__dirname, '../../ui/dist/src')
app.use('/static/ui', express.static(uiDistDir))
// Serve lit and deps from their real paths
const require = createRequire(import.meta.url)
const litMain = require.resolve('lit')
const litDir = path.dirname(litMain)
const litHtmlMain = require.resolve('lit-html')
const litHtmlDir = path.dirname(litHtmlMain)
const reactiveMain = require.resolve('@lit/reactive-element')
const reactiveDir = path.dirname(reactiveMain)
const litElementMain = require.resolve('lit-element')
const litElementDir = path.dirname(litElementMain)
const ssrShimMain = require.resolve('@lit-labs/ssr-dom-shim')
const ssrShimDir = path.dirname(ssrShimMain)
app.use('/static/lit', express.static(litDir))
app.use('/static/lit-html', express.static(litHtmlDir))
app.use('/static/reactive-element', express.static(reactiveDir))
app.use('/static/lit-element', express.static(litElementDir))
app.use('/static/ssr-shim', express.static(ssrShimDir))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.post('/validate', (req, res) => {
  const norm = normalizeDocument(req.body)
  const result = validateDocument(norm)
  res.status(result.valid ? 200 : 400).json(result)
})

app.post('/cid', async (req, res) => {
  try {
    const result = await cidFromDocument(req.body)
    if (result.errors) return res.status(400).json(result)
    return res.json(result)
  } catch (err: any) {
    console.error(err)
    return res.status(500).json({ error: err?.message || 'Internal error' })
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Stroc server listening on port ${port}`)
})

