# @stroc/core

Types, validation, canonical encoding and CIDs for Stroc documents. No Node or DOM APIs: runs in
browsers, Node and React Native.

```js
import { validateDocument, documentCid, verifyDocument } from '@stroc/core'

const { valid, problems } = validateDocument(doc)
const { cid, bytes } = await documentCid(doc)          // DAG-JSON, SHA-256, CIDv1
const check = await verifyDocument(receivedBytes, cid)  // hashes the bytes as received
```

SHA-256 is pure JavaScript by default; an app may install a native one with `setSha256` (checked
against known digests first).

Part of [Stroc](https://github.com/gotchoices/stroc), a format for structured legal documents
identified by content (IPLD CIDs). The format is specified in
[docs/Specification.md](https://github.com/gotchoices/stroc/blob/main/docs/Specification.md).
MIT license.
