import { StrocDocument, StrocSection } from './types.js'

const RESERVED_PATH_CHARS = /[\/#?%\\]/u

function hasControlChars(str: string): boolean {
  return /[\u0000-\u001F\u007F-\u009F]/u.test(str)
}

function validateText(text: unknown, ctx: string, errors: string[]) {
  if (text === undefined) return
  if (typeof text !== 'string') {
    errors.push(`${ctx}: text must be a string (single paragraph)`)
  } else if (!text.trim()) {
    errors.push(`${ctx}: text must not be empty`)
  }
}

function validateTitleOrAlias(label: string, value: string, ctx: string, errors: string[]) {
  if (!value) {
    errors.push(`${ctx}: ${label} must be non-empty`)
    return
  }
  if (RESERVED_PATH_CHARS.test(value)) {
    errors.push(`${ctx}: ${label} contains reserved characters / # ? % \\`)
  }
  if (hasControlChars(value)) {
    errors.push(`${ctx}: ${label} contains control characters`)
  }
}

function validateSection(sec: StrocSection, ctx: string, errors: string[]) {
  if (sec.title) validateTitleOrAlias('title', sec.title, ctx, errors)
  if (sec.as) validateTitleOrAlias('as', sec.as, ctx, errors)
  if (sec.source && typeof sec.source !== 'string') {
    errors.push(`${ctx}: source must be string CID`)
  }
  validateText(sec.text, `${ctx}:text`, errors)
  if (sec.sections) {
    if (!Array.isArray(sec.sections)) {
      errors.push(`${ctx}: sections must be array`)
    } else {
      // uniqueness among siblings
      const seen = new Set<string>()
      sec.sections.forEach((child: StrocSection, idx: number) => {
        const t = child.title || ''
        if (t) {
          if (seen.has(t)) errors.push(`${ctx}: duplicate section title among siblings: "${t}"`)
          else seen.add(t)
        }
        validateSection(child, `${ctx}:section[${idx}]`, errors)
      })
    }
  }
}

export function validateDocument(doc: unknown): { valid: boolean; errors?: string[] } {
  const errors: string[] = []
  const d = doc as Partial<StrocDocument>
  if (!d || typeof d !== 'object') {
    return { valid: false, errors: ['Document must be an object'] }
  }
  if (!d.stroc) errors.push('Missing stroc version')
  if (!d.language) errors.push('Missing language')
  if (!d.title) errors.push('Missing title')
  validateTitleOrAlias('title', d.title || '', 'document', errors)
  if (d.author) validateTitleOrAlias('author', d.author, 'document', errors) // light check
  validateText(d.text, 'document:text', errors)
  if (d.sections) {
    if (!Array.isArray(d.sections)) {
      errors.push('document: sections must be array')
    } else {
      const seen = new Set<string>()
      d.sections.forEach((sec: StrocSection, idx: number) => {
        const t = sec.title || ''
        if (t) {
          if (seen.has(t)) errors.push(`document: duplicate top-level section title: "${t}"`)
          else seen.add(t)
        }
        validateSection(sec, `document:section[${idx}]`, errors)
      })
    }
  }
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined }
}

