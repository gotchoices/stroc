import { LitElement, html, css } from 'lit'

export class StrocEditor extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 16px;
      background: #fafafa;
    }
    header {
      display: flex;
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
  `

  render() {
    return html`
      <header>
        <strong>Stroc Editor (stub)</strong>
        <button @click=${this._onImport}>Import</button>
        <button @click=${this._onExport}>Export</button>
        <button disabled>Bold</button>
        <button disabled>Italic</button>
        <button disabled>Underline</button>
      </header>
      <p>UI component placeholder. Editing features to be implemented.</p>
    `
  }

  private _onImport() {
    this.dispatchEvent(new CustomEvent('stroc-import'))
  }

  private _onExport() {
    this.dispatchEvent(new CustomEvent('stroc-export'))
  }
}

customElements.define('stroc-editor', StrocEditor)

