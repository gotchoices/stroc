# Stroc Specification

**Status**: Work in Progress  
**Version**: 0.5 (Draft)

Items marked *pending* depend on open questions in [STATUS.md](STATUS.md#blocking-questions).

## Overview

Stroc (Structured Documents) is a protocol for creating legal documents where content determines identity, and presentation is secondary. Documents are identified by their content hash (CID), enabling deterministic referencing in Taleus/MyCHIPs tallies.

## Design Principles

1. **Content is canonical**: The hash is computed from normalized content only
2. **Whitespace is not content**: Spacing variations do not affect document identity
3. **Normalize on input**: Authors write freely; the system normalizes automatically
4. **What you store is what hashes**: No hidden normalization at hash time
5. **CID is external**: The content hash is not stored in the document; it's derived from the content

## Document Structure

### Top-Level Document

```json
{
  "stroc": "1.0",
  "language": "eng",
  "title": "Standard MyCHIPs Tally Contract",
  "author": "MyCHIPs Foundation",
  "published": "2024-01-15",
  "text": "The preamble paragraph. It may contain several sentences.",
  "sections": [
    {"source": "abc123...", "as": "Recitals"},
    {"source": "xyz789...", "as": "Ethics"},
    {"title": "Additional Terms", "text": "...", "sections": [{"text": "A second paragraph, as an untitled child section."}]}
  ]
}
```

The document's CID is computed by hashing the entire document. It is not stored within the document.

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stroc` | string | Yes | Specification version (e.g., "1.0") |
| `language` | string | Yes | ISO 639-2 language code |
| `title` | string | Yes | Human-readable document title |
| `author` | string | No | Attribution (any string, e.g., "MyCHIPs Foundation") |
| `published` | string | No | ISO 8601 date of publication |
| `text` | string | No | One paragraph (see Text Structure) |
| `sections` | array | No | Child sections |

### Removed Fields (from Legacy)

| Field | Reason for Removal |
|-------|-------------------|
| `host` | Replaced by `author`; fetch location handled by CID/IPFS |
| `name` | CID is the identifier; references use `as` alias |
| `version` | CID versions content; no anchor without `name` |
| `cid`/`rid` | Now external, not stored in document |

### Text Structure

Each section stores a **single paragraph string** in `text`. Additional paragraphs are represented as child sections (which may omit `title` if they are simple paragraphs within a parent section). There is no sentence-level storage.

### Section Types

#### Inline Section

Content defined directly within the document:

```json
{
  "title": "Signing Keys",
  "text": "Each Party is in possession of a digital key consisting of a private part and a public part.",
  "sections": [...]
}
```

Subsections may omit `title` if they are simple paragraphs within a parent section.

#### Reference Section

Content included by reference to another document's CID:

```json
{
  "source": "SgMhedRY-zj8MaPJkz_cz8Ajfmcg3JSvEq9vF3SuOss",
  "as": "Ethics"
}
```

| Field | Description |
|-------|-------------|
| `source` | CID of the document to incorporate |
| `as` | Local alias for cross-references within this document |

The included document's content becomes part of the composite document at this position.

### Document Resolution and Verification

When a document includes a reference section with a `source` CID, implementations should:

1. **Fetch** the referenced document by CID
2. **Verify** the fetched content matches the CID (recompute hash and compare)
3. **Cache** verified documents to avoid redundant fetches
4. **Reject** documents that fail verification (hash mismatch)

#### Resolution Strategy

Implementations may attempt resolution from multiple sources in order of preference:

1. **Local cache** - Previously fetched and verified documents
2. **Local storage** - Documents available locally (file system, database)
3. **IPFS network** - Fetch via `ipfs dag get <cid>` from public or private nodes
4. **Sereus nodes** - Fetch from trusted Sereus Fabric nodes

#### API Endpoint (Reference Implementation)

```
GET /document/:cid
→ 200 OK with document JSON if found and verified
→ 404 Not Found if document cannot be located
→ 500 Internal Server Error if hash verification fails
```

**Response format:**
```json
{
  "cid": "baguqeera...",
  "document": { /* Stroc document */ },
  "verified": true,
  "source": "cache|local|ipfs|sereus"
}
```

#### Reference Validation

When saving a document:
- Validate that all `<ref:...>` paths resolve to valid sections within the document or its included documents
- For local `<ref:./SectionTitle>` references, verify the section exists in the current document
- For external `<ref:Alias/SectionTitle>` references, fetch the aliased document and verify the path exists
- Block save if any reference is invalid

This ensures all cross-references are valid at the time of document creation, and remain valid due to content-addressability (CIDs are immutable).

---

## Multilingual Documents

To include multiple language versions of a contract, create a **wrapper document**:

```json
{
  "stroc": "1.0",
  "language": "eng",
  "title": "Tally Agreement (Multilingual)",
  "author": "MyCHIPs Foundation",
  "text": "This Agreement is presented in English and French. In case of any conflict between versions, the English version shall govern.",
  "sections": [
    {"source": "abc123...", "as": "English"},
    {"source": "xyz789...", "as": "French"}
  ]
}
```

**Benefits**:
- Tally references ONE CID (the wrapper)
- Both translations are included by reference
- Governing language clause is explicit content, part of the hash
- Each translation is a standalone single-language document

---

## Normalization Rules

### Text Normalization

When text is input, the following normalization rules are applied:

1. **Whitespace collapse**: Multiple spaces, tabs, and newlines become a single space
2. **Trim**: Leading and trailing whitespace is removed from text
3. **Empty text removal**: Empty text is stripped
4. **Invisible/control stripping**: Remove zero-width and control characters (except standard space, tab, newline **and bidi controls** like LRM/RLM/LRE/RLE/PDF/LRI/RLI/FSI/PDI) before hashing
5. **Entity decoding**: Decode HTML entities in text; store literal characters (no `&amp;`, `&nbsp;`, etc.)

### Paragraphs, Not Sentences

- Each section has a single `text` paragraph (string). Additional paragraphs are child sections (which may omit `title`).
- Sentences are not stored separately. Tools may split a paragraph into sentences for display or diffing, but that never affects the hash.
- Consumers never split; they only serialize the stored structure for CID verification.

---

## Authoring Interface

### Display Modes

**WYSIWYG Mode (Default)**:
Document renders as finished prose. Author sees the document as it would appear to readers.

**Structure Mode (Click to Edit)**:
Clicking on content reveals the underlying structure:
- The section’s paragraph text is editable
- Section hierarchy exposed

### Text Input Behavior

1. Author types freely
2. On save/blur, text is normalized (whitespace, entities, controls)
3. Confirmed structure is stored

### Drag and Drop

The editor supports drag-and-drop reorganization:

| Operation | Trigger |
|-----------|---------|
| **Move before** | Drag to upper half of target |
| **Move after** | Drag to lower half of target |
| **Move as child** | Drag to right (indent) |
| **Copy** (instead of move) | Hold Shift while dragging |
| **Delete** | Drag to document header/trash area |

Drag and drop works for:
- Paragraphs (as child sections)
- Sections within the document hierarchy
- Cross-level moves (e.g., promote a subsection)

---

## Content ID (CID) Generation

### Principle

The CID is **external** to the document. It is computed by hashing the document content, but it is not stored within the document itself.

Stroc uses **IPLD DAG-JSON** encoding for IPFS compatibility. CIDs are standard IPFS Content Identifiers.

### Algorithm

1. Take the complete document object
2. Normalize Unicode to NFC (Canonical Composition)
3. Encode using IPLD DAG-JSON (canonical, deterministic)
4. Compute SHA-256 multihash
5. Create CIDv1 with DAG-JSON codec

### Libraries

```javascript
const { CID } = require('multiformats/cid');
const { sha256 } = require('multiformats/hashes/sha2');
const dagJson = require('@ipld/dag-json');
```

### Canonical Serialization (DAG-JSON)

DAG-JSON provides deterministic encoding:
- Keys sorted alphabetically (lexicographic) at all levels
- No extraneous whitespace
- Arrays maintain order
- Undefined fields are omitted
- Special encoding for CID links: `{"/": "baguqeera..."}` (whether `source` uses this form is *pending*)
- Non-finite numbers (`NaN`, `Infinity`, `-Infinity`) are not allowed
- Dates/times must be strings (e.g., ISO 8601), not native Date objects
- Object keys must be unique; no functions/symbols; no cycles (pure DAG)
- Special encoding for bytes: `{"/": {"bytes": "base64..."}}`

### Example

```javascript
const { CID } = require('multiformats/cid');
const { sha256 } = require('multiformats/hashes/sha2');
const dagJson = require('@ipld/dag-json');

const document = {
  language: "eng",
  stroc: "1.0",
  text: "This is a sentence.",
  title: "Example Document"
}

// Encode to canonical DAG-JSON bytes
const bytes = dagJson.encode(document);

// Hash with SHA-256
const hash = await sha256.digest(bytes);

// Create CIDv1 with DAG-JSON codec
const cid = CID.create(1, dagJson.code, hash);

console.log(cid.toString());
// "baguqeerahghdaba3xpdeymhpbrztpwst7ioctsjdoqxoos7hb2lae7jy7xpq"
```

### CID Format

Stroc CIDs are standard IPFS CIDv1:
- Version: 1
- Codec: DAG-JSON (0x0129)
- Hash: SHA-256 (0x12)
- Encoding: base32 lowercase (multibase prefix `b`)

Because the codec is DAG-JSON, every Stroc CID begins `baguqeera`. (`bafy…` is the prefix for DAG-PB and DAG-CBOR CIDs; a value starting that way is not a Stroc CID.)

Example (the document above): `baguqeerahghdaba3xpdeymhpbrztpwst7ioctsjdoqxoos7hb2lae7jy7xpq`

### Verification

To verify a document:
1. Receive document content and claimed CID
2. Parse the CID to extract codec and hash algorithm
3. Encode document using DAG-JSON
4. Compute hash using the specified algorithm
5. Compare computed CID to claimed CID

### IPFS Compatibility

Documents can be stored and retrieved directly via IPFS:
- `ipfs dag put` to store
- `ipfs dag get <cid>` to retrieve
- Works with public IPFS network or private Sereus nodes

---

## Inline Markup

### Principle

Inline emphasis (bold, italic, underline) within **paragraph text** is legally meaningful and part of the content hash. Styling of **structural elements** (titles, headers, section numbers) is presentational and determined by the renderer.

### Allowed Tags

| Tag | Meaning | Context |
|-----|---------|---------|
| `<b>...</b>` | Bold emphasis | Paragraph text only |
| `<i>...</i>` | Italic emphasis | Paragraph text only |
| `<u>...</u>` | Underline emphasis | Paragraph text only |

No other HTML or markup is allowed in content.

### Normalization and Nesting

- Tags are limited to `<b>`, `<i>`, `<u>` (lowercase).
- Attributes are not allowed; any attributes are stripped on save.
- Nested emphasis is allowed; tags are normalized to lowercase on save.
- Canonical nesting order when co-wrapping the same span: `<b><i><u>...text...</u></i></b>`.
- The stored, normalized markup is hashed (emphasis is legally meaningful).

### Storage Model

Inline markup is stored within paragraph strings and included in the hash:

```json
{
  "stroc": "1.0",
  "language": "eng",
  "title": "Tally Agreement",
  "text": "The <b>Stock Holder</b> must <i>not</i> transfer the asset.",
  "sections": [
    {
      "title": "Ethics",
      "text": "All parties agree to act in <b>good faith</b>."
    }
  ]
}
```

### What Is and Isn't Hashed

| Element | Hashed? | Notes |
|---------|---------|-------|
| Paragraph text (including `<b>`, `<i>`, `<u>` tags) | ✓ | Emphasis is legally meaningful |
| `title` field content | ✓ | The text of the title |
| Title styling (bold, size) | ✗ | Renderer decides presentation |
| Section number formatting | ✗ | Renderer decides presentation |
| Header styling | ✗ | Renderer decides presentation |

### Authoring Experience

1. Author highlights text and clicks Bold/Italic/Underline
2. Markup tags are inserted into the paragraph text
3. UI renders the formatting for WYSIWYG editing
4. The markup is part of the document and affects the hash

---

## Cross-References

### Reference Syntax

Cross-references use the `<ref:...>` tag within paragraph text:

```json
"See <ref:Ethics/Competency> for requirements."
```

*Pending*: reference targets may change from title paths to section ids (STATUS Q1), and references may be restricted to the document and what it includes (Q6).

### Reference Paths

References use the `as` alias (for included documents) or `title` (for inline sections):

```
<ref:Ethics>                    → "Section 3" (included doc with as="Ethics")
<ref:Ethics/Competency>         → "Section 3.1" (subsection titled "Competency")
<ref:./Additional Terms>        → Local section in current document
```

### Path Normalization and Uniqueness

- Section titles must be unique among siblings (save is blocked otherwise).
- Path components are normalized before hashing:
  - Trim leading/trailing whitespace
  - Collapse internal whitespace to a single space
  - Lowercase
  - Replace spaces with underscores
  - Disallow reserved characters: `/`, `#`, `?`, `%`, `\`, and control characters
- Stored references use the normalized form.
- Included documents must also satisfy the uniqueness rule; inclusion fails if they do not.

### Resolution

- References are resolved at **render time**
- The reference path (e.g., `<ref:Ethics/Competency>`) is part of the hash
- The rendered text ("Section 3.1") is computed based on document structure
- References to included documents are stable because included docs are immutable (identified by CID)

### Validation

References are validated at **save time**:
- Invalid references block save (not just publish)
- Included documents are CID-addressed and immutable, so a valid reference stays valid
- Local references (`<ref:./Section>`) are checked against current document structure
- Renaming a section changes the document content and therefore its CID; references to the old CID remain valid, but to use the renamed section you must include the new CID
- No separate publish-time validation needed

---

## Open Questions

Tracked in [STATUS.md](STATUS.md#blocking-questions).

## Resolved Questions

1. **Sentence detection**: Not part of the format. Paragraphs are stored whole; tools may segment for display or diffing (see [SentenceSplitting.md](SentenceSplitting.md))

2. **Whitespace handling**: Normalize on input, store normalized form only

3. **Text structure**: One paragraph string per section; further paragraphs are untitled child sections

4. **Empty paragraphs**: Strip during normalization; they do not appear in stored documents

5. **Unicode normalization**: NFC (Canonical Composition) before hashing

6. **Drag/drop support**: Yes, for sections (including untitled paragraph sections); move, copy, delete, cross-level moves

7. **Markup/styling**: Inline markup (`<b>`, `<i>`, `<u>`) in paragraph text is part of content and hashed. Structural element styling (titles, headers) is renderer-determined.

8. **Document identity fields**: Removed `name`, `version`, `host`. Added `author` (optional). CID is external.

9. **Cross-references**: Use `as` alias for included documents, `title` for inline sections. Reference paths are hashed; rendered numbers are computed at render time.

10. **Multilingual documents**: Use a wrapper document that includes multiple language versions by reference, with explicit governing language clause.

11. **Serialization**: Use IPLD DAG-JSON for IPFS compatibility from the start. CIDs will be standard IPFS CIDs.

12. **Reference validation**: Validate at save time only. Invalid references block save. No publish-time check needed because CID-addressed documents are immutable.

13. **Reference paths and titles**: Section titles must be unique among siblings; reference paths are normalized (trim, collapse spaces, lowercase, spaces→underscores, no `/`). Renaming a section changes the document (new CID); references to the old CID remain valid, new names require including the new CID.

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | Draft | Initial structure and text model |
| 0.2 | Draft | Removed `name`, `version`, `host`; added `author`; CID now external; added multilingual wrapper pattern; defined cross-reference syntax |
| 0.3 | Draft | Empty paragraph stripping; `Intl.Segmenter` for sentence detection; NFC Unicode normalization; serialization details |
| 0.4 | Draft | IPLD DAG-JSON for IPFS-compatible CIDs; updated CID generation algorithm |
| 0.5 | 2026-10-06 | Prose aligned with the one-paragraph-string model (no sentence arrays); CID prefix corrected to `baguqeera`; removed the nested-markup open question (already settled under Inline Markup); pending items marked |
