# Stroc Status

**Last reviewed:** 2026-10-06, against the working tree (built, server run, core probed with test
documents, all 13 MyCHIPs contracts converted as a trial).

Checked items are done and verified. Open items are still to do. Blocking questions come first:
the items that depend on them should not be coded until they are answered, because most of them
change what gets hashed.

## Goal

1. **strdoc parity.** Bring Stroc up to what wylib strdoc and MyCHIPs could do: edit structure
   freely, show a contract with its included parts, render cross-references as section numbers,
   maintain a library of documents that include each other, and print a contract.
2. **Taleus readiness.** Taleus consumes documents; it does not author them. It stores a contract's
   CID, and must fetch, verify and render that contract (and everything it includes) in a formal
   legal style, with the parties, dates and similar details shown alongside the text without
   being part of its hash. Authors use a browser-based Stroc editor and publish.

Stroc stays a general document library: it must not depend on Taleus or Sereus. See
[Sereus.md](Sereus.md) for the principles behind this; [Legacy.md](Legacy.md) for what strdoc did.

## Decisions recorded 2026-10-06

- **No legacy compatibility.** Clean slate: no legacy RIDs, no `host`/`name`/`version` identity.
  The MyCHIPs contracts are useful only as realistic sample content.
- **Content addressing stays.** Documents are identified and included by CID, following IPFS
  principles. File names exist only in the folder tools, never in documents (see Q3).
- **Authors may be anyone**, not only lawyers. Taleus users are mostly readers.
- **No editor in Taleus.** The editor is a browser tool; Taleus needs fetch, verify and render.
- **Legal rendering style**: formal, numbered, suitable for an enforceable contract.
- **Render-time data is wanted**: party names, dates and similar values shown in the rendered
  document but not hashed with it (see Q5).
- **Q1 settled: section ids.** Any section may carry an `id`, unique within its document (not
  globally) and hashed. An include section's `id` is required and replaces the `as` alias.
  References are id paths: `<ref:cure>`, `<ref:ethics/good-faith>`. Titles carry no identity.
  Hash-based and position-based references were rejected: sections have no hash, mutually
  referring sections could not be written, and every edit would cascade. Spec 0.6.
- **Q2 settled: includes are IPLD links.** In the hashed form `source` is a DAG-JSON link
  (`{"/": "baguqeera…"}`) to a CIDv1 DAG-JSON document, so a composed contract is one IPLD DAG
  that IPFS tools can pin, walk and export as a CAR file. Any future field naming another document
  uses the same form. Spec 0.7.
- **Q4 settled: YAML is the standard authoring format, and the YAML file is the document.** A
  YAML file and its DAG-JSON encoding are two spellings of the same data; the CID is the hash of
  the DAG-JSON spelling. No build or compile layer: what the author writes is what is hashed,
  and a linter rejects anything not already canonical (with an automatic fix offered). A link is
  written `source: {/: baguqeera…}`. Comments are allowed and are not content. JSON is accepted
  as well. Markdown moves to "later". Spec 0.7.
- **Q3 settled: folder tools, not the editor, manage a library.** The editor handles one
  document: open, edit, validate, save, show its CID, and read included documents by CID. It does
  not track revisions or update other files. A separate command-line package (depending on the
  shared library, not on the editor) does housekeeping in place: `stroc lint`, `stroc status`,
  `stroc update`, and later `stroc publish`. Updates are deliberate (the files you name, one level
  at a time, or `--all`); the tool never rewrites what you did not ask for. File names live only
  in the tool's own record file, whose format is the tool's choice. Losing that file costs manual
  work, never correctness: the tool rebuilds it from the folder and the `replaces` chains. Lint
  rules live in the shared library so the editor and the linter agree.
- **`replaces` is in scope now** (was "later"). An optional, hashed list of links in which a
  document names the versions it supersedes. It is the checkable form of a version history, the
  tools use it to check revisions and rebuild their records, and it is advisory: it never transfers
  anyone's approval. Spec 0.8.
