// Rendering (docs/Rendering.md): check render-time data, lay out a composed document in the legal
// style, and produce HTML. The layout is a plain data structure with no UI framework or DOM, so
// every output format (and any app with its own UI) draws the same thing.

import qrcode from 'qrcode-generator'
import type { Problem } from '@stroc/core'
import { formatNumber, type Composed, type ComposedInline, type ComposedSection } from '@stroc/compose'

// ---------------------------------------------------------------------------------------------
// Inputs

export type Block =
  | { kind: 'heading', text: string }
  | { kind: 'paragraph', text: string }
  | { kind: 'table', title?: string, rows: [label: string, value: string][] }
  | { kind: 'qr', value: string, caption?: string }

export interface Labels {
  section: string          // "Section" in "Section 3.1"
  particulars: string      // heading of the parameter table
  notSpecified: string     // shown for a missing value in drafts
  documentId: string       // label before the root CID
}

export const ENGLISH: Labels = {
  section: 'Section',
  particulars: 'Particulars',
  notSpecified: 'not specified',
  documentId: 'Document',
}

export interface RenderOptions {
  labels?: Partial<Labels>
  draft?: boolean          // render despite problems (missing values, unresolved references)
  cidQr?: boolean          // print the root CID as a QR code at the end
}

// ---------------------------------------------------------------------------------------------
// Layout model

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  ref?: boolean            // a resolved cross-reference ("Section 3.1")
  unresolved?: boolean     // a reference that did not resolve (drafts only)
}

export interface ParticularsRow {
  label: string
  value: string
  supplied: boolean        // true if the value came from the data object, not a default
}

export type LayoutBlock =
  | { kind: 'title', text: string }
  | { kind: 'particulars', heading: string, groups: { heading?: string, rows: ParticularsRow[] }[] }
  | { kind: 'preamble', runs: Run[] }
  | { kind: 'section', number: string, depth: number, title?: string, runs?: Run[], cid?: string }
  | { kind: 'app-heading', text: string }
  | { kind: 'app-paragraph', text: string }
  | { kind: 'app-table', title?: string, rows: [string, string][] }
  | { kind: 'qr', value: string, caption?: string, modules: boolean[][] }

export interface Layout {
  title: string
  language: string
  cid: string
  labels: Labels
  blocks: LayoutBlock[]
  draft: boolean
}

export interface LayoutResult {
  layout?: Layout          // absent if there were problems and draft was not set
  problems: Problem[]
}

// ---------------------------------------------------------------------------------------------
// Data

// The full path of every declared parameter, with its declaration.
function declaredParameters(doc: Composed) {
  return doc.parameters.flatMap(group => group.parameters.map(p => ({
    path: [...group.prefix, p.key].join('/'),
    parameter: p,
    group,
  })))
}

// Check a data object against the composed document's parameters (Specification: Supplying values).
export function checkData(doc: Composed, data: unknown = {}): Problem[] {
  const problems: Problem[] = []
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return [{ path: [], code: 'bad-data', message: 'the data object must be a map of parameter paths to text values' }]
  }
  const values = data as Record<string, unknown>
  const declared = declaredParameters(doc)
  const paths = new Set(declared.map(d => d.path))
  for (const [key, value] of Object.entries(values)) {
    if (!paths.has(key)) problems.push({ path: [key], code: 'unknown-parameter', message: `"${key}" is not a parameter of this document` })
    else if (typeof value !== 'string' || value === '') problems.push({ path: [key], code: 'bad-value', message: `"${key}" must be non-empty text` })
  }
  for (const d of declared) {
    if (d.parameter.default === undefined && values[d.path] === undefined) {
      problems.push({ path: [d.path], code: 'missing-value', message: `no value for required parameter "${d.path}" (${d.parameter.label})` })
    }
  }
  return problems
}

// ---------------------------------------------------------------------------------------------
// Layout

function runs(nodes: ComposedInline[], labels: Labels, style: Omit<Run, 'text'> = {}): Run[] {
  return nodes.flatMap((n): Run[] => {
    if (n.type === 'text') return [{ text: n.value, ...style }]
    if (n.type === 'ref') {
      return n.target
        ? [{ text: `${labels.section} ${formatNumber(n.target)}`, ...style, ref: true }]
        : [{ text: `[${n.path.join('/')}]`, ...style, unresolved: true }]
    }
    const next = { ...style, ...(n.tag === 'b' ? { bold: true } : n.tag === 'i' ? { italic: true } : { underline: true }) }
    return runs(n.children, labels, next)
  })
}

