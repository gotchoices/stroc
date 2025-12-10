// Core types for Stroc documents

export interface StrocSection {
  title?: string
  text?: string       // single paragraph
  sections?: StrocSection[]
  source?: string   // CID
  as?: string       // alias for included doc
}

export interface StrocDocument {
  stroc: string
  language: string
  title: string
  author?: string
  published?: string
  text?: string       // single paragraph
  sections?: StrocSection[]
}