- **Q7 settled (except markup grammar, Q7h): canonical form.** A document must already be
  canonical; tools lint, never clean up silently. Unknown fields are an error; a `stroc` version
  newer than the tool supports is rejected (upgrade the tool). Only ordinary single spaces, so no
  no-break spaces (a markup token can add one later if needed). Zero-width space, word joiner, BOM
  and soft hyphen are forbidden; ZWJ/ZWNJ and bidi marks are allowed. Text is literal: no entity
  decoding. Markup only in `text`, balanced, canonical order. Verification hashes the received
  bytes, which must be canonical DAG-JSON. Spec 0.9.
- **Q7h settled: markup grammar.** Keep `<b>`-style tokens as a strict Stroc grammar, explicitly
  not HTML. Tokens are exact, lowercase, with no spaces or options (arguments follow a colon:
  `<ref:ethics/good-faith>`). Every `<` begins a token; a literal `<` is `\<`, a literal backslash
  `\\`. One spelling per formatting (nesting order, no adjacent duplicates, no edge spaces).
  Braces and backslash commands were rejected (braces break YAML at the start of a paragraph;
  backslash commands are unfamiliar); Markdown has several spellings per meaning. Spec 0.10.
- **Q5 settled: render-time data.** Documents use abstract roles ("Stock Holder"); apps
  may supply blocks the renderer places but never interprets. A document may declare
  `parameters` (`key`, `label`, optional `default`; no types) at its top level only, hashed. A
  parameter without a default is required. Values come in a separate data object, not hashed by
  Stroc, addressed across includes by id path like references (`terms/limit`). When rendered, all
  parameters of the composed document are hoisted into one table near the top ("Particulars", a
  renderer label), grouped by declaring document. Inline placeholders (`<param:…>`) are deferred
  and described in the spec as a possible future feature. Spec 0.11.
- **Q8 settled: included documents render as MyCHIPs rendered them.** The included document's
  title becomes the numbered section heading with its CID in small type beside it; its text and
  sections follow, numbered beneath; its author, date and language are not shown. Two-column
  numbered layout, title on the number row and text below. Spec 0.11; layout in
  [Rendering.md](Rendering.md).
- **Q9 settled: no version label.** `replaces` records history. Renderers print the root CID in
  small type in a page margin and may print it as a QR code at the end.
- **Language tags are BCP 47** (`en`, `en-US`, `sr-Latn`), replacing ISO 639-2 (`eng`): the standard
  browsers and date formatting use, and able to name a script. Spec 0.14.
- **Format version `"0.1"` until frozen.** Documents made during development carry `stroc: "0.1"`.
  The format is frozen, as `"1.0"`, when golden vectors are recorded and the first real set is
  published; `"1.0"` tools reject `"0.1"` documents.
- **Package layout**: `@stroc/core` (types, validation and lint rules, markup tokenizer, encoding,
  CID, verification; runs everywhere, built without Node types); `@stroc/yaml` (read, write,
  `--fix`); `@stroc/compose` (resolver, composition, local store, missing check, CAR bundles, HTTP
  resolver, catalog and provenance); `@stroc/render`; `@stroc/cli`; `@stroc/ui`; plus the dev server,
  which is not part of the library.
- **Editor rewritten on Lit** in Stage 2 as small components, running entirely in the browser; the
  prototype gets only safety fixes until then. Browser spell check in the parity stage; undo later.
  See [Editor.md](Editor.md).
- **Q6 settled: reference scope.** References point only within the document and what it
  includes. Reusable clauses use defined terms for anything outside themselves. Spec 0.6.

## Design questions

All settled 2026-10-06; details under Decisions above, and in the spec and
[Rendering.md](Rendering.md). Nothing blocks recording golden-vector CIDs.

