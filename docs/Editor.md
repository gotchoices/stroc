# Stroc Editor

**Status**: Draft, 2026-10-06

The browser-based editor authors use to create and revise Stroc documents. The document format is
in [Specification.md](Specification.md); this file covers how the editor behaves. Readers of
documents (for example Taleus users) never need the editor.

## Platform

- **Lit web component** (`<stroc-editor>`, package `@stroc/ui`), so it can be embedded in any page
  or framework (plain HTML, Vue, Svelte, React), and used on its own as a standalone page.
- **Runs entirely in the browser.** Validation, linting and CIDs come from `@stroc/core`; no server
  is needed. The development server only hosts the page.
- **Rewritten** in Stage 2 as a set of small components, replacing the current single-file
  prototype. Until then the prototype receives only safety fixes.

## Scope

The editor handles **one document at a time**: open, edit, validate, save, and show its CID. It
reads the documents a file includes (to show them in place and check references into them), but it
does not track revisions or update other files. Library housekeeping belongs to the folder tools
(`stroc lint`, `status`, `update`, `publish`); see [STATUS.md](STATUS.md).

## Files

- Opens and saves YAML (the standard format) and JSON.
- Save validates first and writes the canonical document; what is saved is exactly what is hashed.
- Pasted HTML has entities decoded and markup reduced to Stroc's tokens before it reaches the
  document.

## Display and editing

The legacy strdoc editor is the baseline; see [Legacy.md](Legacy.md) for what it did.

- **Rendered view by default**, in the same legal layout as the renderer
  ([Rendering.md](Rendering.md)), with live section numbers.
- **Edit in place**: click into a paragraph and type in the rendered view. Pressing Enter splits
  the paragraph into a new sibling section.
- **Structure details on demand**: a section's id, title and (for an include) its source are
  editable in a panel when the section is selected.
- **Edit-all / preview-all** toggle.
- **Emphasis**: bold, italic and underline buttons and shortcuts; the editor maintains the
  canonical spelling (nesting order, no empty or adjacent duplicate spans).
- **References**: insert by picking the target section; the editor proposes an id from the target's
  title and shows the live number. Renaming an id updates references within the document.
- **Includes**: shown in place, read-only, via a resolver; a section can be converted between
  written-out and included.
- **Validation errors** are shown at the offending section, as you type where possible.
- **Spell check**: the browser's own, with a toggle.
- **Undo/redo**: later.

## Moving sections

| Operation | Trigger |
|-----------|---------|
| **Move before** | Drag to upper half of target |
| **Move after** | Drag to lower half of target |
| **Move as child** | Drag to the right (indent) |
| **Copy** instead of move | Hold Shift while dragging |
| **Indent / outdent** | Toolbar buttons and keyboard shortcuts |
| **Move up / down** | Toolbar buttons and keyboard shortcuts |
| **Delete** | Delete button (with undo once undo exists) |

Drag and drop works for titled sections and untitled paragraphs alike, across levels.

## Embedding

- Public `doc` property and a `readonly` mode.
- Events for change and save, so a host page can store documents its own way.
- A host can supply a resolver for included documents.
