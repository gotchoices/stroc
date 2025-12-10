import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { cidFromDocument, normalizeDocument, validateDocument } from '@stroc/core'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json({ limit: '1mb' }))

// Serve static stub UI
const publicDir = path.resolve(__dirname, '../public')
app.use(express.static(publicDir))

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

