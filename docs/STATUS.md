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
  principles. Names may exist in drafting tools, not in published documents (see Q3).
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
- **Q6 settled: reference scope.** References point only within the document and what it
  includes. Reusable clauses use defined terms for anything outside themselves. Spec 0.6.

## Blocking questions

Each has a recommendation. Q2 and Q7 must be settled before golden-vector CIDs are recorded.

- [x] **Q1. Cross-reference targets.** Settled: section ids (see Decisions).
- [ ] **Q2. How an include is encoded.** `source` as a plain CID string, or as an IPLD link
  (`{"/": "baguqeera…"}`). They hash differently.
  - A link makes a composed contract one IPLD DAG: IPFS tools can pin, fetch and walk the whole
    contract by its root CID. This is the IPFS-native choice and the main reason DAG-JSON was
    picked.
  - A string is simpler and opaque to IPFS.
  - *Recommended*: link in the canonical form; YAML/JSON source files write a plain string and the
    importer converts it. (This reverses Sereus.md principle 5.)
- [ ] **Q3. Drafting a library by content address.** Editing a clause changes its CID, so every
  document that includes it changes too, up to the top. strdoc handled this with `hash` and
  `refcheck`. *Recommended*: published documents contain only CIDs. Drafts in a folder may
  include each other by relative file path (`source: ./Ethics.yaml`); a `stroc build` step (CLI and
  editor) computes CIDs bottom-up, substitutes them, and writes the published set plus a manifest
  of file → CID. The manifest is a convenience, not hashed. Mutable "latest version" names (IPNS
  style) are out of scope.
- [ ] **Q4. Source format.** *Recommended*: YAML is the authoring format (comments, folded text that
  can be written one sentence per line, readable diffs); JSON is accepted too; DAG-JSON is the only
  hashed form. Comments and line breaks are not content. Markdown moves to "later".
- [ ] **Q5. Render-time data.** Two layers, not mutually exclusive:
  - Documents are written in abstract roles ("Stock Holder", "Foil Holder"). Always works.
  - A document may *declare* the data it expects, hashed as part of the document, e.g.
    `parameters: [{key: stock.name, label: "Stock Holder"}, {key: date, label: "Effective
    Date", type: date}]`. A separate data object, not hashed by Stroc, supplies values. The
    renderer prints a schedule ("Parties and Particulars") and validates the data against the
    declarations.
  - Optionally, inline placeholders such as `<param:stock.name>` render the value (visibly marked)
    or the label if no value is given.

  *Recommended*: declarations + schedule first; inline placeholders in the same stage if they turn
  out cheap (they parse like references). No conditional text. The renderer also accepts arbitrary
  caller-supplied blocks (signatures, tally id, QR codes) that it places but never interprets.
  Is this the shape you want?
- [x] **Q6. References that leave a clause.** Settled: document and its includes only (see Decisions).
- [ ] **Q7. Strictness of the canonical form.** *Recommended*:
  - Unknown fields are rejected. Today they are silently dropped, so a document gets the CID of a
    different, smaller document.
  - Verification hashes what was received; it never normalizes first.
  - In text, only exact `<b>`, `<i>`, `<u>`, `<ref:…>` (and `<param:…>` if adopted) are markup;
    any other `<` is literal text. Entity-encoded tags (`&lt;b&gt;`) are not turned into markup.
