// YAML authoring format (Specification: YAML Authoring Format)
//
// A YAML file is the document: parsing gives the same data as its DAG-JSON spelling. Nothing is
// normalized silently. `lintYaml` reports problems with line numbers, `fixYaml` edits only the
// values that need fixing (keeping comments and layout), and `stringifyDocument` writes a document
// in the standard layout.

import {
  parseDocument, isScalar, visit, stringify, LineCounter,
  type Document, type Node as YamlNode, type Scalar,
} from 'yaml'
import {
  fromPlain, toPlain, validateDocument, canonicalizeText, canonicalLanguageTag, canonicalMarkup, parseMarkup,
  type Problem, type ValidationResult,
} from '@stroc/core'

export interface LocatedProblem extends Problem {
  line?: number           // 1-based
  col?: number            // 1-based
}

export interface YamlParseResult {
  value?: unknown                    // the document in the data model (links as CIDs)
  problems: LocatedProblem[]         // YAML errors and disallowed YAML features
}

export interface YamlLintResult {
  valid: boolean
  value?: unknown
  problems: LocatedProblem[]
  warnings: LocatedProblem[]
  validation?: ValidationResult
}

interface Parsed {
  ydoc: Document.Parsed
  lc: LineCounter
}

function parse(text: string): Parsed {
  const lc = new LineCounter()
  const ydoc = parseDocument(text, { lineCounter: lc, version: '1.2', schema: 'core', merge: false, uniqueKeys: true, prettyErrors: false })
  return { ydoc, lc }
}

function locate(p: Parsed, offset: number | undefined): { line?: number, col?: number } {
  if (offset === undefined) return {}
  const pos = p.lc.linePos(offset)
  return { line: pos.line, col: pos.col }
}

// The source offset of the value at a document path, or of its nearest existing ancestor.
function offsetOfPath(p: Parsed, path: (string | number)[]): number | undefined {
  for (let n = path.length; n >= 0; n--) {
    const node = n === 0 ? p.ydoc.contents : p.ydoc.getIn(path.slice(0, n), true) as YamlNode | undefined
    if (node && 'range' in node && node.range) return node.range[0]
  }
  return undefined
}

function yamlFeatureProblems(p: Parsed): LocatedProblem[] {
  const problems: LocatedProblem[] = []
  for (const err of p.ydoc.errors) {
    problems.push({ path: [], code: 'yaml-error', message: err.message.split('\n')[0], ...locate(p, err.pos[0]) })
  }
  visit(p.ydoc, {
    Alias(_k, node) {
      problems.push({ path: [], code: 'yaml-alias', message: 'YAML aliases (*name) are not allowed', ...locate(p, node.range?.[0]) })
    },
    Node(_k, node) {
      if (node.anchor) problems.push({ path: [], code: 'yaml-anchor', message: 'YAML anchors (&name) are not allowed', ...locate(p, node.range?.[0]) })
      if (node.tag) {
        problems.push({ path: [], code: 'yaml-tag', message: `YAML tags (${node.tag}) are not allowed`, ...locate(p, node.range?.[0]) })
      }
    },
    Pair(_k, pair) {
      if (isScalar(pair.key) && pair.key.value === '<<') {
        problems.push({ path: [], code: 'yaml-merge', message: 'YAML merge keys (<<) are not allowed', ...locate(p, pair.key.range?.[0]) })
      }
    },
  })
  return problems
}

// Parse YAML (or JSON, which is YAML) into the document model. Reports YAML errors and the YAML
// features Stroc does not allow; does not validate the document.
export function parseYaml(text: string): YamlParseResult {
  const p = parse(text)
  const problems = yamlFeatureProblems(p)
  if (p.ydoc.errors.length) return { problems }
  const plain = fromPlain(p.ydoc.toJS({ maxAliasCount: -1 }))
  for (const prob of plain.problems) problems.push({ ...prob, ...locate(p, offsetOfPath(p, prob.path)) })
  return { value: plain.value, problems }
}

// Parse and validate. Every problem carries the line and column of the value it concerns.
export function lintYaml(text: string): YamlLintResult {
  const p = parse(text)
  const parsed = parseYaml(text)
  if (parsed.value === undefined) return { valid: false, problems: parsed.problems, warnings: [] }
  const validation = validateDocument(parsed.value)
  const place = (prob: Problem): LocatedProblem => ({ ...prob, ...locate(p, offsetOfPath(p, prob.path)) })
  const problems = [...parsed.problems, ...validation.problems.map(place)]
  return {
    valid: problems.length === 0,
    value: parsed.value,
    problems,
    warnings: validation.warnings.map(place),
    validation,
  }
}

// ---------------------------------------------------------------------------------------------
// Writing

const DOCUMENT_ORDER = ['stroc', 'language', 'title', 'author', 'published', 'replaces', 'parameters', 'text', 'sections']
const SECTION_ORDER = ['id', 'title', 'text', 'sections', 'source']
const PARAMETER_ORDER = ['key', 'label', 'default']

// Split canonical paragraph text into sentences, breaking only at single spaces, so that folding
// the lines back together (YAML `>-`) restores the exact text.
export function sentenceLines(text: string, locale = 'en'): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (l: string, o: object) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter
  const pieces = Segmenter
    ? Array.from(new Segmenter(locale, { granularity: 'sentence' }).segment(text), s => s.segment)
    : text.split(/(?<=[.!?:;] )/)
  const lines: string[] = []
  let current = ''
  for (const piece of pieces) {
    current += piece
    if (current.endsWith(' ')) {
      lines.push(current.slice(0, -1))
      current = ''
    }
  }
  if (current) lines.push(current)
  return lines
}

