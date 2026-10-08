// The editor's document model: the document being edited, with a stable key on every section so
// the UI can track sections as they move. Pure functions, no DOM: tested on their own.

import { suggestId, parseMarkup, canonicalMarkup, type MarkupNode } from '@stroc/core'

export interface EditSection {
  key: string
  id?: string
  title?: string
  text?: string            // paragraph markup
  sections: EditSection[]
  source?: string          // CID of an included document (then only id and source apply)
}

export interface EditParameter {
  key: string
  label: string
  default?: string
}

export interface EditDoc {
  stroc: string
  language: string
  title: string
  author?: string
  published?: string
  text?: string
  replaces: string[]
  parameters: EditParameter[]
  sections: EditSection[]
}

let counter = 0
export const newKey = () => `s${++counter}`

export function newDoc(): EditDoc {
  return { stroc: '1.0', language: 'en', title: 'Untitled Document', replaces: [], parameters: [], sections: [] }
}

export function newSection(init: Partial<Omit<EditSection, 'key'>> = {}): EditSection {
  return { key: newKey(), sections: [], ...init }
}

// ---------------------------------------------------------------------------------------------
// Conversion to and from the plain form (links as {"/": cid})

const linkOf = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : v && typeof v === 'object' && '/' in v ? String((v as { '/': unknown })['/']) : undefined

export function fromPlain(plain: Record<string, unknown>): EditDoc {
  const section = (s: Record<string, unknown>): EditSection => {
    if (s.source !== undefined) return { key: newKey(), id: (s.id ?? s.as) as string | undefined, source: linkOf(s.source), sections: [] }
    return {
      key: newKey(),
      ...(s.id !== undefined ? { id: String(s.id) } : {}),
      ...(s.title !== undefined ? { title: String(s.title) } : {}),
      ...(s.text !== undefined ? { text: String(s.text) } : {}),
      sections: Array.isArray(s.sections) ? s.sections.map(x => section(x as Record<string, unknown>)) : [],
    }
  }
  return {
    stroc: String(plain.stroc ?? '1.0'),
    language: String(plain.language ?? 'en'),
    title: String(plain.title ?? ''),
    ...(plain.author !== undefined ? { author: String(plain.author) } : {}),
    ...(plain.published !== undefined ? { published: String(plain.published) } : {}),
    ...(plain.text !== undefined ? { text: String(plain.text) } : {}),
    replaces: Array.isArray(plain.replaces) ? plain.replaces.map(linkOf).filter((x): x is string => !!x) : [],
    parameters: Array.isArray(plain.parameters) ? (plain.parameters as EditParameter[]).map(p => ({ ...p })) : [],
    sections: Array.isArray(plain.sections) ? plain.sections.map(x => section(x as Record<string, unknown>)) : [],
  }
}

// Tidy plain text (editors normalize as the author types): single spaces, trimmed.
const tidy = (v: string | undefined): string | undefined => {
  if (v === undefined) return undefined
  const t = v.replace(/\s+/g, ' ').trim()   // \s includes the no-break space
  return t || undefined
}
const tidyText = (v: string | undefined) => (v === undefined ? undefined : canonicalMarkup(v) || undefined)

const omitUndefined = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

// The document as it is validated, hashed and saved: empty values omitted, text canonical, links
// written {"/": cid}. Sections with nothing in them are dropped. If `trace` is given, it records
// which section each plain path ("sections.0.sections.2") came from, for placing problems.
export function toPlain(doc: EditDoc, trace?: Map<string, string>): Record<string, unknown> {
  const list = (items: EditSection[], prefix: string): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = []
    for (const s of items) {
      const path = `${prefix}sections.${out.length}`
      const plain = section(s, path)
      if (plain) { out.push(plain); trace?.set(path, s.key) }
    }
    return out
  }
  const section = (s: EditSection, path: string): Record<string, unknown> | undefined => {
    if (s.source !== undefined) return { id: tidy(s.id), source: { '/': tidy(s.source) ?? '' } }
    const sections = list(s.sections, `${path}.`)
    const out = omitUndefined({ id: tidy(s.id), title: tidy(s.title), text: tidyText(s.text), sections: sections.length ? sections : undefined })
    return Object.keys(out).length ? out : undefined
  }
  const sections = list(doc.sections, '')
  const parameters = doc.parameters
    .map(p => omitUndefined({ key: tidy(p.key), label: tidy(p.label), default: tidy(p.default) }))
    .filter(p => p.key || p.label)
  return omitUndefined({
    stroc: doc.stroc,
    language: tidy(doc.language),
    title: tidy(doc.title),
    author: tidy(doc.author),
    published: tidy(doc.published),
    text: tidyText(doc.text),
    replaces: doc.replaces.length ? doc.replaces.map(c => ({ '/': c })) : undefined,
    parameters: parameters.length ? parameters : undefined,
    sections: sections.length ? sections : undefined,
  })
}

