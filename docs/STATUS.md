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
- **Author is a verifiable domain or a name** (2026-10-07). One field: `author: sereus.org` is a
  claim confirmed against that domain's catalog; `author: Bob Anderson` is shown as written,
  unverifiable. A separate publisher field was considered and rejected: only the domain can be
  checked, and two fields invite contradictory pairs. Documents never contain URLs. Spec 0.15.
- **HTTP layout follows the IPFS trustless gateway** (2026-10-07): `/ipfs/<cid>`, catalog at
  `/.well-known/stroc/catalog.json` with a `domain` and a per-entry `role` (author, endorse,
  mirror), optional `index.html` and CAR bundles. One resolver reads Stroc servers, static hosts
  and IPFS gateways. Spec 0.15.
- **One document server for development and production** (2026-10-07): `stroc serve <folder>` is
  read-only, serves only valid documents on strict paths, caches CID paths forever, watches the
  folder in development, and runs directly or in Docker behind an HTTPS proxy. A folder config
  supplies the domain, `endorse`/`withdrawn` entries; roles default from `author`, `superseded`
  from `replaces`. The current dev server folds into it (`--editor`). `stroc publish` writes the
  same layout as static files.
- **The editor keeps a user-controlled list of fetch sites** (2026-10-07), tried in order and
  verified, typically starting with a local `stroc serve`.
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


- [x] **Inline placeholders** (decided 2026-10-07, spec 0.17): `<param:key>` for the document's own
  parameters, prompted by the AI authoring test, where blanks could not keep their wording.
- [x] **Collections for multi-app domains**: deferred (2026-10-07) until a need appears.
- [x] **`stroc link`**: approved (2026-10-07).

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

- [x] Vitest in every package, wired to `yarn test` (221 tests); `yarn test:e2e` (Playwright) for the
      editor in three browser engines (39 checks each run)
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
- [x] `canonicalMarkup` in core: writes any formatting in its one valid spelling; the emphasis order
      b, i, u now applies at every depth (spec 0.16), closing a gap that allowed two spellings
- [x] `stroc lint --fix` corrects markup spelling in paragraphs (grammar errors left to the author)
- [ ] `eng` → `en` style shortest-tag advice

### Stage 2 — strdoc parity

Library and composition
- [x] `replaces` in types and validation (list of CIDv1 DAG-JSON links, no duplicates)
- [x] CLI package `@stroc/cli`, independent of the editor (Q3). Replaces strdoc's `hash` and `refcheck`:
  - [x] `stroc lint [files]`: the shared lint rules, with `--fix`
  - [x] `stroc link <folder|files>`: drafts may write includes as file links
        (`source: {/: ./clause.yaml}`); the command replaces them with CIDs bottom-up, editing only
        those values; cycles and missing files reported; lint points to it
  - [x] `stroc status [folder]`: each file's CID and earlier versions; every include current,
        outdated (naming the file and its current CID), a file link, or from outside the folder;
        hints when a hand-edited document does not list what it replaces
  - [x] `stroc update [folder] [files] [--all]`: update chosen includes, add `replaces` to each
        document that changes as a result, report (or with `--all`, update) the parents now outdated
  - [x] Record file `.stroc-record.json`, rebuilt from the folder and `replaces` if lost
  - [x] Archive `.stroc-archive/`: the bytes of every recorded version, so in-place edits never lose
        a published version; the server serves archived versions as `superseded`
- [x] `@stroc/compose`: `Resolver` interface (`get(cid)`), `MemoryStore`, `firstOf`, `findMissing`;
      every fetch verified against its CID
- [x] `compose(root, resolver)`: includes resolved into one numbered tree; references resolved
      to numbers in every document's scope, including paths into includes; parameters gathered
      with their paths; never throws (missing, invalid, unresolved reported)
- [ ] Folder resolver for Node (today the CLI loads a folder into a `MemoryStore`)
- [x] `HttpResolver`: `/ipfs/<cid>?format=raw` with the raw Accept header (standard `fetch`, so
      browser, Node and React Native); works with `stroc serve`, static hosts and IPFS gateways
- [x] `AuthorChecker`: `author` domain → `/.well-known/stroc/catalog.json` → confirmed, endorsed,
      mirrored, not listed, unreachable, or not a domain; with entry status and timestamp; one
      catalog fetch per domain; catalog URL overridable for development
- [x] Core: `isDomain`; lint warning for a domain-like `author` not in lowercase

Document server (`stroc serve`, `@stroc/server`; replaced the old dev server)
- [x] Serves a folder: `/ipfs/<cid>` (immutable caching, any CID spelling), catalog, generated
      index page; strict paths (anything else 404), read-only, only valid documents (invalid files
      skipped and logged); CORS on public data
- [x] Folder config `.stroc.yaml`: `domain`, `endorse`, `withdrawn`; roles from `author`,
      `superseded` from `replaces` (`contracts/.stroc.yaml` sets `mychips.org`)
