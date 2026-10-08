# @stroc/compose

Fetches a document and everything it includes, verifies each against its CID, and composes them:
numbering, references resolved, parameters gathered. Includes an HTTP resolver for the IPFS
trustless-gateway layout (`/ipfs/<cid>`), catalog reading and author-domain checks.

```js
import { compose, HttpResolver, MemoryStore, firstOf } from '@stroc/compose'

const resolver = firstOf(localStore, new HttpResolver('https://mychips.org'))
const composed = await compose(cid, resolver)
```

Part of [Stroc](https://github.com/gotchoices/stroc), a format for structured legal documents
identified by content (IPLD CIDs). The format is specified in
[docs/Specification.md](https://github.com/gotchoices/stroc/blob/main/docs/Specification.md).
MIT license.
