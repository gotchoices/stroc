# @stroc/ui

The Stroc document editor, as a self-contained bundle: the `<stroc-editor>` web component (Lit),
with PDF export loading pdfmake and fonts from `dist/vendor` on demand. `stroc serve --editor`
hosts it; to host it elsewhere, serve the package's `dist` folder and load
`stroc-editor.js` as a module.

```html
<script type="module" src="stroc-editor.js"></script>
<stroc-editor></stroc-editor>
```

Part of [Stroc](https://github.com/gotchoices/stroc), a format for structured legal documents
identified by content (IPLD CIDs). The format is specified in
[docs/Specification.md](https://github.com/gotchoices/stroc/blob/main/docs/Specification.md).
MIT license.
