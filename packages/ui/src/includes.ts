// What the editor knows about an included document: whether it could be fetched and verified,
// which source served it, what that source's catalog says about it, and whether its author claim
// is confirmed by the author's own domain.

import { CID } from 'multiformats/cid'
import { compose, AuthorChecker, formatNumber, type Composed, type ComposedSection, type AuthorCheck, type CatalogEntry } from '@stroc/compose'
import { SourcesResolver, sourceCatalog } from './sources.js'

export interface IncludeInfo {
  cid: string
  state: 'loading' | 'ok' | 'missing' | 'invalid' | 'bad-cid'
  composed?: Composed
  source?: string                                   // the source that served the root of the include
  sourceEntry?: { domain: string, entry: CatalogEntry }   // that source's catalog entry for it
  author?: AuthorCheck                              // check against the author's own domain
  problems: string[]                                // missing nested documents, unresolved references
}

const authorChecker = new AuthorChecker()

// Load an included document and everything it includes, from the given sources.
export async function loadInclude(cidText: string, sources: string[]): Promise<IncludeInfo> {
  let cid: CID
  try { cid = CID.parse(cidText) } catch {
    return { cid: cidText, state: 'bad-cid', problems: ['not a CID'] }
  }
  const resolver = new SourcesResolver(sources)
  const composed = await compose(cid, resolver)
  const key = cid.toString()
  const source = resolver.servedBy.get(key)
  if (!composed.document) {
    const missing = composed.problems.some(p => p.code === 'missing-document')
    return { cid: key, state: missing ? 'missing' : 'invalid', problems: composed.problems.map(p => p.message) }
  }
  const info: IncludeInfo = { cid: key, state: 'ok', composed, source, problems: composed.problems.map(p => p.message) }
  const [catalog, author] = await Promise.all([
    source ? sourceCatalog(source) : Promise.resolve(undefined),
    authorChecker.check(composed.document, cid),
  ])
  const entry = catalog?.entries.find(e => e.cid === key)
  if (catalog && entry) info.sourceEntry = { domain: catalog.domain, entry }
  info.author = author
  return info
}

// Find a section by id within one document's scope of a composed tree: search the tree, but do
// not look inside included documents (their ids belong to them); an include's own id is in scope.
export function findInScope(sections: ComposedSection[], id: string): ComposedSection | undefined {
  for (const s of sections) {
    if (s.id === id) return s
    if (!s.include) {
      const inner = findInScope(s.sections, id)
      if (inner) return inner
    }
  }
  return undefined
}

// The number of a reference path that steps into an included document, relative to that document.
export function numberWithin(composed: Composed, path: string[]): number[] | undefined {
  let scope = composed.sections
  let found: ComposedSection | undefined
  for (let i = 0; i < path.length; i++) {
    found = findInScope(scope, path[i])
    if (!found) return undefined
    if (i < path.length - 1) {
      if (!found.include) return undefined
      scope = found.sections
    }
  }
  return found?.number
}

export function joinNumber(prefix: string, number: number[]): string {
  return number.length ? `${prefix}.${formatNumber(number)}` : prefix
}
