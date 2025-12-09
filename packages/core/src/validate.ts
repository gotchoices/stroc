import { StrocDocument } from './types'

export function validateDocument(doc: unknown): { valid: boolean; errors?: string[] } {
  const errors: string[] = []
  const d = doc as Partial<StrocDocument>
  if (!d || typeof d !== 'object') {
    return { valid: false, errors: ['Document must be an object'] }
  }
  if (!d.stroc) errors.push('Missing stroc version')
  if (!d.language) errors.push('Missing language')
  if (!d.title) errors.push('Missing title')
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined }
}

