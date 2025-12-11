import { LitElement, html, css } from 'lit'
import { state } from 'lit/decorators.js'

type Section = {
  title?: string
  text?: string
  sections?: Section[]
  source?: string
  as?: string
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
  stroc: '1.0',
  language: 'eng',
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
  private currentTextArea: HTMLTextAreaElement | null = null
  private savedDocJson: string = JSON.stringify(defaultDoc)

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('beforeunload', this.handleBeforeUnload)
    document.addEventListener('click', this.handleGlobalClick)
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
              <span>Open...</span>
              <span class="menu-shortcut">⌘O</span>
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
        ${this.errors.length ? html`<div class="errors">${this.errors.join('; ')}</div>` : null}

        <!-- Document header -->
        ${this.renderDocHeader()}

        <!-- Sections -->
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
              placeholder="bafy..."
              style="font-family: monospace; font-size: 12px;"
            />
          </div>

          <div class="edit-field">
            <label>Alias (for cross-references)</label>
            <input
              .value=${sec.as ?? ''}
              @input=${(e: any) => this.updateSection(sec, parent, { as: e.target.value })}
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
      // View mode for reference section
      return html`
        <div class="section">
          <div class="section-view" @click=${() => this.toggleEditSection(sec)} style="background: #fff3cd; border-left: 4px solid #ffc107;">
            <div class="section-header">
              <span class="section-number">${number}.</span>
              <div class="section-title">${sec.as ?? 'Included Document'}</div>
            </div>
            <div class="section-text" style="font-size: 13px; color: #6c757d; font-family: monospace;">
              📄 CID: ${sec.source}
            </div>
          </div>
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
    // Render markup tags as actual HTML
    // Only allow <b>, <i>, <u>, <ref:...> tags; sanitize everything else
    const sanitized = text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;b&gt;/g, '<b>')
      .replace(/&lt;\/b&gt;/g, '</b>')
      .replace(/&lt;i&gt;/g, '<i>')
      .replace(/&lt;\/i&gt;/g, '</i>')
      .replace(/&lt;u&gt;/g, '<u>')
      .replace(/&lt;\/u&gt;/g, '</u>')
      .replace(/&lt;ref:([^&]+)&gt;/g, '<span style="color: #0d6efd; text-decoration: underline; cursor: pointer;" title="Reference: $1">→$1</span>')
    
    // Use unsafeHTML to render the sanitized markup
    return html`<span .innerHTML=${sanitized}></span>`
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

    const alias = prompt('Enter an alias for this document (for cross-references):')
    if (!alias || !alias.trim()) return

    this.doc.sections = this.doc.sections ?? []
    this.doc.sections.push({
      source: cid.trim(),
      as: alias.trim(),
      sections: []
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

    const file = files[0]
    if (!file.name.endsWith('.json')) {
      alert('Please drop a .json file')
      return
    }

    if (this.dirty && !confirm('You have unsaved changes. Opening a new document will discard them. Continue?')) {
      return
    }

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.stroc || !data.language || !data.title) {
        alert('Invalid Stroc document: missing required fields (stroc, language, title)')
        return
      }
      this.doc = data
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
    this.markClean()
  }

  private async onValidate() {
    this.closeMenus()
    this.cid = null
    this.errors = []

    // Remove editing flags before sending
    const cleanDoc = this.cleanEditingFlags(structuredClone(this.doc))

    try {
      const res = await fetch('/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanDoc)
      })
      const data = await res.json()
      if (!res.ok) {
        this.errors = data.errors ?? ['Validation failed']
        return
      }

      const cidRes = await fetch('/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanDoc)
      })
      const cidData = await cidRes.json()
      if (cidRes.ok && cidData.cid) {
        this.cid = cidData.cid
      }
    } catch (err: any) {
      this.errors = [err?.message ?? 'Unknown error']
    }
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

  private onOpen() {
    this.closeMenus()
    if (this.dirty && !confirm('You have unsaved changes. Opening a new document will discard them. Continue?')) {
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e: any) => {
      const file = e.target.files[0]
      if (!file) return
      
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        // Basic validation
        if (!data.stroc || !data.language || !data.title) {
          alert('Invalid Stroc document: missing required fields (stroc, language, title)')
          return
        }
        this.doc = data
        this.cid = null
        this.errors = []
        this.markClean()
      } catch (err: any) {
        alert(`Failed to open: ${err.message}`)
      }
    }
    input.click()
  }

  private onSave() {
    this.closeMenus()
    const cleanDoc = this.cleanEditingFlags(structuredClone(this.doc))
    const json = JSON.stringify(cleanDoc, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${cleanDoc.title.replace(/\s+/g, '_')}.json`
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

customElements.define('stroc-editor', StrocEditor)
