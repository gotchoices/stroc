// A folder of documents, as the server sees it: every valid document by CID, plus the folder's
// configuration (.stroc.yaml) and the catalog it implies.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { CID } from 'multiformats/cid'
import { documentCid, isDomain, verifyDocument, type StrocDocument } from '@stroc/core'
import { lintYaml, type LocatedProblem } from '@stroc/yaml'
import { isCollectionName, type Catalog, type CatalogEntry } from '@stroc/compose'

export const CONFIG_FILE = '.stroc.yaml'
export const ARCHIVE_DIR = '.stroc-archive'      // earlier versions kept by the folder tools
const RECORD_FILE = '.stroc-record.json'          // which CIDs each file has had (the folder tools')

export interface FolderConfig {
  domain?: string          // the domain this folder is served for
  endorse?: string[]       // CIDs of documents by other authors that this domain recommends
  withdrawn?: string[]     // CIDs no longer recommended
  // Named lists for apps, such as the contracts to offer: each names files in this folder (their
  // current version, with earlier versions kept in the list) or CIDs.
  collections?: Record<string, string[]>
}

export interface LibraryDocument {
  cid: string
  bytes: Uint8Array
  document: StrocDocument
  file: string
  archived?: boolean      // an earlier version kept in the archive, not a current file
}

export interface Library {
  folder: string
  config: FolderConfig
  documents: Map<string, LibraryDocument>
  skipped: { file: string, problems: LocatedProblem[] }[]   // files that are not valid documents
  collections: Map<string, string[]>     // CID → names of the collections it is in
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
  if (config.collections !== undefined) {
    if (typeof config.collections !== 'object' || config.collections === null || Array.isArray(config.collections)) {
      throw new Error(`${file}: collections must map names to lists of files or CIDs`)
    }
    for (const [name, items] of Object.entries(config.collections)) {
      if (!isCollectionName(name)) throw new Error(`${file}: collection name "${name}" must be lowercase letters, digits and hyphens`)
      if (!Array.isArray(items) || !items.every(i => typeof i === 'string')) throw new Error(`${file}: collection "${name}" must be a list of files or CIDs`)
    }
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
  // Earlier versions: served as they were, verified against their names, never replacing a current file.
  const archive = path.join(folder, ARCHIVE_DIR)
  if (existsSync(archive)) {
    for (const name of readdirSync(archive).filter(n => n.endsWith('.json')).sort()) {
      const cid = name.slice(0, -5)
      if (documents.has(cid)) continue
      const bytes = new Uint8Array(readFileSync(path.join(archive, name)))
      const v = await verifyDocument(bytes, cid).catch(() => undefined)
      if (!v?.ok || !v.document) { skipped.push({ file: `${ARCHIVE_DIR}/${name}`, problems: v?.problems ?? [] }); continue }
      documents.set(cid, { cid, bytes, document: v.document, file: `${ARCHIVE_DIR}/${name}`, archived: true })
    }
  }
  return { folder, config, documents, skipped, collections: resolveCollections(folder, config, documents), loaded: new Date() }
}

function readRecord(folder: string): Record<string, { previous?: string[] }> {
  try {
    const r = JSON.parse(readFileSync(path.join(folder, RECORD_FILE), 'utf8'))
    return r && typeof r.files === 'object' ? r.files : {}
  } catch { return {} }
}

// Which collections each document is in. A file stands for its current version and every earlier
// one this folder still has (from the folder tools' record and the `replaces` chain), so an app can
// still recognise an older version something was agreed under; the catalog marks those superseded.
function resolveCollections(folder: string, config: FolderConfig, documents: Map<string, LibraryDocument>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (!config.collections) return out
  const record = readRecord(folder)
  const add = (cid: string, name: string) => {
    if (!documents.has(cid)) return
    const names = out.get(cid) ?? []
    if (!names.includes(name)) out.set(cid, [...names, name].sort())
  }
  const withLineage = (cid: string, name: string, seen = new Set<string>()) => {
    if (seen.has(cid)) return
    seen.add(cid)
    add(cid, name)
    for (const r of documents.get(cid)?.document.replaces ?? []) withLineage(r.toString(), name, seen)
  }
  for (const [name, items] of Object.entries(config.collections)) {
    for (const item of items) {
      if (/\.(ya?ml|json)$/i.test(item)) {
        const current = [...documents.values()].find(d => d.file === item && !d.archived)
        if (!current) throw new Error(`${CONFIG_FILE}: collection "${name}" lists ${item}, which is not a valid document in this folder`)
        withLineage(current.cid, name)
        for (const cid of record[item]?.previous ?? []) withLineage(cid, name)
      } else {
        let cid: string
        try { cid = CID.parse(item).toString() } catch { throw new Error(`${CONFIG_FILE}: collection "${name}" lists "${item}", which is neither a file nor a CID`) }
        if (!documents.has(cid)) throw new Error(`${CONFIG_FILE}: collection "${name}" lists ${cid}, which this folder does not have (a catalog lists only documents it serves)`)
        withLineage(cid, name)
      }
    }
  }
  return out
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
      status: withdrawn.has(d.cid) ? 'withdrawn' : replaced.has(d.cid) || d.archived ? 'superseded' : 'current',
      ...(d.document.published ? { published: d.document.published } : {}),
      ...(d.document.replaces ? { replaces: d.document.replaces.map(String) } : {}),
      ...(lib.collections.get(d.cid) ? { collections: lib.collections.get(d.cid) } : {}),
    }))
  return { 'stroc-catalog': '1.1', domain, entries }
}
