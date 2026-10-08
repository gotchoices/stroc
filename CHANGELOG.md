# Changelog

All `@stroc/*` packages share one version. The document format has its own version (`stroc: "1.0"`,
see [docs/Specification.md](docs/Specification.md)); package releases do not change it.

List changes under **Unreleased** as they are made; `yarn release:version` dates them.

## Unreleased

- `stroc export <folder> -o <dir>`: publish a document set as static files on any web server
  (Apache, nginx, Netlify, Cloudflare Pages, GitHub Pages), with no Node process (issue #1).
  `exportLibrary` in `@stroc/server`.
- The `stroc` command starts faster: the server and PDF writer load only when used.

## 0.1.0 (2026-10-07)

- First public release of the libraries (`core`, `yaml`, `compose`, `render`, `pdf`), the editor
  bundle (`ui`), the document server (`server`) and the `stroc` command (`cli`), for document
  format 1.0.
