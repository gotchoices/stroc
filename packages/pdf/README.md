# @stroc/pdf

Writes a laid-out Stroc document as PDF in Node, using pdfmake with embedded Noto Serif and Noto
Sans Mono fonts. (In browsers and apps, use `toPdfDefinition` from `@stroc/render` with pdfmake
directly.)

```js
import { toPdf } from '@stroc/pdf'

const bytes = await toPdf(l, { pageSize: 'A4' })
```

Part of [Stroc](https://github.com/gotchoices/stroc), a format for structured legal documents
identified by content (IPLD CIDs). The format is specified in
[docs/Specification.md](https://github.com/gotchoices/stroc/blob/main/docs/Specification.md).
MIT license.
