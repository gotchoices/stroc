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

function checkSpelling(nodes: MarkupNode[], issues: MarkupIssue[], outer?: EmphasisTag) {
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
    // The order b, i, u holds at every depth: b never inside i or u, i never inside u.
    // (Equal tags nested are reported by the parser as nested-same.)
    if (outer && EMPHASIS_ORDER[tag] < EMPHASIS_ORDER[outer]) {
      issues.push({ code: 'emphasis-order', message: `<${tag}> must not be inside <${outer}>: emphasis nests in the order b, i, u`, offset })
    }
    const prev = nodes[idx - 1]
    if (prev?.type === 'emphasis' && prev.tag === tag) {
      issues.push({ code: 'adjacent-emphasis', message: `adjacent <${tag}> spans must be merged into one`, offset })
    }
    checkSpelling(children, issues, outer && EMPHASIS_ORDER[outer] > EMPHASIS_ORDER[tag] ? outer : tag)
  })
}

// ---------------------------------------------------------------------------------------------
// Canonical serialization
//
// Writes formatted text in its one valid spelling: canonical text (NFC, single spaces, trimmed, no
// forbidden invisible characters), emphasis nested b > i > u, maximal spans, no space at the edge
// of an emphasis, literal < and \ escaped. Editors and lint fixes use it; it is never applied
// silently before hashing.

const TAGS: EmphasisTag[] = ['b', 'i', 'u']
const BIT: Record<EmphasisTag, number> = { b: 1, i: 2, u: 4 }
// Characters dropped from canonical text: forbidden invisible characters and controls other than
// whitespace (which becomes a space).
const forbidden = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0
  return c === 0x200b || c === 0x2060 || c === 0xfeff || c === 0xad ||
    (c < 0x20 && !/\s/u.test(ch)) || (c >= 0x7f && c <= 0x9f && !/\s/u.test(ch))
}

interface Atom { ch?: string, ref?: string[], style: number }

export function canonicalMarkup(input: string | MarkupNode[]): string {
  const nodes = typeof input === 'string' ? parseMarkup(input).nodes : input
  // 1. Flatten to atoms, each with the set of emphases that applies to it.
  const atoms: Atom[] = []
  const flatten = (list: MarkupNode[], style: number) => list.forEach(n => {
    if (n.type === 'text') {
      for (const ch of n.value.normalize('NFC')) {
        if (forbidden(ch)) continue
        atoms.push({ ch: /\s/u.test(ch) ? ' ' : ch, style })
      }
    } else if (n.type === 'ref') atoms.push({ ref: n.path, style })
    else flatten(n.children, style | BIT[n.tag])
  })
  flatten(nodes, 0)
  // 2. Single spaces, none at either end.
  let list = atoms.filter((a, i) => !(a.ch === ' ' && (i === 0 || atoms[i - 1].ch === ' ')))
  while (list.length && list[list.length - 1].ch === ' ') list = list.slice(0, -1)
  // 3. A space at the edge of an emphasis is outside it. Tags are written in b, i, u order, so a
  //    space keeps only the leading tags it shares, in that order, with both neighbours; any other
  //    tag would open just before it or close just after it. Repeat until nothing changes.
  const tagsOf = (a: Atom) => TAGS.filter(t => a.style & BIT[t])
  const prefix = (x: EmphasisTag[], y: EmphasisTag[]) => { let n = 0; while (n < x.length && n < y.length && x[n] === y[n]) n++; return n }
  for (let changed = true; changed;) {
    changed = false
    list.forEach((a, i) => {
      if (a.ch !== ' ' || !a.style) return
      const own = tagsOf(a)
      const keep = Math.min(prefix(own, list[i - 1] ? tagsOf(list[i - 1]) : []), prefix(own, list[i + 1] ? tagsOf(list[i + 1]) : []))
      if (keep < own.length) {
        a.style = own.slice(0, keep).reduce((m, t) => m | BIT[t], 0)
        changed = true
      }
    })
  }
  // 4. Emit with a stack kept in b, i, u order, closing and reopening only where the set changes.
  let out = ''
  let stack: EmphasisTag[] = []
  for (const a of list) {
    const want = TAGS.filter(t => a.style & BIT[t])
    let common = 0
    while (common < stack.length && common < want.length && stack[common] === want[common]) common++
    for (let k = stack.length - 1; k >= common; k--) out += `</${stack[k]}>`
    for (let k = common; k < want.length; k++) out += `<${want[k]}>`
    stack = want
    out += a.ref ? `<ref:${a.ref.join('/')}>` : escapeMarkupText(a.ch!)
  }
  for (let k = stack.length - 1; k >= 0; k--) out += `</${stack[k]}>`
  return out
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
