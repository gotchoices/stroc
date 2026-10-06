# Stroc vs. Legacy strdoc Feature Comparison

> **Superseded (2026-10-06).** Several "Implemented" claims here are wrong, and several rejections (drag and drop, YAML, hash tooling) are now parity goals. The current checklist is [STATUS.md](STATUS.md); strdoc capabilities are listed in [Legacy.md](Legacy.md).


## Legend
- ✅ **Adopt** - Keep as-is or with minor improvements
- ❌ **Reject** - Not needed or conflicts with new design
- 🔄 **Modify** - Implement differently based on new requirements
- 🚀 **Surpass** - Improve upon the legacy approach

---

## Core Document Features

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Nested sections** | ✓ Recursive | ✓ Recursive | ✅ **Adopt** | Same hierarchical structure |
| **Section numbering** | ✓ Auto (1., 1.1., etc.) | ✓ Auto | ✅ **Adopt** | Implemented |
| **Single paragraph per section** | ✓ String | ✓ String | ✅ **Adopt** | Matches spec |
| **Reference sections (include by CID)** | ✓ `name`/`source` | ✓ `as`/`source` | 🔄 **Modify** | CID-based, alias for refs |
| **Content hashing** | ✓ SHA-256 + base64url | ✓ SHA-256 + CIDv1 | 🔄 **Modify** | IPFS-compatible |
| **Deterministic serialization** | ✓ json-stable-stringify | ✓ IPLD DAG-JSON | 🚀 **Surpass** | IPFS native |

---

## Editor UI Features

### View/Edit Modes

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **WYSIWYG preview mode** | ✓ Toggle per section | ✓ Click-to-edit | ✅ **Adopt** | Implemented |
| **Edit mode with inputs** | ✓ Toggle reveals fields | ✓ Click reveals fields | ✅ **Adopt** | Implemented |
| **Global edit toggle** | ✓ Top-level switch | ❌ None | ❌ **Reject** | Per-section is cleaner |
| **Inline editing** | ❌ Always form fields | ✓ Natural click | 🚀 **Surpass** | Better UX |

### Text Editing

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Bold markup** | ✓ `<b>` tags | ✓ `<b>` via button | ✅ **Adopt** | Implemented |
| **Italic markup** | ✓ `<i>` tags | ✓ `<i>` via button | ✅ **Adopt** | Implemented |
| **Underline markup** | ✓ `<u>` tags | ✓ `<u>` via button | ✅ **Adopt** | Implemented |
| **Markup toolbar** | ✓ Buttons above text | ✓ Buttons above textarea | ✅ **Adopt** | Implemented |
| **Insert at cursor** | ✓ | ✓ | ✅ **Adopt** | Implemented |
| **Wrap selection** | ✓ | ✓ | ✅ **Adopt** | Implemented |
| **Rich text editor** | ❌ Plain textarea | ❌ Plain textarea | ✅ **Adopt** | Keeps source clean |

### Cross-References

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Reference syntax** | `<x-r name="...">` | `<ref:Path/To/Section>` | 🔄 **Modify** | Path-based, more explicit |
| **Custom element** | ✓ `<x-r>` web component | ❌ | ❌ **Reject** | Just use `<ref:...>` in text |
| **Ref insertion UI** | ✓ Button/dialog | ✓ Button inserts `<ref:` | ✅ **Adopt** | Implemented (basic) |
| **Ref validation** | ✓ On save | ✓ On save | ✅ **Adopt** | Implemented in core |
| **Ref picker/autocomplete** | ❌ Manual typing | ⏳ **TODO** | 🚀 **Surpass** | Future: dropdown of available sections |
| **Visual ref indicators** | ✓ Styled in preview | ✓ Styled (blue, →) | ✅ **Adopt** | Implemented |

### Section Management

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Add section** | ✓ Button | ✓ Button | ✅ **Adopt** | Implemented |
| **Add subsection** | ✓ Button in section | ✓ Button in edit mode | ✅ **Adopt** | Implemented |
| **Delete section** | ✓ Button | ✓ Button in edit mode | ✅ **Adopt** | Implemented |
| **Move section up** | ❌ Drag only | ✓ Button | 🚀 **Surpass** | More accessible |
| **Move section down** | ❌ Drag only | ✓ Button | 🚀 **Surpass** | More accessible |