// ---------------------------------------------------------------------------------------------
// Navigation

export interface Located {
  section: EditSection
  parent: EditSection[]      // the list it is in
  index: number
  path: number[]             // indexes from the document root
}

export function locate(doc: EditDoc, key: string): Located | undefined {
  const walk = (list: EditSection[], path: number[]): Located | undefined => {
    for (let i = 0; i < list.length; i++) {
      const s = list[i]
      if (s.key === key) return { section: s, parent: list, index: i, path: [...path, i] }
      const inner = walk(s.sections, [...path, i])
      if (inner) return inner
    }
    return undefined
  }
  return walk(doc.sections, [])
}

export function allSections(doc: EditDoc): { section: EditSection, number: string, depth: number }[] {
  const out: { section: EditSection, number: string, depth: number }[] = []
  const walk = (list: EditSection[], prefix: string, depth: number) => list.forEach((s, i) => {
    const number = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
    out.push({ section: s, number, depth })
    if (s.source === undefined) walk(s.sections, number, depth + 1)
  })
  walk(doc.sections, '', 1)
  return out
}

// The section at a validation problem's path (['sections', 2, 'sections', 0, 'text']).
export function sectionAtPath(doc: EditDoc, path: (string | number)[]): EditSection | undefined {
  let list = doc.sections
  let found: EditSection | undefined
  for (let i = 0; i + 1 < path.length && path[i] === 'sections'; i += 2) {
    found = list[path[i + 1] as number]
    if (!found) return undefined
    list = found.sections
  }
  return found
}

function isDescendant(ancestor: EditSection, key: string): boolean {
  return ancestor.sections.some(s => s.key === key || isDescendant(s, key))
}

// ---------------------------------------------------------------------------------------------
// Structure operations. Each returns true if it changed the document.

export function moveUp(doc: EditDoc, key: string): boolean {
  const at = locate(doc, key)
  if (!at || at.index === 0) return false
  at.parent.splice(at.index, 1)
  at.parent.splice(at.index - 1, 0, at.section)
  return true
}

export function moveDown(doc: EditDoc, key: string): boolean {
  const at = locate(doc, key)
  if (!at || at.index >= at.parent.length - 1) return false
  at.parent.splice(at.index, 1)
  at.parent.splice(at.index + 1, 0, at.section)
  return true
}

// Make the section the last child of its previous sibling (which must be written out).
export function indent(doc: EditDoc, key: string): boolean {
  const at = locate(doc, key)
  if (!at || at.index === 0) return false
  const prev = at.parent[at.index - 1]
  if (prev.source !== undefined) return false
  at.parent.splice(at.index, 1)
  prev.sections.push(at.section)
  return true
}

// Move the section out of its parent, to just after the parent.
export function outdent(doc: EditDoc, key: string): boolean {
  const at = locate(doc, key)
  if (!at || at.path.length < 2) return false
  const parentKey = locateParentKey(doc, at)
  const parentAt = parentKey ? locate(doc, parentKey) : undefined
  if (!parentAt) return false
  at.parent.splice(at.index, 1)
  parentAt.parent.splice(parentAt.index + 1, 0, at.section)
  return true
}

function locateParentKey(doc: EditDoc, at: Located): string | undefined {
  let list = doc.sections
  let parent: EditSection | undefined
  for (const i of at.path.slice(0, -1)) { parent = list[i]; list = parent.sections }
  return parent?.key
}

export function remove(doc: EditDoc, key: string): boolean {
  const at = locate(doc, key)
  if (!at) return false
  at.parent.splice(at.index, 1)
  return true
}

// A deep copy with new keys (and no ids, which must stay unique).
export function copySection(s: EditSection): EditSection {
  return { ...s, key: newKey(), id: s.source !== undefined ? s.id : undefined, sections: s.sections.map(copySection) }
}

export type Placement = 'before' | 'after' | 'into'

// Move (or copy) a section relative to a target. Refuses to put a section inside itself.
export function place(doc: EditDoc, key: string, targetKey: string, where: Placement, copy = false): boolean {
  if (key === targetKey && !copy) return false
  const from = locate(doc, key)
  const target = locate(doc, targetKey)
  if (!from || !target) return false
  if (!copy && isDescendant(from.section, targetKey)) return false
  if (where === 'into' && target.section.source !== undefined) return false
  const moving = copy ? copySection(from.section) : from.section
  if (!copy) from.parent.splice(from.index, 1)
  const t = locate(doc, targetKey)!     // indexes may have shifted
  if (where === 'into') t.section.sections.push(moving)
  else t.parent.splice(t.index + (where === 'after' ? 1 : 0), 0, moving)
  return true
}