- [ ] **Q8. How an included document appears.** *Recommended*: its `title` becomes the section
  heading, its `text` and sections follow, numbered in place; its author, date and language are not
  shown, but its CID is printed in small type (as strdoc's PDF did with the RID).

## Other open questions

- [ ] **Trim [Sereus.md](Sereus.md).** Done so far: removed the app-guidance and "what Sereus provides"
  sections. Further candidates, please decide:
  - Rename it (e.g. `Principles.md`), since it is no longer about Sereus?
  - Instrument declaration (29–32): drop? Taleus decides who signs in its own schema.
  - Templates (18–28): replace with whatever Q5 decides.
  - Markdown (10–17): demote to "later", given Q4?
  - Lineage (33–35), review/diff (39–41), publisher signatures (49): keep as "later" or drop?
- [ ] Delete [FeatureComparison.md](FeatureComparison.md)? The parity checklist below supersedes it.
- [ ] Rewrite [Implementation.md](Implementation.md) and [Vision.md](Vision.md) once the package split
  is settled (both still describe sentence arrays, a server-backed editor, and "Sereus MyCHIPs").
- [ ] Undo/redo and spell-check toggle: strdoc had a spell-check toggle and a stubbed undo. In the
  parity stage or later?

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

- [ ] Vitest in `@stroc/core`, wired to `yarn test`
- [ ] Unit tests for normalization and validation, including malformed input
- [ ] Golden-vector CID tests (after Q2, Q7)
- [ ] Malformed input returns errors instead of throwing (D1)
- [ ] Fix editor XSS (D2)
- [ ] ESLint configured and passing
- [ ] Fix `yarn start` and server paths (D3); commit the regenerated `yarn.lock`; untrack `.DS_Store`

### Stage 1 — Document model

Spec first (per [Workflow.md](Workflow.md)), then code.
- [x] Spec: reference targets (Q1) and reference scope (Q6), spec 0.6
- [ ] Spec: include encoding (Q2), strictness (Q7), include rendering (Q8), parameter declarations (Q5)
- [ ] Validation completeness (D4): reject unknown fields, empty sections, a reference section
      with anything besides `source` and `id`, `source` that is not a CID, malformed or duplicate
      ids, unknown `stroc` version, `published` not an ISO date, `language` not ISO 639-2
- [ ] Replace `as` with `id` in types, normalization, validation, editor and sample documents;
      drop the sibling-title uniqueness and reserved-character rules for titles
- [ ] Markup: normalize and validate `<b>/<i>/<u>` (allowed tags only, balanced, canonical order) (D5)
- [ ] References: parse id paths, validate local targets and targets in included documents (D6)
- [ ] `verifyDocument(bytes, cid)` that hashes exactly what was received
- [ ] YAML and JSON import/export (Q4), in a package separate from core
- [ ] Sample corpus: all 13 MyCHIPs documents converted to the new form, as test fixtures
      (replaces the 3 hand conversions in `contracts/`, which carry stale RIDs and small edits)

### Stage 2 — strdoc parity

Library and composition
- [ ] `stroc build`: folder of drafts → CIDs bottom-up → published set + manifest (Q3).
      Replaces strdoc's `hash` and `refcheck`.
- [ ] Resolver interface: `get(cid)` from an app-supplied source, every fetch verified; folder and
      in-memory implementations
- [ ] Compose: resolve includes into one numbered tree

Rendering
- [ ] Render model independent of any UI framework: numbered tree, references resolved to numbers
- [ ] HTML renderer in legal style: numbered run-in bold titles, hanging indent (as strdoc)
- [ ] PDF renderer (pdfmake), same style; page numbers
- [ ] References display the target's section number

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
- [ ] Open/Save YAML as well as JSON; Save validates and writes the normalized document
- [ ] Validation errors shown at the offending section
- [ ] Build/publish a library from the editor (Q3)

### Stage 3 — Taleus readiness

- [ ] Render-time data (Q5): declarations validated; data checked against declarations; schedule
      rendered; placeholders if adopted
- [ ] Caller-supplied blocks (signatures, identifiers, QR codes) placed by the renderer
- [ ] Bundle: root CID → the document and everything it includes, in one object; verified offline
- [ ] Document and section CIDs printed in rendered output
- [ ] Package split so a reader app takes only what it needs: core (types, normalize, validate,
      CID), io (YAML/JSON), compose (resolver, bundle), render (HTML, PDF), ui, cli. Everything
      below ui runs in browser, Node and React Native / NativeScript.
- [ ] Example tally-style contract written in abstract roles with parameter declarations,
      rendered with sample data

### Later

- [ ] Markdown import/export
- [ ] Structural diff between two documents
- [ ] `replaces` / `translates` lineage
- [ ] IPFS transport adapter (`dag put/get`)
- [ ] Publisher signatures
- [ ] AI drafting guide (prompt bundle that produces valid Stroc source)
- [ ] Outline panel, search, undo/redo

## Known defects

Found or confirmed 2026-10-06. Numbers are referenced from the checklist.

- **D1. Malformed input throws.** `null`, a non-string `title`/`text`, or `sections` as an object
  throw a `TypeError` in normalization; the server returns HTTP 500 with a stack trace.
- **D2. XSS in the editor.** `renderMarkup` ([ui/src/index.ts:798](../packages/ui/src/index.ts))
  escapes `<` and `>` but puts the reference path inside a `title="…"` attribute, so
  `<ref:x" onmouseover="…">` injects an event handler. Core accepts such text and hashes it.
- **D3. `yarn start` fails.** It runs `dist/index.js`; the build writes `dist/src/index.js`, and the
  compiled server resolves `public/` and the UI bundle relative to the wrong directory (index and UI
  return 404). Only `yarn dev` works.
- **D4. Validation is far thinner than the spec.** All of these pass today: empty sections `{}`;
  `source` together with `text`; `source: "hello world"`; duplicate `as` aliases; an alias equal to
  a sibling title; `Foo Bar` beside `foo_bar` (the same normalized path); `stroc: "banana"`;
  `published: "next tuesday"`; `language: "Klingon!!"`. Unknown fields are dropped silently.
- **D5. No markup handling.** `<B class="x">` and `<b>` hash differently; `<script>`, unclosed tags
  pass. `&lt;b&gt;` is decoded into a real `<b>`.
- **D6. No reference validation.** A reference to a missing section passes.
- **D7. Editor depends on the dev server** for validation and CID, and keeps the document in private
  state with no events, so it cannot be embedded or used offline.
- **D8. Save writes the unnormalized document** without validating it.
- **D9. Spec says zero-width characters are stripped**; code keeps U+200B. Decide during Q7 (stripping
  ZWJ/ZWNJ would damage some scripts).

## Running it

```
yarn dev        # builds core and ui, then serves the editor and API on :3000 (PORT overrides)
yarn build      # compiles all packages
```

Editor at `http://localhost:3000`. `POST /cid` and `POST /validate` take a document as JSON.
`yarn start`, `yarn test` and `yarn lint` do not work yet (Stage 0).

## Document references

- [Sereus.md](Sereus.md): principles and the division of responsibility between Stroc and apps
- [Specification.md](Specification.md): the protocol
- [Legacy.md](Legacy.md): strdoc and MyCHIPs, the parity target
- [Vision.md](Vision.md), [Implementation.md](Implementation.md): original goals and plan (dated)
- [FeatureComparison.md](FeatureComparison.md): superseded by this checklist
- [Workflow.md](Workflow.md): change process
