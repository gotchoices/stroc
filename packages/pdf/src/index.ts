// PDF output: turns a Stroc layout into PDF bytes with pdfmake (docs/Rendering.md).
//
// Uses the PDF standard fonts (Times, Helvetica, Courier), which cover Latin text only; documents
// in other scripts need embedded fonts (an open issue). External resources are never fetched:
// the definition contains none, and pdfmake's URL and file access is denied outright.

import { createRequire } from 'node:module'
import { toPdfDefinition, type Layout, type PdfOptions } from '@stroc/render'

interface PdfMake {
  setFonts(fonts: Record<string, Record<string, string>>): void
  setUrlAccessPolicy(cb: (url: string) => boolean): void
  setLocalAccessPolicy?(cb: (path: string) => boolean): void
  createPdf(def: unknown): { getBuffer(): Promise<Uint8Array> }
}

const require = createRequire(import.meta.url)

const FONTS = {
  Times: { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' },
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
  Courier: { normal: 'Courier', bold: 'Courier-Bold', italics: 'Courier-Oblique', bolditalics: 'Courier-BoldOblique' },
}
const STANDARD_FONTS = new Set(Object.values(FONTS).flatMap(f => Object.values(f)))
let pdfmake: PdfMake | undefined

function engine(): PdfMake {
  if (!pdfmake) {
    pdfmake = require('pdfmake') as PdfMake
    pdfmake.setFonts(FONTS)
    pdfmake.setUrlAccessPolicy(() => false)
    // pdfmake checks font names against the local access policy too: allow exactly the built-in
    // standard fonts, and nothing else.
    pdfmake.setLocalAccessPolicy?.(name => STANDARD_FONTS.has(name))
  }
  return pdfmake
}

export async function toPdf(layout: Layout, options: PdfOptions = {}): Promise<Uint8Array> {
  const bytes = await engine().createPdf(toPdfDefinition(layout, options)).getBuffer()
  return new Uint8Array(bytes)
}
