// The readable page for a document, shared by the server (rendered on request) and the static
// export (rendered once per document), so both show the same thing.

import { MemoryStore, compose, type Catalog } from '@stroc/compose'
import { layout, toHtml } from '@stroc/render'
import type { Library } from './library.js'

// Where a page's links point: absolute paths on the server, relative ones in an export (so an
// exported tree also works below a path, for example on a mirror).
export interface PageLinks {
  bytes: string
  catalog: string
  index: string
}

export async function libraryStore(lib: Library): Promise<MemoryStore> {
  const store = new MemoryStore()
  for (const d of lib.documents.values()) await store.put(d.bytes)
  return store
}

// The document composed from the library's own documents. Missing includes and other problems are
// shown (draft view); missing deal-specific values print as blanks.
export async function documentPage(lib: Library, catalog: Catalog, store: MemoryStore, key: string, links: PageLinks): Promise<string> {
  const composed = await compose(key, store)
  const result = layout(composed, { options: { template: true, draft: composed.problems.length > 0 } })
  const domain = catalog.domain
  const entry = catalog.entries.find(e => e.cid === key)
  const claim = entry ? ` This server lists it as ${entry.role === 'author' ? `issued by ${domain}` : entry.role === 'endorse' ? `recommended by ${domain}` : 'hosted only'} (${entry.status}).` : ''
  return toHtml(result.layout!, {
    notice: {
      text: `Rendered by the server for ${domain}.${claim} To verify, fetch the document itself and check that it hashes to ${key}.`,
      links: [['Document bytes', links.bytes], ['Catalog', links.catalog], ['All documents', links.index]],
    },
  })
}
