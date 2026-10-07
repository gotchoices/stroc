import { LitElement, html, css } from 'lit'
import { state } from 'lit/decorators.js'
import { parse as parseYaml } from 'yaml'
import { CID } from 'multiformats/cid'
import { verifyDocument, toPlain } from '@stroc/core'
import type { ComposedInline, ComposedSection } from '@stroc/compose'
import { loadInclude, numberWithin, joinNumber, type IncludeInfo } from './includes.js'
import { loadSources, saveSources, normalizeSource, SourcesResolver, forgetCatalogs } from './sources.js'

type Section = {
  id?: string
  title?: string
  text?: string
  sections?: Section[]
  source?: string   // CID string here; sent as a link {"/": cid}
  _editing?: boolean
}

type Doc = {
  stroc: string
  language: string
  title: string
  author?: string
  published?: string
  text?: string
  sections?: Section[]
}

const defaultDoc: Doc = {
  stroc: '0.1',
  language: 'en',
  title: 'Untitled Document',
  text: '',
  sections: []
}

export class StrocEditor extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: white;
      color: #1a1a1a;
    }

    /* Menu bar */
    .menubar {
      display: flex;
      align-items: center;
      background: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
      padding: 0;
      height: 40px;
      z-index: 100;
    }

    .menu {
      position: relative;
      display: inline-block;
    }

    .menu-label {
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      border: none;
      background: transparent;
      color: #212529;
    }

    .menu-label:hover {
      background: #e9ecef;
    }

    .menu-dropdown {
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      background: white;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      min-width: 200px;
      z-index: 1000;
    }

    .menu.open .menu-dropdown {
      display: block;
    }

    .menu-item {
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
      border: none;
      background: transparent;
      width: 100%;
      text-align: left;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .menu-item:hover {
      background: #f8f9fa;
    }

    .menu-item:disabled {
      color: #6c757d;
      cursor: not-allowed;
    }

    .menu-item:disabled:hover {
      background: transparent;
    }

    .menu-shortcut {
      color: #6c757d;
      font-size: 12px;
      margin-left: 24px;
    }

    .status-bar {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 16px;
      font-size: 13px;
      color: #6c757d;
    }

    .status-dirty {
      color: #dc3545;
      font-weight: 600;
    }

    .status-cid {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 11px;
      background: #e9ecef;
      padding: 4px 8px;
      border-radius: 3px;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Toolbar - secondary actions */
    .toolbar {
      background: #fff;
      border-bottom: 1px solid #dee2e6;
      padding: 8px 12px;
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .toolbar-section {
      display: flex;
      gap: 6px;
      padding-right: 12px;
      border-right: 1px solid #dee2e6;
    }

    .toolbar-section:last-child {
      border-right: none;
    }

    /* Document area */
    .document-area {
      flex: 1;
      overflow-y: auto;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
      width: 100%;
    }

    .drop-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(13, 110, 253, 0.1);
      border: 4px dashed #0d6efd;
      z-index: 9999;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 600;
      color: #0d6efd;
    }

    .drop-overlay.active {
      display: flex;
    }

    button {
      padding: 6px 12px;
      border: 1px solid #ced4da;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s;
    }

    button:hover {
      background: #e9ecef;
      border-color: #adb5bd;
    }

    button:active {
      transform: translateY(1px);
    }

    button.primary {
      background: #0d6efd;
      color: white;
      border-color: #0d6efd;
    }

    button.primary:hover {
      background: #0b5ed7;
    }

    .cid-display {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 11px;
      color: #6c757d;
      padding: 4px 8px;
      background: #e9ecef;
      border-radius: 3px;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .errors {
      background: #f8d7da;
      border: 1px solid #f5c2c7;
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 16px;
      color: #842029;
    }

    /* Document metadata */
    .doc-header {
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 2px solid #dee2e6;
    }

    .doc-header h1 {
      font-size: 32px;
      font-weight: 700;
      margin: 0 0 12px 0;
      line-height: 1.2;
    }

    .doc-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      color: #6c757d;
      font-size: 14px;
    }

    .doc-meta-item {
      display: flex;
      gap: 6px;
    }

    .doc-meta-item strong {
      font-weight: 600;
      color: #495057;
    }

    /* Document body text */
    .doc-body {
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 32px;
    }

    /* Section rendering */
    .section {
      margin: 24px 0;
      position: relative;
    }

    .section-view {
      cursor: pointer;
      padding: 12px;
      border-radius: 6px;
      transition: background 0.2s;
    }

    .section-view:hover {
      background: #f8f9fa;
    }

    .section-header {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 8px;
    }

    .section-number {
      font-weight: 700;
      color: #6c757d;
      min-width: 60px;
      font-size: 15px;
    }

    .section-title {
      font-size: 20px;
      font-weight: 600;
      color: #212529;
      flex: 1;
    }

    .section-text {
      margin-left: 72px;
      font-size: 16px;
      line-height: 1.6;
      color: #212529;
    }

    .section-text b {
      font-weight: 700;
    }

    .section-text i {
      font-style: italic;
    }

    .ref {
      color: #0d6efd;
    }

    .ref.unresolved {
      color: #dc3545;
      text-decoration: underline wavy;
    }

    /* Included documents */
    .include-view {
      background: #f6f8fb;
      border-left: 4px solid #6c8ebf;
    }

    .include-id {
      font-family: monospace;
      font-size: 12px;
      color: #6c757d;
      margin-left: auto;
    }

    .include-info {
      margin-left: 72px;
      font-size: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      align-items: center;
    }

    .include-info.bad { color: #842029; }

    .include-cid {
      font-family: monospace;
      font-size: 11px;
      color: #6c757d;
      width: 100%;
    }

    .section-header .include-cid { width: auto; margin-left: auto; }

    .include-problems { width: 100%; }

    .include-actions { display: inline-flex; gap: 8px; align-items: center; }
    .include-actions button, .include-actions a { font-size: 12px; }

    .badge {
      border-radius: 10px;
      padding: 1px 8px;
      background: #e9ecef;
    }
    .badge.good { background: #d1e7dd; color: #0f5132; }
    .badge.warn { background: #fff3cd; color: #664d03; }
    .badge.bad { background: #f8d7da; color: #842029; }
    .muted { color: #6c757d; }

    .include-body {
      margin-left: 40px;
      color: #343a40;
      border-left: 1px dashed #ced4da;
      padding-left: 12px;
    }

    .composed { margin: 6px 0; font-size: 15px; line-height: 1.55; }
    .composed .crow { display: grid; grid-template-columns: 56px 1fr; }
    .composed .cnum { color: #6c757d; font-weight: 600; }
    .composed .chead { display: flex; gap: 12px; align-items: baseline; }
    .composed .ctitle { font-weight: 600; }
    .composed .chead .include-cid { margin-left: auto; width: auto; }
    .composed .csub { margin-left: 32px; }
    .include-body > .section-text { margin-left: 0; margin-bottom: 8px; }

    .status-from { font-size: 12px; color: #6c757d; margin-right: 8px; }

    /* Sources panel */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 200;
    }
    .sources-panel {
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      width: min(720px, calc(100vw - 32px));
      z-index: 201;
      border: 1px solid #ced4da;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      padding: 16px 20px;
      font-size: 14px;
    }
    .sources-head { display: flex; gap: 12px; align-items: baseline; }
    .sources-head button { margin-left: auto; }
    .sources-panel li { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
    .sources-panel li code { flex: 1; }
    .sources-panel form { display: flex; gap: 6px; }
    .sources-panel input { flex: 1; padding: 4px 8px; }

    .section-text u {
      text-decoration: underline;
    }

    /* Edit mode */
    .section-edit {
      background: #f8f9fa;
      border: 2px solid #0d6efd;
      border-radius: 6px;
      padding: 16px;
      margin: 16px 0;
    }

    .edit-field {
      margin-bottom: 12px;
    }

    .edit-field label {
      display: block;
      font-weight: 600;
      font-size: 13px;
      color: #495057;
      margin-bottom: 4px;
    }

    .edit-field input,
    .edit-field textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 12px;
      border: 1px solid #ced4da;
      border-radius: 4px;
      font-family: inherit;
      font-size: 14px;
      line-height: 1.5;
    }

    .edit-field textarea {
      min-height: 120px;
      resize: vertical;
    }

    .edit-field input:focus,
    .edit-field textarea:focus {
      outline: none;
      border-color: #0d6efd;
      box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.1);
    }

    .edit-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #dee2e6;
    }

    .edit-toolbar {
      display: flex;
      gap: 4px;
      margin-bottom: 8px;
      padding: 4px;
      background: #f8f9fa;
      border-radius: 4px;
    }

    .edit-toolbar button {
      padding: 4px 8px;
      font-size: 12px;
    }

    /* Subsections */
    .subsections {
      margin-left: 40px;
      margin-top: 16px;
    }

    /* Add section button */
    .add-section-btn {
      margin: 16px 0;
      width: 100%;
      padding: 10px;
      border: 2px dashed #dee2e6;
      background: transparent;
      color: #6c757d;
      font-weight: 500;
    }

    .add-section-btn:hover {
      border-color: #0d6efd;
      color: #0d6efd;
      background: #f8f9fa;
    }
  `

  @state() private doc: Doc = structuredClone(defaultDoc)
  @state() private cid: string | null = null
  @state() private errors: string[] = []
  @state() private editingMeta = false
  @state() private dirty = false
  @state() private openMenus: Set<string> = new Set()
  @state() private dragOver = false
  @state() private sources: string[] = loadSources()
  @state() private showSources = false
  @state() private openedFrom: string | null = null
  // Included documents by CID: fetched, verified and checked once per session (content never changes).
  private includes = new Map<string, IncludeInfo>()
  // Section numbers of this document's own ids, recomputed on every render.
  private numbering = new Map<string, { number: string, section: Section }>()
  private currentTextArea: HTMLTextAreaElement | null = null
  private savedDocJson: string = JSON.stringify(defaultDoc)

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('beforeunload', this.handleBeforeUnload)
    document.addEventListener('click', this.handleGlobalClick)
    const cid = new URLSearchParams(location.search).get('cid')
    if (cid) void this.openByCid(cid)
  }

  // Start loading any included document not yet known.
  updated() {
    const walk = (secs?: Section[]) => secs?.forEach(sec => {
      if (sec.source) {
        if (!this.includes.has(sec.source)) {
          const cid = sec.source
          this.includes.set(cid, { cid, state: 'loading', problems: [] })
          loadInclude(cid, this.sources).then(info => { this.includes.set(cid, info); this.requestUpdate() })
        }
      } else walk(sec.sections)
    })
    walk(this.doc.sections)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
    document.removeEventListener('click', this.handleGlobalClick)
  }

  private handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (this.dirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  }

  private handleGlobalClick = (e: MouseEvent) => {
    // Close all menus when clicking outside
    if (!(e.target as HTMLElement).closest('.menu')) {
      this.openMenus.clear()
      this.requestUpdate()
    }
  }

  private toggleMenu(menuId: string, e: Event) {
    e.stopPropagation()
    if (this.openMenus.has(menuId)) {
      this.openMenus.delete(menuId)
    } else {
      this.openMenus.clear()
      this.openMenus.add(menuId)
    }
    this.requestUpdate()
  }

  private closeMenus() {
    this.openMenus.clear()
    this.requestUpdate()
  }

  private handleMenuItemClick(callback: () => void, e: Event) {
    e.stopPropagation()
    callback()
    this.closeMenus()
  }

  private markDirty() {
    this.dirty = true
  }

  private markClean() {
    this.dirty = false
    this.savedDocJson = JSON.stringify(this.cleanEditingFlags(structuredClone(this.doc)))
  }

  render() {
    return html`
      <!-- Drop overlay -->
      <div class="drop-overlay ${this.dragOver ? 'active' : ''}">
        Drop Stroc document here
      </div>

      <!-- Menu bar -->
      <div class="menubar">
        <!-- File menu -->
        <div class="menu ${this.openMenus.has('file') ? 'open' : ''}">
          <button class="menu-label" @click=${(e: Event) => this.toggleMenu('file', e)}>File</button>
          <div class="menu-dropdown">
            <button class="menu-item" @click=${(e: Event) => this.handleMenuItemClick(() => this.onNew(), e)}>
              <span>New</span>
              <span class="menu-shortcut">⌘N</span>
            </button>
            <button class="menu-item" @click=${(e: Event) => this.handleMenuItemClick(() => this.onOpen(), e)}>
              <span>Open File...</span>
              <span class="menu-shortcut">⌘O</span>
            </button>
            <button class="menu-item" @click=${(e: Event) => this.handleMenuItemClick(() => this.onOpenByCid(), e)}>
              <span>Open by CID...</span>
            </button>
            <button class="menu-item" @click=${(e: Event) => this.handleMenuItemClick(() => this.onSave(), e)}>
              <span>Save</span>
              <span class="menu-shortcut">⌘S</span>
            </button>
            <button class="menu-item" @click=${(e: Event) => this.handleMenuItemClick(() => this.onExportPdf(), e)} disabled>
              <span>Export PDF...</span>
            </button>
            <button class="menu-item" @click=${(e: Event) => this.handleMenuItemClick(() => this.onValidate(), e)}>
              <span>Validate & Generate CID</span>
            </button>
            <button class="menu-item" @click=${(e: Event) => this.handleMenuItemClick(() => { this.showSources = true }, e)}>
              <span>Sources...</span>
            </button>
          </div>
        </div>

        <!-- Edit menu -->
        <div class="menu ${this.openMenus.has('edit') ? 'open' : ''}">
          <button class="menu-label" @click=${(e: Event) => this.toggleMenu('edit', e)}>Edit</button>
          <div class="menu-dropdown">
            <button class="menu-item" @click=${(e: Event) => this.handleMenuItemClick(() => { this.editingMeta = true }, e)}>
              <span>Document Properties...</span>
            </button>
          </div>
        </div>

        <!-- Insert menu -->
        <div class="menu ${this.openMenus.has('insert') ? 'open' : ''}">
          <button class="menu-label" @click=${(e: Event) => this.toggleMenu('insert', e)}>Insert</button>
          <div class="menu-dropdown">
            <button class="menu-item" @click=${(e: Event) => this.handleMenuItemClick(() => this.onAddSection(), e)}>
              <span>Section</span>
            </button>
            <button class="menu-item" @click=${(e: Event) => this.handleMenuItemClick(() => this.onIncludeByCid(), e)}>
              <span>Include Document by CID...</span>
            </button>
          </div>
        </div>

        <!-- Status bar -->
        <div class="status-bar">
          ${this.openedFrom ? html`<span class="status-from" title="Opened by CID ${this.openedFrom}">from ${this.openedFrom.slice(0, 16)}…</span>` : null}
          ${this.dirty ? html`<span class="status-dirty" title="Document has unsaved changes">●</span>` : null}
          ${this.cid ? html`<div class="status-cid" title="${this.cid}">CID: ${this.cid}</div>` : null}
        </div>
      </div>

      <!-- Document area -->
      <div 
        class="document-area"
        @dragenter=${this.handleDragEnter}
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
      >
        ${this.showSources ? this.renderSources() : null}
        ${this.errors.length ? html`<div class="errors">${this.errors.join('; ')}</div>` : null}

        <!-- Document header -->
        ${this.renderDocHeader()}

        <!-- Sections -->
        ${this.computeNumbering()}
        ${this.doc.sections?.map((sec, idx) => this.renderSection(sec, `${idx + 1}`, this.doc.sections!))}

        <!-- Add root section -->
        <button class="add-section-btn" @click=${this.onAddSection}>+ Add Section</button>
      </div>
    `
  }

  private renderDocHeader(): unknown {
    if (this.editingMeta) {
      return html`
        <div class="section-edit" style="margin-bottom: 32px;">
          <div class="edit-toolbar">
            <button @click=${() => { this.editingMeta = false }}>Done</button>
            <button @click=${() => this.insertMarkup('<b>', '</b>')} title="Bold" style="font-weight: bold;">B</button>
            <button @click=${() => this.insertMarkup('<i>', '</i>')} title="Italic" style="font-style: italic;">I</button>
            <button @click=${() => this.insertMarkup('<u>', '</u>')} title="Underline" style="text-decoration: underline;">U</button>
            <button @click=${() => this.insertMarkup('<ref:', '>')} title="Cross-reference">Ref</button>
          </div>

          <div class="edit-field">
            <label>Document Title</label>
            <input
              .value=${this.doc.title}
              @input=${(e: any) => { this.doc.title = e.target.value; this.markDirty(); this.requestUpdate() }}
              placeholder="Document title"
            />
          </div>

          <div class="edit-field">
            <label>Author (optional)</label>
            <input
              .value=${this.doc.author ?? ''}
              @input=${(e: any) => { this.doc.author = e.target.value; this.markDirty(); this.requestUpdate() }}
              placeholder="Author name"
            />
          </div>

          <div class="edit-field">
            <label>Language</label>
            <input
              .value=${this.doc.language}
              @input=${(e: any) => { this.doc.language = e.target.value; this.markDirty(); this.requestUpdate() }}
              placeholder="ISO 639-2 code (e.g., eng)"
            />
          </div>

          <div class="edit-field">
            <label>Published Date (optional)</label>
            <input
              type="date"
              .value=${this.doc.published ?? ''}
              @input=${(e: any) => { this.doc.published = e.target.value; this.markDirty(); this.requestUpdate() }}
            />
          </div>

          <div class="edit-field">
            <label>Document Body Text (optional)</label>
            <textarea
              .value=${this.doc.text ?? ''}
              @input=${(e: any) => { this.doc.text = e.target.value; this.markDirty(); this.requestUpdate() }}
              @focus=${(e: any) => { this.currentTextArea = e.target }}
              placeholder="Introduction or preamble text..."
              rows="4"
            ></textarea>
          </div>
        </div>
      `
    }

    return html`
      <div class="doc-header" @click=${() => { this.editingMeta = true }} style="cursor: pointer;">
        <h1>${this.doc.title}</h1>
        <div class="doc-meta">
          ${this.doc.author ? html`<div class="doc-meta-item"><strong>Author:</strong> <span>${this.doc.author}</span></div>` : null}
          ${this.doc.language ? html`<div class="doc-meta-item"><strong>Language:</strong> <span>${this.doc.language}</span></div>` : null}
          ${this.doc.published ? html`<div class="doc-meta-item"><strong>Published:</strong> <span>${this.doc.published}</span></div>` : null}
        </div>
      </div>

      <!-- Document body text -->
      ${this.doc.text ? html`<div class="doc-body" @click=${() => { this.editingMeta = true }} style="cursor: pointer;">${this.renderMarkup(this.doc.text)}</div>` : null}
    `
  }

  private renderSection(sec: Section, number: string, parent: Section[]): unknown {
    const isEditing = sec._editing || false
    const isReference = !!sec.source

    if (isReference && isEditing) {
      // Edit mode for reference section
      return html`
        <div class="section-edit">
          <div class="edit-toolbar">
            <button @click=${() => this.toggleEditSection(sec)}>Done</button>
            <button @click=${() => this.moveSectionUp(sec, parent)}>↑</button>
            <button @click=${() => this.moveSectionDown(sec, parent)}>↓</button>
            <button @click=${() => this.deleteSection(sec, parent)} style="margin-left: auto; color: #dc3545;">Delete</button>
          </div>

          <div class="edit-field">
            <label>Included Document CID</label>
            <input
              .value=${sec.source ?? ''}
              @input=${(e: any) => this.updateSection(sec, parent, { source: e.target.value })}
              placeholder="baguqeera..."
              style="font-family: monospace; font-size: 12px;"
            />
          </div>

          <div class="edit-field">
            <label>Id (for cross-references, e.g. ethics)</label>
            <input
              .value=${sec.id ?? ''}
              @input=${(e: any) => this.updateSection(sec, parent, { id: e.target.value })}
              placeholder="e.g., Ethics"
            />
          </div>
        </div>
      `
    }

    if (isEditing) {
      return html`
        <div class="section-edit">
          <div class="edit-toolbar">
            <button @click=${() => this.toggleEditSection(sec)}>Done</button>
            <button @click=${() => this.insertMarkup('<b>', '</b>')} title="Bold" style="font-weight: bold;">B</button>
            <button @click=${() => this.insertMarkup('<i>', '</i>')} title="Italic" style="font-style: italic;">I</button>
            <button @click=${() => this.insertMarkup('<u>', '</u>')} title="Underline" style="text-decoration: underline;">U</button>
            <button @click=${() => this.insertMarkup('<ref:', '>')} title="Cross-reference">Ref</button>
            <button @click=${() => this.addSubsection(sec)}>+ Subsection</button>
            <button @click=${() => this.moveSectionUp(sec, parent)}>↑</button>
            <button @click=${() => this.moveSectionDown(sec, parent)}>↓</button>
            <button @click=${() => this.deleteSection(sec, parent)} style="margin-left: auto; color: #dc3545;">Delete</button>
          </div>

          <div class="edit-field">
            <label>Section Title</label>
            <input
              .value=${sec.title ?? ''}
              @input=${(e: any) => this.updateSection(sec, parent, { title: e.target.value })}
              placeholder="Section title"
            />
          </div>

          <div class="edit-field">
            <label>Paragraph Text</label>
            <textarea
              .value=${sec.text ?? ''}
              @input=${(e: any) => this.updateSection(sec, parent, { text: e.target.value })}
              @focus=${(e: any) => { this.currentTextArea = e.target }}
              placeholder="Section content..."
            ></textarea>
          </div>

          ${sec.sections?.length ? html`
            <div class="subsections">
              ${sec.sections.map((child, idx) => this.renderSection(child, `${number}.${idx + 1}`, sec.sections!))}
            </div>
          ` : null}
        </div>
      `
    }

    if (isReference) {
      const info = this.includes.get(sec.source!)
      const doc = info?.composed
      return html`
        <div class="section include">
          <div class="section-view include-view" @click=${() => this.toggleEditSection(sec)}>
            <div class="section-header">
              <span class="section-number">${number}.</span>
              <div class="section-title">${doc?.title ?? 'Included document'}</div>
              <span class="include-id" title="Id of this include, used in references">${sec.id}</span>
            </div>
            ${this.renderIncludeInfo(info, sec.source!)}
          </div>
          ${doc ? html`
            <div class="include-body">
              ${doc.text ? html`<div class="section-text">${this.renderComposedInline(doc.text, number)}</div>` : null}
              ${doc.sections.map(child => this.renderComposedSection(child, number))}
            </div>` : null}
        </div>
      `
    }

    return html`
      <div class="section">
        <div class="section-view" @click=${() => this.toggleEditSection(sec)}>
          <div class="section-header">
            <span class="section-number">${number}.</span>
            ${sec.title ? html`<div class="section-title">${sec.title}</div>` : null}
          </div>
          ${sec.text ? html`<div class="section-text">${this.renderMarkup(sec.text)}</div>` : null}
        </div>

        ${sec.sections?.length ? html`
          <div class="subsections">
            ${sec.sections.map((child, idx) => this.renderSection(child, `${number}.${idx + 1}`, sec.sections!))}
          </div>
        ` : null}
      </div>
    `
  }

  private renderMarkup(text: string): unknown {
    // Escape everything, then re-enable only exact Stroc tokens. Reference paths are restricted to
    // id characters, so nothing from the text can reach an attribute or become HTML.
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
    // One left-to-right pass, so an escaped \< is never mistaken for the start of a tag.
    const rendered = escaped.replace(
      /\\(&lt;|\\)|&lt;(\/?)([biu])&gt;|&lt;ref:([a-z0-9/-]+)&gt;/g,
      (_m, lit, slash, tag, ref) =>
        lit !== undefined ? lit :
        tag !== undefined ? `<${slash}${tag}>` :
        this.refHtml(ref.split('/')))
    return html`<span .innerHTML=${rendered}></span>`
  }

  // A reference rendered as its live number. Path segments are id characters only (the regex
  // above guarantees it), so they are safe inside the title attribute.
  private refHtml(path: string[]): string {
    const n = this.resolveRef(path)
    return n
      ? `<span class="ref" title="ref:${path.join('/')}">Section ${n}</span>`
      : `<span class="ref unresolved" title="Unresolved reference">→${path.join('/')}</span>`
  }

  // This document's own section numbers, by id.
  private computeNumbering(): null {
    this.numbering.clear()
    const walk = (secs: Section[] | undefined, prefix: string) => secs?.forEach((sec, idx) => {
      const number = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`
      if (sec.id) this.numbering.set(sec.id, { number, section: sec })
      if (!sec.source) walk(sec.sections, number)
    })
    walk(this.doc.sections, '')
    return null
  }

  // The number a reference path points to, or undefined if it does not (yet) resolve.
  private resolveRef(path: string[]): string | undefined {
    const first = this.numbering.get(path[0])
    if (!first) return undefined
    if (path.length === 1) return first.number
    const info = first.section.source ? this.includes.get(first.section.source) : undefined
    if (!info?.composed) return undefined
    const within = numberWithin(info.composed, path.slice(1))
    return within ? joinNumber(first.number, within) : undefined
  }

  // Inline content of an included document; its references are numbered within the composition.
  private renderComposedInline(nodes: ComposedInline[], prefix: string): unknown {
    return nodes.map(n => {
      if (n.type === 'text') return n.value
      if (n.type === 'ref') {
        return n.target
          ? html`<span class="ref" title="ref:${n.path.join('/')}">Section ${joinNumber(prefix, n.target)}</span>`
          : html`<span class="ref unresolved">→${n.path.join('/')}</span>`
      }
      const inner = this.renderComposedInline(n.children, prefix)
      return n.tag === 'b' ? html`<b>${inner}</b>` : n.tag === 'i' ? html`<i>${inner}</i>` : html`<u>${inner}</u>`
    })
  }

  private renderComposedSection(sec: ComposedSection, prefix: string): unknown {
    const number = joinNumber(prefix, sec.number)
    return html`
      <div class="composed">
        <div class="crow">
          <span class="cnum">${number}.</span>
          <div>
            ${sec.title || sec.include ? html`
              <div class="chead">
                ${sec.title ? html`<span class="ctitle">${sec.title}</span>` : null}
                ${sec.include ? html`<span class="include-cid">${sec.include.cid.toString()}</span>` : null}
              </div>` : null}
            ${sec.text ? html`<div class="ctext">${this.renderComposedInline(sec.text, prefix)}</div>` : null}
          </div>
        </div>
        ${sec.sections.length ? html`<div class="csub">${sec.sections.map(c => this.renderComposedSection(c, prefix))}</div>` : null}
      </div>`
  }

  // What is known about an included document, and how to open it.
  private renderIncludeInfo(info: IncludeInfo | undefined, cid: string): unknown {
    const stop = (e: Event) => e.stopPropagation()
    const open = html`
      <span class="include-actions" @click=${stop}>
        <button @click=${() => this.openByCid(cid)} title="Open this document in the editor">Open</button>
        <a href="?cid=${encodeURIComponent(cid)}" target="_blank" rel="noopener" title="Open in a new tab">Open in new tab ↗</a>
      </span>`
    if (!info || info.state === 'loading') {
      return html`<div class="include-info">Loading ${cid.slice(0, 20)}… from ${this.sources.length} source${this.sources.length === 1 ? '' : 's'}</div>`
    }
    if (info.state !== 'ok') {
      const what = info.state === 'missing' ? 'Not found in any source' : info.state === 'bad-cid' ? 'Not a valid CID' : 'Failed verification'
      return html`
        <div class="include-info bad">
          <span class="badge bad">✗ ${what}</span>
          <code>${cid}</code>
          <span class="include-actions" @click=${stop}><button @click=${() => { this.showSources = true }}>Sources…</button></span>
          ${info.problems.length ? html`<div class="include-problems">${info.problems[0]}</div>` : null}
        </div>`
    }
    const a = info.author
    const authorText =
      !a || a.status === 'not-a-domain' ? (a?.author ? html`Author ${a.author} <span class="muted">(a name; not verifiable)</span>` : html`<span class="muted">No author</span>`) :
      a.status === 'confirmed' ? html`<span class="badge good">✓ Author ${a.domain} confirmed</span>` :
      html`<span class="badge warn" title=${a.reason ?? ''}>Author ${a.domain} not confirmed: ${a.status.replace('-', ' ')}</span>`
    const entry = info.sourceEntry?.entry
    const stale = entry && entry.status !== 'current'
    let host = info.source ?? ''
    try { host = new URL(info.source ?? '').host } catch { /* keep as is */ }
    return html`
      <div class="include-info">
        <span class="badge good" title="The content matches its CID">✓ Verified</span>
        <span class="muted">from ${host}</span>
        ${authorText}
        ${entry ? html`<span class="badge ${stale ? 'warn' : 'plain'}" title="What ${host} claims in its catalog for ${info.sourceEntry!.domain}">${host}: ${entry.role}, ${entry.status}</span>` : null}
        ${info.problems.length ? html`<span class="badge warn" title=${info.problems.join('\n')}>${info.problems.length} problem${info.problems.length === 1 ? '' : 's'} inside</span>` : null}
        ${open}
        <div class="include-cid">${cid}</div>
      </div>`
  }

  private renderSources(): unknown {
    const update = (list: string[]) => {
      this.sources = list
      saveSources(list)
      forgetCatalogs()
      this.includes = new Map()   // refetch everything from the new list
    }
    const move = (i: number, d: number) => {
      const list = [...this.sources]
      const [x] = list.splice(i, 1)
      list.splice(i + d, 0, x)
      update(list)
    }
    const add = (e: Event) => {
      e.preventDefault()
      const input = (e.target as HTMLFormElement).elements.namedItem('source') as HTMLInputElement
      const url = normalizeSource(input.value.trim())
      if (!url) { alert('Not a valid URL'); return }
      if (!this.sources.includes(url)) update([...this.sources, url])
      input.value = ''
    }
    return html`
      <div class="modal-backdrop" @click=${() => { this.showSources = false }}></div>
      <div class="sources-panel" role="dialog" aria-label="Document sources">
        <div class="sources-head">
          <b>Document sources</b>
          <span class="muted">Tried in order when fetching a document by CID. Everything fetched is verified against its CID.</span>
          <button @click=${() => { this.showSources = false }}>Close</button>
        </div>
        <ol>
          ${this.sources.map((src, i) => html`
            <li>
              <code>${src}</code>
              <button ?disabled=${i === 0} @click=${() => move(i, -1)}>↑</button>
              <button ?disabled=${i === this.sources.length - 1} @click=${() => move(i, 1)}>↓</button>
              <button @click=${() => update(this.sources.filter((_, j) => j !== i))}>Remove</button>
            </li>`)}
        </ol>
        <form @submit=${add}>
          <input name="source" placeholder="http://localhost:3001 or https://example.org or an IPFS gateway" />
          <button type="submit">Add</button>
          <button type="button" @click=${() => update([location.origin])}>Reset</button>
        </form>
      </div>`
  }

  private toggleEditSection(sec: Section) {
    sec._editing = !sec._editing
    this.requestUpdate()
  }

  private updateSection(target: Section, parent: Section[], patch: Partial<Section>) {
    Object.assign(target, patch)
    this.markDirty()
    this.requestUpdate()
  }

  private insertMarkup(openTag: string, closeTag: string) {
    if (!this.currentTextArea) return

    const textarea = this.currentTextArea
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selectedText = text.substring(start, end)

    // Insert markup around selection (or at cursor if no selection)
    const before = text.substring(0, start)
    const after = text.substring(end)
    const newText = before + openTag + selectedText + closeTag + after

    textarea.value = newText
    
    // Trigger input event to update the model
    textarea.dispatchEvent(new Event('input', { bubbles: true }))

    // Restore cursor position (inside the tags if no selection)
    const newPos = start + openTag.length + selectedText.length
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(newPos, newPos)
    }, 0)
  }

  private addSubsection(parent: Section) {
    parent.sections = parent.sections ?? []
    parent.sections.push({ title: '', text: '', sections: [] })
    this.markDirty()
    this.requestUpdate()
  }

  private deleteSection(target: Section, parent: Section[]) {
    const idx = parent.indexOf(target)
    if (idx >= 0) {
      parent.splice(idx, 1)
      this.markDirty()
      this.requestUpdate()
    }
  }

  private moveSectionUp(target: Section, parent: Section[]) {
    const idx = parent.indexOf(target)
    if (idx > 0) {
      // Swap with previous section
      [parent[idx - 1], parent[idx]] = [parent[idx], parent[idx - 1]]
      this.markDirty()
      this.requestUpdate()
    }
  }

  private moveSectionDown(target: Section, parent: Section[]) {
    const idx = parent.indexOf(target)
    if (idx >= 0 && idx < parent.length - 1) {
      // Swap with next section
      [parent[idx], parent[idx + 1]] = [parent[idx + 1], parent[idx]]
      this.markDirty()
      this.requestUpdate()
    }
  }

  private onAddSection() {
    this.doc.sections = this.doc.sections ?? []
    this.doc.sections.push({ title: '', text: '', sections: [], _editing: true })
    this.markDirty()
    this.requestUpdate()
  }

  private onIncludeByCid() {
    const cid = prompt('Enter the CID of the document to include:')
    if (!cid || !cid.trim()) return

    const alias = prompt('Enter an id for this included document (lowercase, e.g. ethics):')
    if (!alias || !alias.trim()) return

    this.doc.sections = this.doc.sections ?? []
    this.doc.sections.push({
      source: cid.trim(),
      id: alias.trim()
    })
    this.closeMenus()
    this.markDirty()
    this.requestUpdate()
  }

  private dragCounter = 0

  private handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
    if (!this.dragOver) {
      this.dragOver = true
    }
  }

  private handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    this.dragCounter++
    if (this.dragCounter === 1) {
      this.dragOver = true
    }
  }

  private handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    this.dragCounter--
    if (this.dragCounter === 0) {
      this.dragOver = false
    }
  }

  private handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    this.dragOver = false
    this.dragCounter = 0

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    if (this.dirty && !confirm('You have unsaved changes. Opening a new document will discard them. Continue?')) {
      return
    }
    await this.loadFile(files[0])
  }

  // Open a Stroc document from a .yaml, .yml or .json file. (JSON is also YAML.)
  private async loadFile(file: File) {
    if (!/\.(ya?ml|json)$/i.test(file.name)) {
      alert('Please choose a .yaml or .json file')
      return
    }
    try {
      const data = parseYaml(await file.text(), { version: '1.2', schema: 'core' })
      if (!data || typeof data !== 'object' || !data.title) {
        alert('This does not look like a Stroc document (no title)')
        return
      }
      this.doc = this.fromPlainDoc(data)
      this.openedFrom = null
      this.cid = null
      this.errors = []
      this.markClean()
    } catch (err: any) {
      alert(`Failed to open: ${err.message}`)
    }
  }

  private onNew() {
    this.closeMenus()
    if (this.dirty && !confirm('You have unsaved changes. Creating a new document will discard them. Continue?')) {
      return
    }
    this.doc = structuredClone(defaultDoc)
    this.cid = null
    this.errors = []
    this.openedFrom = null
    this.markClean()
  }

  private async onValidate() {
    this.closeMenus()
    this.cid = null
    this.errors = []
    try {
      const res = await fetch('/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.toPlainDoc())
      })
      const data = await res.json()
      if (data.cid) {
        this.cid = data.cid
      } else {
        const problems: { path: (string | number)[], message: string }[] = data.problems ?? []
        this.errors = problems.length
          ? problems.map(p => `${p.path.join('.') || 'document'}: ${p.message}`)
          : ['Validation failed']
      }
    } catch (err: any) {
      this.errors = [err?.message ?? 'Unknown error']
    }
  }

  // The document as plain JSON for the server: editing flags removed, sources written as links.
  // The document as plain JSON, as it is validated, hashed and saved: editing flags removed, empty
  // fields omitted, whitespace tidied (the editor's job under the canonical-form rules), and
  // sources written as links {"/": cid}.
  private toPlainDoc(): any {
    const tidy = (v: unknown): string | undefined => {
      if (typeof v !== 'string') return undefined
      const t = v.replace(/[\s\u00A0]+/g, ' ').trim()
      return t || undefined
    }
    const section = (sec: Section): any => {
      if (sec.source !== undefined) return { id: tidy(sec.id), source: { '/': tidy(sec.source) ?? '' } }
      const children = sec.sections?.map(section).filter(c => Object.keys(c).length)
      return omitEmpty({ id: tidy(sec.id), title: tidy(sec.title), text: tidy(sec.text), sections: children?.length ? children : undefined })
    }
    const d = this.doc
    const sections = d.sections?.map(section).filter(c => Object.keys(c).length)
    return omitEmpty({
      stroc: d.stroc, language: tidy(d.language), title: tidy(d.title), author: tidy(d.author),
      published: tidy(d.published), text: tidy(d.text), sections: sections?.length ? sections : undefined,
    })
  }

  // Accept documents saved with links ({"/": cid}) or, from older files, plain CID strings.
  private fromPlainDoc(data: any): Doc {
    const section = (sec: any): Section => sec.source !== undefined
      ? { id: sec.id ?? sec.as, source: typeof sec.source === 'object' ? sec.source['/'] : sec.source }
      : { ...sec, ...(sec.sections ? { sections: sec.sections.map(section) } : {}) }
    return { ...data, ...(data.sections ? { sections: data.sections.map(section) } : {}) }
  }

  private cleanEditingFlags(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanEditingFlags(item))
    }
    if (obj && typeof obj === 'object') {
      const clean: any = {}
      for (const key of Object.keys(obj)) {
        if (key !== '_editing') {
          clean[key] = this.cleanEditingFlags(obj[key])
        }
      }
      return clean
    }
    return obj
  }

  private async onOpenByCid() {
    const cid = prompt('CID of the document to open (fetched from your sources):')
    if (cid && cid.trim()) await this.openByCid(cid.trim())
  }

  // Fetch a document by CID from the sources, verify it, and open it for editing.
  private async openByCid(cidText: string) {
    if (this.dirty && !confirm('You have unsaved changes. Opening another document will discard them. Continue?')) return
    // Failures go to the error bar, not alert(): an alert blocks the page.
    let cid: CID
    try { cid = CID.parse(cidText) } catch { this.errors = [`Not a CID: ${cidText}`]; return }
    const bytes = await new SourcesResolver(this.sources).get(cid)
    if (!bytes) { this.errors = [`${cid} was not found in any source (${this.sources.join(', ')}). Add a source with File → Sources.`]; return }
    const v = await verifyDocument(bytes, cid)
    if (!v.ok || !v.document) { this.errors = [`${cid} failed verification: ${v.problems.map(p => p.message).join('; ')}`]; return }
    this.doc = this.fromPlainDoc(toPlain(v.document))
    this.openedFrom = cid.toString()
    this.cid = cid.toString()
    this.errors = []
    this.markClean()
    const url = new URL(location.href)
    url.searchParams.set('cid', cid.toString())
    history.replaceState(null, '', url)
  }

  private onOpen() {
    this.closeMenus()
    if (this.dirty && !confirm('You have unsaved changes. Opening a new document will discard them. Continue?')) {
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.yaml,.yml,.json'
    input.onchange = async (e: any) => {
      const file = e.target.files[0]
      if (file) await this.loadFile(file)
    }
    input.click()
  }

  private onSave() {
    this.closeMenus()
    const cleanDoc = this.toPlainDoc()
    const json = JSON.stringify(cleanDoc, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(cleanDoc.title ?? 'document').replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
    this.markClean()
  }

  private onExportPdf() {
    this.closeMenus()
    // TODO: Implement PDF export using pdfmake or similar
    alert('PDF export not yet implemented')
  }
}

// Drop fields whose value is undefined, so empty values never reach the document.
function omitEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

customElements.define('stroc-editor', StrocEditor)