function scalar(value: string): string {
  return stringify(value, { lineWidth: 0 }).trimEnd()
}

function quoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function linkText(value: unknown): string | undefined {
  if (value && typeof value === 'object' && '/' in value && Object.keys(value).length === 1) {
    return `{/: ${(value as { '/': string })['/']}}`
  }
  return undefined
}

function paragraph(text: string, indent: string, locale: string): string {
  return '>-\n' + sentenceLines(text, locale).map(l => indent + l).join('\n')
}

function ordered(obj: Record<string, unknown>, order: string[]): [string, unknown][] {
  const keys = [...order.filter(k => k in obj), ...Object.keys(obj).filter(k => !order.includes(k))]
  return keys.map(k => [k, obj[k]])
}

function emitMap(obj: Record<string, unknown>, order: string[], indent: string, locale: string, first = ''): string[] {
  const lines: string[] = []
  ordered(obj, order).forEach(([key, value], i) => {
    const lead = i === 0 ? first : indent
    const link = linkText(value)
    if (link) lines.push(`${lead}${key}: ${link}`)
    else if (typeof value === 'string') {
      if (key === 'text') lines.push(`${lead}${key}: ${paragraph(value, indent + '  ', locale)}`)
      else if (key === 'stroc' || key === 'published') lines.push(`${lead}${key}: ${quoted(value)}`)
      else lines.push(`${lead}${key}: ${scalar(value)}`)
    } else if (Array.isArray(value)) {
      lines.push(`${lead}${key}:`)
      const itemOrder = key === 'parameters' ? PARAMETER_ORDER : SECTION_ORDER
      for (const item of value) {
        const itemLink = linkText(item)
        if (itemLink) lines.push(`${indent}  - ${itemLink}`)
        else if (typeof item === 'string') lines.push(`${indent}  - ${scalar(item)}`)
        else lines.push(...emitMap(item as Record<string, unknown>, itemOrder, indent + '    ', locale, `${indent}  - `))
      }
    } else {
      lines.push(`${lead}${key}: ${scalar(String(value))}`)
    }
  })
  return lines
}

// Write a document (data model) in the standard YAML layout: fixed field order, paragraphs as
// folded scalars with one sentence per line, links as {/: cid}. Parsing the result gives back the
// same document.
export function stringifyDocument(doc: unknown, options: { header?: string } = {}): string {
  const plain = toPlain(doc) as Record<string, unknown>
  const locale = typeof plain.language === 'string' ? plain.language : 'en'
  const header = options.header ? options.header.split('\n').map(l => `# ${l}`.trimEnd()).join('\n') + '\n' : ''
  return header + emitMap(plain, DOCUMENT_ORDER, '', locale).join('\n') + '\n'
}

// ---------------------------------------------------------------------------------------------
// Fixing

// Markup spelling problems that can be fixed without guessing the author's intent. Grammar errors
// (a bare <, a mistyped tag, unbalanced tags) are left for the author.
const SPELLING = new Set(['empty-emphasis', 'nested-same', 'emphasis-order', 'adjacent-emphasis', 'emphasis-edge-space'])

function fixParagraph(value: string): string {
  const { issues } = parseMarkup(value)
  return issues.every(i => SPELLING.has(i.code)) ? canonicalMarkup(value) : canonicalizeText(value)
}

export interface FixResult {
  text: string            // the fixed source
  fixed: number           // number of values changed
}

// Fix what can be fixed mechanically: non-canonical text (spaces, invisible characters, NFC),
// markup spelling in paragraphs (order, merging, edge spaces), language tag case, and values YAML
// read as numbers or booleans that must be strings. Only the affected values are rewritten;
// comments and layout elsewhere are kept. Markup grammar errors are reported, not fixed.
export function fixYaml(text: string): FixResult {
  const p = parse(text)
  if (p.ydoc.errors.length) return { text, fixed: 0 }
  const edits: { start: number, end: number, replacement: string }[] = []

  visit(p.ydoc, {
    Pair(_k, pair) {
      if (!isScalar(pair.value) || !isScalar(pair.key)) return
      const key = String(pair.key.value)
      const node = pair.value as Scalar
      if (!node.range) return
      const inLink = key === '/'
      let replacement: string | undefined
      const value = node.value
      if (typeof value === 'string') {
        let fixedValue = inLink ? value : key === 'text' ? fixParagraph(value) : canonicalizeText(value)
        if (key === 'language') fixedValue = canonicalLanguageTag(fixedValue) ?? fixedValue
        if (fixedValue !== value && fixedValue !== '') {
          const isBlock = node.type === 'BLOCK_FOLDED' || node.type === 'BLOCK_LITERAL'
          const keyCol = p.lc.linePos(pair.key.range![0]).col - 1
          replacement = isBlock && key === 'text'
            ? paragraph(fixedValue, ' '.repeat(keyCol + 2), 'en')
            : key === 'stroc' || key === 'published' ? quoted(fixedValue) : scalar(fixedValue)
        }
      } else if (value !== null && value !== undefined && (typeof value === 'number' || typeof value === 'boolean')) {
        replacement = quoted(node.source ?? String(value))
      }
      if (replacement !== undefined) {
        // Keep any line breaks the original range ended with (block scalars include them).
        const trailing = /\n*$/.exec(text.slice(node.range[0], node.range[1]))![0]
        edits.push({ start: node.range[0], end: node.range[1], replacement: replacement + trailing })
      }
    },
  })
  let out = text
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end)
  }
  return { text: out, fixed: edits.length }
}

