// <stroc-paragraph>: one paragraph of Stroc text, shown formatted and edited in place.
//
// The element manages its own DOM (not Lit templates), so typing never loses the caret. It turns
// markup into DOM for display, and DOM back into canonical markup after every edit. Only Stroc's
// formatting survives the round trip: bold, italic, underline and references; anything else a
// browser inserts is reduced to its text.

import { LitElement } from 'lit'
import { parseMarkup, canonicalMarkup, escapeMarkupText, type MarkupNode } from '@stroc/core'

export type RefLabel = (path: string[]) => string | undefined

export interface ParagraphChange { key: string, value: string }
export interface ParagraphSplit { key: string, before: string, after: string }
export interface ParagraphPaste { key: string, before: string, blocks: string[], after: string }

const BLOCK = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|TR|DT|DD|PRE|SECTION|ARTICLE|HEADER|FOOTER|UL|OL|TABLE|TBODY)$/

// Pasted HTML as paragraphs of canonical markup: one per block element (or per run of inline
// content between blocks). Only bold, italic and underline survive.
export function htmlToParagraphs(html: string): string[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  body.querySelectorAll('script, style, meta, link, title').forEach(n => n.remove())
  // Treat a pair of line breaks as a paragraph break.
  body.querySelectorAll('br + br').forEach(br => { const p = document.createElement('p'); br.replaceWith(p) })
  const out: string[] = []
  const hasBlock = (n: Node): boolean => Array.from(n.childNodes).some(c => c.nodeType === 1 && (BLOCK.test((c as Element).tagName) || hasBlock(c)))
  const collect = (node: Node) => {
    let run = document.createElement('div')
    const flushRun = () => { const m = domToMarkup(run); if (m) out.push(m); run = document.createElement('div') }
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1 && (BLOCK.test((child as Element).tagName) || hasBlock(child))) {
        flushRun()
        if (hasBlock(child)) collect(child)
        else { const m = domToMarkup(child); if (m) out.push(m) }
      } else run.appendChild(child.cloneNode(true))
    }
    flushRun()
  }
  collect(body)
  return out
}

// Pasted plain text as paragraphs: one per line.
export function textToParagraphs(text: string): string[] {
  return text.split(/\r?\n/).map(l => canonicalMarkup(escapeMarkupText(l))).filter(Boolean)
}

const TAG_OF: Record<string, 'b' | 'i' | 'u'> = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u' }

// Markup to DOM nodes (display and editing share one representation).
export function markupToDom(markup: string, label: RefLabel, doc: Document = document): DocumentFragment {
  const frag = doc.createDocumentFragment()
  const build = (nodes: MarkupNode[], parent: Node) => nodes.forEach(n => {
    if (n.type === 'text') parent.appendChild(doc.createTextNode(n.value))
    else if (n.type === 'ref') {
      const span = doc.createElement('span')
      const text = label(n.path)
      span.className = text ? 'ref' : 'ref unresolved'
      span.dataset.ref = n.path.join('/')
      span.contentEditable = 'false'
      span.title = `Reference to ${n.path.join('/')}`
      span.textContent = text ?? `→${n.path.join('/')}`
      parent.appendChild(span)
    } else {
      const el = doc.createElement(n.tag)
      build(n.children, el)
      parent.appendChild(el)
    }
  })
  build(parseMarkup(markup).nodes, frag)
  return frag
}

// DOM to canonical markup. Block elements and line breaks become spaces.
export function domToMarkup(root: Node): string {
  const walk = (node: Node): MarkupNode[] => {
    const out: MarkupNode[] = []
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) out.push({ type: 'text', value: child.nodeValue ?? '' })
      else if (child.nodeType === 1) {
        const el = child as HTMLElement
        if (el.dataset?.ref) out.push({ type: 'ref', path: el.dataset.ref.split('/'), offset: 0 })
        else if (el.tagName === 'BR') out.push({ type: 'text', value: ' ' })
        else if (TAG_OF[el.tagName]) out.push({ type: 'emphasis', tag: TAG_OF[el.tagName], children: walk(el), offset: 0 })
        else {
          const block = /^(DIV|P|LI|H[1-6])$/.test(el.tagName)
          if (block) out.push({ type: 'text', value: ' ' })
          out.push(...walk(el))
          if (block) out.push({ type: 'text', value: ' ' })
        }
      }
    })
    return out
  }
  return canonicalMarkup(walk(root))
}

