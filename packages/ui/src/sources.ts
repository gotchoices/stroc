// The editor's document sources: an ordered, user-controlled list of servers (stroc serve, static
// hosts, IPFS gateways) to fetch documents from by CID. Remembered per browser.

import type { CID } from 'multiformats/cid'
import { HttpResolver, parseCatalog, CATALOG_PATH, type Resolver, type Catalog } from '@stroc/compose'

const STORAGE_KEY = 'stroc.sources'

export function normalizeSource(url: string): string | undefined {
  try {
    const u = new URL(url.includes('://') ? url : `http://${url}`)
    return u.origin + u.pathname.replace(/\/+$/, '')
  } catch {
    return undefined
  }
}

// The saved list, or the server hosting the editor if nothing is saved yet.
export function loadSources(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(saved) && saved.every(s => typeof s === 'string')) return saved
  } catch { /* storage unavailable or corrupt: fall through */ }
  return [location.origin]
}

export function saveSources(sources: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sources)) } catch { /* not persisted */ }
}

// Tries each source in order and remembers which one supplied each CID. Verification happens in
// compose, so a source that supplies wrong bytes only produces a reported failure.
export class SourcesResolver implements Resolver {
  readonly servedBy = new Map<string, string>()
  private readonly resolvers: [string, HttpResolver][]

  constructor(sources: string[]) {
    this.resolvers = sources.map(s => [s, new HttpResolver(s)])
  }

  async get(cid: CID): Promise<Uint8Array | undefined> {
    for (const [source, resolver] of this.resolvers) {
      const bytes = await resolver.get(cid)
      if (bytes) {
        this.servedBy.set(cid.toString(), source)
        return bytes
      }
    }
    return undefined
  }
}

// Each source's own catalog (what that server claims about what it serves), fetched once.
const catalogs = new Map<string, Promise<Catalog | undefined>>()

export function sourceCatalog(source: string): Promise<Catalog | undefined> {
  let pending = catalogs.get(source)
  if (!pending) {
    pending = fetch(source + CATALOG_PATH)
      .then(r => (r.ok ? r.json() : undefined))
      .then(json => (json ? parseCatalog(json).catalog : undefined))
      .catch(() => undefined)
    catalogs.set(source, pending)
  }
  return pending
}

export function forgetCatalogs() {
  catalogs.clear()
}
