# @stroc/server

Serves a folder of Stroc documents for a domain: each document at `/ipfs/<cid>` (IPFS
trustless-gateway layout, with a readable page for browsers), the catalog at
`/.well-known/stroc/catalog.json`, and an index. Read-only; put it behind the domain's HTTPS
front end.

```
npx stroc-server <folder> --port 3100 --domain example.org
```

See [docs/Deploying.md](https://github.com/gotchoices/stroc/blob/main/docs/Deploying.md).

Part of [Stroc](https://github.com/gotchoices/stroc), a format for structured legal documents
identified by content (IPLD CIDs). The format is specified in
[docs/Specification.md](https://github.com/gotchoices/stroc/blob/main/docs/Specification.md).
MIT license.