export function qrModules(value: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(value)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

export function layout(doc: Composed, input: { data?: Record<string, string>, blocks?: Block[], options?: RenderOptions } = {}): LayoutResult {
  const options = input.options ?? {}
  const labels: Labels = { ...ENGLISH, ...options.labels }
  const data = input.data ?? {}
  const problems = [...doc.problems, ...checkData(doc, data)]
  if (!doc.document || (problems.length && !options.draft)) return { problems }

  const blocks: LayoutBlock[] = [{ kind: 'title', text: doc.title }]

  if (doc.parameters.length) {
    const groups = doc.parameters.map(group => ({
      ...(group.section ? { heading: `${formatNumber(group.section.number)}. ${group.section.title}` } : {}),
      rows: group.parameters.map(p => {
        const path = [...group.prefix, p.key].join('/')
        const supplied = typeof data[path] === 'string' && data[path] !== ''
        return { label: p.label, value: supplied ? data[path] : p.default ?? labels.notSpecified, supplied }
      }),
    }))
    blocks.push({ kind: 'particulars', heading: labels.particulars, groups })
  }

  if (doc.text) blocks.push({ kind: 'preamble', runs: runs(doc.text, labels) })

  const walk = (sections: ComposedSection[]) => {
    for (const s of sections) {
      blocks.push({
        kind: 'section',
        number: formatNumber(s.number) + '.',
        depth: s.number.length,
        ...(s.title ? { title: s.title } : {}),
        ...(s.text ? { runs: runs(s.text, labels) } : {}),
        ...(s.include ? { cid: s.include.cid.toString() } : {}),
      })
      walk(s.sections)
    }
  }
  walk(doc.sections)

  for (const b of input.blocks ?? []) {
    if (b.kind === 'heading') blocks.push({ kind: 'app-heading', text: b.text })
    else if (b.kind === 'paragraph') blocks.push({ kind: 'app-paragraph', text: b.text })
    else if (b.kind === 'table') blocks.push({ kind: 'app-table', ...(b.title ? { title: b.title } : {}), rows: b.rows })
    else blocks.push({ kind: 'qr', value: b.value, ...(b.caption ? { caption: b.caption } : {}), modules: qrModules(b.value) })
  }

  const cid = doc.cid.toString()
  if (options.cidQr) blocks.push({ kind: 'qr', value: cid, caption: `${labels.documentId} ${cid}`, modules: qrModules(cid) })

  return {
    layout: { title: doc.title, language: doc.language, cid, labels, blocks, draft: !!options.draft },
    problems,
  }
}

// ---------------------------------------------------------------------------------------------
// HTML

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function runsHtml(list: Run[]): string {
  return list.map(r => {
    let h = esc(r.text)
    if (r.ref) h = `<span class="ref">${h}</span>`
    if (r.unresolved) h = `<span class="unresolved">${h}</span>`
    if (r.underline) h = `<u>${h}</u>`
    if (r.italic) h = `<em>${h}</em>`
    if (r.bold) h = `<strong>${h}</strong>`
    return h
  }).join('')
}

export function qrSvg(modules: boolean[][], size = 120): string {
  const n = modules.length
  const quiet = 2
  let path = ''
  modules.forEach((row, r) => row.forEach((dark, c) => { if (dark) path += `M${c + quiet} ${r + quiet}h1v1h-1z` }))
  const dim = n + quiet * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
}

const STYLE = `
:root { --ink: #111; --muted: #666; --value: #0b4f8a; }
body { margin: 0; background: #fff; color: var(--ink); }
.stroc { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.4; max-width: 7in; margin: 0 auto; padding: 0.75in 0.5in 1in; }
.stroc h1 { font-size: 16pt; text-align: center; margin: 0 0 1em; }
.stroc .particulars { margin: 0 0 1.25em; }
.stroc .particulars h2 { font-size: 11pt; margin: 0 0 0.4em; }
.stroc .particulars h3 { font-size: 10pt; font-weight: normal; font-style: italic; margin: 0.5em 0 0.2em; }
.stroc .particulars table { border-collapse: collapse; }
.stroc .particulars td { padding: 0.1em 1em 0.1em 0; vertical-align: top; }
.stroc .particulars td.label { color: var(--muted); }
.stroc .particulars .supplied { color: var(--value); font-weight: bold; }
.stroc .preamble { text-indent: 2em; margin: 0 0 1em; text-align: justify; }
.stroc .section { display: grid; grid-template-columns: minmax(2.5em, max-content) 1fr; column-gap: 0.6em; margin: 0 0 0.5em calc((var(--depth) - 1) * 2.5em); break-inside: avoid-page; }
.stroc .section .num { font-weight: bold; }
.stroc .section .head { display: flex; justify-content: space-between; align-items: baseline; gap: 1em; }
.stroc .section .title { font-weight: bold; }
.stroc .section .cid { font-family: ui-monospace, Menlo, monospace; font-size: 6.5pt; color: var(--muted); white-space: nowrap; }
.stroc .section p { margin: 0; text-align: justify; }
.stroc .section .head + p { margin-top: 0.15em; }
.stroc .ref { font-style: normal; }
.stroc .unresolved { color: #b00; }
.stroc .app h2 { font-size: 12pt; margin: 1.5em 0 0.5em; }
.stroc .app table { border-collapse: collapse; margin: 0 0 1em; }
.stroc .app td { padding: 0.1em 1em 0.1em 0; vertical-align: top; font-size: 9pt; }
.stroc figure.qr { display: inline-block; vertical-align: top; margin: 1em 1em 0 0; text-align: center; }
.stroc figure.qr figcaption { font-family: ui-monospace, Menlo, monospace; font-size: 6pt; color: var(--muted); max-width: 140px; word-break: break-all; }
.stroc .draft { color: #b00; text-align: center; font-weight: bold; margin-bottom: 1em; }
.stroc-footer { font-family: ui-monospace, Menlo, monospace; font-size: 6.5pt; color: var(--muted); text-align: right; max-width: 7in; margin: 0 auto; padding: 0 0.5in 0.5in; }
@page { size: letter; margin: 0.75in 0.75in 0.9in; }
@media print {
  .stroc { padding: 0; max-width: none; }
  .stroc-footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 0; max-width: none; }
}
`

// A standalone, print-ready HTML page.
export function toHtml(l: Layout): string {
  const body: string[] = []
  if (l.draft) body.push('<div class="draft">DRAFT</div>')
  for (const b of l.blocks) {
    switch (b.kind) {
      case 'title':
        body.push(`<h1>${esc(b.text)}</h1>`)
        break
      case 'particulars':
        body.push(`<section class="particulars"><h2>${esc(b.heading)}</h2>` + b.groups.map(g =>
          (g.heading ? `<h3>${esc(g.heading)}</h3>` : '') + '<table>' + g.rows.map(r =>
            `<tr><td class="label">${esc(r.label)}</td><td${r.supplied ? ' class="supplied"' : ''}>${esc(r.value)}</td></tr>`).join('') + '</table>',
        ).join('') + '</section>')
        break
      case 'preamble':
        body.push(`<p class="preamble">${runsHtml(b.runs)}</p>`)
        break
      case 'section': {
        const head = b.title || b.cid
          ? `<div class="head"><span class="title">${b.title ? esc(b.title) : ''}</span>${b.cid ? `<span class="cid">${esc(b.cid)}</span>` : ''}</div>`
          : ''
        const text = b.runs ? `<p>${runsHtml(b.runs)}</p>` : ''
        body.push(`<div class="section" style="--depth:${b.depth}"><div class="num">${esc(b.number)}</div><div class="body">${head}${text}</div></div>`)
        break
      }
      case 'app-heading':
        body.push(`<div class="app"><h2>${esc(b.text)}</h2></div>`)
        break
      case 'app-paragraph':
        body.push(`<div class="app"><p>${esc(b.text)}</p></div>`)
        break
      case 'app-table':
        body.push('<div class="app">' + (b.title ? `<h2>${esc(b.title)}</h2>` : '') + '<table>' +
          b.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') + '</table></div>')
        break
      case 'qr':
        body.push(`<figure class="qr">${qrSvg(b.modules)}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`)
        break
    }
  }
  return `<!doctype html>
<html lang="${esc(l.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(l.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<article class="stroc">
${body.join('\n')}
</article>
<footer class="stroc-footer">${esc(l.labels.documentId)} ${esc(l.cid)}</footer>
</body>
</html>
`
}