- [x] `--watch` reloads on change (development); `SIGHUP` reloads (production)
- [x] Browsers get the composed document as a readable page at `/ipfs/<cid>` (content
      negotiation, `Vary: Accept`), with a notice saying how to verify it; every other client
      gets the bytes. A QR code on a printed contract therefore opens the contract.
- [x] `--editor` hosts the editor at `/editor/` with its validation endpoints (development);
      `--editor` with no folder hosts only the editor; a busy port gives a clear message
- [x] `Dockerfile`: built and run against `contracts/` (2026-10-07); `stroc-server` entry point
      reads `PORT`, `HOST`, `STROC_DOMAIN`
- [ ] `?format=car` bundles (with the CAR work in Stage 3; 406 until then)

Rendering (`@stroc/render`, per [Rendering.md](Rendering.md))
- [x] pdfmake browser build produces a PDF in a bare JS context (no DOM, no Node): good sign for
      React Native
- [ ] Confirm on a device (Hermes) and in NativeScript; fall back to HTML in a web view
- [x] `layout`: framework-neutral model; numbering; two-column legal layout; references as
      "Section 3.1"; included documents with CID beside the heading; refuses to render with
      problems unless `draft`
- [x] `toHtml`: standalone, print-ready, everything escaped; root CID in the footer
- [x] Localizable label set (English default)
- [x] `stroc render <file> [--data] [--draft] [--qr] [-o]` composes a file with its folder as the
      library and writes HTML
- [x] `toPdfDefinition` (in `@stroc/render`, no pdfmake dependency) and `toPdf` (`@stroc/pdf`):
      same legal layout as HTML; footer with root CID and page n / total; Letter or A4; DRAFT
      watermark; QR codes as SVG; PDF metadata carries the title and CID; no external access
- [x] `stroc render ... -o file.pdf [--a4]`
- [x] Embedded fonts by default: Noto Serif and Noto Sans Mono (Latin, Greek, Cyrillic), loaded
      into pdfmake's in-memory file system; standard fonts optional (`standardFonts`)
- [ ] Fonts for further scripts (Arabic, Hebrew, CJK, Indic) and right-to-left layout
- [x] Closing QR code encodes `https://<author-domain>/ipfs/<cid>` for a domain author (or
      `<qrBase>/ipfs/<cid>`, or the bare CID)
- [x] Template view (`template`): the document as published, required values as blanks
- [x] HTML is readable on phones (small-screen layout)
- [x] The editor loads `@stroc/render` in the browser (bundled by esbuild, QR library included)

Editor
- [x] Bundled with core and compose (esbuild); fetches and verifies documents in the browser
- [x] Rewritten as components (`editor.ts`, `paragraph.ts`, `model.ts`, `styles.ts`, plus `sources.ts`,
      `includes.ts`); the single-file prototype is gone
- [x] Validation and CID in the browser as you type; problems shown at their section; status bar
      shows Valid or the problem count and the CID with a copy button; server endpoints removed (D7)
- [x] Sources list (File → Sources): user-controlled, ordered, remembered per browser
- [x] Open File… and Open by CID… (also `?cid=` in the address, used by Open in new tab)
- [x] Sources dialog shown over the page (was drawn inline, off-screen when scrolled)
- [x] Open from Sources lists every source's catalog (title, source, claim, status); a CID can
      still be entered for gateways
- [ ] Embeddable API: change and save events, host-supplied resolver (`doc` property and Preview
      exist)
- [x] Included documents fetched, verified, composed and shown in place, numbered; header shows
      verification, serving source, author check, source catalog role and status, problems inside;
      Open and Open in new tab
- [x] References show live numbers, including into included documents; unresolved marked
- [x] Indent/outdent (Tab, Shift+Tab, toolbar), move (Alt+Shift+↑↓, toolbar), drag and drop by the
      grip: before, after or into a section; Shift or Alt to copy (copies get no ids)
- [x] Write out a copy of an included document (replaces the include with editable text)
- [ ] Turn written-out text into an include (needs publishing the text as its own document first)
- [x] Type directly in the rendered view; Enter splits the paragraph into a new sibling section;
      Backspace at the start joins it to the previous paragraph; plain-text paste
- [x] Bold, italic, underline from the toolbar and ⌘B/⌘I/⌘U, saved as canonical markup
- [x] Preview (View menu, ⌘E): the document as readers see it, no editing controls
- [x] Spell-check toggle (View menu)
- [x] End-to-end tests with Playwright (`yarn test:e2e`) in Chromium, WebKit and Firefox: opening by
      CID, typing, splitting, joining, bold, indent and outdent, mouse drag and drop, references,
      preview, Open from Sources. They found that editing failed entirely in Safari (selection
      inside shadow DOM): the editor now renders into the page's DOM with nested, scoped styles
- [x] Undo/redo across the document (⌘Z, ⇧⌘Z or Ctrl+Y, Edit menu): snapshots of the model;
      typing in one paragraph or title within 1.5 s is one step
- [x] Paste keeps bold, italic and underline from HTML and drops everything else; several
      paragraphs (HTML blocks or lines of plain text) become paragraph sections
