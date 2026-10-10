// HTTP access to published documents (Specification: Published Sets and Catalogs).
//
// Uses only the standard `fetch`, so it runs in browsers, Node and React Native. Nothing fetched is
// trusted: documents are verified against their CIDs by `compose`, and catalogs only ever confirm
// claims about a domain they were fetched from.

import type { CID } from 'multiformats/cid'
import { isDomain, type StrocDocument } from '@stroc/core'
import type { Resolver } from './index.js'

type Fetch = typeof globalThis.fetch

// Reads documents from a Stroc server, a static host or an IPFS gateway, using the trustless
// gateway convention: GET <base>/ipfs/<cid>?format=raw. Returns undefined for anything other than
// a successful response (the caller reports the document as missing).
export class HttpResolver implements Resolver {
  readonly base: string
  private readonly fetchFn: Fetch

  constructor(base: string, options: { fetch?: Fetch } = {}) {
    this.base = base.replace(/\/+$/, '')
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async get(cid: CID): Promise<Uint8Array | undefined> {
    try {
      const res = await this.fetchFn(`${this.base}/ipfs/${cid}?format=raw`, {
        headers: { Accept: 'application/vnd.ipld.raw, application/vnd.ipld.dag-json;q=0.9, */*;q=0.1' },
      })
      if (!res.ok) return undefined
      return new Uint8Array(await res.arrayBuffer())
    } catch {
      return undefined
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Catalogs

export const CATALOG_PATH = '/.well-known/stroc/catalog.json'

export type CatalogRole = 'author' | 'endorse' | 'mirror'
export type CatalogStatus = 'current' | 'superseded' | 'withdrawn'

export interface CatalogEntry {
  cid: string
  title?: string
  role: CatalogRole
  status: CatalogStatus
  published?: string
  replaces?: string[]
  collections?: string[]   // the publisher's named lists this document is in (for example the
                           // contracts an app should offer); components are usually in none
}

export interface Catalog {
  'stroc-catalog': string
  domain: string
  entries: CatalogEntry[]
}

const ROLES = new Set<string>(['author', 'endorse', 'mirror'])
const STATUSES = new Set<string>(['current', 'superseded', 'withdrawn'])

// A collection name: lowercase letters, digits and hyphens, chosen by the publisher and agreed with
// the apps that read it (for example `tally-contracts`).
export function isCollectionName(name: unknown): name is string {
  return typeof name === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)
}

// Check the shape of a fetched catalog. Returns undefined (with a reason) if it is not one.
export function parseCatalog(value: unknown): { catalog?: Catalog, error?: string } {
  if (typeof value !== 'object' || value === null) return { error: 'not a JSON object' }
  const c = value as Record<string, unknown>
  if (typeof c['stroc-catalog'] !== 'string') return { error: 'missing "stroc-catalog" version' }
  if (typeof c.domain !== 'string') return { error: 'missing "domain"' }
  if (!Array.isArray(c.entries)) return { error: '"entries" must be an array' }
  for (const e of c.entries as Record<string, unknown>[]) {
    if (typeof e?.cid !== 'string' || !ROLES.has(e.role as string) || !STATUSES.has(e.status as string)) {
      return { error: 'an entry lacks a valid cid, role or status' }
    }
    if (e.collections !== undefined && !(Array.isArray(e.collections) && e.collections.every(isCollectionName))) {
      return { error: `entry ${e.cid}: "collections" must be a list of names (lowercase letters, digits, hyphens)` }
    }
  }
  return { catalog: value as Catalog }
}

// Fetch and check a publisher's catalog from a site (a Stroc server, a static host or a mirror),
// for example to list what a domain offers. The site's catalog speaks only for its own domain.
export async function fetchCatalog(base: string, options: { fetch?: Fetch } = {}): Promise<{ catalog?: Catalog, error?: string }> {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis)
  try {
    const res = await fetchFn(`${base.replace(/\/+$/, '')}${CATALOG_PATH}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    return parseCatalog(await res.json())
  } catch (err) {
    return { error: (err as Error).message }
  }
}

// The entries of a named collection, by default only the current ones the domain stands behind
// (role author or endorse, not mirror): what an app should offer. Pass `all: true` for every entry
// in the collection (superseded and withdrawn versions too, to recognise a document something was
// agreed under). To know who issued an endorsed document, check its author (AuthorChecker).
export function collectionEntries(catalog: Catalog, name: string, options: { all?: boolean } = {}): CatalogEntry[] {
  return catalog.entries.filter(e => e.collections?.includes(name) &&
    (options.all || (e.role !== 'mirror' && e.status === 'current')))
}

// ---------------------------------------------------------------------------------------------
// Author check

export type AuthorCheckStatus =
  | 'confirmed'       // the author domain's catalog lists the document with role "author"
  | 'endorsed'        // listed with role "endorse": the domain recommends but does not claim it
  | 'mirrored'        // listed with role "mirror": hosted, no claim
  | 'not-listed'      // the catalog does not list this document
  | 'unreachable'     // the catalog could not be fetched or is malformed
  | 'not-a-domain'    // the author is a name (or absent): nothing to check

export interface AuthorCheck {
  status: AuthorCheckStatus
  author?: string
  domain?: string
  entry?: CatalogEntry        // the catalog's entry, when listed (its status may be superseded/withdrawn)
  reason?: string             // for unreachable
  checked: string             // ISO 8601 timestamp of the check
}

export interface AuthorCheckOptions {
  fetch?: Fetch
  // Where to find a domain's catalog. Default: https://<domain>/.well-known/stroc/catalog.json.
  // Overridden in development and tests, e.g. to point a domain at a local `stroc serve`.
  catalogUrl?: (domain: string) => string
  now?: () => Date
}

// Checks documents' `author` claims, fetching each domain's catalog once.
export class AuthorChecker {
  private readonly fetchFn: Fetch
  private readonly catalogUrl: (domain: string) => string
  private readonly now: () => Date
  private readonly catalogs = new Map<string, Promise<{ catalog?: Catalog, error?: string }>>()

  constructor(options: AuthorCheckOptions = {}) {
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.catalogUrl = options.catalogUrl ?? (d => `https://${d}${CATALOG_PATH}`)
    this.now = options.now ?? (() => new Date())
  }

  private catalog(domain: string) {
    let pending = this.catalogs.get(domain)
    if (!pending) {
      pending = (async () => {
        try {
          const res = await this.fetchFn(this.catalogUrl(domain), { headers: { Accept: 'application/json' } })
          if (!res.ok) return { error: `HTTP ${res.status}` }
          const parsed = parseCatalog(await res.json())
          if (parsed.catalog && parsed.catalog.domain !== domain) {
            return { error: `the catalog speaks for "${parsed.catalog.domain}", not "${domain}"` }
          }
          return parsed
        } catch (err) {
          return { error: (err as Error).message }
        }
      })()
      this.catalogs.set(domain, pending)
    }
    return pending
  }

  async check(document: StrocDocument, cid: CID | string): Promise<AuthorCheck> {
    const checked = this.now().toISOString()
    const author = document.author
    if (!author || !isDomain(author)) return { status: 'not-a-domain', ...(author ? { author } : {}), checked }
    const { catalog, error } = await this.catalog(author)
    if (!catalog) return { status: 'unreachable', author, domain: author, reason: error, checked }
    const entry = catalog.entries.find(e => e.cid === cid.toString())
    if (!entry) return { status: 'not-listed', author, domain: author, checked }
    const status: AuthorCheckStatus = entry.role === 'author' ? 'confirmed' : entry.role === 'endorse' ? 'endorsed' : 'mirrored'
    return { status, author, domain: author, entry, checked }
  }
}
