# Changelog

All `@stroc/*` packages share one version. The document format has its own version (`stroc: "1.0"`,
see [docs/Specification.md](docs/Specification.md)); package releases do not change it.

List changes under **Unreleased** as they are made; `yarn release:version` dates them.

## Unreleased

- Collections: a publisher names which documents are meant for what in `.stroc.yaml`
  (`collections: {tally-contracts: [Tally_Contract.yaml]}`), and the catalog lists them on each
  entry (catalog format 1.1), so an app can offer the contracts and not the clauses they include.
  Earlier versions stay in the collection, marked superseded. Apps read them with the new
  `fetchCatalog` and `collectionEntries` in `@stroc/compose`. Older clients ignore the field.

## 0.2.0 (2026-10-08)

- `stroc export <folder> -o <dir>`: publish a document set as static files on any web server
  (Apache, nginx, Netlify, Cloudflare Pages, GitHub Pages), with no Node process (issue #1).
  `exportLibrary` in `@stroc/server`.
- The `stroc` command starts faster: the server and PDF writer load only when used.

## 0.1.0 (2026-10-07)

- First public release of the libraries (`core`, `yaml`, `compose`, `render`, `pdf`), the editor
  bundle (`ui`), the document server (`server`) and the `stroc` command (`cli`), for document
  format 1.0.
