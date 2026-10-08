// Core types for Stroc documents (Specification 1.0)
import type { CID } from 'multiformats/cid'

export type { CID }

export interface InlineSection {
  id?: string
  title?: string
  text?: string          // one paragraph, may contain markup
  sections?: StrocSection[]
}

export interface IncludeSection {
  id: string             // local name of the included document
  source: CID            // link to the included document
}

export type StrocSection = InlineSection | IncludeSection

export interface Parameter {
  key: string
  label: string
  default?: string
}

export interface StrocDocument {
  stroc: string
  language: string       // BCP 47 tag
  title: string
  author?: string
  published?: string     // YYYY-MM-DD
  text?: string
  sections?: StrocSection[]
  replaces?: CID[]
  parameters?: Parameter[]
}

// A problem found in a document. `path` locates the offending value, e.g. ['sections', 2, 'text'].
export interface Problem {
  path: (string | number)[]
  code: string
  message: string
  offset?: number        // character offset within a text value, where applicable
}

export function isIncludeSection(sec: StrocSection): sec is IncludeSection {
  return 'source' in sec
}
