import he from 'he'
import { StrocDocument, StrocSection } from './types.js'

const ALLOWED_BIDI = new Set([
  '\u200E', // LRM
  '\u200F', // RLM
  '\u202A', // LRE
  '\u202B', // RLE
  '\u202C', // PDF
  '\u2066', // LRI
  '\u2067', // RLI
  '\u2068', // FSI
  '\u2069'  // PDI
])

// Normalize a single string per spec: decode entities, strip controls (except bidi), NFC, collapse whitespace.
export function normalizeString(input: string): string {
  if (!input) return ''
  // Decode HTML entities
  let text = he.decode(input)
  // Strip control chars except allowed bidi, keep space/tab/newline
  text = Array.from(text)
    .filter(ch => {
      const code = ch.codePointAt(0) ?? 0
      if (ALLOWED_BIDI.has(ch)) return true
      if (ch === ' ' || ch === '\t' || ch === '\n') return true
      if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false
      return true
    })
    .join('')
  // Normalize Unicode
  text = text.normalize('NFC')
  // Collapse whitespace (space/tab/newline) to single space, trim
  text = text.replace(/[\s\u00A0]+/g, ' ').trim()
  return text
}

// Normalize paragraphs/sentences; drop empty sentences and paragraphs
export function normalizeTextArray(text?: string[][]): string[][] | undefined {
  if (!text) return undefined
  const paragraphs = text
    .map(par => par.map(normalizeString).filter(s => s.length > 0))
    .filter(par => par.length > 0)
  return paragraphs.length > 0 ? paragraphs : undefined
}

function normalizeSection(sec: StrocSection): StrocSection {
  const title = sec.title ? normalizeString(sec.title) : undefined
  const text = normalizeTextArray(sec.text)
  const sections = sec.sections?.map(normalizeSection).filter(Boolean)
  const source = sec.source ? normalizeString(sec.source) : undefined
  const as = sec.as ? normalizeString(sec.as) : undefined
  return {
    ...(title ? { title } : {}),
    ...(text ? { text } : {}),
    ...(sections && sections.length ? { sections } : {}),
    ...(source ? { source } : {}),
    ...(as ? { as } : {})
  }
}

export function normalizeDocument(doc: StrocDocument): StrocDocument {
  const title = normalizeString(doc.title)
  const language = normalizeString(doc.language)
  const author = doc.author ? normalizeString(doc.author) : undefined
  const published = doc.published ? normalizeString(doc.published) : undefined
  const text = normalizeTextArray(doc.text)
  const sections = doc.sections?.map(normalizeSection).filter(Boolean)
  return {
    stroc: doc.stroc,
    title,
    language,
    ...(author ? { author } : {}),
    ...(published ? { published } : {}),
    ...(text ? { text } : {}),
    ...(sections && sections.length ? { sections } : {})
  }
}

