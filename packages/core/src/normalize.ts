import he from 'he'

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