export class StrocParagraph extends LitElement {
  static properties = {
    value: { type: String },
    key: { type: String },
    placeholder: { type: String },
    editable: { type: Boolean },
    refresh: { type: Number },    // bump to redraw reference labels
  }

  declare value: string
  declare key: string
  declare placeholder: string
  declare editable: boolean
  declare refresh: number
  labelRef: RefLabel = () => undefined

  private box?: HTMLDivElement
  private shown?: string           // the markup currently in the DOM
  private timer?: ReturnType<typeof setTimeout>
  private savedOffset?: number     // caret position in atoms (characters, a reference counts as one)

  constructor() {
    super()
    this.value = ''
    this.key = ''
    this.placeholder = ''
    this.editable = true
    this.refresh = 0
  }

  createRenderRoot() { return this }   // light DOM: styled by the editor, selection works normally

  render() { return null }

  firstUpdated() {
    const box = document.createElement('div')
    box.className = 'para'
    box.dataset.test = 'text'
    box.addEventListener('input', () => this.scheduleChange())
    box.addEventListener('blur', () => { this.saveSelection(); this.flush() })
    box.addEventListener('keydown', e => this.onKey(e))
    box.addEventListener('paste', e => this.onPaste(e))
    document.addEventListener('selectionchange', this.onSelectionChange)
    this.appendChild(box)
    this.box = box
    this.draw()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener('selectionchange', this.onSelectionChange)
  }

  // Remember where the caret is whenever it moves inside this paragraph, so it can be restored
  // after a dialog (such as the reference picker) takes the focus.
  private onSelectionChange = () => this.saveSelection()

  rememberSelection() {
    this.saveSelection()
  }

  updated(changed: Map<string, unknown>) {
    if (!this.box) return
    this.box.contentEditable = this.editable ? 'true' : 'false'
    this.box.spellcheck = this.getAttribute('spellcheck') !== 'false'
    this.box.dataset.placeholder = this.placeholder
    // Never redraw text the author is typing in; a changed value from outside wins only when it
    // really differs from what is shown.
    if ((changed.has('value') && this.value !== this.shown) || changed.has('refresh')) this.draw()
  }

  private draw() {
    if (!this.box) return
    const focused = this.box.matches(':focus')
    if (focused && this.value === this.shown) {
      // Only reference labels may have changed: update them in place, keeping the caret.
      this.box.querySelectorAll<HTMLElement>('[data-ref]').forEach(el => {
        const text = this.labelRef(el.dataset.ref!.split('/'))
        el.textContent = text ?? `→${el.dataset.ref}`
        el.className = text ? 'ref' : 'ref unresolved'
      })
      return
    }
    this.box.replaceChildren(markupToDom(this.value ?? '', this.labelRef))
    this.shown = this.value
    this.box.classList.toggle('empty', !this.value)
  }

