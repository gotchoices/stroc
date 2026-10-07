// PDF output: turns a Stroc layout into PDF bytes with pdfmake (docs/Rendering.md).
//
// By default the fonts are embedded (Noto Serif for text, Noto Sans Mono for CIDs), so every
// viewer shows the same document, and Latin, Greek and Cyrillic text all render. The PDF standard
// fonts (Times, Courier; not embedded, Latin only) remain available for the smallest files.
// pdfmake is never allowed to fetch URLs or read files: fonts are loaded into its in-memory file
// system first.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { toPdfDefinition, type Layout, type PdfOptions } from '@stroc/render'

interface PdfMake {
  setFonts(fonts: Record<string, Record<string, string>>): void
  setUrlAccessPolicy(cb: (url: string) => boolean): void
  setLocalAccessPolicy?(cb: (path: string) => boolean): void
  virtualfs: { writeFileSync(name: string, data: Uint8Array): void }
  createPdf(def: unknown): { getBuffer(): Promise<Uint8Array> }
}

const require = createRequire(import.meta.url)

const STANDARD = {
  Times: { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' },
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
  Courier: { normal: 'Courier', bold: 'Courier-Bold', italics: 'Courier-Oblique', bolditalics: 'Courier-BoldOblique' },
}
const STANDARD_NAMES = new Set(Object.values(STANDARD).flatMap(f => Object.values(f)))

// Embedded fonts: [family, style, package, file within the package]
const EMBEDDED: [string, 'normal' | 'bold' | 'italics' | 'bolditalics', string, string][] = [
  ['NotoSerif', 'normal', '@expo-google-fonts/noto-serif', '400Regular/NotoSerif_400Regular.ttf'],
  ['NotoSerif', 'bold', '@expo-google-fonts/noto-serif', '700Bold/NotoSerif_700Bold.ttf'],
  ['NotoSerif', 'italics', '@expo-google-fonts/noto-serif', '400Regular_Italic/NotoSerif_400Regular_Italic.ttf'],
  ['NotoSerif', 'bolditalics', '@expo-google-fonts/noto-serif', '700Bold_Italic/NotoSerif_700Bold_Italic.ttf'],
  ['NotoSansMono', 'normal', '@expo-google-fonts/noto-sans-mono', '400Regular/NotoSansMono_400Regular.ttf'],
  ['NotoSansMono', 'bold', '@expo-google-fonts/noto-sans-mono', '400Regular/NotoSansMono_400Regular.ttf'],
  ['NotoSansMono', 'italics', '@expo-google-fonts/noto-sans-mono', '400Regular/NotoSansMono_400Regular.ttf'],
  ['NotoSansMono', 'bolditalics', '@expo-google-fonts/noto-sans-mono', '400Regular/NotoSansMono_400Regular.ttf'],
]

let pdfmake: PdfMake | undefined

function engine(): PdfMake {
  if (!pdfmake) {
    const pm = require('pdfmake') as PdfMake
    const fonts: Record<string, Record<string, string>> = { ...STANDARD }
    const vfsNames = new Set<string>()
    for (const [family, style, pkg, file] of EMBEDDED) {
      const name = path.basename(file)
      if (!vfsNames.has(name)) {
        const dir = path.dirname(require.resolve(`${pkg}/package.json`))
        pm.virtualfs.writeFileSync(name, readFileSync(path.join(dir, file)))
        vfsNames.add(name)
      }
      fonts[family] = { ...fonts[family], [style]: name }
    }
    pm.setFonts(fonts)
    pm.setUrlAccessPolicy(() => false)
    // pdfmake checks font names against the local access policy: allow the built-in standard
    // fonts and the fonts loaded into its virtual file system, nothing else.
    pm.setLocalAccessPolicy?.(name => STANDARD_NAMES.has(name) || vfsNames.has(name))
    pdfmake = pm
  }
  return pdfmake
}

export interface PdfWriteOptions extends Omit<PdfOptions, 'font' | 'monoFont' | 'fontSize' | 'lineHeight'> {
  standardFonts?: boolean   // use non-embedded Times and Courier (smaller files, Latin only)
}

export async function toPdf(layout: Layout, options: PdfWriteOptions = {}): Promise<Uint8Array> {
  // Noto Serif is larger on the body and has more built-in line spacing than Times.
  const fonts = options.standardFonts
    ? { font: 'Times', monoFont: 'Courier' }
    : { font: 'NotoSerif', monoFont: 'NotoSansMono', fontSize: 9.5, lineHeight: 1.0 }
  const def = toPdfDefinition(layout, { ...options, ...fonts })
  return new Uint8Array(await engine().createPdf(def).getBuffer())
}
