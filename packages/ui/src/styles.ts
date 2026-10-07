// The editor's styles. The editor renders into the page's own DOM (not a shadow root, so text
// selection works the same in every browser engine), so its styles are nested under the
// stroc-editor element and cannot affect the host page.

export const editorCss = `
stroc-editor {

  & {
    --ink: #1a1a1a; --muted: #6c757d; --line: #dee2e6; --accent: #0d6efd; --bad: #b02a37;
    --good-bg: #d1e7dd; --good: #0f5132; --warn-bg: #fff3cd; --warn: #664d03; --bad-bg: #f8d7da;
    display: flex; flex-direction: column; height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: white; color: var(--ink);
  }
  button { font: inherit; font-size: 13px; padding: 3px 9px; border: 1px solid #ced4da; border-radius: 4px; background: white; cursor: pointer; }
  button:hover:not(:disabled) { background: #f1f3f5; }
  button:disabled { opacity: 0.4; cursor: default; }
  input, textarea { font: inherit; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  .muted { color: var(--muted); }

  /* Menu bar and status */
  .menubar { display: flex; align-items: center; background: #f8f9fa; border-bottom: 1px solid var(--line); height: 40px; padding-right: 12px; gap: 2px; }
  .menu { position: relative; }
  .menu-label { padding: 8px 14px; border: none; background: transparent; font-size: 14px; font-weight: 500; border-radius: 0; }
  .menu-dropdown { display: none; position: absolute; top: 100%; left: 0; min-width: 240px; background: white; border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 6px 18px rgba(0,0,0,.12); z-index: 100; padding: 4px 0; }
  .menu.open .menu-dropdown { display: block; }
  .menu-item { display: flex; justify-content: space-between; width: 100%; border: none; border-radius: 0; padding: 7px 16px; text-align: left; font-size: 14px; }
  .menu-item .shortcut { color: var(--muted); font-size: 12px; margin-left: 24px; }
  .menu-sep { border-top: 1px solid var(--line); margin: 4px 0; }
  .status { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 12px; }
  .status .file { color: var(--muted); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status .dirty { color: #e67700; font-size: 16px; }
  .status .cid { font-family: ui-monospace, Menlo, monospace; background: #e9ecef; padding: 2px 8px; border-radius: 4px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { border-radius: 10px; padding: 1px 8px; background: #e9ecef; font-size: 12px; white-space: nowrap; }
  .badge.good { background: var(--good-bg); color: var(--good); }
  .badge.warn { background: var(--warn-bg); color: var(--warn); }
  .badge.bad { background: var(--bad-bg); color: var(--bad); }
  button.badge { border: none; padding: 1px 8px; }

  /* Format bar */
  .formatbar { display: flex; gap: 4px; align-items: center; padding: 6px 12px; border-bottom: 1px solid var(--line); background: white; }
  .formatbar .sep { width: 1px; align-self: stretch; background: var(--line); margin: 0 6px; }
  .formatbar .hint { margin-left: auto; font-size: 12px; color: var(--muted); }

  /* Document */
  .document-area { flex: 1; overflow-y: auto; padding: 32px 48px 96px; }
  .doc { max-width: 860px; margin: 0 auto; }
  .doc-title { font-size: 30px; font-weight: 700; border: none; width: 100%; padding: 4px 0; outline: none; }
  .doc-meta { display: flex; flex-wrap: wrap; gap: 16px; color: var(--muted); font-size: 13px; margin: 4px 0 18px; }
  .doc-meta b { color: #495057; font-weight: 600; }
  .doc-meta button { font-size: 12px; padding: 1px 8px; }
  .preamble { margin-bottom: 24px; }
  .problems { background: var(--bad-bg); color: var(--bad); border-radius: 6px; padding: 8px 12px; margin: 0 0 16px; font-size: 13px; }
  .problems li { margin: 2px 0; }

  /* Paragraphs */
  .para { min-height: 1.5em; line-height: 1.65; font-size: 16px; outline: none; border-radius: 4px; padding: 1px 4px; margin: 0 -4px; white-space: pre-wrap; }
  .para[contenteditable="true"]:hover { background: #f8f9fa; }
  .para[contenteditable="true"]:focus { background: #f1f6ff; box-shadow: 0 0 0 2px #cfe2ff; }
  .para.empty::before { content: attr(data-placeholder); color: #adb5bd; }
  .para .ref { color: var(--accent); cursor: default; }
  .para .ref.unresolved, .ref.unresolved { color: var(--bad); text-decoration: underline wavy; }

  /* Preview: the document as readers see it */
  &[preview] .grip, &[preview] .sec-problems, &[preview] .inc-info button,
  &[preview] .problems, &[preview] .doc-meta button { display: none; }
  &[preview] .sec.active > .row { background: none; box-shadow: none; }
  &[preview] .sec.include > .row { background: none; box-shadow: none; }
  &[preview] .title-input { cursor: default; }

  /* Sections */
  .sec { margin: 6px 0; border-radius: 6px; position: relative; }
  .sec.active > .row { background: #fbfcfe; box-shadow: inset 3px 0 0 #cfe2ff; }
  .sec.drop-before { box-shadow: 0 -3px 0 var(--accent); }
  .sec.drop-after { box-shadow: 0 3px 0 var(--accent); }
  .sec.drop-into > .row { outline: 2px dashed var(--accent); }
  .row { display: grid; grid-template-columns: 22px 56px 1fr; align-items: start; border-radius: 6px; padding: 2px 4px 2px 0; }
  .grip { cursor: grab; color: #ced4da; font-size: 14px; line-height: 28px; text-align: center; user-select: none; }
  .row:hover .grip { color: var(--muted); }
  .num { font-weight: 600; color: #495057; line-height: 28px; }
  .title-input { font-size: 17px; font-weight: 600; border: none; outline: none; width: 100%; padding: 2px 4px; margin: 0 -4px; border-radius: 4px; background: transparent; }
  .title-input:focus { background: #f1f6ff; box-shadow: 0 0 0 2px #cfe2ff; }
  .children { margin-left: 40px; }
  .tools { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 4px 0 2px; }
  .tools button { font-size: 12px; padding: 1px 7px; }
  .tools .id { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); margin-left: 8px; }
  .tools .id input { width: 150px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; padding: 1px 4px; }
  .sec-problems { color: var(--bad); font-size: 12px; margin: 2px 0; }
  .add-section { margin: 20px 0; width: 100%; padding: 10px; border: 2px dashed var(--line); background: transparent; color: var(--muted); }
  .add-section:hover { border-color: var(--accent); color: var(--accent); }

  /* Included documents */
  .sec.include > .row { background: #f6f8fb; box-shadow: inset 4px 0 0 #6c8ebf; }
  .inc-title { font-size: 17px; font-weight: 600; line-height: 28px; display: flex; gap: 10px; align-items: baseline; }
  .inc-title .inc-id { margin-left: auto; font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: var(--muted); font-weight: normal; }
  .inc-info { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 12px; margin: 2px 0 4px; }
  .inc-info a, .inc-info button { font-size: 12px; }
  .cid-line { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--muted); overflow-wrap: anywhere; }
  .inc-body { margin-left: 78px; border-left: 1px dashed #ced4da; padding-left: 12px; color: #343a40; }
  .composed { margin: 6px 0; font-size: 15px; line-height: 1.55; }
  .composed .crow { display: grid; grid-template-columns: 56px 1fr; }
  .composed .cnum { color: var(--muted); font-weight: 600; }
  .composed .ctitle { font-weight: 600; }
  .composed .chead { display: flex; gap: 12px; align-items: baseline; }
  .composed .chead .cid-line { margin-left: auto; }
  .composed .csub { margin-left: 32px; }
  .composed .ref { color: var(--accent); }

  /* Dialogs */
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.3); z-index: 200; }
  .dialog { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); width: min(780px, calc(100vw - 32px)); max-height: calc(100vh - 128px); overflow: auto; z-index: 201; background: white; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,.2); padding: 16px 20px; font-size: 14px; }
  .dialog h2 { font-size: 16px; margin: 0 0 4px; display: flex; align-items: center; gap: 12px; }
  .dialog h2 button { margin-left: auto; }
  .dialog .intro { color: var(--muted); font-size: 13px; margin: 0 0 12px; }
  .dialog ol, .dialog ul { padding-left: 20px; }
  .dialog li { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
  .dialog li code { flex: 1; }
  .dialog form { display: flex; gap: 6px; margin-top: 8px; }
  .dialog form input { flex: 1; padding: 4px 8px; }
  .dialog table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .dialog th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; }
  .dialog td, .dialog th { padding: 5px 8px 5px 0; border-bottom: 1px solid #f1f3f5; vertical-align: top; }
  .dialog tr.pick { cursor: pointer; }
  .dialog tr.pick:hover { background: #f1f6ff; }
  .dialog label { display: block; font-size: 12px; font-weight: 600; color: #495057; margin: 10px 0 3px; }
  .dialog .field { width: 100%; box-sizing: border-box; padding: 5px 8px; border: 1px solid #ced4da; border-radius: 4px; }
  .dialog .row-fields { display: grid; grid-template-columns: 1fr 1.6fr 1fr auto; gap: 6px; margin: 4px 0; }
  .dialog .row-fields input { padding: 4px 6px; border: 1px solid #ced4da; border-radius: 4px; }
  .dialog .note { font-size: 12px; color: var(--muted); }
  .drop-overlay { position: fixed; inset: 0; background: rgba(13,110,253,.08); border: 3px dashed var(--accent); z-index: 300; display: grid; place-items: center; font-size: 20px; color: var(--accent); pointer-events: none; }
}
`

// Add the styles once to the document (or shadow root) the editor lives in.
export function installStyles(root: Document | ShadowRoot) {
  const host = root instanceof Document ? root.head : root
  if (host.querySelector('style[data-stroc-editor]')) return
  const style = document.createElement('style')
  style.dataset.strocEditor = ''
  style.textContent = editorCss
  host.appendChild(style)
}
