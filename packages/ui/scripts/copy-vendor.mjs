// Copy what PDF export loads on demand into dist/vendor, beside the editor bundle, so the built
// editor is self-contained on any static host: pdfmake's browser build and the Noto fonts.
import { mkdirSync, copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/vendor')
const pkg = name => path.dirname(require.resolve(`${name}/package.json`))
mkdirSync(path.join(out, 'fonts'), { recursive: true })
copyFileSync(path.join(pkg('pdfmake'), 'build/pdfmake.min.js'), path.join(out, 'pdfmake.min.js'))
for (const [p, f] of [
  ['@expo-google-fonts/noto-serif', '400Regular/NotoSerif_400Regular.ttf'],
  ['@expo-google-fonts/noto-serif', '700Bold/NotoSerif_700Bold.ttf'],
  ['@expo-google-fonts/noto-serif', '400Regular_Italic/NotoSerif_400Regular_Italic.ttf'],
  ['@expo-google-fonts/noto-serif', '700Bold_Italic/NotoSerif_700Bold_Italic.ttf'],
  ['@expo-google-fonts/noto-sans-mono', '400Regular/NotoSansMono_400Regular.ttf'],
]) copyFileSync(path.join(pkg(p), f), path.join(out, 'fonts', path.basename(f)))
