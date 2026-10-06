// Document validation (Specification 0.14). Never throws; reports every problem found.

import { CID } from 'multiformats/cid'
import * as dagJson from '@ipld/dag-json'
import { sha256 } from 'multiformats/hashes/sha2'
import type { Problem } from './types.js'
import { checkText, findEntityLike } from './text.js'
import { isValidId, MAX_ID_LENGTH } from './ids.js'
import { canonicalLanguageTag, isCanonicalLanguageTag } from './language.js'
import { parseMarkup, findReferences } from './markup.js'

export const SUPPORTED_VERSIONS = ['0.1'] as const

const DOCUMENT_FIELDS = new Set(['stroc', 'language', 'title', 'author', 'published', 'text', 'sections', 'replaces', 'parameters'])
const INLINE_FIELDS = new Set(['id', 'title', 'text', 'sections'])
const INCLUDE_FIELDS = new Set(['id', 'source'])
const PARAMETER_FIELDS = new Set(['key', 'label', 'default'])

type Path = (string | number)[]

// A reference that steps into an included document; only composition can check the rest of it.
export interface ExternalReference {
  path: string[]          // full reference path; path[0] is the include's id
  at: Path                // where the reference appears
  offset: number
}

export interface ValidationResult {
  valid: boolean
  problems: Problem[]     // errors: the document is not valid
  warnings: Problem[]     // advice: the document is valid
  external: ExternalReference[]
}

interface Ctx {
  problems: Problem[]
  warnings: Problem[]
  ids: Map<string, { include: boolean, at: Path }>
  refs: { path: string[], at: Path, offset: number }[]
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !CID.asCID(v) && !(v instanceof Uint8Array)
}

function describe(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'an array'
  if (CID.asCID(v)) return 'a link'
  return `a ${typeof v}`
}

function problem(ctx: Ctx, at: Path, code: string, message: string, offset?: number) {
  ctx.problems.push({ path: at, code, message, ...(offset !== undefined ? { offset } : {}) })
}

function checkUnknown(ctx: Ctx, obj: Record<string, unknown>, allowed: Set<string>, at: Path) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) problem(ctx, [...at, key], 'unknown-field', `unknown field "${key}"`)
  }
}

// A plain-text string field. Returns the string if it is one.
function checkString(ctx: Ctx, value: unknown, at: Path): string | undefined {
  if (typeof value !== 'string') {
    problem(ctx, at, 'not-string', `must be a string, not ${describe(value)}`)
    return undefined
  }
  for (const issue of checkText(value)) problem(ctx, at, issue.code, issue.message, issue.offset)
  return value
}

// Paragraph text: canonical text plus markup grammar.
function checkParagraph(ctx: Ctx, value: unknown, at: Path) {
  const text = checkString(ctx, value, at)
  if (text === undefined) return
  const { nodes, issues } = parseMarkup(text)
  for (const issue of issues) problem(ctx, at, issue.code, issue.message, issue.offset)
  for (const ref of findReferences(nodes)) ctx.refs.push({ path: ref.path, at, offset: ref.offset })
  for (const offset of findEntityLike(text)) {
    ctx.warnings.push({ path: at, code: 'entity-like', message: 'looks like an HTML entity; Stroc text is literal, so it will appear exactly as written', offset })
  }
}

function checkId(ctx: Ctx, value: unknown, at: Path, include: boolean) {
  const id = checkString(ctx, value, at)
  if (id === undefined) return
  if (!isValidId(id)) {
    problem(ctx, at, 'bad-id', `"${id}" is not a valid id: lowercase letters, digits and single hyphens, starting with a letter, at most ${MAX_ID_LENGTH} characters`)
    return
  }
  const prior = ctx.ids.get(id)
  if (prior) problem(ctx, at, 'duplicate-id', `id "${id}" is already used at ${prior.at.join('.')}; ids must be unique within the document`)
  else ctx.ids.set(id, { include, at })
}