- [x] **Q1. Cross-reference targets**: section ids, unique within a document.
- [x] **Q2. Include encoding**: IPLD link.
- [x] **Q3. Maintaining a library**: folder tools separate from the editor, plus `replaces`.
- [x] **Q4. Source format**: YAML; the YAML file is the document.
- [x] **Q5. Render-time data**: top-level `parameters`, untyped, hoisted into one table.
- [x] **Q6. Reference scope**: the document and what it includes.
- [x] **Q7. Canonical form and markup grammar.**
- [x] **Q8. How an included document appears**: MyCHIPs' layout, CID beside the heading.
- [x] **Q9. Version label**: none.

## Other open questions

- [x] **Trim [Sereus.md](Sereus.md).** Done 2026-10-06: now describes how Stroc serves Sereus apps
  (the environment, division of responsibility, distributing documents, packaging, guidance for
  apps, possible later features). Material now in the spec, Rendering.md or this file was removed;
  the instrument declaration was set aside. The name is kept, since the file is about Sereus apps.
- [ ] Rewrite [Implementation.md](Implementation.md) and [Vision.md](Vision.md) once the package split
  is settled (both still describe sentence arrays, a server-backed editor, and "Sereus MyCHIPs").

## Checklist

### Done

Specification and decisions
- [x] One paragraph string per section; further paragraphs are untitled child sections
- [x] CID is external to the document: DAG-JSON, SHA-256, CIDv1, base32 (`baguqeera…`)
- [x] `host`, `name`, `version`, `rid` removed; `author` optional
- [x] Text normalization rules (entities, control characters with bidi preserved, NFC, whitespace)
- [x] Inline markup `<b>`, `<i>`, `<u>` defined, with canonical nesting order (spec only)
- [x] Include by CID (spec only)
- [x] Section ids and reference rules (spec 0.6)
- [x] Multilingual wrapper-document pattern
- [x] Spec prose aligned with the paragraph-string model; CID prefix and version corrected (2026-10-06)

`@stroc/core`
- [x] Types `StrocDocument`, `StrocSection`
- [x] `normalizeString`, `normalizeDocument`
- [x] `validateDocument`: required fields, reserved path characters, sibling title uniqueness,
      text is a string
- [x] `encodeDagJson`, `computeCid`, `cidFromDocument`

`@stroc/server` (development tool)
- [x] `GET /health`, `POST /validate`, `POST /cid`, static hosting of the editor, under `yarn dev`

`@stroc/ui` (Lit web component)
- [x] Rendered view with section numbering; click a section to edit it
- [x] B/I/U/Ref buttons insert tags into the textarea
- [x] Add, delete, move up/down within a parent; add subsection
- [x] Include by CID (enter CID and alias)
- [x] Document properties (title, author, language, date, preamble)
- [x] Open/Save JSON, drag a file onto the page, unsaved-changes guard
- [x] Validate and show CID (via server)

### Stage 0 — Safety net

- [x] Vitest in `@stroc/core` and `@stroc/yaml`, wired to `yarn test` (122 tests)
- [x] Unit tests for text rules, ids, language tags, markup and validation, including malformed input
- [x] Golden-vector CID tests (5 fixture documents in `packages/core/test/fixtures/`, including a
      contract that includes a clause by CID). Recorded for format `"0.1"`; re-recorded at freeze.
- [x] Malformed input returns problems instead of throwing (D1)
- [x] Fix editor XSS (D2)
- [x] ESLint configured and passing (`yarn lint`, all packages)
- [x] Fix `yarn start` and server paths (D3); untrack `.DS_Store`
- [ ] Commit the regenerated `yarn.lock` (user)
- [x] Build `@stroc/core` without Node types
- [x] Drop the `he` dependency

### Stage 1 — Document model

Spec first (per [Workflow.md](Workflow.md)), then code.
- [x] Spec: reference targets (Q1) and reference scope (Q6), spec 0.6
- [x] Spec: include encoding (Q2) and YAML format (Q4), spec 0.7
- [x] Spec: `replaces` field, spec 0.8
- [x] Spec: canonical form and verification (Q7 except Q7h), spec 0.9
- [x] Spec: markup grammar (Q7h), spec 0.10
- [x] Spec: parameters (Q5) and composition (Q8), spec 0.11
- [x] Rendering.md: rendering library and legal layout (draft)
- [x] Editor.md: editor platform and behavior (draft); editor section moved out of the spec
- [x] Spec: BCP 47 language tags, `"0.1"` format version (spec 0.14)
- [x] Core rewritten to spec 0.14: no silent normalization; every rule reported as a problem with a
      path (and offset within text), never thrown (D4, D9)
