// <stroc-paragraph>: one paragraph of Stroc text, shown formatted and edited in place.
//
// The element manages its own DOM (not Lit templates), so typing never loses the caret. It turns
// markup into DOM for display, and DOM back into canonical markup after every edit. Only Stroc's
// formatting survives the round trip: bold, italic, underline and references; anything else a
// browser inserts is reduced to its text.

import { LitElement } from 'lit'
import { parseMarkup, canonicalMarkup, type MarkupNode } from '@stroc/core'

export type RefLabel = (path: string[]) => string | undefined

export interface ParagraphChange { key: string, value: string }
export interface ParagraphSplit { key: string, before: string, after: string }

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
  private savedRange?: Range

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
    box.addEventListener('input', () => this.scheduleChange())
    box.addEventListener('blur', () => { this.saveSelection(); this.flush() })
    box.addEventListener('keydown', e => this.onKey(e))
    box.addEventListener('paste', e => this.onPaste(e))
    box.addEventListener('keyup', () => this.saveSelection())
    box.addEventListener('mouseup', () => this.saveSelection())
    this.appendChild(box)
    this.box = box
    this.draw()
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
    if (r) this.savedRange = r.cloneRange()
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
    const head = document.createRange()
    head.setStart(this.box, 0)
    head.setEnd(r.startContainer, r.startOffset)
    const tail = document.createRange()
    tail.setStart(r.endContainer, r.endOffset)
    tail.setEnd(this.box, this.box.childNodes.length)
    const holder = (range: Range) => { const d = document.createElement('div'); d.appendChild(range.cloneContents()); return domToMarkup(d) }
    const before = holder(head)
    const after = holder(tail)
    this.shown = before
    this.dispatchEvent(new CustomEvent<ParagraphSplit>('paragraph-split', { detail: { key: this.key, before, after }, bubbles: true, composed: true }))
  }

  private onPaste(e: ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') ?? ''
    document.execCommand('insertText', false, text.replace(/\s+/g, ' '))
  }

  // Apply bold, italic or underline to the selection (from shortcuts or the toolbar).
  format(command: 'bold' | 'italic' | 'underline') {
    if (!this.box) return
    if (!this.caretRange() && this.savedRange) this.restoreSelection()
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand(command)
    this.flush()
  }

  private restoreSelection() {
    const sel = this.selection()
    if (!sel || !this.savedRange) return
    this.box?.focus()
    sel.removeAllRanges()
    sel.addRange(this.savedRange)
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

  // Put the caret at a character offset (or the start or end) of the paragraph.
  focusAt(where: number | 'start' | 'end') {
    if (!this.box) return
    this.box.focus()
    const sel = this.selection()
    const r = document.createRange()
    if (where === 'start' || where === 'end') {
      r.selectNodeContents(this.box)
      r.collapse(where === 'start')
    } else {
      let left = where
      const walker = document.createTreeWalker(this.box, NodeFilter.SHOW_TEXT)
      let placed = false
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.parentElement?.closest('[data-ref]')) continue   // reference labels are not text
        const len = n.nodeValue?.length ?? 0
        if (left <= len) { r.setStart(n, left); r.collapse(true); placed = true; break }
        left -= len
      }
      if (!placed) { r.selectNodeContents(this.box); r.collapse(false) }
    }
    sel?.removeAllRanges()
    sel?.addRange(r)
  }
}

customElements.define('stroc-paragraph', StrocParagraph)
