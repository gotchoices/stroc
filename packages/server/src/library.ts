// A folder of documents, as the server sees it: every valid document by CID, plus the folder's
// configuration (.stroc.yaml) and the catalog it implies.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { documentCid, isDomain, type StrocDocument } from '@stroc/core'
import { lintYaml, type LocatedProblem } from '@stroc/yaml'
import type { Catalog, CatalogEntry } from '@stroc/compose'

export const CONFIG_FILE = '.stroc.yaml'

export interface FolderConfig {
  domain?: string          // the domain this folder is served for
  endorse?: string[]       // CIDs of documents by other authors that this domain recommends
  withdrawn?: string[]     // CIDs no longer recommended
}

export interface LibraryDocument {
  cid: string
  bytes: Uint8Array
  document: StrocDocument
  file: string
}

export interface Library {
  folder: string
  config: FolderConfig
  documents: Map<string, LibraryDocument>
  skipped: { file: string, problems: LocatedProblem[] }[]   // files that are not valid documents
  loaded: Date
}

export function readConfig(folder: string): FolderConfig {
  const file = path.join(folder, CONFIG_FILE)
  if (!existsSync(file)) return {}
  const value = parse(readFileSync(file, 'utf8')) as FolderConfig | null
  const config: FolderConfig = value ?? {}
  if (config.domain !== undefined && !isDomain(config.domain)) {
    throw new Error(`${file}: domain "${config.domain}" is not a lowercase domain name`)
  }
  return config
}

export async function loadLibrary(folder: string, overrides: FolderConfig = {}): Promise<Library> {
  const config = { ...readConfig(folder), ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) }
  const documents = new Map<string, LibraryDocument>()
  const skipped: Library['skipped'] = []
  const files = readdirSync(folder).filter(n => /\.(ya?ml|json)$/i.test(n) && !n.startsWith('.')).sort()
  for (const file of files) {
    const lint = lintYaml(readFileSync(path.join(folder, file), 'utf8'))
    if (!lint.valid) { skipped.push({ file, problems: lint.problems }); continue }
    const { cid, bytes } = await documentCid(lint.value)
    if (!cid || !bytes) continue
    documents.set(cid.toString(), { cid: cid.toString(), bytes, document: lint.value as StrocDocument, file })
  }
  return { folder, config, documents, skipped, loaded: new Date() }
}

// The catalog this folder implies (Specification: Published Sets and Catalogs).
export function buildCatalog(lib: Library): Catalog {
  const domain = lib.config.domain ?? 'localhost'
  const endorsed = new Set(lib.config.endorse ?? [])
  const withdrawn = new Set(lib.config.withdrawn ?? [])
  const replaced = new Set<string>()
  for (const d of lib.documents.values()) for (const r of d.document.replaces ?? []) replaced.add(r.toString())
  const entries: CatalogEntry[] = [...lib.documents.values()]
    .sort((a, b) => a.document.title.localeCompare(b.document.title))
    .map(d => ({
      cid: d.cid,
      title: d.document.title,
      role: d.document.author === domain ? 'author' : endorsed.has(d.cid) ? 'endorse' : 'mirror',
      status: withdrawn.has(d.cid) ? 'withdrawn' : replaced.has(d.cid) ? 'superseded' : 'current',
      ...(d.document.published ? { published: d.document.published } : {}),
      ...(d.document.replaces ? { replaces: d.document.replaces.map(String) } : {}),
    }))
  return { 'stroc-catalog': '0.1', domain, entries }
}
