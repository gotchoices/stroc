// Markup grammar (Specification: Inline Markup)
//
//   text    = { char | escape | token }
//   escape  = "\<" | "\\"
//   token   = "<b>" | "</b>" | "<i>" | "</i>" | "<u>" | "</u>" | "<ref:" path ">"
//   path    = id { "/" id }
//
// Markup is not HTML. Renderers walk the parsed tree and produce their own output.

import { isValidId } from './ids.js'

export type EmphasisTag = 'b' | 'i' | 'u'

// Canonical order when one emphasis directly wraps another: b outside i outside u.
const EMPHASIS_ORDER: Record<EmphasisTag, number> = { b: 0, i: 1, u: 2 }

export type MarkupNode =
  | { type: 'text', value: string }                                   // literal characters, escapes resolved
  | { type: 'emphasis', tag: EmphasisTag, children: MarkupNode[], offset: number }
  | { type: 'ref', path: string[], offset: number }

export interface MarkupIssue {
  code: string
  message: string
  offset: number
}

export interface ParsedMarkup {
  nodes: MarkupNode[]
  issues: MarkupIssue[]
}

type Token =
  | { type: 'text', value: string, offset: number }
  | { type: 'open' | 'close', tag: EmphasisTag, offset: number }
  | { type: 'ref', path: string[], offset: number }

const TAG_TOKENS: [string, Token['type'], EmphasisTag][] = [
  ['<b>', 'open', 'b'], ['</b>', 'close', 'b'],
  ['<i>', 'open', 'i'], ['</i>', 'close', 'i'],
  ['<u>', 'open', 'u'], ['</u>', 'close', 'u'],
]

function tokenize(text: string, issues: MarkupIssue[]): Token[] {
  const tokens: Token[] = []
  let buf = ''
  let bufStart = 0
  const flush = () => {
    if (buf) tokens.push({ type: 'text', value: buf, offset: bufStart })
    buf = ''
  }
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      const next = text[i + 1]
      if (next === '<' || next === '\\') {
        if (!buf) bufStart = i
        buf += next
        i += 2
      } else {
        issues.push({ code: 'bad-escape', message: 'a backslash must be followed by < or \\ (write \\\\ for a literal backslash)', offset: i })
        if (!buf) bufStart = i
        buf += ch
        i += 1
      }
      continue
    }
    if (ch === '<') {
      const tag = TAG_TOKENS.find(([lit]) => text.startsWith(lit, i))
      if (tag) {
        flush()
        tokens.push({ type: tag[1] as 'open' | 'close', tag: tag[2], offset: i })
        i += tag[0].length
        continue
      }
      if (text.startsWith('<ref:', i)) {
        const end = text.indexOf('>', i)
        const body = end < 0 ? '' : text.slice(i + 5, end)
        const path = body.split('/')
        if (end >= 0 && body && path.every(isValidId)) {
          flush()
          tokens.push({ type: 'ref', path, offset: i })
          i = end + 1
          continue
        }
        issues.push({ code: 'bad-ref', message: 'a reference must be <ref:id> or <ref:id/id/...> using valid section ids', offset: i })
      } else {
        issues.push({ code: 'bad-tag', message: 'every < must begin a markup token (<b>, </b>, <i>, </i>, <u>, </u>, <ref:...>); write \\< for a literal <', offset: i })
      }
      if (!buf) bufStart = i
      buf += ch
      i += 1
      continue
    }
    if (!buf) bufStart = i
    buf += ch
    i += 1
  }
  flush()
  return tokens
}

// Parse paragraph text into a tree, reporting every grammar and one-spelling violation.
export function parseMarkup(text: string): ParsedMarkup {
  const issues: MarkupIssue[] = []
  const tokens = tokenize(text, issues)
  const root: MarkupNode[] = []
  const stack: { tag: EmphasisTag, offset: number, children: MarkupNode[] }[] = []
  const current = () => (stack.length ? stack[stack.length - 1].children : root)

  for (const tok of tokens) {
    if (tok.type === 'text') {
      current().push({ type: 'text', value: tok.value })
    } else if (tok.type === 'ref') {
      current().push({ type: 'ref', path: tok.path, offset: tok.offset })
    } else if (tok.type === 'open') {
      if (stack.some(s => s.tag === tok.tag)) {
        issues.push({ code: 'nested-same', message: `<${tok.tag}> must not be nested inside another <${tok.tag}>`, offset: tok.offset })
      }
      stack.push({ tag: tok.tag, offset: tok.offset, children: [] })
    } else {
      const top = stack[stack.length - 1]
      if (!top || top.tag !== tok.tag) {
        issues.push({ code: 'unbalanced', message: `</${tok.tag}> does not close the most recent open tag`, offset: tok.offset })
        continue
      }
      stack.pop()
      current().push({ type: 'emphasis', tag: top.tag, children: top.children, offset: top.offset })
    }
  }
  while (stack.length) {
    const open = stack.pop()!
    issues.push({ code: 'unclosed', message: `<${open.tag}> is never closed`, offset: open.offset })
    current().push({ type: 'emphasis', tag: open.tag, children: open.children, offset: open.offset })
  }
  checkSpelling(root, issues)
  return { nodes: root, issues }
}

function checkSpelling(nodes: MarkupNode[], issues: MarkupIssue[]) {
  nodes.forEach((node, idx) => {
    if (node.type !== 'emphasis') return
    const { tag, children, offset } = node
    if (children.length === 0) {
      issues.push({ code: 'empty-emphasis', message: `<${tag}> must not be empty`, offset })
    }
    const first = children[0], last = children[children.length - 1]
    if (first?.type === 'text' && first.value.startsWith(' ')) {
      issues.push({ code: 'emphasis-edge-space', message: `<${tag}> content must not begin with a space; move the space outside`, offset })
    }
    if (last?.type === 'text' && last.value.endsWith(' ')) {
      issues.push({ code: 'emphasis-edge-space', message: `<${tag}> content must not end with a space; move the space outside`, offset })
    }
    if (children.length === 1 && children[0].type === 'emphasis' &&
        EMPHASIS_ORDER[children[0].tag] < EMPHASIS_ORDER[tag]) {
      issues.push({ code: 'emphasis-order', message: `write <${children[0].tag}><${tag}>…</${tag}></${children[0].tag}>: the order is b, i, u`, offset })
    }
    const prev = nodes[idx - 1]
    if (prev?.type === 'emphasis' && prev.tag === tag) {
      issues.push({ code: 'adjacent-emphasis', message: `adjacent <${tag}> spans must be merged into one`, offset })
    }
    checkSpelling(children, issues)
  })
}

// All references in a paragraph, in order.
export function findReferences(nodes: MarkupNode[]): { path: string[], offset: number }[] {
  const refs: { path: string[], offset: number }[] = []
  const walk = (list: MarkupNode[]) => list.forEach(n => {
    if (n.type === 'ref') refs.push({ path: n.path, offset: n.offset })
    else if (n.type === 'emphasis') walk(n.children)
  })
  walk(nodes)
  return refs
}

// Plain text of a paragraph with markup removed (references shown by path), for search and diff.
export function markupToPlainText(nodes: MarkupNode[]): string {
  return nodes.map(n =>
    n.type === 'text' ? n.value :
    n.type === 'ref' ? n.path.join('/') :
    markupToPlainText(n.children)).join('')
}

// Escape literal text for inclusion in paragraph markup.
export function escapeMarkupText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/</g, '\\<')
}
