# Stroc Rendering

**Status**: Draft, 2026-10-06

How Stroc turns a document into something a person reads and signs, and the library apps use to
do it. The document format itself is in [Specification.md](Specification.md); this file covers
presentation, which never affects a CID.

## Purpose

Most users of an app such as Taleus never author a document. They read the contract they are
agreeing to, or have agreed to, and may keep a printed or PDF copy. The renderer must produce
that copy:

- **Formal**: a numbered legal layout suitable for an enforceable contract.
- **Complete**: the whole composed document, with every included document in place.
- **Checkable**: the CIDs needed to verify the printed copy against the published documents.
- **Offline**: from a bundle the app already holds, with no network access.
- **Generic**: the renderer knows nothing about tallies, parties or signatures. Apps supply data
  and blocks; the renderer places them without interpreting them.

## Package

`@stroc/render`, a TypeScript library. It depends on `@stroc/core` and on a composition package
(resolver and bundle), never on the editor.

```ts
// Supplied by the app: fetch a document's bytes by CID (cache, file, peer, IPFS, HTTP...).
interface Resolver {
  get(cid: CID): Promise<Uint8Array>
}

// Fetch and verify the root and everything it includes. Every block is hashed and checked
// against its CID before use.
compose(root: CID, resolver: Resolver): Promise<Composed>
composeFromCar(car: Uint8Array): Promise<Composed>      // a bundle exported as a CAR file

// Check a data object against the composed document's parameters (Specification: Parameters).
checkData(doc: Composed, data: Record<string, string>): Problem[]

// Lay out the document. The result is a plain data structure with no UI framework or DOM.
layout(doc: Composed, input: {
  data?: Record<string, string>
  blocks?: Block[]                // app-supplied, placed after the document
  options?: RenderOptions
}): Layout

toHtml(layout: Layout): string                              // standalone, print-ready HTML
toPdfDefinition(layout: Layout, options?: PdfOptions): PdfDefinition   // plain pdfmake definition

// @stroc/pdf (separate, so apps that only need HTML do not take pdfmake):
toPdf(layout: Layout, options?: PdfOptions): Promise<Uint8Array>
```

`toPdfDefinition` produces pdfmake's document definition as plain data, with no dependency on
pdfmake. `@stroc/pdf` turns it into bytes in Node; an app can equally hand the definition to
pdfmake's browser build. pdfmake is never allowed to fetch URLs or read files: the definition
refers to no external resources and access policies deny them.

`layout` does all the work of numbering, resolving references and grouping parameters, so HTML
and PDF output are thin and always agree. An app with its own UI can draw from `Layout`
directly.

### App blocks

```ts
type Block =
  | { kind: 'heading', text: string }
  | { kind: 'paragraph', text: string }
  | { kind: 'table', title?: string, rows: [label: string, value: string][] }
  | { kind: 'qr', value: string, caption?: string }
```

- All block text is plain text, escaped on output. Blocks carry no Stroc markup.
- The renderer draws QR codes itself, so apps need no QR library.
- Example: Taleus passes party certificates as tables, a block of tally id, date and digest, and
  each signature as a `qr` block whose value Taleus defines (MyCHIPs encoded digest, public key
  and signature).

## Layout

Modeled on MyCHIPs' `lib/control/buildpdf.js`, the layout users were satisfied with.

### Order on the page

1. **Title**: the root document's `title`, large, centered, not numbered.
2. **Particulars**: the parameter table, if the composed document declares any parameters.
3. **Preamble**: the root document's `text`.
4. **Sections**, numbered.
5. **App blocks**, in the order supplied.
6. **Closing identifier**: optionally a QR code (option `cidQr`). It encodes
   `https://<author-domain>/ipfs/<cid>` when the root document's author is a domain, so scanning it
   fetches the document from its issuer; otherwise `<qrBase>/ipfs/<cid>` if a base (for example an
   IPFS gateway) is given; otherwise the bare CID.

### Numbering and sections

- Numbers are computed from position in the composed document: `1.`, `1.1.`, `1.1.1.`. Documents
  store nesting, never depth.
- Each section is a row with two columns: the number, and the content. Text hangs clear of the
  numbers.
- A titled section shows its title, bold, on the number's row; its text follows below in the
  content column.
- An untitled section (a plain paragraph) shows its text directly beside the number.
- Nested sections are indented one content column further.

### Included documents

As in [Specification: Composition](Specification.md#composition):

- The included document's title is the section heading, numbered in place.
- Its CID is printed beside the heading in small, right-aligned type.
- Its text and sections follow, numbered beneath the heading.
- Its author, date, language and lineage are not shown.

### Inline content

- `<b>`, `<i>`, `<u>` render as bold, italic and underline.
- `<ref:path>` renders as the target's number in the composed document, e.g. "Section 3.1", or
  "Section 3" for a whole included document. The word is a localizable label.
- Escapes (`\<`, `\\`) render as the literal characters.

### Particulars

- One table near the top for the whole composed document, including parameters declared by
  included documents.
- The root document's parameters come first, in declaration order. Each included document that
  declares parameters follows as a group headed by its section number and title, in document
  order.
- Each row is the parameter's label and value. A missing value shows the default; a missing
  required value is an error from `checkData`, and `layout` refuses to render unless `draft` (shows
  "not specified", with a DRAFT mark) or `template` (the document as published, with a blank line
  to fill in, no mark) is set.
- Supplied values are styled distinctly from document text, so a reader can tell the fixed terms
  from the deal-specific values.
- The heading is a renderer label, default "Particulars". (The word "Definitions" is left for
  defined terms.)

### Page furniture (PDF and print HTML)

- Footer on every page: the root CID in small type, and page `n / total`.
- Page size option: Letter (default) or A4.

### Labels and localization

All words the renderer adds ("Section", "Particulars", "Page", "not specified") come from a
label set passed in options. English is the default. The document's own text is never translated.

## Platforms

- `compose`, `checkData` and `layout` are plain TypeScript with no DOM or Node APIs, so they run
  in browsers, Node and React Native.
- `toHtml` returns a string; an app can show it in a web view on any platform.
- `toPdf` uses pdfmake, which runs in browsers and Node. pdfmake's browser build was checked
  (2026-10-07) in a bare JavaScript context with no DOM and no Node APIs, and produced a PDF with
  SVG, which strongly suggests it runs in React Native. **Not yet verified on a device (Hermes) or
  in NativeScript.** If it does not run there, a mobile app renders HTML in a web view and prints
  or saves from that.

## Open issues

- **Fonts for other scripts.** PDFs embed Noto Serif and Noto Sans Mono (Latin, Greek, Cyrillic),
  so every viewer shows the same document. Other scripts (Arabic, Hebrew, CJK, Indic...) need
  further Noto families; how an app selects or adds them is to be decided. The non-embedded PDF
  standard fonts remain an option (`standardFonts`) for the smallest files, Latin only.
- **pdfmake on a device**: confirm on React Native (Hermes) and NativeScript (see Platforms).
- **Right-to-left documents**: bidi marks are preserved in text; layout direction is not yet
  addressed.
