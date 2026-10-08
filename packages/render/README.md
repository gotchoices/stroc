# @stroc/render

Lays out a composed Stroc document (numbers, references, parameter values, Particulars table, CID
and optional QR code) and turns the layout into HTML or a pdfmake document definition. No Node or
DOM APIs.

```js
import { layout, toHtml, toPdfDefinition } from '@stroc/render'

const { layout: l, problems } = layout(composed, { data: { 'terms/limit': '500' } })
const html = toHtml(l)
const definition = toPdfDefinition(l)     // pass to pdfmake in a browser or app
```

Part of [Stroc](https://github.com/gotchoices/stroc), a format for structured legal documents
identified by content (IPLD CIDs). The format is specified in
[docs/Specification.md](https://github.com/gotchoices/stroc/blob/main/docs/Specification.md).
MIT license.
