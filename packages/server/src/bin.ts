#!/usr/bin/env node
// stroc-server: the document server on its own, for production (for example in Docker).
// Reloads the folder on SIGHUP. Settings may also come from PORT, HOST and STROC_DOMAIN.
import { startServer } from './server.js'
import { parseServeArgs, SERVE_USAGE } from './args.js'

const opts = parseServeArgs(process.argv.slice(2), process.env)
if (!opts.folder) {
  console.error(`usage: stroc-server ${SERVE_USAGE}`)
  process.exit(2)
}
const server = await startServer({ ...opts, folder: opts.folder, log: m => console.log(m) })
process.on('SIGHUP', () => { server.reload().catch(err => console.error(err)) })
process.on('SIGTERM', () => { server.close(); process.exit(0) })