export function insertAfter(doc: EditDoc, key: string | undefined, section: EditSection): void {
  const at = key ? locate(doc, key) : undefined
  if (!at) doc.sections.push(section)
  else at.parent.splice(at.index + 1, 0, section)
}

// Split a section's paragraph: the section keeps `before`; a new untitled paragraph section with
// `after` follows it as a sibling. Returns the new section.
export function splitParagraph(doc: EditDoc, key: string, before: string, after: string): EditSection | undefined {
  const at = locate(doc, key)
  if (!at) return undefined
  at.section.text = before || undefined
  const next = newSection({ text: after || undefined })
  at.parent.splice(at.index + 1, 0, next)
  return next
}

// Join an untitled paragraph onto the previous sibling's paragraph (Backspace at its start).
// Returns the section that now holds the text and where the join is, or undefined if not possible.
export function mergeWithPrevious(doc: EditDoc, key: string): { into: EditSection, at: number } | undefined {
  const loc = locate(doc, key)
  if (!loc || loc.index === 0 || loc.section.title || loc.section.sections.length || loc.section.source !== undefined) return undefined
  const prev = loc.parent[loc.index - 1]
  if (prev.source !== undefined || prev.sections.length) return undefined
  const left = prev.text ?? ''
  const right = loc.section.text ?? ''
  const joined = canonicalMarkup(left && right ? `${left} ${right}` : left + right)
  const at = plainLength(left)
  prev.text = joined || undefined
  loc.parent.splice(loc.index, 1)
  return { into: prev, at }
}

// Length in atoms: characters of text, plus one per reference or placeholder (as the editor counts).
export function plainLength(markup: string): number {
  const count = (nodes: MarkupNode[]): number => nodes.reduce((n, x) =>
    n + (x.type === 'text' ? x.value.length : x.type === 'ref' || x.type === 'param' ? 1 : count(x.children)), 0)
  return count(parseMarkup(markup).nodes)
}

// Inline an included document: replace the include with written-out sections (a copy, no longer
// linked by CID). `content` comes from the composed include.
export function replaceInclude(doc: EditDoc, key: string, content: { title?: string, text?: string, sections: EditSection[] }): boolean {
  const at = locate(doc, key)
  if (!at || at.section.source === undefined) return false
  at.parent[at.index] = { key: at.section.key, id: at.section.id, ...content.title ? { title: content.title } : {}, ...content.text ? { text: content.text } : {}, sections: content.sections }
  return true
}

// ---------------------------------------------------------------------------------------------
// Ids and references

export function idsInUse(doc: EditDoc): Set<string> {
  const ids = new Set<string>()
  const walk = (list: EditSection[]) => list.forEach(s => { if (s.id) ids.add(s.id); if (s.source === undefined) walk(s.sections) })
  walk(doc.sections)
  return ids
}

// A new id for a section, from its title, unique in the document.
export function uniqueId(doc: EditDoc, title: string | undefined): string {
  const base = suggestId(title ?? 'section')
  const used = idsInUse(doc)
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
}

// Rename an id and update every reference in the document whose path starts with it.
export function renameId(doc: EditDoc, oldId: string, newId: string): number {
  let count = 0
  const fix = (text: string | undefined) => text?.replace(/<ref:([a-z0-9/-]+)>/g, (m, path: string) => {
    const parts = path.split('/')
    if (parts[0] !== oldId) return m
    count++
    return `<ref:${[newId, ...parts.slice(1)].join('/')}>`
  })
  doc.text = fix(doc.text)
  const walk = (list: EditSection[]) => list.forEach(s => {
    if (s.id === oldId) s.id = newId
    s.text = fix(s.text)
    walk(s.sections)
  })
  walk(doc.sections)
  return count
}

export function includeCids(doc: EditDoc): string[] {
  const out: string[] = []
  const walk = (list: EditSection[]) => list.forEach(s => { if (s.source) out.push(s.source); else walk(s.sections) })
  walk(doc.sections)
  return out
}

// Rename a parameter key and update every placeholder for it in the document.
export function renameParam(doc: EditDoc, oldKey: string, newKey: string): number {
  let count = 0
  const fix = (text: string | undefined) => text?.replace(/<param:([a-z0-9-]+)>/g, (m, key: string) => {
    if (key !== oldKey) return m
    count++
    return `<param:${newKey}>`
  })
  doc.text = fix(doc.text)
  const walk = (list: EditSection[]) => list.forEach(s => { s.text = fix(s.text); walk(s.sections) })
  walk(doc.sections)
  for (const p of doc.parameters) if (p.key === oldKey) p.key = newKey
  return count
}