// A link to another Stroc document: CIDv1, DAG-JSON codec, SHA-256.
export function checkDocumentLink(value: unknown): string | undefined {
  const cid = CID.asCID(value)
  if (!cid) return `must be a link ({"/": "baguqeera..."}), not ${describe(value)}`
  if (cid.version !== 1) return 'must be a CIDv1'
  if (cid.code !== dagJson.code) return 'must link to a DAG-JSON document (CID beginning "baguqeera")'
  if (cid.multihash.code !== sha256.code) return 'must use a SHA-256 hash'
  return undefined
}

function checkLink(ctx: Ctx, value: unknown, at: Path) {
  const err = checkDocumentLink(value)
  if (err) problem(ctx, at, 'bad-link', err)
}

function checkArray(ctx: Ctx, value: unknown, at: Path): unknown[] | undefined {
  if (!Array.isArray(value)) {
    problem(ctx, at, 'not-array', `must be an array, not ${describe(value)}`)
    return undefined
  }
  if (value.length === 0) {
    problem(ctx, at, 'empty', 'must not be empty (omit the field instead)')
    return undefined
  }
  return value
}

function checkSections(ctx: Ctx, value: unknown, at: Path) {
  const list = checkArray(ctx, value, at)
  list?.forEach((sec, idx) => checkSection(ctx, sec, [...at, idx]))
}

function checkSection(ctx: Ctx, sec: unknown, at: Path) {
  if (!isObject(sec)) {
    problem(ctx, at, 'not-object', `a section must be an object, not ${describe(sec)}`)
    return
  }
  if ('source' in sec) {
    checkUnknown(ctx, sec, INCLUDE_FIELDS, at)
    checkLink(ctx, sec.source, [...at, 'source'])
    if (sec.id === undefined) problem(ctx, [...at, 'id'], 'missing-id', 'an include section must have an id')
    else checkId(ctx, sec.id, [...at, 'id'], true)
    return
  }
  checkUnknown(ctx, sec, INLINE_FIELDS, at)
  if (sec.title === undefined && sec.text === undefined && sec.sections === undefined) {
    problem(ctx, at, 'empty-section', 'a section must have a title, text or sections')
  }
  if (sec.id !== undefined) checkId(ctx, sec.id, [...at, 'id'], false)
  if (sec.title !== undefined) checkString(ctx, sec.title, [...at, 'title'])
  if (sec.text !== undefined) checkParagraph(ctx, sec.text, [...at, 'text'])
  if (sec.sections !== undefined) checkSections(ctx, sec.sections, [...at, 'sections'])
}

