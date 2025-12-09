# Stroc Development Status

## Completed Decisions

- [x] **Text structure**: Array of paragraphs, each an array of sentences
- [x] **Whitespace handling**: Normalize on input, store normalized form only
- [x] **Empty paragraphs**: Strip/eliminate during normalization
- [x] **Sentence detection**: Rule-based with author override in UI
- [x] **Inline markup**: `<b>`, `<i>`, `<u>` in sentence text is content (hashed); structural styling is renderer-determined
- [x] **Document identity**: CID is external (not stored in document)
- [x] **Removed fields**: `name`, `version`, `host`, internal `cid`/`rid`
- [x] **New/changed fields**: `author` (optional, replaces `host`), `title` (required at top level)
- [x] **Cross-references**: Use `<ref:path>` syntax; paths use `as` alias for included docs, `title` for inline sections
- [x] **Multilingual documents**: Wrapper document pattern (includes multiple language versions by CID reference)
- [x] **Drag and drop**: Support for sections, paragraphs, sentences; move, copy, delete, cross-level moves

## In Progress / To Research

- [ ] **Serialization library**: Need deterministic JSON serialization
  - Legacy used `json-stable-stringify` (npm)
  - Consider IPLD DAG-JSON for IPFS compatibility
  - Must define: key ordering, Unicode handling, number representation

- [ ] **Unicode normalization**: Decide NFC vs NFD before hashing
  - Recommendation: NFC (composed form) - more common, smaller byte size

- [x] **Sentence boundary detection library**: Research locale-aware options
  - Primary: `Intl.Segmenter` (native API, Node.js 16+, modern browsers)
  - Fallback: `@echogarden/text-segmentation` (multilingual support)
  - Edge cases: Author override in UI

- [x] **Abbreviation handling**: Decided approach
  - Rely on `Intl.Segmenter` locale rules (Option A)
  - Author override handles edge cases (no hard-coded lists needed)

## Implementation Tasks

### Phase 1: Core Library
- [ ] Define TypeScript types for Stroc document structure
- [ ] Implement text normalization (whitespace collapse, sentence parsing)
- [ ] Implement canonical JSON serialization
- [ ] Implement CID generation (SHA-256 + base64url)
- [ ] Implement document validation (required fields, reference resolution)

### Phase 2: Parser / Importer
- [ ] Parse legacy strdoc YAML format
- [ ] Convert to new Stroc JSON format
- [ ] Handle reference section migration (`name`/`source` → `as`/`source`)

### Phase 3: Authoring UI
- [ ] WYSIWYG display mode
- [ ] Structure edit mode (click to reveal)
- [ ] Sentence/paragraph parsing with author confirmation
- [ ] Drag and drop (sections, paragraphs, sentences)
- [ ] Bold/italic/underline toolbar
- [ ] Cross-reference insertion
- [ ] Document inclusion by CID

### Phase 4: Renderers
- [ ] HTML renderer
- [ ] PDF renderer (pdfmake or similar)
- [ ] Plain text renderer

### Phase 5: Integration
- [ ] IPFS storage/retrieval
- [ ] Taleus/MyCHIPs tally integration
- [ ] Document signing workflow

## Open Questions

### Specification
1. **Nested markup**: Is `<b><i>text</i></b>` allowed? (Probably yes, but not specified)

### Pre-Implementation Decisions
4. **UI Framework**: Vue (like legacy wylib)? React? Svelte? Web Components?
5. **Target environment**: Browser only? Node.js only? Both?
6. **Package structure**: Monorepo with separate packages? Or single library?
7. **Framework-agnostic core**: Should core library (types, normalization, CID) be separate from UI?
8. **IPFS integration**: Public IPFS network, private Sereus nodes, or both? Gateway strategy?
9. **Taleus integration**: How do Stroc CIDs get referenced in tallies? (May need Taleus spec review)

## Resolved Questions (Research Phase)

1. **Abbreviation handling**: Rely on `Intl.Segmenter` locale rules; author override for edge cases
2. **Unicode normalization**: NFC (Canonical Composition)
3. **Sentence drag/drop across sections**: Supported (same as section/paragraph drag/drop)
4. **Sentence detection fallback**: `@echogarden/text-segmentation` for environments without `Intl.Segmenter`
5. **Serialization**: IPLD DAG-JSON for IPFS compatibility; CIDs are standard IPFS CIDv1
6. **Reference validation**: At save time only; invalid references block save. No publish-time check needed (CID-addressed docs are immutable).
7. **Reference paths and titles**: Section titles must be unique among siblings; reference paths are normalized (trim, collapse spaces, lowercase, spaces→underscores, no `/`). Renaming a section changes the document (new CID); references to the old CID remain valid, new names require including the new CID.

## Research Notes

### Sentence Boundary Detection Options

#### 1. Intl.Segmenter (JavaScript Native API) - RECOMMENDED PRIMARY

```javascript
const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const segments = segmenter.segment('Dr. Smith went to the store. He bought milk.');
for (const { segment } of segments) {
  console.log(segment);
}
// Output:
// "Dr. Smith went to the store. "
// "He bought milk."
```

**Pros**:
- Native browser/Node.js API (no dependencies)
- Locale-aware (handles language-specific rules)
- Handles common abbreviations automatically

**Cons**:
- Behavior may vary slightly across browser versions
- May need fallback for older environments
- Accuracy for legal text with unusual abbreviations unknown

#### 2. Fallback Libraries (when Intl.Segmenter unavailable)

| Library | Best For | Notes |
|---------|----------|-------|
| **sbd** | Simple, European-language text | Easy, lightweight |
| **@echogarden/text-segmentation** | Multilingual (Latin, Cyrillic, CJK) | Strong for mixed-language |
| **winkNLP** | Full NLP pipeline | More dependencies, more features |
| **sentencex-js** | Wide-language fallback | Conservative (errs toward not splitting) |

**Recommendation for Stroc**:
1. Primary: `Intl.Segmenter` (native, locale-aware)
2. Fallback: `@echogarden/text-segmentation` (multilingual support matches our needs)
3. Legal text edge cases: Author override in UI

### json-stable-stringify (npm)

```javascript
const stringify = require('json-stable-stringify');
const obj = { b: 2, a: 1 };
console.log(stringify(obj));
// Output: '{"a":1,"b":2}'
```

**Behavior**:
- Keys sorted alphabetically (lexicographic)
- No whitespace
- Deterministic output

**Considerations for Stroc**:
- Need to verify Unicode string handling
- Need to verify number representation (no trailing zeros, etc.)

### IPLD DAG-JSON

IPLD (InterPlanetary Linked Data) defines canonical encodings for content-addressed data:
- DAG-JSON: JSON with specific rules for CID links and bytes
- DAG-CBOR: Binary format, more compact

For Stroc, DAG-JSON alignment would enable direct IPFS compatibility.

## Document References

- [Legacy.md](Legacy.md) - Documentation of original strdoc implementation
- [Specification.md](Specification.md) - Current Stroc specification (WIP)
- [Vision.md](Vision.md) - Project goals and strategy

