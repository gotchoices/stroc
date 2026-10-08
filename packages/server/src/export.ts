// The static form of the document server: writes what `stroc serve` serves as files, so any web
// server (Apache, nginx, a static host or CDN) can publish a document set without running Node.
//
//   ipfs/<cid>                       each document's exact bytes (current and archived)
//   ipfs/<cid>.html                  its readable page (for browsers and QR codes)
//   .well-known/stroc/catalog.json   the catalog
//   index.html                       the index
//   ipfs/.htaccess, .well-known/stroc/.htaccess, _headers, .nojekyll
//                                    headers (and a page for browsers) on Apache, Netlify and
//                                    Cloudflare Pages; GitHub Pages keeps the .well-known folder
//
// Documents are never deleted or replaced: signed agreements refer to old versions by CID, so files
// already in ipfs/ stay, even if the folder no longer has them. Files this tool did not write
// (an index.html or _headers belonging to the site) are left alone. The catalog is written last,
// so it never lists a document that is not there yet.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import path from 'node:path'
import { CATALOG_PATH } from '@stroc/compose'
import { buildCatalog, type Library } from './library.js'
import { documentPage, libraryStore } from './views.js'
import { indexPage, EXPORT_MARK } from './index-page.js'

export interface ExportResult {
  dir: string
  documents: number           // documents in the export from this folder
  added: string[]             // CIDs whose bytes were written this time
  kept: string[]              // CIDs already in ipfs/ that this folder no longer has (left in place)
  notWritten: string[]        // files left alone because this tool did not write them
}

const IMMUTABLE = 'public, max-age=31536000, immutable'

// Apache: documents as raw bytes with long caching, a page for browsers that ask for HTML (not for
// clients asking for ?format=raw), and the headers browser-based clients need.
const IPFS_HTACCESS = `# Written by ${EXPORT_MARK}; rewritten on every export.
# Needs mod_headers and mod_rewrite, and AllowOverride FileInfo for this directory.
<IfModule mod_headers.c>
  Header always set Access-Control-Allow-Origin "*"
  Header always set X-Content-Type-Options "nosniff"
  Header always merge Vary "Accept"
</IfModule>
<FilesMatch "^[a-z2-7]+$">
  ForceType application/vnd.ipld.raw
  <IfModule mod_headers.c>
    Header always set Cache-Control "${IMMUTABLE}"
  </IfModule>
</FilesMatch>
<FilesMatch "\\.html$">
  <IfModule mod_headers.c>
    Header always set Cache-Control "public, max-age=300"
  </IfModule>
</FilesMatch>
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{QUERY_STRING} !(^|&)format=
  RewriteCond %{HTTP_ACCEPT} text/html
  RewriteCond %{REQUEST_FILENAME}.html -f
  RewriteRule ^([a-z2-7]+)$ $1.html [L]
</IfModule>
`

const CATALOG_HTACCESS = `# Written by ${EXPORT_MARK}; rewritten on every export.
<IfModule mod_headers.c>
  Header always set Access-Control-Allow-Origin "*"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Cache-Control "public, max-age=300"
</IfModule>
`

// Netlify and Cloudflare Pages (paths from the site root). They cannot choose a page by the Accept
// header, so a browser opening /ipfs/<cid> gets the bytes; the index links to the pages.
const HEADERS = `# Written by ${EXPORT_MARK}; rewritten on every export.
/ipfs/*
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
/.well-known/stroc/*
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
  Cache-Control: public, max-age=300
`

function isCidName(name: string) { return /^b[a-z2-7]{20,}$/.test(name) }

function writeAtomic(file: string, data: string | Uint8Array) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, file)
}

// Write a file this tool owns, unless the file is there and was not written by it.
function writeOwned(file: string, data: string, notWritten: string[], out: string): void {
  if (existsSync(file) && !readFileSync(file, 'utf8').includes(EXPORT_MARK)) {
    notWritten.push(path.relative(out, file))
    return
  }
  writeAtomic(file, data)
}

export async function exportLibrary(lib: Library, out: string): Promise<ExportResult> {
  if (!lib.config.domain) throw new Error('no domain: set domain in .stroc.yaml, or pass --domain')
  out = path.resolve(out)
  if (out === path.resolve(lib.folder)) throw new Error('export to a different folder than the documents\' own')
  const ipfs = path.join(out, 'ipfs')
  const wellKnown = path.join(out, path.dirname(CATALOG_PATH.slice(1)))

  // Check before writing anything: an existing file under a document's CID must hold those bytes.
  for (const d of lib.documents.values()) {
    const file = path.join(ipfs, d.cid)
    if (existsSync(file) && !Buffer.from(readFileSync(file)).equals(Buffer.from(d.bytes))) {
      throw new Error(`ipfs/${d.cid} already exists with different content; it is not that document (remove it if it is damaged)`)
    }
  }
  mkdirSync(ipfs, { recursive: true })
  mkdirSync(wellKnown, { recursive: true })

  const catalog = buildCatalog(lib)
  const store = await libraryStore(lib)
  const result: ExportResult = { dir: out, documents: lib.documents.size, added: [], kept: [], notWritten: [] }
  for (const d of lib.documents.values()) {
    const file = path.join(ipfs, d.cid)
    if (!existsSync(file)) { writeAtomic(file, d.bytes); result.added.push(d.cid) }
    const page = await documentPage(lib, catalog, store, d.cid,
      { bytes: `${d.cid}?format=raw`, catalog: `../${CATALOG_PATH.slice(1)}`, index: '../index.html' })
    writeAtomic(`${file}.html`, page)
  }
  result.kept = readdirSync(ipfs).filter(n => isCidName(n) && !lib.documents.has(n)).sort()

  writeAtomic(path.join(ipfs, '.htaccess'), IPFS_HTACCESS)
  writeAtomic(path.join(wellKnown, '.htaccess'), CATALOG_HTACCESS)
  writeOwned(path.join(out, '_headers'), HEADERS, result.notWritten, out)
  if (!existsSync(path.join(out, '.nojekyll'))) writeFileSync(path.join(out, '.nojekyll'), '')
  writeOwned(path.join(out, 'index.html'), indexPage(lib, catalog, { exported: true }), result.notWritten, out)
  writeAtomic(path.join(out, CATALOG_PATH.slice(1)), JSON.stringify(catalog, null, 2) + '\n')
  return result
}
