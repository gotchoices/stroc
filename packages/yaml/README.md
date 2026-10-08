# @stroc/yaml

Stroc documents are authored as YAML; the YAML file is the document. This package reads, lints,
fixes and writes them, reporting every problem with its line and column.

```js
import { lintYaml, fixYaml, stringifyDocument } from '@stroc/yaml'

const { valid, problems, value } = lintYaml(text)
const { text: fixed } = fixYaml(text)     // the one correct spelling, comments kept
```

Part of [Stroc](https://github.com/gotchoices/stroc), a format for structured legal documents
identified by content (IPLD CIDs). The format is specified in
[docs/Specification.md](https://github.com/gotchoices/stroc/blob/main/docs/Specification.md).
MIT license.
