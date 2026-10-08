// The human-readable index at "/": what this server serves and what it claims about each document.
// The static export writes the same page as index.html, with relative links to the documents'
// pages (so it works without the server's content negotiation, and below a path).

import type { Catalog } from '@stroc/compose'
import type { Library } from './library.js'
import { CATALOG_PATH } from '@stroc/compose'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const ROLE_TEXT: Record<string, string> = {
  author: 'issued by this domain',
  endorse: 'recommended by this domain',
  mirror: 'hosted only (no claim)',
}

export const EXPORT_MARK = 'stroc export'

export function indexPage(lib: Library, catalog: Catalog, options: { editor?: boolean, exported?: boolean } = {}): string {
  const { editor = false, exported = false } = options
  const catalogHref = exported ? CATALOG_PATH.slice(1) : CATALOG_PATH
  const rows = catalog.entries.map(e => {
    const doc = lib.documents.get(e.cid)
    return `<tr>
  <td><a href="${exported ? `ipfs/${esc(e.cid)}.html` : `/ipfs/${esc(e.cid)}`}">${esc(e.title ?? '')}</a></td>
  <td>${esc(doc?.document.author ?? '')}</td>
  <td>${esc(ROLE_TEXT[e.role])}</td>
  <td class="${e.status}">${esc(e.status)}</td>
  <td><code>${esc(e.cid)}</code></td>
</tr>`
  }).join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${exported ? `\n<meta name="generator" content="${EXPORT_MARK}">` : ''}
<title>Stroc documents: ${esc(catalog.domain)}</title>
<style>
body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 2em; color: #111; background: #fff; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.35em 0.75em 0.35em 0; border-bottom: 1px solid #ddd; vertical-align: top; }
th { font-size: 0.85em; color: #555; }
code { font-size: 0.75em; color: #555; }
.superseded, .withdrawn { color: #a40; }
p.meta { color: #555; font-size: 0.9em; }
</style>
</head>
<body>
<h1>Stroc documents served for ${esc(catalog.domain)}</h1>
<p class="meta">${catalog.entries.length} documents. Machine-readable catalog: <a href="${catalogHref}">${CATALOG_PATH}</a>.
Documents are at <code>/ipfs/&lt;cid&gt;</code>; verify every document against its CID.${editor ? ' Editor: <a href="/editor/">/editor/</a>.' : ''}</p>
<table>
<thead><tr><th>Title</th><th>Author</th><th>This server's claim</th><th>Status</th><th>CID</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>
`
}