### Drag and Drop

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Drag to reorder** | ✓ Full HTML5 DnD | ❌ Not yet | ⏳ **TODO** | Move up/down sufficient for now |
| **Drag to move before** | ✓ Drop zone | ❌ | ⏳ **TODO** | Future enhancement |
| **Drag to move after** | ✓ Drop zone | ❌ | ⏳ **TODO** | Future enhancement |
| **Drag to nest (child)** | ✓ Drop zone + indent | ❌ | ⏳ **TODO** | Future enhancement |
| **Drag to copy (Shift)** | ✓ Hold Shift | ❌ | ⏳ **TODO** | Low priority |
| **Drag to delete (trash)** | ✓ Drop on header | ❌ | ❌ **Reject** | Delete button is clearer |
| **Visual drag feedback** | ✓ Custom cursors | ❌ | ⏳ **TODO** | If we add DnD |
| **Cross-level moves** | ✓ | ❌ | ⏳ **TODO** | Move up/down works for now |

**Decision on Drag/Drop:** Move up/down buttons provide 80% of the value with 20% of the complexity. Full DnD is a nice-to-have for later.

### Document Metadata

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Title** | ✓ Required | ✓ Required | ✅ **Adopt** | Implemented |
| **Author** | ❌ (used `host`) | ✓ Optional | 🔄 **Modify** | Implemented |
| **Language** | ✓ ISO code | ✓ ISO 639-2 | ✅ **Adopt** | Implemented |
| **Published date** | ✓ ISO 8601 | ✓ ISO 8601 | ✅ **Adopt** | Implemented |
| **Host/name/version** | ✓ | ❌ Removed | ❌ **Reject** | CID is the identifier |
| **Click title to edit** | ❌ Always visible | ✓ Click to reveal | 🚀 **Surpass** | Cleaner UI |

### Import/Export

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Open JSON** | ✓ | ✓ | ✅ **Adopt** | Implemented |
| **Save JSON** | ✓ | ✓ | ✅ **Adopt** | Implemented |
| **Import YAML** | ✓ | ❌ | ❌ **Reject** | Manual conversion sufficient |
| **Export YAML** | ✓ | ❌ | ❌ **Reject** | JSON is canonical format |
| **Export PDF** | ✓ (pdfmake) | ⏳ **TODO** | ✅ **Adopt** | Phase 5 priority |
| **Export HTML** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | Simple renderer |
| **File picker** | ✓ Browser API | ✓ | ✅ **Adopt** | Implemented |
| **Drag-drop file** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | Nice enhancement |

---

## Display/Rendering Features

### Outline/Navigation

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Outline panel** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | Separate collapsible panel |
| **Jump to section** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | Click outline to scroll |
| **Expand/collapse sections** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | For long documents |
| **Search within document** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | Future enhancement |

### Styling

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Section number styling** | ✓ Gray, bold | ✓ Gray, bold | ✅ **Adopt** | Implemented |
| **Title styling** | ✓ Bold, larger | ✓ Bold, larger | ✅ **Adopt** | Implemented |
| **Nested indentation** | ✓ Visual offset | ✓ Margin-left | ✅ **Adopt** | Implemented |
| **Edit mode highlighting** | ✓ Border/background | ✓ Blue border | ✅ **Adopt** | Implemented |
| **Reference section styling** | ❌ | ✓ Yellow background | 🚀 **Surpass** | Visual distinction |
| **Hover effects** | ✓ | ✓ | ✅ **Adopt** | Implemented |

---

## Backend/Server Features

### Validation

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Required fields** | ✓ | ✓ | ✅ **Adopt** | Implemented |
| **Reference resolution** | ✓ refcheck script | ✓ On save | 🔄 **Modify** | Integrated in editor |
| **Title uniqueness** | ❌ | ✓ Siblings | 🚀 **Surpass** | Prevents ambiguous refs |
| **Path character rules** | ❌ | ✓ Enforced | 🚀 **Surpass** | `/`, `#`, `?`, etc. blocked |
| **Markup validation** | ❌ | ✓ Canonical form | 🚀 **Surpass** | Normalize `<b><i><u>` order |

### Hash Generation

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Hash script** | ✓ `./hash` CLI | ❌ | ❌ **Reject** | API endpoint instead |
| **Endpoint /cid** | ❌ | ✓ | 🚀 **Surpass** | RESTful |
| **Endpoint /validate** | ❌ | ✓ | 🚀 **Surpass** | RESTful |
| **Exclude hash from hash** | ✓ `rid` field removed | ✓ CID external | ✅ **Adopt** | Cleaner |

