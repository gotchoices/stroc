import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

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

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Stroc server listening on port ${port}`)
})

