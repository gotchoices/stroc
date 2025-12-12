# Stroc Development Status

## Specification - Complete ✓

All design decisions finalized and documented in [Specification.md](Specification.md):

- [x] **Text structure**: Single paragraph string per section; additional paragraphs as child sections
- [x] **Whitespace handling**: Normalize on input (collapse, trim, entity decode, NFC)
- [x] **Inline markup**: `<b>`, `<i>`, `<u>` tags in text; normalized, lowercase, canonical nesting order; hashed
- [x] **Document identity**: CID external (IPLD DAG-JSON + SHA-256)
- [x] **Removed fields**: `name`, `version`, `host`, internal `cid`/`rid`
- [x] **Field changes**: `author` (optional), `title` (required), `language` (required)
- [x] **Cross-references**: `<ref:Alias/SectionTitle>` syntax; validated at save
- [x] **Multilingual**: Wrapper document pattern
- [x] **Serialization**: IPLD DAG-JSON for IPFS compatibility
- [x] **Unicode normalization**: NFC (Canonical Composition)
- [x] **Control/invisible chars**: Strip (except space/tab/newline and bidi controls)
- [x] **Reserved path chars**: Disallow `/`, `#`, `?`, `%`, `\` in titles/aliases
- [x] **Nested markup**: Allowed; canonical order `<b><i><u>...</u></i></b>`
- [x] **Reference validation**: At save time only; blocks save if invalid

## Implementation Progress

### Phase 1: Core Library ✓
- [x] TypeScript types for Stroc documents and sections
- [x] Text normalization (whitespace, entity decode, control strip, NFC)
- [x] IPLD DAG-JSON canonical serialization
- [x] CID generation (SHA-256 multihash + CIDv1)
- [x] Document validation (required fields, text shape, title uniqueness, path rules)
- [x] Helper: `cidFromDocument` (normalize → validate → encode → CID)

### Phase 2: Server Endpoints ✓
- [x] Express server with static file serving
- [x] `/health` - Server health check
- [x] `/validate` - Normalize + validate document
- [x] `/cid` - Generate CID for valid document
- [x] Lit dependency resolution (import maps for bare specifiers)

### Phase 3: Authoring UI ✓
**Completed:**
- [x] Monorepo scaffold with `@stroc/core`, `@stroc/server`, `@stroc/ui`
- [x] Lit Web Component (full-screen editor with menu bar)
- [x] WYSIWYG view mode with section numbering (1., 1.1., 1.1.1.)
- [x] Click-to-edit per section and document properties
- [x] B/I/U/Ref toolbar - Insert markup at cursor position
- [x] Include by CID - UI to add reference sections with `source`/`as` fields
- [x] Document metadata editing - Title/author/language/published
- [x] Section management - Add/delete/move up/down sections
- [x] Dirty/clean tracking with unsaved changes warning
- [x] File menu with Open/Save/New/Validate & CID
- [x] Drag & drop JSON files to open
- [x] Status bar showing dirty indicator and CID

**To Do (Next Priority):**
- [ ] **Document fetcher API** - Mock implementation using local `contracts/` folder
  - Endpoint: `GET /document/:cid` 
  - Scan `contracts/*.json` at startup, build CID → document cache
  - Verify hash matches on fetch
  - Enable reference section content display and validation
- [ ] **Cross-reference picker** - Dropdown/autocomplete for `<ref:...>` paths
- [ ] **Display included document content** - Fetch and inline `source` CID content in view mode
- [ ] **Outline/navigation panel** - Collapsible sidebar showing document structure

### Phase 4: File I/O ✓
- [x] Open Stroc JSON files
- [x] Save Stroc JSON files
- [x] Basic validation on load
- ❌ Legacy YAML import (rejected - manual conversion sufficient)

### Phase 5: Renderers (Future)
- [ ] **PDF export** - Using pdfmake with section numbering, markup rendering
- [ ] HTML export - Standalone HTML with styles
- [ ] Plain text export - Strip markup, preserve structure

### Phase 6: Integration (Future)
- [ ] **IPFS storage/retrieval** - Extend document fetcher to use `ipfs dag put/get`
  - Replace/augment local mock with IPFS client (`kubo-rpc-client`)
  - Support public IPFS network and private Sereus nodes
  - Cache strategy: local → IPFS → Sereus
- [ ] **Taleus/MyCHIPs tally contract referencing** - How tallies reference Stroc CIDs
- [ ] **Document signing workflow** - Cryptographic signing of documents

## Open Questions

### Integration (Deferred to Phase 6)
1. **Taleus integration**: How do Stroc CIDs get referenced in tallies? (May need Taleus spec review)
2. **IPFS gateway strategy**: Direct connection to IPFS daemon vs. HTTP gateway for browser clients?

## Technology Choices

**Core:**
- Language: TypeScript (ES modules, NodeNext)
- Serialization: IPLD DAG-JSON (`@ipld/dag-json`, `multiformats`)
- Normalization: Unicode NFC, HTML entity decoding (`he`)

**UI:**
- Framework: Lit (Web Components for embeddability)
- Styling: CSS-in-JS (Lit's `css` tag)

**Server:**
- Runtime: Node.js with Express
- Dev: ts-node with ESM support

**Build:**
- Monorepo: Yarn workspaces
- Packages: `@stroc/core`, `@stroc/ui`, `@stroc/server`

## Document References

- [Legacy.md](Legacy.md) - Documentation of original strdoc implementation
- [Specification.md](Specification.md) - Current Stroc specification (WIP)
- [Vision.md](Vision.md) - Project goals and strategy

