import { LitElement, html, css } from 'lit'
import { state } from 'lit/decorators.js'

type Section = {
  title?: string
  text?: string
  sections?: Section[]
  source?: string
  as?: string
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
  title: 'Untitled',
  author: '',
  text: '',
  sections: []
}

export class StrocEditor extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 16px;
      background: #fafafa;
      color: #222;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    button {
      padding: 6px 10px;
      border: 1px solid #ccc;
      background: white;
      border-radius: 4px;
      cursor: pointer;
    }
    .doc-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    input, textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 6px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font: inherit;
    }
    .section {
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 8px;
      background: white;
    }
    .section header {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 6px;
    }
    .outline {
      margin-bottom: 12px;
    }
    .cid {
      margin-left: auto;
      font-size: 12px;
      color: #555;
    }
  `

  @state() private doc: Doc = structuredClone(defaultDoc)
  @state() private cid: string | null = null
  @state() private errors: string[] = []

  render() {
    return html`
      <header>
        <strong>Stroc Editor</strong>
        <button @click=${this.onImport}>Import</button>
        <button @click=${this.onExport}>Export</button>
        <button @click=${this.onSave}>Save & Validate</button>
        ${this.cid ? html`<span class="cid">CID: ${this.cid}</span>` : null}
      </header>

      <div class="doc-meta">
        ${this.inputField('Title', this.doc.title, (v) => this.updateDocField('title', v))}
        ${this.inputField('Author', this.doc.author ?? '', (v) => this.updateDocField('author', v))}
        ${this.inputField('Language', this.doc.language, (v) => this.updateDocField('language', v))}
        ${this.inputField('Published', this.doc.published ?? '', (v) => this.updateDocField('published', v))}
      </div>

      ${this.textAreaField('Document text', this.doc.text ?? '', (v) => this.updateDocField('text', v))}

      <div class="actions">
        <button @click=${() => this.addSection(null)}>Add Section</button>
      </div>

      <div>
        ${this.doc.sections?.map((sec, idx) => this.renderSection(sec, idx, null))}
      </div>

      ${this.errors.length ? html`<div style="color:red; margin-top:8px;">${this.errors.join('; ')}</div>` : null}
    `
  }

  private inputField(label: string, value: string, onInput: (v: string) => void) {
    return html`
      <label>
        ${label}
        <input .value=${value} @input=${(e: any) => onInput(e.target.value)} />
      </label>
    `
  }

  private textAreaField(label: string, value: string, onInput: (v: string) => void) {
    return html`
      <label>
        ${label}
        <textarea rows="3" .value=${value} @input=${(e: any) => onInput(e.target.value)}></textarea>
      </label>
    `
  }

  private renderSection(sec: Section, idx: number, parent: Section[] | null): ReturnType<typeof html> {
    return html`
      <div class="section">
        <header>
          <input
            placeholder="Section title"
            .value=${sec.title ?? ''}
            @input=${(e: any) => this.updateSection(sec, parent, { title: e.target.value })}
          />
        </header>
        ${this.textAreaField('Paragraph', sec.text ?? '', (v) => this.updateSection(sec, parent, { text: v }))}
        <div class="actions">
          <button @click=${() => this.addSection(sec)}>Add Subsection</button>
          <button @click=${() => this.deleteSection(sec, parent)}>Delete</button>
        </div>
        ${sec.sections?.map((child, cIdx) => this.renderSection(child, cIdx, sec.sections!))}
      </div>
    `
  }

  private updateDocField<K extends keyof Doc>(key: K, value: Doc[K]) {
    this.doc = { ...this.doc, [key]: value }
  }

  private updateSection(target: Section, parent: Section[] | null, patch: Partial<Section>) {
    const mutate = (arr: Section[]) => {
      arr.forEach((s) => {
        if (s === target) Object.assign(s, patch)
        if (s.sections) mutate(s.sections)
      })
    }
    const doc = structuredClone(this.doc)
    mutate(doc.sections ?? [])
    this.doc = doc
  }

  private addSection(parent: Section | null) {
    const newSec: Section = { title: '', text: '', sections: [] }
    const doc = structuredClone(this.doc)
    if (parent) {
      parent.sections = parent.sections ?? []
      parent.sections.push(newSec)
    } else {
      doc.sections = doc.sections ?? []
      doc.sections.push(newSec)
    }
    this.doc = doc
  }

  private deleteSection(target: Section, parent: Section[] | null) {
    if (!parent) {
      this.doc = { ...this.doc, sections: (this.doc.sections ?? []).filter((s) => s !== target) }
    } else {
      parent.splice(parent.indexOf(target), 1)
      this.doc = { ...this.doc }
    }
  }

  private async onSave() {
    this.cid = null
    this.errors = []
    try {
      const res = await fetch('/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.doc)
      })
      const data = await res.json()
      if (!res.ok) {
        this.errors = data.errors ?? ['Validation failed']
        return
      }
      const cidRes = await fetch('/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.doc)
      })
      const cidData = await cidRes.json()
      if (cidRes.ok && cidData.cid) this.cid = cidData.cid
    } catch (err: any) {
      this.errors = [err?.message ?? 'Unknown error']
    }
  }

  private onImport() {
    this.dispatchEvent(new CustomEvent('stroc-import'))
  }

  private onExport() {
    this.dispatchEvent(new CustomEvent('stroc-export', { detail: this.doc }))
  }
}

customElements.define('stroc-editor', StrocEditor)