- [x] Validation completeness (D4): unknown fields, empty values and sections, include sections
      with exactly `id` and `source`, links must be CIDv1 DAG-JSON SHA-256, id syntax and
      document-wide uniqueness, format version (newer rejected), `published` date, BCP 47 tag
- [x] `as` replaced by `id` in core and the prototype editor; title uniqueness and title
      character rules dropped
- [x] Markup tokenizer and validator for the spec 0.10 grammar, exported as a parsed tree for
      renderers and the editor (`parseMarkup`) (D5)
- [x] References: id paths parsed; local targets validated; references into includes returned
      as `external` for composition to check (D6, local part)
- [x] `verifyDocument(bytes, cid)`: hashes exactly what was received, requires canonical
      DAG-JSON, then validates
- [x] `source` and `replaces` as links in core; `fromPlain` / `toPlain` convert `{"/": cid}`
- [x] `parameters` in types and validation
- [x] `canonicalizeText` and `suggestId` helpers for lint fixes and the editor
- [x] `@stroc/yaml`: parse YAML (or JSON) with line and column for every problem; reject anchors,
      aliases, tags, merge keys and duplicate keys; write the standard layout (fixed field order,
      one sentence per line, `{/: cid}` links); `fixYaml` fixes text, language case and unquoted
      numbers in place, keeping comments and layout. Round trip tested: same CID.
- [x] `@stroc/cli`: `stroc lint [--fix]` and `stroc cid` (run as `yarn stroc ...`)
- [x] Sample library: all 13 MyCHIPs documents converted to `contracts/*.yaml`, includes linked
      by real CID; a test keeps every file valid and every include current (D10)
- [x] Prototype editor opens `.yaml` files (saves JSON until the rewrite)
- [ ] Lint fixes for markup spelling (tag order, adjacent spans, edge spaces) and `eng` → `en`
      style shortest-tag advice

### Stage 2 — strdoc parity

