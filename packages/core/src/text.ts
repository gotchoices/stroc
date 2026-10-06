// Canonical text rules (Specification: Canonical Form, rules 4 to 6)

// Invisible characters that are never allowed (rule 6).
const FORBIDDEN_INVISIBLE = new Set(['​', '⁠', '﻿', '­'])

function isControl(code: number): boolean {
  return code < 0x20 || (code >= 0x7f && code <= 0x9f)
}

function isWhitespace(ch: string): boolean {
  return /\s/u.test(ch) && !FORBIDDEN_INVISIBLE.has(ch)
}

export interface TextIssue {
  code: string
  message: string
  offset?: number
}

// Report every way a string departs from canonical text. Empty result means canonical.
export function checkText(value: string): TextIssue[] {
  const issues: TextIssue[] = []
  if (value.length === 0) {
    issues.push({ code: 'empty', message: 'must not be empty (omit the field instead)' })
    return issues
  }
  if (value !== value.normalize('NFC')) {
    issues.push({ code: 'not-nfc', message: 'must be in Unicode NFC form' })
  }
  let offset = 0
  let prevSpace = false
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (ch === ' ') {
      if (offset === 0) issues.push({ code: 'leading-space', message: 'must not begin with a space', offset })
      else if (prevSpace) issues.push({ code: 'double-space', message: 'must not contain two spaces in a row', offset })
      prevSpace = true
    } else {
      prevSpace = false
      if (FORBIDDEN_INVISIBLE.has(ch)) {
        issues.push({ code: 'invisible', message: `invisible character U+${hex(code)} is not allowed`, offset })
      } else if (isWhitespace(ch)) {
        issues.push({ code: 'whitespace', message: `whitespace U+${hex(code)} is not allowed; use a single ordinary space`, offset })
      } else if (isControl(code)) {
        issues.push({ code: 'control', message: `control character U+${hex(code)} is not allowed`, offset })
      }
    }
    offset += ch.length
  }
  if (value.endsWith(' ')) {
    issues.push({ code: 'trailing-space', message: 'must not end with a space', offset: value.length - 1 })
  }
  return issues
}

export function isCanonicalText(value: string): boolean {
  return checkText(value).length === 0
}

// Produce the canonical form of a string, for editors and lint fixes. Never applied before hashing.
export function canonicalizeText(value: string): string {
  let out = ''
  for (const ch of value.normalize('NFC')) {
    const code = ch.codePointAt(0) ?? 0
    if (FORBIDDEN_INVISIBLE.has(ch)) continue
    if (isWhitespace(ch)) out += ' '
    else if (isControl(code)) continue
    else out += ch
  }
  return out.replace(/ {2,}/g, ' ').trim()
}

// A sequence that looks like an HTML entity, for lint warnings (rule 7).
export function findEntityLike(value: string): number[] {
  const offsets: number[] = []
  for (const m of value.matchAll(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g)) {
    offsets.push(m.index ?? 0)
  }
  return offsets
}

function hex(code: number): string {
  return code.toString(16).toUpperCase().padStart(4, '0')
}
