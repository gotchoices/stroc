# Stroc Editor

**Status**: Working, 2026-10-07

The browser-based editor authors use to create and revise Stroc documents. The document format is
in [Specification.md](Specification.md); this file covers how the editor behaves. Readers of
documents (for example Taleus users) never need the editor.

## Platform

- **Lit web component** (`<stroc-editor>`, package `@stroc/ui`), embeddable in any page or
  framework and usable on its own. `stroc serve --editor` hosts it at `/editor/`.
- **Runs entirely in the browser**: bundled (esbuild) with `@stroc/core`, `@stroc/compose` and
  `@stroc/yaml`. It validates, computes CIDs, and fetches and verifies included documents itself.
- **Modules**: `editor.ts` (the component), `paragraph.ts` (in-place paragraph editing),
  `model.ts` (the document model and structure operations, unit-tested without a browser),
  `includes.ts`, `sources.ts`, `styles.ts`.
- **Renders into the page's DOM**, not a shadow root: Safari does not expose the text selection
  inside shadow roots, and in-place editing depends on it. Its styles are nested under
  `stroc-editor` (CSS nesting), so they do not affect the host page.
- **Tests**: unit tests for the model (`yarn test`), and end-to-end tests with Playwright that drive
  the real editor in Chromium, WebKit (Safari's engine) and Firefox with real keyboard and mouse
  input (`yarn test:e2e`; it builds and starts its own server on port 3990).

## Scope

One document at a time: open, edit, validate, save, show its CID. It reads the documents a file
includes (to show them in place and resolve references into them) but does not track revisions or
update other files; library housekeeping belongs to the folder tools (`stroc lint`, `status`,
`update`, `publish`).

## Opening and saving

- **New**, **Open File…** (⌘O; YAML or JSON), **Open from Sources…** (a list of every document in
  the sources' catalogs, or a CID), and dropping a file on the page.
- **Save** (⌘S) writes back to the opened file where the browser allows (File System Access, in
  Chromium browsers); otherwise it downloads. **Save As…** (⇧⌘S) and **Save As JSON…**.
- Saved files are canonical: YAML in the standard layout (one sentence per line), or JSON. What is
  saved is exactly what is hashed.
- An unfinished document can be saved; the editor reports how many problems it still has.
- `?cid=<cid>` in the editor's address opens that document from the sources.

## Sources

An ordered list of servers (`stroc serve`, static hosts, IPFS gateways), edited under File →
Sources and remembered by the browser. It starts as the server hosting the editor. Documents are
fetched by CID from the first source that has them, and always verified. Several folders can be
served at once (`stroc serve a --port 3001`, `stroc serve b --port 3002`) and added as sources to
one editor (`stroc serve --editor` with no folder hosts only the editor).

## Editing

The document is edited in its rendered form.

- **Text**: click any paragraph and type. **Enter** splits the paragraph into a new section after
  it; **Backspace** at the start of a paragraph joins it to the one before (the first section joins
  back into the preamble).
- **Paste**: bold, italic and underline are kept from formatted text (word processors, web pages);
  everything else is dropped. Several pasted paragraphs become several paragraph sections: the first
  joins the text before the caret, the last the text after it. Plain text splits at line breaks.
- **Formatting**: bold, italic, underline from the toolbar or ⌘B / ⌘I / ⌘U. Whatever the browser
  produces is written back as canonical Stroc markup.
- **Titles**: the document title at the top; a section's title is added or removed from its
  toolbar.
- **The section toolbar** (shown for the section being edited): move up/down, outdent/indent, add or
  remove the title, add a paragraph after or a subsection inside, delete, and the section's **id**
  (with a suggestion from the title). Renaming an id updates every reference to it.
- **Moving sections**:

  | Operation | How |
  |-----------|-----|
  | Indent under the section above / outdent | Tab / Shift+Tab, or the toolbar |
  | Move up / down | Alt+Shift+↑ / ↓, or the toolbar |
  | Move before / after / into a section | Drag by the ⋮⋮ grip onto the upper third / lower third / middle |
  | Copy instead of move | Hold Shift or Alt while dropping (copies get no ids) |
  | Delete | Toolbar (asks first) |

- **Document properties** (Edit → Document Properties, or Properties… under the title): title,
  author (a domain, which is verifiable, or a name), language, published date, **parameters**
  (key, label, optional default) and **replaces** (CIDs of earlier versions).

## Undo

**Undo** (⌘Z) and **Redo** (⇧⌘Z, or Ctrl+Y) cover every change to the document, also in the Edit
menu. A burst of typing in one paragraph or title is one step; each structural change is its own.

## References

Insert a reference with **Reference…** on the toolbar, Insert → Reference, or **⌘K**: a list of every
section of the document and of its included documents (those with ids), with live numbers and a
filter. Picking a section of this document that has no id gives it one from its title. References
always show the target's current number ("Section 3.1"); one that does not resolve is underlined in
red.

## Placeholders

**Parameter…** (toolbar or Insert menu) inserts a placeholder at the caret: pick one of the
document's parameters, or declare a new one by its label (the key is derived from it). Placeholders
show as chips with the parameter's label (`⟨Weekly Rent⟩`); one naming an undeclared parameter is
red. Changing a parameter's key under Properties updates its placeholders.

## Included documents

Insert → Included Document lists the documents in the sources' catalogs (or takes a CID) and asks
for the include's id. Each include is fetched, verified and composed with everything it includes,
and shown in place, read-only and numbered. Its header shows:
- its title and the include's id;
- **Verified**, **Not found in any source** or **Failed verification**;
- which source served it;
- its author: a name (not verifiable), or a domain with the result of checking that domain's catalog;
- what the serving source's catalog says about it (role and status; superseded or withdrawn
  highlighted), and the number of problems inside it;
- **Open** and **Open in new tab**.

**Write out a copy** (on the include's toolbar) replaces the include with an editable copy of its
text, no longer linked by CID.

## Validation

Validation runs as you type. The status bar shows **Valid** and the CID (with Copy), or the number
of problems; each problem is shown at the section it concerns, and document-level problems under
the title. References into included documents are checked against the composed includes.

## PDF

**File → Export PDF** (Letter or A4) composes the document with everything it includes (fetched from
the sources), lays it out in the legal style as a template (deal-specific values left blank), with a
QR code for fetching the document, and downloads it. The document must be valid, since the PDF shows
its CID. pdfmake and the embedded fonts are loaded only when first needed, from `vendor/` beside the
editor bundle (copied there by the build), and pdfmake may fetch nothing but those fonts.

## View

- **Preview** (View menu or ⌘E): the document as readers see it, with no editing controls.
- **Spell check**: the browser's own, on by default, toggled in the View menu.

## Not yet

- Turning written-out text into an include (it must first be published as its own document).
- Embedding API for host pages: a public `doc` property exists; change and save events, and a
  host-supplied resolver, are still to define.