Library and composition
- [ ] `replaces` in types and validation (list of CIDv1 DAG-JSON links, no duplicates)
- [ ] CLI package `@stroc/cli`, independent of the editor (Q3). Replaces strdoc's `hash` and `refcheck`:
  - [x] `stroc lint [files]`: the shared lint rules, with `--fix`
  - [ ] `stroc status [folder]`: each file's CID and `replaces` chain; every `source` pointing at a
        superseded version, naming the newer file; `source` CIDs the tool has never seen, by file and line
  - [ ] `stroc update [files] [--all]`: update chosen sources, add `replaces` to each document that
        changes as a result, report the parents now out of date
  - [ ] Record file (format of the tool's choosing), rebuilt from the folder and `replaces` if lost
- [ ] Resolver interface: `get(cid)` from an app-supplied source, every fetch verified; folder and
      in-memory implementations
- [ ] Compose: resolve includes into one numbered tree

Rendering
Rendering (`@stroc/render`, per [Rendering.md](Rendering.md))
- [ ] Verify pdfmake in React Native / NativeScript early; fall back to HTML in a web view
- [ ] `layout`: framework-neutral model; numbering; two-column legal layout; references as
      "Section 3.1"; included documents with CID beside the heading
- [ ] `toHtml`: standalone, print-ready
- [ ] `toPdf` (pdfmake): same layout; footer with root CID and page n / total; Letter or A4
- [ ] Localizable label set (English default)

Editor
- [ ] Runs entirely in the browser: validation and CID via core, no server needed
- [ ] Embeddable: public `doc` property, `readonly` mode, change and save events
- [ ] Included documents shown in place, read-only, via the resolver
- [ ] Indent/outdent; move a section to another parent; drag and drop before/after/into,
      Shift to copy
- [ ] Convert a section between written-out and included
- [ ] Type directly in the rendered view; Enter splits the paragraph into a new sibling section
- [ ] Edit-all / preview-all
- [ ] Insert a reference by picking the target (proposes an id from its title); shows its live number
- [ ] Renaming an id updates references within the document
- [ ] Open/Save YAML (standard) and JSON; Save validates and writes the canonical document
- [ ] Validation errors shown at the offending section

### Stage 3 — Taleus readiness

- [ ] `checkData`: missing required values, unknown keys, non-string values; paths across includes
- [ ] Particulars table in `layout`: hoisted, grouped by declaring document, values styled distinctly
- [ ] App blocks (`heading`, `paragraph`, `table`, `qr`) placed after the document; QR drawn by
      the renderer; closing root-CID QR option
- [ ] `stroc publish`: write a published set (static `<cid>` files of canonical bytes, a CAR per
      root document, and `catalog.json` with status and `replaces`) for any web server; mark
      replaced entries superseded; optionally upload to IPFS
- [ ] Bundle as a CAR file: root CID → the document and everything it includes; every block verified offline
- [ ] Local store helper (verified documents by CID) and missing check (included documents a store
      does not hold)
- [ ] HTTP resolver for published sets
- [ ] Provenance check: base URL + CID → catalog entry (publisher, origin, status, date checked)
- [ ] Packages per the layout decision; everything except ui and cli runs in browser, Node and
      React Native / NativeScript
- [ ] Example tally-style contract written in abstract roles with parameter declarations,
      rendered with sample data

### Later

- [ ] Markdown import/export (lossless, round-trip to the same CID; see Sereus.md)
- [ ] Defined terms declared by a document for its included clauses
- [ ] Structural diff between two documents
- [ ] `translates` lineage
- [ ] IPFS transport adapter (`dag put/get`)
- [ ] Publisher signatures
- [ ] AI drafting guide (prompt bundle that produces valid Stroc source)
- [ ] Outline panel, search, undo/redo

## Known defects

Found 2026-10-06. D1–D6 and D9 fixed 2026-10-06 (Stage 0 and the core rewrite).

- **D6 (remaining part).** References into included documents are only checked when a document is
  composed; composition does not exist yet (Stage 2).
- **D7. Editor depends on the dev server** for validation and CID, and keeps the document in private
  state with no events, so it cannot be embedded or used offline. (Rewrite, Stage 2.)
- **D8. Editor Save does not validate before writing.** Since 2026-10-06 it does write the same
  tidied document that is validated (empty fields omitted, whitespace collapsed, links as
  `{"/": cid}`), and Open accepts both link and older string sources. (Rewrite, Stage 2.)
- **D10 (fixed).** The old sample contracts were replaced by the converted library.

## Running it

```
yarn dev        # builds core and ui, then serves the editor and API on :3000 (PORT overrides)
yarn build      # compiles all packages
```

```
yarn test       # unit tests, golden vectors, sample library consistency
yarn lint       # ESLint, all packages
yarn stroc lint contracts/*.yaml     # check documents (--fix to fix what can be fixed)
yarn stroc cid contracts/*.yaml      # print CIDs
yarn start      # build, then run the compiled server
```

Editor at `http://localhost:3000`. `POST /cid` (or `/validate`) takes a document as plain JSON,
links written `{"/": "<cid>"}`, and returns `{ valid, cid?, problems, warnings }`.

## Document references

- [Sereus.md](Sereus.md): principles and the division of responsibility between Stroc and apps
- [Specification.md](Specification.md): the protocol
- [Rendering.md](Rendering.md): the rendering library and legal layout
- [Legacy.md](Legacy.md): strdoc and MyCHIPs, the parity target
- [Vision.md](Vision.md), [Implementation.md](Implementation.md): original goals and plan (dated)
- [Editor.md](Editor.md): editor platform and behavior
- [Workflow.md](Workflow.md): change process