### Storage/Retrieval

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Database storage** | ✓ PostgreSQL | ⏳ **TODO** | 🔄 **Modify** | Future: IPFS + optional DB |
| **File storage (YAML)** | ✓ | ⏳ **TODO** | ✅ **Adopt** | Import/export |
| **IPFS storage** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | `ipfs dag put` |
| **IPFS retrieval** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | `ipfs dag get` |
| **Fetch by CID** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | For included docs |

---

## PDF/Export Features

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **PDF generation** | ✓ pdfmake | ⏳ **TODO** | ✅ **Adopt** | Phase 5 |
| **Recursive sections** | ✓ | ⏳ **TODO** | ✅ **Adopt** | Phase 5 |
| **Tally metadata** | ✓ Signatures/QR | ⏳ **TODO** | ✅ **Adopt** | Phase 6 (MyCHIPs) |
| **Custom fonts** | ✓ Courier/Helvetica/Times | ⏳ **TODO** | ✅ **Adopt** | Phase 5 |
| **Styles (header/par/subpar)** | ✓ | ⏳ **TODO** | ✅ **Adopt** | Phase 5 |
| **HTML export** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | Simple renderer |
| **Markdown export** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | For GitHub/docs |

---

## Advanced Features (Future)

| Feature | Legacy | New Stroc | Status | Notes |
|---------|--------|-----------|--------|-------|
| **Version history** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | CIDs enable this naturally |
| **Diff view** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | Compare two CIDs |
| **Collaborative editing** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | Operational transforms? |
| **Comments/annotations** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | Non-content metadata |
| **Signing workflow** | ✓ MyCHIPs-specific | ⏳ **TODO** | 🔄 **Modify** | Phase 6 |
| **Multi-language UI** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | i18n for editor UI |
| **Accessibility** | ⚠️ Partial | ⏳ **TODO** | 🚀 **Surpass** | ARIA labels, keyboard nav |
| **Undo/redo** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | Command pattern |
| **Templates** | ❌ | ⏳ **TODO** | 🚀 **Surpass** | Starter documents |

---

## Summary

### ✅ Implemented (Ready Now)
- WYSIWYG view with click-to-edit
- Section numbering (1., 1.1., etc.)
- B/I/U markup insertion with proper rendering
- Cross-reference insertion (basic)
- Add/delete/move sections (up/down buttons)
- Include by CID with visual distinction
- Metadata editing (title/author/language/published)
- Validation and CID generation
- Reference sections with special styling
- **Open/Save Stroc JSON files**

### ⏳ High Priority TODO
1. **PDF export** - Using pdfmake with proper formatting
2. **Ref picker** - Dropdown to select sections for `<ref:...>`
3. **Outline panel** - Collapsible navigation sidebar
4. **Fetch included docs** - Load and display `source` CID content
5. **HTML export** - Standalone HTML with embedded styles

### 🔄 Medium Priority
6. **HTML/PDF export** - Renderers for different formats
7. **IPFS integration** - `ipfs dag put/get`
8. **Expand/collapse sections** - For long documents
9. **Search** - Find text within document

### 🚀 Low Priority / Future
10. **Version diff** - Compare two document CIDs
11. **Undo/redo** - Command history
12. **Templates** - Starter documents
13. **Collaborative editing** - Real-time multi-user
14. **Accessibility improvements** - Full ARIA, keyboard nav
15. **Drag-drop file import** - UX enhancement

---

## Decisions Made

### ✅ Keep from Legacy
- WYSIWYG with click-to-edit per section
- Section numbering and nesting
- B/I/U markup with toolbar
- Single paragraph string per section
- Cross-references (improved syntax)
- Include by CID (improved field names)

### ❌ Drop from Legacy
- Global edit toggle (per-section is better)
- `host`/`name`/`version` fields (CID replaces them)
- `<x-r>` custom element (use `<ref:...>` text)
- Drag-to-delete (delete button is clearer)
- Drag-to-copy (low value)
- **Legacy YAML import** (manual conversion sufficient)
- **YAML export** (JSON is canonical format)

### 🚀 Improvements Over Legacy
- IPFS-compatible CIDs (not just SHA-256)
- Path-based cross-references (not just name lookup)
- Move up/down buttons (more accessible than drag-only)
- Click title to edit metadata (cleaner default view)
- Reference section visual distinction
- Title uniqueness enforcement
- Path character validation
- Canonical markup normalization
- RESTful API (not CLI scripts)

