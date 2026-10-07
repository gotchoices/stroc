// <stroc-editor>: the Stroc document editor (docs/Editor.md).
//
// One document at a time, edited in place in its rendered form. Everything is computed in the
// browser: validation and CID as you type, included documents fetched from the user's sources and
// verified, references shown as live section numbers.

import { LitElement, html, nothing, type TemplateResult } from 'lit'
import { CID } from 'multiformats/cid'
import {
  fromPlain as coreFromPlain, toPlain as coreToPlain, validateDocument, documentCid, verifyDocument, canonicalMarkup,
  type ValidationResult,
} from '@stroc/core'
import { lintYaml, stringifyDocument } from '@stroc/yaml'
import { MemoryStore, compose, firstOf, type ComposedInline, type ComposedSection, type CatalogEntry } from '@stroc/compose'
import { layout, toPdfDefinition } from '@stroc/render'
import { installStyles } from './styles.js'
import { StrocParagraph, type ParagraphChange, type ParagraphSplit, type ParagraphPaste } from './paragraph.js'
import * as M from './model.js'
import { loadInclude, numberWithin, joinNumber, type IncludeInfo } from './includes.js'
import { loadSources, saveSources, normalizeSource, SourcesResolver, sourceCatalog, forgetCatalogs } from './sources.js'

type Dialog = 'sources' | 'open' | 'include' | 'properties' | 'reference' | undefined
type Format = 'yaml' | 'json'

interface FileHandle {
  name: string
  getFile(): Promise<File>
  createWritable?(): Promise<{ write(data: string): Promise<void>, close(): Promise<void> }>
}
interface PickerWindow {
  showOpenFilePicker?(options: unknown): Promise<FileHandle[]>
  showSaveFilePicker?(options: unknown): Promise<FileHandle>
}

const FILE_TYPES = [{ description: 'Stroc documents', accept: { 'application/yaml': ['.yaml', '.yml'], 'application/json': ['.json'] } }]

interface Validation {
  result?: ValidationResult
  bySection: Map<string, string[]>       // problems shown at a section, by key
  document: string[]                     // problems shown at the top
  count: number
}

interface CatalogRow { source: string, host: string, entry: CatalogEntry }

// A place a reference can point to.
interface RefTarget {
  number: string
  label: string                 // title, or the start of the text
  path?: string[]               // the reference path, if the target has an id (or will get one)
  section?: M.EditSection       // a section of this document that needs an id first
  included?: boolean            // inside an included document
  depth: number
}

export class StrocEditor extends LitElement {
  static properties = {
    version: { state: true },
    dialog: { state: true },
    menu: { state: true },
    activeKey: { state: true },
    notice: { state: true },
    dragOverFile: { state: true },
    preview: { type: Boolean, reflect: true },
  }

  declare version: number
  declare dialog: Dialog
  declare menu: string | undefined
  declare activeKey: string | undefined
  declare notice: string | undefined
  declare dragOverFile: boolean
  declare preview: boolean            // show the document as readers see it: no editing controls
  private checkSpelling = true

  doc: M.EditDoc = M.newDoc()
  private dirty = false
  private fileName?: string
  private fileHandle?: FileHandle
  private fileFormat: Format = 'yaml'
  private openedFrom?: string
  private cid?: string
  private validation: Validation = { bySection: new Map(), document: [], count: 0 }
  private sources = loadSources()
  private includes = new Map<string, IncludeInfo>()
  private catalogRows?: CatalogRow[]
  private pendingFocus?: { key: string, where: number | 'start' | 'end' }
  private validateTimer?: ReturnType<typeof setTimeout>
  private noticeTimer?: ReturnType<typeof setTimeout>
  private activePara?: StrocParagraph
  private refFilter = ''
  private refPara?: StrocParagraph
  // Undo history: snapshots of the document. `at` is the current one. Typing in one paragraph or
  // title within a short time is one step.
  private history: { doc: M.EditDoc, group?: string, time: number }[] = []
  private historyAt = -1
  private dragKey?: string
  private dropAt?: { key: string, where: M.Placement }

  constructor() {
    super()
    this.version = 0
    this.dragOverFile = false
    this.preview = false
  }

  // -------------------------------------------------------------------------------------------
  // Lifecycle

  // Render into the page's DOM, not a shadow root: browsers (Safari in particular) do not expose
  // the text selection inside shadow roots consistently, and in-place editing depends on it.
  createRenderRoot() { return this }

  connectedCallback() {
    super.connectedCallback()
    installStyles(this.getRootNode() as Document | ShadowRoot)
    window.addEventListener('beforeunload', this.onBeforeUnload)
    window.addEventListener('keydown', this.onShortcut, true)     // capture: before the browser's own undo
    document.addEventListener('click', this.onDocumentClick)
    const cid = new URLSearchParams(location.search).get('cid')
    if (cid) void this.openByCid(cid)
    else { this.record(); this.validateSoon(0) }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('beforeunload', this.onBeforeUnload)
    window.removeEventListener('keydown', this.onShortcut, true)
    document.removeEventListener('click', this.onDocumentClick)
  }

  updated() {
    this.loadIncludes()
    if (this.pendingFocus) {
      const { key, where } = this.pendingFocus
      const para = this.renderRoot.querySelector<StrocParagraph>(`stroc-paragraph[data-key="${key}"]`)
      if (para) {
        this.pendingFocus = undefined
        requestAnimationFrame(() => para.focusAt(where))
      }
    }
  }