function checkVersion(ctx: Ctx, value: unknown) {
  if (value === undefined) { problem(ctx, ['stroc'], 'missing', 'missing format version "stroc"'); return }
  if (typeof value !== 'string') { problem(ctx, ['stroc'], 'not-string', `must be a string such as '0.1', not ${describe(value)}`); return }
  if ((SUPPORTED_VERSIONS as readonly string[]).includes(value)) return
  const newer = /^\d+(\.\d+)*$/.test(value) && compareVersions(value, SUPPORTED_VERSIONS[SUPPORTED_VERSIONS.length - 1]) > 0
  problem(ctx, ['stroc'], newer ? 'version-too-new' : 'unknown-version',
    newer ? `format version "${value}" is newer than this tool supports; upgrade the tool`
          : `unknown format version "${value}"; supported: ${SUPPORTED_VERSIONS.join(', ')}`)
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

function checkLanguage(ctx: Ctx, value: unknown) {
  if (value === undefined) { problem(ctx, ['language'], 'missing', 'missing language'); return }
  const tag = checkString(ctx, value, ['language'])
  if (tag === undefined || isCanonicalLanguageTag(tag)) return
  const fixed = canonicalLanguageTag(tag)
  problem(ctx, ['language'], 'bad-language', fixed
    ? `language tag must be written "${fixed}"`
    : `"${tag}" is not a BCP 47 language tag (for example "en", "en-US", "sr-Latn")`)
}

function checkPublished(ctx: Ctx, value: unknown) {
  const date = checkString(ctx, value, ['published'])
  if (date === undefined) return
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const ok = m && (() => {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
  })()
  if (!ok) problem(ctx, ['published'], 'bad-date', 'must be a date written YYYY-MM-DD')
}

function checkReplaces(ctx: Ctx, value: unknown) {
  const list = checkArray(ctx, value, ['replaces'])
  if (!list) return
  const seen = new Set<string>()
  list.forEach((link, idx) => {
    checkLink(ctx, link, ['replaces', idx])
    const cid = CID.asCID(link)
    if (cid) {
      if (seen.has(cid.toString())) problem(ctx, ['replaces', idx], 'duplicate', 'listed more than once')
      seen.add(cid.toString())
    }
  })
}

function checkParameters(ctx: Ctx, value: unknown) {
  const list = checkArray(ctx, value, ['parameters'])
  if (!list) return
  const keys = new Set<string>()
  list.forEach((param, idx) => {
    const at: Path = ['parameters', idx]
    if (!isObject(param)) { problem(ctx, at, 'not-object', `a parameter must be an object, not ${describe(param)}`); return }
    checkUnknown(ctx, param, PARAMETER_FIELDS, at)
    if (param.key === undefined) problem(ctx, [...at, 'key'], 'missing', 'a parameter must have a key')
    else {
      const key = checkString(ctx, param.key, [...at, 'key'])
      if (key !== undefined) {
        if (!isValidId(key)) problem(ctx, [...at, 'key'], 'bad-id', `"${key}" is not a valid key: same rules as a section id`)
        else if (keys.has(key)) problem(ctx, [...at, 'key'], 'duplicate-key', `parameter key "${key}" is declared more than once`)
        keys.add(key)
      }
    }
    if (param.label === undefined) problem(ctx, [...at, 'label'], 'missing', 'a parameter must have a label')
    else checkString(ctx, param.label, [...at, 'label'])
    if (param.default !== undefined) checkString(ctx, param.default, [...at, 'default'])
  })
}

function checkReferences(ctx: Ctx): ExternalReference[] {
  const external: ExternalReference[] = []
  for (const ref of ctx.refs) {
    const target = ctx.ids.get(ref.path[0])
    if (!target) {
      problem(ctx, ref.at, 'unresolved-ref', `<ref:${ref.path.join('/')}>: no section with id "${ref.path[0]}" in this document`, ref.offset)
    } else if (ref.path.length > 1) {
      if (!target.include) {
        problem(ctx, ref.at, 'bad-ref-path', `<ref:${ref.path.join('/')}>: "${ref.path[0]}" is not an included document, so the path cannot continue`, ref.offset)
      } else {
        external.push({ path: ref.path, at: ref.at, offset: ref.offset })
      }
    }
  }
  return external
}

// Validate a document in the data model (links as CID objects, e.g. from fromPlain or decodeDocument).
export function validateDocument(doc: unknown): ValidationResult {
  const ctx: Ctx = { problems: [], warnings: [], ids: new Map(), refs: [] }
  if (!isObject(doc)) {
    problem(ctx, [], 'not-object', `a document must be an object, not ${describe(doc)}`)
    return { valid: false, problems: ctx.problems, warnings: [], external: [] }
  }
  checkUnknown(ctx, doc, DOCUMENT_FIELDS, [])
  checkVersion(ctx, doc.stroc)
  checkLanguage(ctx, doc.language)
  if (doc.title === undefined) problem(ctx, ['title'], 'missing', 'missing title')
  else checkString(ctx, doc.title, ['title'])
  if (doc.author !== undefined) checkString(ctx, doc.author, ['author'])
  if (doc.published !== undefined) checkPublished(ctx, doc.published)
  if (doc.text !== undefined) checkParagraph(ctx, doc.text, ['text'])
  if (doc.sections !== undefined) checkSections(ctx, doc.sections, ['sections'])
  if (doc.replaces !== undefined) checkReplaces(ctx, doc.replaces)
  if (doc.parameters !== undefined) checkParameters(ctx, doc.parameters)
  const external = checkReferences(ctx)
  return { valid: ctx.problems.length === 0, problems: ctx.problems, warnings: ctx.warnings, external }
}
