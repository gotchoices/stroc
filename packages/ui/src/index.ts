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
  title: 'Sample Stroc Document',
  author: 'Stroc Editor',
  text: 'This is a sample structured document. Click on any section to edit it, or click the document title to edit metadata.',
  sections: [
    {
      title: 'Introduction',
      text: 'This section demonstrates <b>bold</b>, <i>italic</i>, and <u>underline</u> markup within text.',
      sections: []
    },
    {
      title: 'Key Principles',
      text: 'Structured documents enable content-addressable legal contracts.',
      sections: [
        {
          title: 'Content Hashing',
          text: 'Each document has a unique CID based on its normalized content.',
          sections: []
        },
        {
          title: 'Immutability',
          text: 'Once published, documents cannot be changed without changing their CID.',
          sections: []
        }
      ]
    }
  ]
}

export class StrocEditor extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: white;
      color: #1a1a1a;
    }

    /* Toolbar */
    .toolbar {
      position: sticky;
      top: 0;
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 24px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      z-index: 100;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .toolbar-section {
      display: flex;
      gap: 6px;
      padding-right: 12px;
      border-right: 1px solid #dee2e6;
    }

    .toolbar-section:last-child {
      border-right: none;
      margin-left: auto;
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
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #dee2e6;
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
  private currentTextArea: HTMLTextAreaElement | null = null

  render() {
    return html`
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-section">
          <button @click=${this.onOpen} title="Open Stroc document">Open</button>
          <button @click=${this.onSave} title="Save Stroc document">Save</button>
          <button @click=${this.onExportPdf} title="Export to PDF" disabled>PDF</button>
        </div>
        
        <div class="toolbar-section">
          <button @click=${this.onAddSection} title="Add new section">+ Section</button>
          <button @click=${this.onIncludeByCid} title="Include document by CID">+ Include</button>
        </div>

        <div class="toolbar-section">
          <button @click=${this.onValidate} class="primary">Validate & CID</button>
        </div>

        ${this.cid ? html`<div class="cid-display" title="${this.cid}">CID: ${this.cid}</div>` : null}
      </div>

      ${this.errors.length ? html`<div class="errors">${this.errors.join('; ')}</div>` : null}

      <!-- Document header -->
      ${this.renderDocHeader()}

      <!-- Sections -->
      ${this.doc.sections?.map((sec, idx) => this.renderSection(sec, `${idx + 1}`, this.doc.sections!))}

      <!-- Add root section -->
      <button class="add-section-btn" @click=${this.onAddSection}>+ Add Section</button>
    `
  }

  private renderDocHeader(): unknown {
    if (this.editingMeta) {
      return html`
        <div class="section-edit" style="margin-bottom: 32px;">
          <div class="edit-field">
            <label>Document Title</label>
            <input
              .value=${this.doc.title}
              @input=${(e: any) => { this.doc.title = e.target.value; this.requestUpdate() }}
              placeholder="Document title"
            />
          </div>

          <div class="edit-field">
            <label>Author (optional)</label>
            <input
              .value=${this.doc.author ?? ''}
              @input=${(e: any) => { this.doc.author = e.target.value; this.requestUpdate() }}
              placeholder="Author name"
            />
          </div>

          <div class="edit-field">
            <label>Language</label>
            <input
              .value=${this.doc.language}
              @input=${(e: any) => { this.doc.language = e.target.value; this.requestUpdate() }}
              placeholder="ISO 639-2 code (e.g., eng)"
            />
          </div>

          <div class="edit-field">
            <label>Published Date (optional)</label>
            <input
              type="date"
              .value=${this.doc.published ?? ''}
              @input=${(e: any) => { this.doc.published = e.target.value; this.requestUpdate() }}
            />
          </div>

          <div class="edit-field">
            <label>Document Body Text (optional)</label>
            <div style="display: flex; gap: 4px; margin-bottom: 4px;">
              <button @click=${() => this.insertMarkup('<b>', '</b>')} title="Bold" style="font-weight: bold; padding: 4px 8px;">B</button>
              <button @click=${() => this.insertMarkup('<i>', '</i>')} title="Italic" style="font-style: italic; padding: 4px 8px;">I</button>
              <button @click=${() => this.insertMarkup('<u>', '</u>')} title="Underline" style="text-decoration: underline; padding: 4px 8px;">U</button>
              <button @click=${() => this.insertMarkup('<ref:', '>')} title="Cross-reference" style="padding: 4px 8px;">Ref</button>
            </div>
            <textarea
              .value=${this.doc.text ?? ''}
              @input=${(e: any) => { this.doc.text = e.target.value; this.requestUpdate() }}
              @focus=${(e: any) => { this.currentTextArea = e.target }}
              placeholder="Introduction or preamble text..."
              rows="4"
            ></textarea>
          </div>

          <div class="edit-actions">
            <button @click=${() => { this.editingMeta = false }}>Done</button>
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

          <div class="edit-actions">
            <button @click=${() => this.toggleEditSection(sec)}>Done</button>
            <button @click=${() => this.moveSectionUp(sec, parent)}>↑ Move Up</button>
            <button @click=${() => this.moveSectionDown(sec, parent)}>↓ Move Down</button>
            <button @click=${() => this.deleteSection(sec, parent)} style="margin-left: auto; color: #dc3545;">Delete</button>
          </div>
        </div>
      `
    }

    if (isEditing) {
      return html`
        <div class="section-edit">
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
            <div style="display: flex; gap: 4px; margin-bottom: 4px;">
              <button @click=${() => this.insertMarkup('<b>', '</b>')} title="Bold" style="font-weight: bold; padding: 4px 8px;">B</button>
              <button @click=${() => this.insertMarkup('<i>', '</i>')} title="Italic" style="font-style: italic; padding: 4px 8px;">I</button>
              <button @click=${() => this.insertMarkup('<u>', '</u>')} title="Underline" style="text-decoration: underline; padding: 4px 8px;">U</button>
              <button @click=${() => this.insertMarkup('<ref:', '>')} title="Cross-reference" style="padding: 4px 8px;">Ref</button>
            </div>
            <textarea
              .value=${sec.text ?? ''}
              @input=${(e: any) => this.updateSection(sec, parent, { text: e.target.value })}
              @focus=${(e: any) => { this.currentTextArea = e.target }}
              placeholder="Section content..."
            ></textarea>
          </div>

          <div class="edit-actions">
            <button @click=${() => this.toggleEditSection(sec)}>Done</button>
            <button @click=${() => this.addSubsection(sec)}>+ Subsection</button>
            <button @click=${() => this.moveSectionUp(sec, parent)}>↑ Move Up</button>
            <button @click=${() => this.moveSectionDown(sec, parent)}>↓ Move Down</button>
            <button @click=${() => this.deleteSection(sec, parent)} style="margin-left: auto; color: #dc3545;">Delete</button>
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
    this.requestUpdate()
  }

  private deleteSection(target: Section, parent: Section[]) {
    const idx = parent.indexOf(target)
    if (idx >= 0) {
      parent.splice(idx, 1)
      this.requestUpdate()
    }
  }

  private moveSectionUp(target: Section, parent: Section[]) {
    const idx = parent.indexOf(target)
    if (idx > 0) {
      // Swap with previous section
      [parent[idx - 1], parent[idx]] = [parent[idx], parent[idx - 1]]
      this.requestUpdate()
    }
  }

  private moveSectionDown(target: Section, parent: Section[]) {
    const idx = parent.indexOf(target)
    if (idx >= 0 && idx < parent.length - 1) {
      // Swap with next section
      [parent[idx], parent[idx + 1]] = [parent[idx + 1], parent[idx]]
      this.requestUpdate()
    }
  }

  private onAddSection() {
    this.doc.sections = this.doc.sections ?? []
    this.doc.sections.push({ title: '', text: '', sections: [], _editing: true })
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
    this.requestUpdate()
  }

  private async onValidate() {
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
      } catch (err: any) {
        alert(`Failed to open: ${err.message}`)
      }
    }
    input.click()
  }

  private onSave() {
    const cleanDoc = this.cleanEditingFlags(structuredClone(this.doc))
    const json = JSON.stringify(cleanDoc, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${cleanDoc.title.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  private onExportPdf() {
    // TODO: Implement PDF export using pdfmake or similar
    alert('PDF export not yet implemented')
  }
}

customElements.define('stroc-editor', StrocEditor)
