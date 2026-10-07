// A folder of documents as the folder tools see it: each file's current CID, the CIDs it had before
// (from the record file and from documents' `replaces` lists), and the state of every include.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { documentCid } from '@stroc/core'

// Every version the tools have recorded, kept as its exact bytes, so editing a file in place never
// loses a published version (signed agreements refer to it by CID). The server serves these too.
export const ARCHIVE_DIR = '.stroc-archive'
import { lintYaml, findLinkValues, isFileLink } from '@stroc/yaml'

// The record file: the tool's memory of which CIDs each file has had. Not a document; if it is
// lost, it is rebuilt from the folder and the documents' `replaces` lists, and only CIDs nobody
// recorded become "unknown".
export const RECORD_FILE = '.stroc-record.json'

interface Record {
  files: { [name: string]: { cid?: string, previous: string[] } }
}

export interface FolderFile {
  name: string
  file: string
  text: string
  cid?: string                    // current CID, if the file is a valid document
  bytes?: Uint8Array              // its canonical bytes
  problems: number
  previous: string[]              // earlier CIDs of this file
}

export type IncludeState =
  | { kind: 'current', target: string }                       // the current version of a file here
  | { kind: 'outdated', target: string, current: string }     // an earlier version of a file here
  | { kind: 'file-link', target: string }                     // a draft link to a file (stroc link)
  | { kind: 'external' }                                      // not a document of this folder

export interface Include {
  file: string                    // the including file's name
  line: number
  cid: string
  state: IncludeState
}

export interface Folder {
  dir: string
  files: FolderFile[]
  includes: Include[]
  byName: Map<string, FolderFile>
}

function readRecord(dir: string): Record {
  try {
    const r = JSON.parse(readFileSync(path.join(dir, RECORD_FILE), 'utf8')) as Record
    if (r && typeof r.files === 'object') return r
  } catch { /* missing or unreadable: rebuilt */ }
  return { files: {} }
}

export async function loadFolder(dir: string): Promise<Folder> {
  const record = readRecord(dir)
  const names = readdirSync(dir).filter(n => /\.(ya?ml|json)$/i.test(n) && !n.startsWith('.')).sort()
  const files: FolderFile[] = []
  for (const name of names) {
    const file = path.join(dir, name)
    const text = readFileSync(file, 'utf8')
    const lint = lintYaml(text)
    const result = lint.valid ? await documentCid(lint.value) : undefined
    const cid = result?.cid?.toString()
    const prior = record.files[name] ?? { previous: [] }
    const previous = [...prior.previous]
    if (prior.cid && prior.cid !== cid && !previous.includes(prior.cid)) previous.push(prior.cid)
    // Versions this document says it replaces are earlier versions of this file too.
    for (const v of findLinkValues(text)) if (v.inReplaces && !previous.includes(v.value)) previous.push(v.value)
    files.push({ name, file, text, cid, bytes: result?.bytes, problems: lint.problems.length, previous })
  }
  const byName = new Map(files.map(f => [f.name, f]))
  const byCid = new Map<string, FolderFile>()
  for (const f of files) if (f.cid) byCid.set(f.cid, f)
  const byPrevious = new Map<string, FolderFile>()
  for (const f of files) for (const p of f.previous) if (!byCid.has(p)) byPrevious.set(p, f)

  const includes: Include[] = []
  for (const f of files) {
    for (const v of findLinkValues(f.text)) {
      if (v.inReplaces) continue
      const current = byCid.get(v.value)
      const older = byPrevious.get(v.value)
      const state: IncludeState =
        current ? { kind: 'current', target: current.name } :
        older?.cid ? { kind: 'outdated', target: older.name, current: older.cid } :
        isFileLink(v.value) ? { kind: 'file-link', target: v.value } :
        { kind: 'external' }
      includes.push({ file: f.name, line: v.line, cid: v.value, state })
    }
  }
  return { dir, files, includes, byName }
}

// Remember every file's current CID (and keep what it had before), and archive its bytes.
export function saveRecord(folder: Folder) {
  const record: Record = { files: {} }
  for (const f of folder.files) record.files[f.name] = { ...(f.cid ? { cid: f.cid } : {}), previous: f.previous }
  writeFileSync(path.join(folder.dir, RECORD_FILE), JSON.stringify(record, null, 2) + '\n')
  const archive = path.join(folder.dir, ARCHIVE_DIR)
  for (const f of folder.files) {
    if (!f.cid || !f.bytes) continue
    const out = path.join(archive, `${f.cid}.json`)
    if (existsSync(out)) continue
    mkdirSync(archive, { recursive: true })
    writeFileSync(out, f.bytes)
  }
}

export function isArchived(dir: string, cid: string): boolean {
  return existsSync(path.join(dir, ARCHIVE_DIR, `${cid}.json`))
}

export function hasRecord(dir: string): boolean {
  return existsSync(path.join(dir, RECORD_FILE))
}