- [x] Export PDF from the editor (File → Export PDF, Letter or A4): composed with its includes,
      template view, embedded Noto fonts, CID QR; pdfmake and fonts load on demand from `vendor/`
- [ ] Usability pass against a real document
- [x] Insert a reference by picking the target (toolbar, Insert menu, ⌘K): this document's sections
      and included documents' sections with ids, with live numbers and a filter; a section without
      an id gets one from its title; a space is kept before the reference
- [x] Renaming an id updates references within the document (and says how many)
- [x] Open and Save YAML (standard) and JSON; Save writes back to the opened file where the browser
      allows (File System Access), otherwise downloads; saving an invalid draft is allowed, with
      the problem count reported (D8)
- [x] Document properties dialog: title, author, language, published, parameters, replaces
- [x] Validation errors shown at the offending section

### Stage 3 — Taleus readiness

- [x] `checkData`: missing required values, unknown keys, non-string values; paths across includes
- [x] Particulars table in `layout`: hoisted, grouped by declaring document, values styled distinctly
- [x] Placeholders `<param:key>` (spec 0.17): core grammar and validation (undeclared key is an
      error), canonical markup, golden vector, composition by path, rendered in place in HTML and PDF
      (supplied, default, or `[Label]` when blank), editor chips with Insert → Parameter (declare and
      insert), key rename updates placeholders
- [x] App blocks (`heading`, `paragraph`, `table`, `qr`) placed after the document; QR drawn by
      the renderer; closing root-CID QR option
- [ ] `stroc publish`: write what `stroc serve` would serve, as static files (`ipfs/<cid>`, CARs,
      `.well-known/stroc/catalog.json`, `index.html`); optionally upload to IPFS
- [ ] Bundle as a CAR file: root CID → the document and everything it includes; every block verified offline
- [x] Local store helper (`MemoryStore`) and missing check (`findMissing`), in `@stroc/compose`
- [x] Packages per the layout decision (core, yaml, compose, render, pdf, ui, cli, server); core,
      yaml, compose and render are free of Node APIs; `@stroc/pdf` is the Node writer (browsers and
      phones use pdfmake's browser build with `toPdfDefinition`).
- [ ] Example tally-style contract written in abstract roles with parameter declarations,
      rendered with sample data

### Later

- [ ] Markdown import/export (lossless, round-trip to the same CID; see Sereus.md)
- [ ] Defined terms declared by a document for its included clauses
- [ ] Structural diff between two documents
- [ ] `translates` lineage
- [ ] IPFS transport adapter (`dag put/get`)
- [ ] Publisher signatures
- [x] AI drafting guide: [Authoring.md](Authoring.md), tested by having an agent convert a sample agreement
- [ ] Outline panel and search in the editor (undo/redo done)

## Known defects

Found 2026-10-06. All fixed: D1–D6, D9, D10 on 2026-10-06; D7, D8 on 2026-10-07.

- **D7, D8 (fixed 2026-10-07).** The rewritten editor validates and hashes in the browser, and
  Save writes the canonical document (drafts with problems may be saved; the count is reported).

## Running it

```
yarn dev        # build, then serve contracts/ with --watch --editor on :3000 (PORT overrides)
yarn start      # build, then serve contracts/ (no editor)
yarn test       # unit tests, golden vectors, sample library, server
yarn lint       # ESLint, all packages
yarn test:e2e                     # editor end-to-end in Chromium, WebKit, Firefox (Playwright)
yarn stroc lint contracts/*.yaml                  # check documents (--fix to fix what can be fixed)
yarn stroc cid contracts/*.yaml                   # print CIDs
yarn stroc render contracts/Tally_Contract.yaml -o tally.html   # the composed contract as HTML
yarn stroc render contracts/Tally_Contract.yaml -o tally.pdf    # ... or as PDF (--a4 for A4)
yarn stroc serve <folder> [--port N] [--domain D] [--watch] [--editor]
docker build -t stroc-server . && docker run -p 3000:3000 -v $PWD/contracts:/documents:ro stroc-server
```

With `yarn dev`: the index of served documents is at `http://localhost:3000/`, the catalog at
`/.well-known/stroc/catalog.json`, documents at `/ipfs/<cid>`, and the editor at `/editor/`.

Several libraries at once: run `yarn stroc serve <folder> --port N` for each (every server needs its
own port), open the editor from any of them (or `yarn stroc serve --editor --port N` for an editor
alone), and add the others under File → Sources.

## Document references

- [Sereus.md](Sereus.md): principles and the division of responsibility between Stroc and apps
- [Specification.md](Specification.md): the protocol
- [Rendering.md](Rendering.md): the rendering library and legal layout
- [Legacy.md](Legacy.md): strdoc and MyCHIPs, the parity target
- [Vision.md](Vision.md), [Implementation.md](Implementation.md): original goals and plan (dated)
- [Editor.md](Editor.md): editor platform and behavior
- [Authoring.md](Authoring.md): writing Stroc documents, by hand or with an AI assistant
- [Deploying.md](Deploying.md): preparing and publishing a document set on a domain
- [Testing.md](Testing.md): test layers and rules
- [Workflow.md](Workflow.md): change process