  private onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (this.dirty) { e.preventDefault(); e.returnValue = '' }
  }

  private onShortcut = (e: KeyboardEvent) => {
    // Structure: Tab / Shift+Tab indent and outdent; Alt+Shift+↑/↓ move the current section.
    const key = this.activeKey
    const editing = e.composedPath().some(n => (n as HTMLElement).classList?.contains('para') || (n as HTMLElement).classList?.contains('title-input'))
    if (key && editing && e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      this.structure(e.shiftKey ? 'outdent' : 'indent', key)
      return
    }
    if (key && editing && e.altKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      this.structure(e.key === 'ArrowUp' ? 'up' : 'down', key)
      return
    }
    if (!(e.metaKey || e.ctrlKey)) return
    const k = e.key.toLowerCase()
    if (k === 'z' && !this.dialog) { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return }
    if (k === 'y' && !this.dialog) { e.preventDefault(); this.redo(); return }
    if (k === 's') { e.preventDefault(); void (e.shiftKey ? this.saveAs() : this.save()) }
    else if (k === 'k') { e.preventDefault(); this.showReferences() }
    else if (k === 'e') { e.preventDefault(); this.preview = !this.preview }
    else if (k === 'o') { e.preventDefault(); void this.openFile() }
  }

  private onDocumentClick = (e: MouseEvent) => {
    if (this.menu && !e.composedPath().some(n => (n as HTMLElement).classList?.contains('menu'))) this.menu = undefined
  }

  private say(message: string) {
    this.notice = message
    clearTimeout(this.noticeTimer)
    this.noticeTimer = setTimeout(() => { this.notice = undefined }, 6000)
  }

  // -------------------------------------------------------------------------------------------
  // Changes and validation

  private changed(markDirty = true, group?: string) {
    if (markDirty) this.dirty = true
    this.record(group)
    this.version++
    this.validateSoon()
  }

  private record(group?: string) {
    const now = Date.now()
    const top = this.history[this.historyAt]
    const snapshot = { doc: structuredClone(this.doc), group, time: now }
    this.history.splice(this.historyAt + 1)          // a new change discards anything redoable
    if (group && top?.group === group && now - top.time < 1500 && this.historyAt > 0) this.history[this.historyAt] = snapshot
    else { this.history.push(snapshot); this.historyAt = this.history.length - 1 }
    if (this.history.length > 300) { this.history.shift(); this.historyAt-- }
  }

  private undo() { this.stepHistory(-1) }
  private redo() { this.stepHistory(1) }

  private stepHistory(delta: number) {
    this.activePara?.flush()                        // keep what was just typed as its own step
    const target = this.historyAt + delta
    if (target < 0 || target >= this.history.length) { this.say(delta < 0 ? 'Nothing to undo' : 'Nothing to redo'); return }
    this.historyAt = target
    this.doc = structuredClone(this.history[target].doc)
    this.dirty = true
    const key = this.activePara?.key
    if (key && (key === 'doc' || M.locate(this.doc, key))) this.pendingFocus = { key, where: 'end' }
    this.version++
    this.validateSoon()
  }

  private validateSoon(delay = 200) {
    clearTimeout(this.validateTimer)
    this.validateTimer = setTimeout(() => { void this.validate() }, delay)
  }

  private async validate() {
    const trace = new Map<string, string>()
    const plain = M.toPlain(this.doc, trace)
    const value = coreFromPlain(plain).value
    const result = validateDocument(value)
    const bySection = new Map<string, string[]>()
    const document: string[] = []
    const add = (path: (string | number)[], message: string) => {
      let key: string | undefined
      for (let n = path.length; n > 0 && !key; n--) key = trace.get(path.slice(0, n).join('.'))
      if (key) bySection.set(key, [...(bySection.get(key) ?? []), message])
      else document.push(`${path.join('.') || 'document'}: ${message}`)
    }
    for (const p of result.problems) add(p.path, p.message)
    // References into included documents are checked against the composed includes.
    for (const ext of result.external) {
      const include = this.includeBySectionId(ext.path[0])
      const info = include?.source ? this.includes.get(include.source) : undefined
      if (info?.state === 'ok' && !numberWithin(info.composed!, ext.path.slice(1))) {
        add(ext.at, `<ref:${ext.path.join('/')}> does not resolve in the included document`)
      }
    }
    const count = document.length + [...bySection.values()].reduce((n, l) => n + l.length, 0)
    this.validation = { result, bySection, document, count }
    this.cid = result.valid && !document.length && !bySection.size ? (await documentCid(value)).cid?.toString() : undefined
    this.requestUpdate()
  }

  private includeBySectionId(id: string): M.EditSection | undefined {
    const walk = (list: M.EditSection[]): M.EditSection | undefined => {
      for (const s of list) {
        if (s.id === id) return s
        if (s.source === undefined) { const inner = walk(s.sections); if (inner) return inner }
      }
      return undefined
    }
    return walk(this.doc.sections)
  }

  // -------------------------------------------------------------------------------------------
  // Included documents and references

  private loadIncludes() {
    for (const cid of M.includeCids(this.doc)) {
      if (this.includes.has(cid)) continue
      this.includes.set(cid, { cid, state: 'loading', problems: [] })
      void loadInclude(cid, this.sources).then(info => {
        this.includes.set(cid, info)
        this.version++
        this.validateSoon(0)
      })
    }
  }

  private numbers(): Map<string, { number: string, section: M.EditSection }> {
    const map = new Map<string, { number: string, section: M.EditSection }>()
    for (const { section, number } of M.allSections(this.doc)) if (section.id) map.set(section.id, { number, section })
    return map
  }

  // The live label of a reference, e.g. "Section 3.1", or undefined if it does not resolve.
  private refLabel = (path: string[]): string | undefined => {
    const first = this.numbers().get(path[0])
    if (!first) return undefined
    if (path.length === 1) return `Section ${first.number}`
    const info = first.section.source ? this.includes.get(first.section.source) : undefined
    const within = info?.composed ? numberWithin(info.composed, path.slice(1)) : undefined
    return within ? `Section ${joinNumber(first.number, within)}` : undefined
  }

  // -------------------------------------------------------------------------------------------
  // Paragraph events

  private onParagraphChange(e: CustomEvent<ParagraphChange>) {
    const { key, value } = e.detail
    if (key === 'doc') this.doc.text = value || undefined
    else { const at = M.locate(this.doc, key); if (!at) return; at.section.text = value || undefined }
    this.changed(true, `text:${key}`)
  }

  private onParagraphSplit(e: CustomEvent<ParagraphSplit>) {
    const { key, before, after } = e.detail
    if (key === 'doc') {
      this.doc.text = before || undefined
      const next = M.newSection({ text: after || undefined })
      this.doc.sections.unshift(next)
      this.pendingFocus = { key: next.key, where: 'start' }
    } else {
      const next = M.splitParagraph(this.doc, key, before, after)
      if (next) this.pendingFocus = { key: next.key, where: 'start' }
    }
    this.changed()
  }

  // Several pasted paragraphs: the first joins the text before the caret; the others become new
  // paragraph sections after this one, the last joined by the text after the caret.
  private onParagraphPaste(e: CustomEvent<ParagraphPaste>) {
    const { key, before, blocks, after } = e.detail
    const join = (a: string, b: string) => canonicalMarkup(a + b) || undefined
    const first = join(before, blocks[0])
    const lastText = blocks[blocks.length - 1]
    const rest = blocks.slice(1).map((b, i) => M.newSection({ text: i === blocks.length - 2 ? join(b, after) : b }))
    if (key === 'doc') {
      this.doc.text = first
      this.doc.sections.unshift(...rest)
    } else {
      const at = M.locate(this.doc, key)
      if (!at) return
      at.section.text = first
      at.parent.splice(at.index + 1, 0, ...rest)
    }
    const last = rest[rest.length - 1]
    this.pendingFocus = { key: last.key, where: M.plainLength(lastText) }
    this.changed()
  }

  private onParagraphMerge(e: CustomEvent<{ key: string }>) {
    // The first section joins back into the preamble (the reverse of Enter at the preamble's end).
    const first = this.doc.sections[0]
    if (first?.key === e.detail.key && first.source === undefined && first.title === undefined && !first.sections.length) {
      const left = this.doc.text ?? ''
      const at = M.plainLength(left)
      this.doc.text = canonicalMarkup(left && first.text ? `${left} ${first.text}` : left + (first.text ?? '')) || undefined
      this.doc.sections.shift()
      this.pendingFocus = { key: 'doc', where: at }
      this.changed()
      return
    }
    const merged = M.mergeWithPrevious(this.doc, e.detail.key)
    if (!merged) return
    this.pendingFocus = { key: merged.into.key, where: merged.at }
    this.changed()
  }

  private onFocusIn(e: FocusEvent) {
    const para = e.composedPath().find(n => n instanceof StrocParagraph) as StrocParagraph | undefined
    if (para) this.activePara = para
    const sec = e.composedPath().find(n => (n as HTMLElement).dataset?.sec) as HTMLElement | undefined
    this.activeKey = sec?.dataset.sec
  }

  private format(command: 'bold' | 'italic' | 'underline') {
    this.activePara?.format(command)
  }

  // -------------------------------------------------------------------------------------------
  // Opening and saving

  private confirmDiscard(): boolean {
    return !this.dirty || confirm('You have unsaved changes. Discard them?')
  }

  private load(doc: M.EditDoc, from: { name?: string, handle?: FileHandle, format?: Format, cid?: string }) {
    this.doc = doc
    this.fileName = from.name
    this.fileHandle = from.handle
    this.fileFormat = from.format ?? 'yaml'
    this.openedFrom = from.cid
    this.dirty = false
    this.activeKey = undefined
    const url = new URL(location.href)
    if (from.cid) url.searchParams.set('cid', from.cid)
    else url.searchParams.delete('cid')
    history.replaceState(null, '', url)
    this.history = []
    this.historyAt = -1
    this.changed(false)
  }

  private newDocument() {
    if (!this.confirmDiscard()) return
    this.load(M.newDoc(), {})
  }

  async openFile() {
    if (!this.confirmDiscard()) return
    const w = window as unknown as PickerWindow
    if (w.showOpenFilePicker) {
      try {
        const [handle] = await w.showOpenFilePicker({ types: FILE_TYPES })
        await this.loadFile(await handle.getFile(), handle)
      } catch (err) { if ((err as Error).name !== 'AbortError') this.say(`Could not open: ${(err as Error).message}`) }
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.yaml,.yml,.json'
    input.onchange = () => { const f = input.files?.[0]; if (f) void this.loadFile(f) }
    input.click()
  }

  private async loadFile(file: File, handle?: FileHandle) {
    const parsed = lintYaml(await file.text())
    if (parsed.value === undefined) {
      this.say(`${file.name} is not readable YAML or JSON: ${parsed.problems[0]?.message ?? ''}`)
      return
    }
    const plain = coreToPlain(parsed.value) as Record<string, unknown>
    if (!plain || typeof plain !== 'object' || !('title' in plain)) { this.say(`${file.name} is not a Stroc document`); return }
    this.load(M.fromPlain(plain), { name: file.name, handle, format: /\.json$/i.test(file.name) ? 'json' : 'yaml' })
  }

  private serialize(format: Format): string {
    const plain = M.toPlain(this.doc)
    return format === 'json' ? JSON.stringify(plain, null, 2) + '\n' : stringifyDocument(plain)
  }

  private suggestedName(format: Format) {
    const base = (this.doc.title || 'document').trim().replace(/[^\w.-]+/g, '_')
    return `${base}.${format === 'json' ? 'json' : 'yaml'}`
  }

  async save() {
    if (this.fileHandle?.createWritable) {
      try {
        const out = await this.fileHandle.createWritable()
        await out.write(this.serialize(this.fileFormat))
        await out.close()
        this.saved(this.fileHandle.name)
        return
      } catch (err) { this.say(`Could not save to ${this.fileHandle.name}: ${(err as Error).message}`) }
    }
    await this.saveAs()
  }

  async saveAs(format: Format = this.fileFormat) {
    const w = window as unknown as PickerWindow
    if (w.showSaveFilePicker) {
      try {
        const handle = await w.showSaveFilePicker({ suggestedName: this.suggestedName(format), types: FILE_TYPES })
        const out = await handle.createWritable!()
        await out.write(this.serialize(/\.json$/i.test(handle.name) ? 'json' : 'yaml'))
        await out.close()
        this.fileHandle = handle
        this.fileName = handle.name
        this.fileFormat = /\.json$/i.test(handle.name) ? 'json' : 'yaml'
        this.saved(handle.name)
      } catch (err) { if ((err as Error).name !== 'AbortError') this.say(`Could not save: ${(err as Error).message}`) }
      return
    }
    const name = this.suggestedName(format)
    const url = URL.createObjectURL(new Blob([this.serialize(format)], { type: format === 'json' ? 'application/json' : 'application/yaml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    this.fileName = name
    this.saved(name)
  }

  private saved(name: string) {
    this.dirty = false
    const n = this.validation.count
    this.say(n ? `Saved ${name}, with ${n} problem${n === 1 ? '' : 's'}: not yet a valid document` : `Saved ${name}`)
    this.version++
  }

  // Fetch a document by CID from the sources, verify it, and open it.
  async openByCid(text: string) {
    if (!this.confirmDiscard()) return
    let cid: CID
    try { cid = CID.parse(text.trim()) } catch { this.say(`Not a CID: ${text}`); return }
    const bytes = await new SourcesResolver(this.sources).get(cid)
    if (!bytes) { this.say(`${cid} was not found in any source. Add one under File → Sources.`); return }
    const v = await verifyDocument(bytes, cid)
    if (!v.ok || !v.document) { this.say(`${cid} failed verification: ${v.problems[0]?.message ?? ''}`); return }
    this.dialog = undefined
    this.load(M.fromPlain(coreToPlain(v.document) as Record<string, unknown>), { cid: cid.toString() })
  }

  // Export the document as PDF: composed with its includes from the sources, laid out as a template
  // (deal-specific values blank), with a QR code for fetching it. pdfmake and the fonts are loaded
  // from vendor/ beside the editor bundle on first use; pdfmake may fetch only those fonts.
  async exportPdf(pageSize: 'LETTER' | 'A4') {
    const plain = M.toPlain(this.doc)
    const result = await documentCid(coreFromPlain(plain).value)
    if (!result.cid || !result.bytes) {
      this.say(`Fix the ${this.validation.count || 'remaining'} problem${this.validation.count === 1 ? '' : 's'} before exporting: a PDF shows the document's CID`)
      return
    }
    this.say('Preparing PDF…')
    const store = new MemoryStore()
    await store.put(result.bytes)
    const composed = await compose(result.cid, firstOf(store, new SourcesResolver(this.sources)))
    const laid = layout(composed, { options: { template: true, draft: composed.problems.length > 0, cidQr: true } })
    if (!laid.layout) { this.say(`Cannot lay out: ${laid.problems[0]?.message ?? ''}`); return }
    try {
      const pdfMake = await loadPdfMake()
      const def = toPdfDefinition(laid.layout, { pageSize, font: 'NotoSerif', monoFont: 'NotoSansMono', fontSize: 9.5, lineHeight: 1.0 })
      pdfMake.createPdf(def).download(`${(this.doc.title || 'document').trim().replace(/[^\w.-]+/g, '_')}.pdf`)
      this.say(composed.problems.length ? 'PDF exported as a draft: some included documents were not available' : 'PDF exported')
    } catch (err) {
      this.say(`PDF export failed: ${(err as Error).message}`)
    }
  }

  private onDrop = async (e: DragEvent) => {
    if (!e.dataTransfer?.files.length) return
    e.preventDefault()
    this.dragOverFile = false
    if (this.confirmDiscard()) await this.loadFile(e.dataTransfer.files[0])
  }

  // -------------------------------------------------------------------------------------------
  // Section operations

  private run(op: () => boolean | void, focusKey?: string) {
    if (op() === false) return
    if (focusKey) this.pendingFocus = { key: focusKey, where: 'end' }
    this.changed()
  }

  private addSection(where: 'end' | 'after' | 'child', init: Partial<M.EditSection> = {}) {
    const s = M.newSection(init)
    const at = this.activeKey ? M.locate(this.doc, this.activeKey) : undefined
    this.run(() => {
      if (where === 'child' && at && at.section.source === undefined) at.section.sections.push(s)
      else if (where === 'after' && at) M.insertAfter(this.doc, at.section.key, s)
      else this.doc.sections.push(s)
    }, s.key)
    this.activeKey = s.key
  }

  private toggleTitle(s: M.EditSection) {
    this.run(() => { s.title = s.title === undefined ? '' : undefined })
  }

  private setId(s: M.EditSection, value: string) {
    const id = value.trim() || undefined
    if (s.id && id && s.id !== id) {
      const n = M.renameId(this.doc, s.id, id)
      if (n) this.say(`Updated ${n} reference${n === 1 ? '' : 's'} to the new id`)
    } else s.id = id
    this.changed()
  }

  // Move the section and keep editing where the caret was.
  private structure(op: 'up' | 'down' | 'indent' | 'outdent', key: string) {
    const ops = { up: M.moveUp, down: M.moveDown, indent: M.indent, outdent: M.outdent }
    if (!ops[op](this.doc, key)) {
      if (op === 'indent') this.say('Cannot indent: there is no written-out section before this one at its level')
      return
    }
    const focused = this.activePara?.key === key
    this.changed()
    if (focused) this.pendingFocus = { key, where: 'end' }
  }

  // Replace an include with a written-out copy of the included document. It is then ordinary text
  // of this document: no longer linked by CID, and free to edit.
  private inlineInclude(s: M.EditSection) {
    const info = s.source ? this.includes.get(s.source) : undefined
    const doc = info?.composed?.document
    if (!doc) { this.say('The included document is not available to copy'); return }
    if (!confirm('Replace the include with a written-out copy of its text? The copy is no longer linked to the original document.')) return
    const copy = M.fromPlain(coreToPlain(doc) as Record<string, unknown>)
    this.run(() => M.replaceInclude(this.doc, s.key, { title: copy.title, text: copy.text, sections: copy.sections }))
    if (doc.parameters?.length) this.say('Note: the included document declared parameters; add them under Properties if this document needs them')
  }

  // Drag and drop: drop on the upper third of a section to place before it, the lower third to
  // place after it, the middle to make it the last subsection. Hold Shift (or Alt) to copy.
  private onDragStart(e: DragEvent, key: string) {
    this.dragKey = key
    e.dataTransfer!.effectAllowed = 'copyMove'
    e.dataTransfer!.setData('application/x-stroc-section', key)
  }

  private onDragOver(e: DragEvent, target: M.EditSection) {
    if (!this.dragKey || !e.dataTransfer?.types.includes('application/x-stroc-section')) return
    e.preventDefault()
    e.stopPropagation()
    const row = (e.currentTarget as HTMLElement).querySelector('.row') as HTMLElement
    const box = row.getBoundingClientRect()
    const y = (e.clientY - box.top) / box.height
    const where: M.Placement = target.source !== undefined ? (y < 0.5 ? 'before' : 'after') : y < 0.33 ? 'before' : y > 0.67 ? 'after' : 'into'
    e.dataTransfer.dropEffect = e.shiftKey || e.altKey ? 'copy' : 'move'
    if (this.dropAt?.key !== target.key || this.dropAt.where !== where) {
      this.dropAt = { key: target.key, where }
      this.version++
    }
  }

  private onDropSection(e: DragEvent) {
    if (!this.dragKey || !this.dropAt) return
    e.preventDefault()
    e.stopPropagation()
    const { key, where } = this.dropAt
    const copy = e.shiftKey || e.altKey
    const moved = M.place(this.doc, this.dragKey, key, where, copy)
    this.dragKey = undefined
    this.dropAt = undefined
    if (moved) this.changed()
    else { this.version++; this.say('Cannot drop a section inside itself') }
  }

  private onDragEnd() {
    this.dragKey = undefined
    if (this.dropAt) { this.dropAt = undefined; this.version++ }
  }

  // -------------------------------------------------------------------------------------------
  // References

  private showReferences() {
    if (!this.activePara) { this.say('Click in a paragraph first, where the reference should go'); return }
    this.activePara.rememberSelection()
    this.refPara = this.activePara
    this.refFilter = ''
    this.dialog = 'reference'
  }

  // Everything a reference can point to: this document's sections, and the sections of included
  // documents that have ids (their ids cannot be added from here).
  private referenceTargets(): RefTarget[] {
    const out: RefTarget[] = []
    const snippet = (t?: string) => (t ? t.replace(/<[^>]*>|\\/g, '').slice(0, 70) : '')
    for (const { section, number, depth } of M.allSections(this.doc)) {
      if (section.source !== undefined) {
        const info = this.includes.get(section.source)
        out.push({ number, label: info?.composed?.title ?? 'Included document', path: section.id ? [section.id] : undefined, section, depth })
        if (section.id && info?.composed) this.composedTargets(info.composed.sections, [section.id], number, depth + 1, out)
      } else {
        out.push({ number, label: section.title || snippet(section.text) || '(empty)', path: section.id ? [section.id] : undefined, section, depth })
      }
    }
    return out
  }

  private composedTargets(list: ComposedSection[], scope: string[], prefix: string, depth: number, out: RefTarget[]) {
    for (const c of list) {
      const number = joinNumber(prefix, c.number)
      if (c.id) {
        out.push({ number, label: c.title ?? (c.text ? 'Paragraph' : ''), path: [...scope, c.id], included: true, depth })
        if (c.include) { this.composedTargets(c.sections, [...scope, c.id], prefix, depth + 1, out); continue }
      }
      if (!c.include) this.composedTargets(c.sections, scope, prefix, depth + 1, out)
    }
  }

  private pickReference(t: RefTarget) {
    let path = t.path
    if (!path && t.section) {
      t.section.id = M.uniqueId(this.doc, t.section.title || t.section.text?.replace(/<[^>]*>/g, '').slice(0, 40))
      path = [t.section.id]
      this.changed()
    }
    if (!path) return
    this.dialog = undefined
    const para = this.refPara
    this.refPara = undefined
    requestAnimationFrame(() => para?.insertRef(path!))
  }

  // -------------------------------------------------------------------------------------------
  // Rendering

  render() {
    return html`
      ${this.renderMenubar()}
      ${this.preview ? nothing : this.renderFormatbar()}
      <div class="document-area"
        @focusin=${this.onFocusIn}
        @paragraph-change=${this.onParagraphChange}
        @paragraph-split=${this.onParagraphSplit}
        @paragraph-merge=${this.onParagraphMerge}
        @paragraph-paste=${this.onParagraphPaste}
        @dragover=${(e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); this.dragOverFile = true } }}
        @dragleave=${() => { this.dragOverFile = false }}
        @drop=${this.onDrop}>
        <div class="doc">${this.renderHeader()}${this.renderSections(this.doc.sections, '')}
          ${this.preview ? nothing : html`<button class="add-section" @click=${() => this.addSection('end')}>+ Add section</button>`}
        </div>
      </div>
      ${this.dragOverFile ? html`<div class="drop-overlay">Drop a Stroc document to open it</div>` : nothing}
      ${this.renderDialog()}
    `
  }

  private menuItem(label: string, action: () => void, shortcut = '', disabled = false) {
    return html`<button class="menu-item" ?disabled=${disabled} @click=${() => { this.menu = undefined; action() }}>
      <span>${label}</span>${shortcut ? html`<span class="shortcut">${shortcut}</span>` : nothing}</button>`
  }

  private renderMenu(id: string, label: string, items: TemplateResult) {
    return html`<div class="menu ${this.menu === id ? 'open' : ''}">
      <button class="menu-label" @click=${() => { this.menu = this.menu === id ? undefined : id }}>${label}</button>
      <div class="menu-dropdown">${items}</div></div>`
  }

  private renderMenubar() {
    const v = this.validation
    const where = this.fileName ?? (this.openedFrom ? `CID ${this.openedFrom.slice(0, 14)}…` : 'not saved')
    return html`
      <div class="menubar">
        ${this.renderMenu('file', 'File', html`
          ${this.menuItem('New', () => this.newDocument())}
          ${this.menuItem('Open File…', () => void this.openFile(), '⌘O')}
          ${this.menuItem('Open from Sources…', () => this.showOpen('open'))}
          <div class="menu-sep"></div>
          ${this.menuItem('Save', () => void this.save(), '⌘S')}
          ${this.menuItem('Save As…', () => void this.saveAs(), '⇧⌘S')}
          ${this.menuItem('Save As JSON…', () => void this.saveAs('json'))}
          <div class="menu-sep"></div>
          ${this.menuItem('Export PDF (Letter)…', () => void this.exportPdf('LETTER'))}
          ${this.menuItem('Export PDF (A4)…', () => void this.exportPdf('A4'))}
          <div class="menu-sep"></div>
          ${this.menuItem('Sources…', () => { this.dialog = 'sources' })}
        `)}
        ${this.renderMenu('edit', 'Edit', html`
          ${this.menuItem('Undo', () => this.undo(), '⌘Z', this.historyAt <= 0)}
          ${this.menuItem('Redo', () => this.redo(), '⇧⌘Z', this.historyAt >= this.history.length - 1)}
          <div class="menu-sep"></div>
          ${this.menuItem('Document Properties…', () => { this.dialog = 'properties' })}
        `)}
        ${this.renderMenu('view', 'View', html`
          ${this.menuItem(this.preview ? '✓ Preview (no editing)' : 'Preview (no editing)', () => { this.preview = !this.preview }, '⌘E')}
          ${this.menuItem(this.checkSpelling ? '✓ Spell Check' : 'Spell Check', () => { this.checkSpelling = !this.checkSpelling; this.version++ })}
        `)}
        ${this.renderMenu('insert', 'Insert', html`
          ${this.menuItem('Section at End', () => this.addSection('end'))}
          ${this.menuItem('Section After Current', () => this.addSection('after'), '', !this.activeKey)}
          ${this.menuItem('Subsection', () => this.addSection('child'), '', !this.activeKey)}
          ${this.menuItem('Included Document…', () => this.showOpen('include'))}
          ${this.menuItem('Reference…', () => this.showReferences(), '⌘K')}
        `)}
        <div class="status">
          ${this.notice ? html`<span>${this.notice}</span>` : nothing}
          <span class="file" title=${where}>${where}</span>
          ${this.dirty ? html`<span class="dirty" title="Unsaved changes">●</span>` : nothing}
          ${v.count
            ? html`<span class="badge bad" title="Problems are shown at the sections they concern">${v.count} problem${v.count === 1 ? '' : 's'}</span>`
            : html`<span class="badge good">Valid</span>`}
          ${this.cid ? html`<span class="cid" title=${this.cid}>${this.cid}</span>
            <button class="badge" title="Copy the CID" @click=${() => { void navigator.clipboard?.writeText(this.cid!); this.say('CID copied') }}>Copy</button>` : nothing}
        </div>
      </div>`
  }

  private renderFormatbar() {
    const keep = (e: Event) => e.preventDefault()   // keep the selection in the paragraph
    return html`
      <div class="formatbar">
        <button title="Bold (⌘B)" @mousedown=${keep} @click=${() => this.format('bold')}><b>B</b></button>
        <button title="Italic (⌘I)" @mousedown=${keep} @click=${() => this.format('italic')}><i>I</i></button>
        <button title="Underline (⌘U)" @mousedown=${keep} @click=${() => this.format('underline')}><u>U</u></button>
        <span class="sep"></span>
        <button title="Insert a reference to a section (⌘K)" @mousedown=${keep} @click=${() => this.showReferences()}>Reference…</button>
        <span class="hint">Paste keeps bold, italic, underline; several paragraphs become sections · Enter: new paragraph · Backspace at start: join · Tab / Shift+Tab: indent / outdent · Alt+Shift+↑↓: move · drag ⋮⋮ to move (Shift to copy)</span>
      </div>`
  }

  private renderHeader() {
    const d = this.doc
    return html`
      <input class="doc-title" .value=${d.title} placeholder="Document title" ?readonly=${this.preview}
        @input=${(e: InputEvent) => { d.title = (e.target as HTMLInputElement).value; this.changed(true, 'title:doc') }} />
      <div class="doc-meta">
        <span><b>Author</b> ${d.author ?? html`<span class="muted">none</span>`}</span>
        <span><b>Language</b> ${d.language}</span>
        ${d.published ? html`<span><b>Published</b> ${d.published}</span>` : nothing}
        ${d.parameters.length ? html`<span><b>Parameters</b> ${d.parameters.length}</span>` : nothing}
        ${d.replaces.length ? html`<span><b>Replaces</b> ${d.replaces.length}</span>` : nothing}
        <button @click=${() => { this.dialog = 'properties' }}>Properties…</button>
      </div>
      ${this.validation.document.length ? html`<ul class="problems">${this.validation.document.map(p => html`<li>${p}</li>`)}</ul>` : nothing}
      <div class="preamble">${this.renderParagraph('doc', d.text, 'Preamble (optional): text before the first section')}</div>`
  }

  private renderParagraph(key: string, value: string | undefined, placeholder: string) {
    return html`<stroc-paragraph data-key=${key} .key=${key} .value=${value ?? ''} .placeholder=${this.preview ? '' : placeholder}
      .editable=${!this.preview} spellcheck=${this.checkSpelling ? 'true' : 'false'}
      .labelRef=${this.refLabel} .refresh=${this.version}></stroc-paragraph>`
  }

  private renderSections(list: M.EditSection[], prefix: string): unknown {
    return list.map((s, i) => this.renderSection(s, prefix ? `${prefix}.${i + 1}` : `${i + 1}`))
  }

  private renderSection(s: M.EditSection, number: string): TemplateResult {
    const active = this.activeKey === s.key
    const problems = this.validation.bySection.get(s.key) ?? []
    if (s.source !== undefined) return this.renderInclude(s, number, active, problems)
    return html`
      <div class="sec ${active ? 'active' : ''} ${this.dropClass(s)}" data-sec=${s.key}
        @dragover=${(e: DragEvent) => this.onDragOver(e, s)} @drop=${(e: DragEvent) => this.onDropSection(e)}>
        <div class="row">
          ${this.grip(s)}
          <span class="num">${number}.</span>
          <div>
            ${s.title !== undefined ? html`<input class="title-input" .value=${s.title} placeholder="Section title" ?readonly=${this.preview}
              @input=${(e: InputEvent) => { s.title = (e.target as HTMLInputElement).value; this.changed(true, `title:${s.key}`) }} />` : nothing}
            ${this.renderParagraph(s.key, s.text, s.sections.length || s.title ? 'Text (optional)' : 'Type a paragraph')}
            ${problems.map(p => html`<div class="sec-problems">${p}</div>`)}
            ${active && !this.preview ? this.renderTools(s) : nothing}
          </div>
        </div>
        ${s.sections.length ? html`<div class="children">${this.renderSections(s.sections, number)}</div>` : nothing}
      </div>`
  }

  private grip(s: M.EditSection) {
    return html`<span class="grip" draggable="true" title="Drag to move (Shift or Alt to copy)"
      @dragstart=${(e: DragEvent) => this.onDragStart(e, s.key)} @dragend=${() => this.onDragEnd()}>⋮⋮</span>`
  }

  private dropClass(s: M.EditSection) {
    return this.dropAt?.key === s.key ? `drop-${this.dropAt.where}` : ''
  }

  private renderTools(s: M.EditSection) {
    const at = M.locate(this.doc, s.key)
    return html`
      <div class="tools">
        <button title="Move up (Alt+Shift+↑)" ?disabled=${!at || at.index === 0} @click=${() => this.structure('up', s.key)}>↑</button>
        <button title="Move down (Alt+Shift+↓)" ?disabled=${!at || at.index >= at.parent.length - 1} @click=${() => this.structure('down', s.key)}>↓</button>
        <button title="Outdent (Shift+Tab)" ?disabled=${!at || at.path.length < 2} @click=${() => this.structure('outdent', s.key)}>⇤</button>
        <button title="Indent under the section above (Tab)" ?disabled=${!at || at.index === 0 || at.parent[at.index - 1].source !== undefined} @click=${() => this.structure('indent', s.key)}>⇥</button>
        ${s.source === undefined
          ? html`<button @click=${() => this.toggleTitle(s)}>${s.title === undefined ? 'Add title' : 'Remove title'}</button>`
          : html`<button title="Replace with a written-out copy of the document" @click=${() => this.inlineInclude(s)}>Write out a copy</button>`}
        <button title="New paragraph after this section" @click=${() => this.addSection('after')}>+ Paragraph</button>
        ${s.source === undefined ? html`<button title="New section inside this one" @click=${() => this.addSection('child')}>+ Subsection</button>` : nothing}
        <button title="Delete this section" @click=${() => { if (confirm('Delete this section and everything in it?')) this.run(() => M.remove(this.doc, s.key)) }}>Delete</button>
        <span class="id">id
          <input .value=${s.id ?? ''} placeholder=${s.source !== undefined ? 'required' : 'none'} title="Id for references to this section"
            @change=${(e: Event) => this.setId(s, (e.target as HTMLInputElement).value)} />
          ${!s.id && s.source === undefined ? html`<button title="Suggest an id from the title" @click=${() => this.setId(s, M.uniqueId(this.doc, s.title || s.text?.slice(0, 40)))}>Suggest</button>` : nothing}
        </span>
      </div>`
  }

  private renderInclude(s: M.EditSection, number: string, active: boolean, problems: string[]) {
    const info = this.includes.get(s.source!)
    const doc = info?.composed
    return html`
      <div class="sec include ${active ? 'active' : ''} ${this.dropClass(s)}" data-sec=${s.key} tabindex="-1"
        @dragover=${(e: DragEvent) => this.onDragOver(e, s)} @drop=${(e: DragEvent) => this.onDropSection(e)}>
        <div class="row">
          ${this.grip(s)}
          <span class="num">${number}.</span>
          <div>
            <div class="inc-title">${doc?.title ?? 'Included document'}<span class="inc-id">${s.id ?? '(no id)'}</span></div>
            ${this.renderIncludeInfo(info, s.source!)}
            ${problems.map(p => html`<div class="sec-problems">${p}</div>`)}
            ${active && !this.preview ? this.renderTools(s) : nothing}
          </div>
        </div>
        ${doc ? html`<div class="inc-body">
          ${doc.text ? html`<div>${this.renderComposedInline(doc.text, number)}</div>` : nothing}
          ${doc.sections.map(c => this.renderComposed(c, number))}
        </div>` : nothing}
      </div>`
  }

  private renderIncludeInfo(info: IncludeInfo | undefined, cid: string) {
    if (!info || info.state === 'loading') return html`<div class="inc-info muted">Loading from ${this.sources.length} source${this.sources.length === 1 ? '' : 's'}…</div>`
    if (info.state !== 'ok') {
      const what = info.state === 'missing' ? 'Not found in any source' : info.state === 'bad-cid' ? 'Not a valid CID' : 'Failed verification'
      return html`<div class="inc-info"><span class="badge bad">✗ ${what}</span>
        <button @click=${() => { this.dialog = 'sources' }}>Sources…</button>
        <div class="cid-line">${cid}</div></div>`
    }
    const a = info.author
    let host = info.source ?? ''
    try { host = new URL(host).host } catch { /* as is */ }
    const entry = info.sourceEntry?.entry
    return html`
      <div class="inc-info">
        <span class="badge good" title="The content matches its CID">✓ Verified</span>
        <span class="muted">from ${host}</span>
        ${!a || a.status === 'not-a-domain'
          ? html`<span>${a?.author ? html`Author ${a.author} <span class="muted">(a name; not verifiable)</span>` : html`<span class="muted">No author</span>`}</span>`
          : a.status === 'confirmed'
            ? html`<span class="badge good">✓ Author ${a.domain} confirmed</span>`
            : html`<span class="badge warn" title=${a.reason ?? ''}>Author ${a.domain} not confirmed: ${a.status.replace('-', ' ')}</span>`}
        ${entry ? html`<span class="badge ${entry.status !== 'current' ? 'warn' : ''}" title="What ${host} claims in its catalog">${host}: ${entry.role}, ${entry.status}</span>` : nothing}
        ${info.problems.length ? html`<span class="badge warn" title=${info.problems.join('\n')}>${info.problems.length} problem${info.problems.length === 1 ? '' : 's'} inside</span>` : nothing}
        <button @click=${() => void this.openByCid(cid)}>Open</button>
        <a href="?cid=${encodeURIComponent(cid)}" target="_blank" rel="noopener">Open in new tab ↗</a>
        <div class="cid-line">${cid}</div>
      </div>`
  }

  private renderComposedInline(nodes: ComposedInline[], prefix: string): unknown {
    return nodes.map(n => {
      if (n.type === 'text') return n.value
      if (n.type === 'ref') return n.target
        ? html`<span class="ref">Section ${joinNumber(prefix, n.target)}</span>`
        : html`<span class="ref unresolved">→${n.path.join('/')}</span>`
      const inner = this.renderComposedInline(n.children, prefix)
      return n.tag === 'b' ? html`<b>${inner}</b>` : n.tag === 'i' ? html`<i>${inner}</i>` : html`<u>${inner}</u>`
    })
  }

  private renderComposed(sec: ComposedSection, prefix: string): TemplateResult {
    return html`
      <div class="composed">
        <div class="crow"><span class="cnum">${joinNumber(prefix, sec.number)}.</span>
          <div>
            ${sec.title || sec.include ? html`<div class="chead">${sec.title ? html`<span class="ctitle">${sec.title}</span>` : nothing}
              ${sec.include ? html`<span class="cid-line">${sec.include.cid.toString()}</span>` : nothing}</div>` : nothing}
            ${sec.text ? html`<div>${this.renderComposedInline(sec.text, prefix)}</div>` : nothing}
          </div>
        </div>
        ${sec.sections.length ? html`<div class="csub">${sec.sections.map(c => this.renderComposed(c, prefix))}</div>` : nothing}
      </div>`
  }

  // -------------------------------------------------------------------------------------------
  // Dialogs

  private renderDialog() {
    if (!this.dialog) return nothing
    const close = () => { this.dialog = undefined }
    const body =
      this.dialog === 'sources' ? this.renderSourcesDialog(close) :
      this.dialog === 'properties' ? this.renderPropertiesDialog(close) :
      this.dialog === 'reference' ? this.renderReferenceDialog(close) :
      this.renderCatalogDialog(close)
    return html`<div class="backdrop" @click=${close}></div><div class="dialog" role="dialog">${body}</div>`
  }

  private renderReferenceDialog(close: () => void) {
    const filter = this.refFilter.toLowerCase()
    const targets = this.referenceTargets().filter(t =>
      !filter || t.label.toLowerCase().includes(filter) || t.number.startsWith(filter) || t.path?.join('/').includes(filter))
    const choose = (e: Event) => { e.preventDefault(); const first = targets.find(t => t.path || t.section); if (first) this.pickReference(first) }
    return html`
      <h2>Insert a reference <button @click=${close}>Cancel</button></h2>
      <p class="intro">References are shown as live section numbers and stored by id. Picking a section of this document without an id gives it one, from its title.</p>
      <form @submit=${choose}><input name="filter" placeholder="Filter by title, number or id" .value=${this.refFilter} autofocus
        @input=${(e: InputEvent) => { this.refFilter = (e.target as HTMLInputElement).value; this.version++ }} /></form>
      <table>
        <thead><tr><th>Section</th><th>Title</th><th>Reference</th></tr></thead>
        <tbody>${targets.map(t => {
          const usable = t.path || t.section
          return html`<tr class=${usable ? 'pick' : ''} @click=${() => usable && this.pickReference(t)}>
            <td style="padding-left:${(t.depth - 1) * 12}px">${t.number}</td>
            <td>${t.label}${t.included ? html` <span class="muted">(included)</span>` : nothing}</td>
            <td>${t.path ? html`<code>${t.path.join('/')}</code>` : t.section ? html`<span class="muted">will get an id</span>` : html`<span class="muted">no id: cannot be referenced</span>`}</td></tr>`
        })}</tbody>
      </table>`
  }

  private renderSourcesDialog(close: () => void) {
    const update = (list: string[]) => {
      this.sources = list
      saveSources(list)
      forgetCatalogs()
      this.includes = new Map()
      this.catalogRows = undefined
      this.changed(false)
    }
    const move = (i: number, d: number) => { const l = [...this.sources]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); update(l) }
    const add = (e: Event) => {
      e.preventDefault()
      const input = (e.target as HTMLFormElement).elements.namedItem('source') as HTMLInputElement
      const url = normalizeSource(input.value.trim())
      if (!url) { this.say('Not a valid URL'); return }
      if (!this.sources.includes(url)) update([...this.sources, url])
      input.value = ''
    }
    return html`
      <h2>Document sources <button @click=${close}>Close</button></h2>
      <p class="intro">Tried in order when fetching a document by CID. Everything fetched is verified against its CID, so no source needs to be trusted.</p>
      <ol>${this.sources.map((src, i) => html`<li><code>${src}</code>
        <button ?disabled=${i === 0} @click=${() => move(i, -1)}>↑</button>
        <button ?disabled=${i === this.sources.length - 1} @click=${() => move(i, 1)}>↓</button>
        <button @click=${() => update(this.sources.filter((_, j) => j !== i))}>Remove</button></li>`)}</ol>
      <form @submit=${add}>
        <input name="source" placeholder="http://localhost:3001, https://example.org or an IPFS gateway" />
        <button type="submit">Add</button>
        <button type="button" @click=${() => update([location.origin])}>Reset</button>
      </form>`
  }

  private showOpen(mode: 'open' | 'include') {
    this.dialog = mode
    if (!this.catalogRows) void this.loadCatalogRows()
  }

  private async loadCatalogRows() {
    const rows: CatalogRow[] = []
    await Promise.all(this.sources.map(async source => {
      const catalog = await sourceCatalog(source)
      let host = source
      try { host = new URL(source).host } catch { /* as is */ }
      for (const entry of catalog?.entries ?? []) rows.push({ source, host, entry })
    }))
    rows.sort((a, b) => (a.entry.title ?? '').localeCompare(b.entry.title ?? ''))
    this.catalogRows = rows
    this.version++
  }

  private insertInclude(cid: string, title?: string) {
    let id = M.uniqueId(this.doc, title ?? 'included')
    const answer = prompt('Id for this included document (used in references):', id)
    if (answer === null) return
    id = answer.trim() || id
    this.dialog = undefined
    this.addSection(this.activeKey ? 'after' : 'end', { id, source: cid })
  }

  private renderCatalogDialog(close: () => void) {
    const include = this.dialog === 'include'
    const pick = (row: CatalogRow) => include ? this.insertInclude(row.entry.cid, row.entry.title) : void this.openByCid(row.entry.cid)
    const byCid = (e: Event) => {
      e.preventDefault()
      const input = (e.target as HTMLFormElement).elements.namedItem('cid') as HTMLInputElement
      if (!input.value.trim()) return
      if (include) this.insertInclude(input.value.trim())
      else void this.openByCid(input.value)
    }
    const rows = this.catalogRows
    return html`
      <h2>${include ? 'Include a document' : 'Open from sources'} <button @click=${close}>Close</button></h2>
      <p class="intro">Documents listed in your sources' catalogs (File → Sources). Or enter a CID, for sources without a catalog such as IPFS gateways.</p>
      ${!rows ? html`<p class="muted">Loading catalogs…</p>` : !rows.length ? html`<p class="muted">No catalogs found in your sources.</p>` : html`
        <table>
          <thead><tr><th>Title</th><th>Source</th><th>Its claim</th><th>Status</th></tr></thead>
          <tbody>${rows.map(r => html`<tr class="pick" title=${r.entry.cid} @click=${() => pick(r)}>
            <td>${r.entry.title ?? r.entry.cid}</td><td>${r.host}</td><td>${r.entry.role}</td>
            <td>${r.entry.status === 'current' ? r.entry.status : html`<span class="badge warn">${r.entry.status}</span>`}</td></tr>`)}</tbody>
        </table>`}
      <form @submit=${byCid}><input name="cid" placeholder="baguqeera… (CID)" /><button type="submit">${include ? 'Include' : 'Open'}</button></form>`
  }

  private renderPropertiesDialog(close: () => void) {
    const d = this.doc
    const set = (field: 'author' | 'language' | 'published' | 'title') => (e: Event) => {
      const v = (e.target as HTMLInputElement).value
      if (field === 'title' || field === 'language') d[field] = v
      else d[field] = v || undefined
      this.changed()
    }
    const param = (i: number, field: keyof M.EditParameter) => (e: Event) => {
      const v = (e.target as HTMLInputElement).value
      if (field === 'default') d.parameters[i].default = v || undefined
      else d.parameters[i][field] = v
      this.changed()
    }
    const addReplaces = (e: Event) => {
      e.preventDefault()
      const input = (e.target as HTMLFormElement).elements.namedItem('cid') as HTMLInputElement
      if (input.value.trim()) { d.replaces.push(input.value.trim()); input.value = ''; this.changed() }
    }
    return html`
      <h2>Document properties <button @click=${close}>Done</button></h2>
      <label>Title</label><input class="field" .value=${d.title} @input=${set('title')} />
      <label>Author</label><input class="field" .value=${d.author ?? ''} @input=${set('author')} placeholder="A domain (verifiable), e.g. sereus.org, or a name" />
      <label>Language</label><input class="field" .value=${d.language} @input=${set('language')} placeholder="BCP 47 tag, e.g. en or en-US" />
      <label>Published</label><input class="field" type="date" .value=${d.published ?? ''} @input=${set('published')} />
      <label>Parameters</label>
      <p class="note">Values supplied when the document is used (party names, dates); shown in a Particulars table. A parameter without a default is required.</p>
      ${d.parameters.map((p, i) => html`<div class="row-fields">
        <input .value=${p.key} placeholder="key, e.g. stock-name" @input=${param(i, 'key')} />
        <input .value=${p.label} placeholder="Label, e.g. Stock Holder" @input=${param(i, 'label')} />
        <input .value=${p.default ?? ''} placeholder="Default (optional)" @input=${param(i, 'default')} />
        <button @click=${() => { d.parameters.splice(i, 1); this.changed() }}>Remove</button></div>`)}
      <button @click=${() => { d.parameters.push({ key: '', label: '' }); this.changed() }}>+ Parameter</button>
      <label>Replaces</label>
      <p class="note">Earlier versions this document supersedes (their CIDs).</p>
      <ul>${d.replaces.map((c, i) => html`<li><code>${c}</code><button @click=${() => { d.replaces.splice(i, 1); this.changed() }}>Remove</button></li>`)}</ul>
      <form @submit=${addReplaces}><input name="cid" placeholder="baguqeera… (CID of an earlier version)" /><button type="submit">Add</button></form>
      ${this.validation.document.length ? html`<ul class="problems">${this.validation.document.map(p => html`<li>${p}</li>`)}</ul>` : nothing}`
  }
}

interface PdfMakeBrowser {
  setFonts(fonts: Record<string, Record<string, string>>): void
  setUrlAccessPolicy(cb: (url: string) => boolean): void
  createPdf(def: unknown): { download(name: string): void }
}

let pdfMakeLoading: Promise<PdfMakeBrowser> | undefined

// Load pdfmake's browser build and point it at the bundled fonts, once.
function loadPdfMake(): Promise<PdfMakeBrowser> {
  pdfMakeLoading ??= new Promise((resolve, reject) => {
    const vendor = new URL('vendor/', import.meta.url).href
    const script = document.createElement('script')
    script.src = `${vendor}pdfmake.min.js`
    script.onload = () => {
      const pdfMake = (window as unknown as { pdfMake: PdfMakeBrowser }).pdfMake
      const font = (name: string) => `${vendor}fonts/${name}`
      pdfMake.setFonts({
        NotoSerif: {
          normal: font('NotoSerif_400Regular.ttf'), bold: font('NotoSerif_700Bold.ttf'),
          italics: font('NotoSerif_400Regular_Italic.ttf'), bolditalics: font('NotoSerif_700Bold_Italic.ttf'),
        },
        NotoSansMono: {
          normal: font('NotoSansMono_400Regular.ttf'), bold: font('NotoSansMono_400Regular.ttf'),
          italics: font('NotoSansMono_400Regular.ttf'), bolditalics: font('NotoSansMono_400Regular.ttf'),
        },
      })
      pdfMake.setUrlAccessPolicy(url => url.startsWith(`${vendor}fonts/`))
      resolve(pdfMake)
    }
    script.onerror = () => { pdfMakeLoading = undefined; reject(new Error(`could not load ${script.src}`)) }
    document.head.appendChild(script)
  })
  return pdfMakeLoading
}

customElements.define('stroc-editor', StrocEditor)