  private scheduleChange() {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 250)
  }

  // Emit the current content as canonical markup, if it changed.
  flush() {
    clearTimeout(this.timer)
    if (!this.box) return
    const value = domToMarkup(this.box)
    this.box.classList.toggle('empty', !value)
    if (value === this.shown) return
    this.shown = value
    this.dispatchEvent(new CustomEvent<ParagraphChange>('paragraph-change', { detail: { key: this.key, value }, bubbles: true, composed: true }))
  }

  private selection(): Selection | null {
    const root = this.getRootNode() as ShadowRoot & { getSelection?: () => Selection | null }
    return root.getSelection?.() ?? document.getSelection()
  }

  private caretRange(): Range | undefined {
    const sel = this.selection()
    if (!sel || !sel.rangeCount || !this.box) return undefined
    const r = sel.getRangeAt(0)
    return this.box.contains(r.startContainer) ? r : undefined
  }

  private saveSelection() {
    const r = this.caretRange()
    if (r) this.savedOffset = this.atomsBefore(r.startContainer, r.startOffset)
  }

  // Positions in a paragraph are counted in atoms: each character of text is one, and each
  // reference is one (its label is not text). They survive redrawing the DOM, unlike Ranges.
  private atomsBefore(container: Node, offset: number): number {
    let count = 0
    const visit = (node: Node): boolean => {
      if (node === container && node.nodeType === 3) { count += offset; return true }
      if (node === container) {
        for (let i = 0; i < offset && i < node.childNodes.length; i++) count += this.atomsIn(node.childNodes[i])
        return true
      }
      if ((node as HTMLElement).dataset?.ref) { if (node.contains(container)) return true; count += 1; return false }
      if (node.nodeType === 3) { count += node.nodeValue?.length ?? 0; return false }
      for (const child of Array.from(node.childNodes)) if (visit(child)) return true
      return false
    }
    for (const child of Array.from(this.box!.childNodes)) if (visit(child)) break
    if (container === this.box) { count = 0; for (let i = 0; i < offset; i++) count += this.atomsIn(this.box!.childNodes[i]) }
    return count
  }

  private atomsIn(node: Node): number {
    if ((node as HTMLElement).dataset?.ref) return 1
    if (node.nodeType === 3) return node.nodeValue?.length ?? 0
    return Array.from(node.childNodes).reduce((n, c) => n + this.atomsIn(c), 0)
  }

  // A collapsed range at an atom position.
  private rangeAt(atoms: number): Range {
    const r = document.createRange()
    let left = atoms
    const place = (node: Node): boolean => {
      for (const child of Array.from(node.childNodes)) {
        if ((child as HTMLElement).dataset?.ref) {
          if (left === 0) { r.setStartBefore(child); return true }
          left -= 1
          if (left === 0) { r.setStartAfter(child); return true }
          continue
        }
        if (child.nodeType === 3) {
          const len = child.nodeValue?.length ?? 0
          if (left <= len) { r.setStart(child, left); return true }
          left -= len
          continue
        }
        if (place(child)) return true
      }
      return false
    }
    if (!place(this.box!)) { r.selectNodeContents(this.box!); r.collapse(false) }
    r.collapse(true)
    return r
  }

  private onKey(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey
    if (mod && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault()
      this.format(({ b: 'bold', i: 'italic', u: 'underline' } as const)[e.key.toLowerCase() as 'b' | 'i' | 'u'])
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      this.split()
      return
    }
    if (e.key === 'Backspace') {
      const r = this.caretRange()
      if (r && r.collapsed && this.textBefore(r) === '') {
        e.preventDefault()
        this.flush()
        this.dispatchEvent(new CustomEvent('paragraph-merge', { detail: { key: this.key }, bubbles: true, composed: true }))
      }
    }
  }

  private textBefore(r: Range): string {
    const before = document.createRange()
    before.setStart(this.box!, 0)
    before.setEnd(r.startContainer, r.startOffset)
    return before.toString()
  }

  private split() {
    const r = this.caretRange()
    if (!r || !this.box) return
    const { before, after } = this.around(r)
    this.shown = before
    this.dispatchEvent(new CustomEvent<ParagraphSplit>('paragraph-split', { detail: { key: this.key, before, after }, bubbles: true, composed: true }))
  }

  // Paste keeps bold, italic and underline. Several paragraphs become several sections: the first
  // joins the text before the caret, the last joins the text after it.
  private onPaste(e: ClipboardEvent) {
    e.preventDefault()
    const html = e.clipboardData?.getData('text/html') ?? ''
    const text = e.clipboardData?.getData('text/plain') ?? ''
    const blocks = html ? htmlToParagraphs(html) : textToParagraphs(text)
    const r = this.caretRange()
    if (!r || !this.box || !blocks.length) return
    r.deleteContents()
    if (blocks.length === 1) {
      // Pasted into the middle of a paragraph: keep a space at either edge of what was copied.
      const raw = html ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '') : text
      const frag = markupToDom(blocks[0], this.labelRef)
      if (/^\s/.test(raw)) frag.prepend(document.createTextNode(' '))
      if (/\s$/.test(raw)) frag.append(document.createTextNode(' '))
      const last = frag.lastChild
      r.insertNode(frag)
      if (last) {
        const after = document.createRange()
        after.setStartAfter(last)
        after.collapse(true)
        const sel = this.selection()
        sel?.removeAllRanges()
        sel?.addRange(after)
      }
      this.flush()
      return
    }
    const { before, after } = this.around(r, true)
    this.shown = undefined
    this.dispatchEvent(new CustomEvent<ParagraphPaste>('paragraph-paste', { detail: { key: this.key, before, blocks, after }, bubbles: true, composed: true }))
  }

  // The paragraph's markup before and after a caret. With keepEdges, a space at the caret is kept
  // (for joining pasted text); otherwise both sides are trimmed (for splitting).
  private around(r: Range, keepEdges = false): { before: string, after: string } {
    const head = document.createRange()
    head.setStart(this.box!, 0)
    head.setEnd(r.startContainer, r.startOffset)
    const tail = document.createRange()
    tail.setStart(r.endContainer, r.endOffset)
    tail.setEnd(this.box!, this.box!.childNodes.length)
    const markup = (range: Range) => { const d = document.createElement('div'); d.appendChild(range.cloneContents()); return domToMarkup(d) }
    let before = markup(head), after = markup(tail)
    if (keepEdges && before && /\s$/.test(head.toString())) before += ' '
    if (keepEdges && after && /^\s/.test(tail.toString())) after = ' ' + after
    return { before, after }
  }

  // Apply bold, italic or underline to the selection (from shortcuts or the toolbar).
  format(command: 'bold' | 'italic' | 'underline') {
    if (!this.box) return
    if (!this.caretRange() && this.savedOffset !== undefined) this.restoreSelection()
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand(command)
    this.flush()
  }

  private restoreSelection() {
    const sel = this.selection()
    if (!sel || this.savedOffset === undefined || !this.box) return
    this.box.focus()
    sel.removeAllRanges()
    sel.addRange(this.rangeAt(this.savedOffset))
  }

  // Insert a reference at the caret (or where the caret last was).
  insertRef(path: string[]) {
    if (!this.box) return
    if (!this.caretRange()) this.restoreSelection()
    const r = this.caretRange() ?? (() => { const x = document.createRange(); x.selectNodeContents(this.box!); x.collapse(false); return x })()
    const frag = markupToDom(`<ref:${path.join('/')}>`, this.labelRef)
    const node = frag.firstChild!
    r.deleteContents()
    const before = this.textBefore(r)
    if (before && !/\s$/.test(before)) {          // keep the reference apart from the word before it
      r.insertNode(document.createTextNode(' '))
      r.collapse(false)
    }
    r.insertNode(node)
    const space = document.createTextNode(' ')
    node.parentNode!.insertBefore(space, node.nextSibling)
    const sel = this.selection()
    const after = document.createRange()
    after.setStartAfter(space)
    after.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(after)
    this.flush()
  }

  // Put the caret at an atom position (or the start or end) of the paragraph.
  focusAt(where: number | 'start' | 'end') {
    if (!this.box) return
    this.box.focus()
    const sel = this.selection()
    let r: Range
    if (where === 'start' || where === 'end') {
      r = document.createRange()
      r.selectNodeContents(this.box)
      r.collapse(where === 'start')
    } else r = this.rangeAt(where)
    sel?.removeAllRanges()
    sel?.addRange(r)
    this.saveSelection()
  }
}

customElements.define('stroc-paragraph', StrocParagraph)
