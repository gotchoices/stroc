# Legacy strdoc Implementation

This document captures the architecture and design of the original strdoc implementation, which serves as the foundation for the new Stroc specification.

## Source Locations

The legacy implementation is spread across two repositories:

| Repository | Path | Purpose |
|------------|------|---------|
| [wylib](https://github.com/gotchoices/wylib) | `src/strdoc.vue` | Vue-based interactive editor |
| [wylib](https://github.com/gotchoices/wylib) | `src/crossref.js` | Custom HTML element for cross-references |
| [mychips](https://github.com/gotchoices/mychips) | `lib/control/contract.js` | Backend controller for editing/publishing |
| [mychips](https://github.com/gotchoices/mychips) | `lib/control/agree.js` | Backend controller for tally agreements |
| [mychips](https://github.com/gotchoices/mychips) | `lib/control/buildpdf.js` | PDF rendering using pdfmake |
| [mychips](https://github.com/gotchoices/mychips) | `contract/*.yaml` | Example contract documents |
| [mychips](https://github.com/gotchoices/mychips) | `contract/hash` | Script to generate document RIDs |
| [mychips](https://github.com/gotchoices/mychips) | `contract/refcheck` | Script to validate cross-document references |

## Document Data Model

### Contract Structure (YAML/JSON)

Each document is wrapped in a `contract` object with the following fields:

```yaml
contract:
  host: mychips.org          # Publisher/authority identifier
  name: 'Tally_Definition'   # Document name (used for file lookups)
  version: 1                 # Version number
  language: eng              # ISO language code
  published: '2020-04-01'    # Publication date
  top: true                  # Optional: marks this as a top-level document
  rid: 'Z2XFBa24t7ap...'     # Resource ID (content hash)
  title: 'Document Title'    # Human-readable title
  text: 'Paragraph text...'  # Body text (single string)
  sections: [...]            # Array of nested subsections
```

### Section Types

Sections come in two forms:

**1. Inline Sections** - Content defined directly:
```yaml
sections:
  - title: 'Signing Keys'
    text: >-
      Each Party is in possession of a digital key...
    sections: [...]  # Optional nested subsections
```

**2. Reference Sections** - Content included by reference:
```yaml
sections:
  - name: 'Ethics'
    source: 'SgMhedRY-zj8MaPJkz_cz8Ajfmcg3JSvEq9vF3SuOss'
```

The `source` field contains the `rid` (hash) of another document to be incorporated. The `name` field corresponds to the filename (without `.yaml` extension) used by the `refcheck` script to locate and validate references.

### Field Summary

| Field | Required | Purpose |
|-------|----------|---------|
| `host` | Yes | Identifies the publishing authority |
| `name` | Yes | Unique document identifier within host |
| `version` | Yes | Document version number |
| `language` | Yes | ISO language code (e.g., `eng`, `spa`) |
| `published` | No | Publication date |
| `top` | No | Marks as a root/top-level document |
| `rid` | Yes* | Resource ID (hash) - auto-generated |
| `title` | No | Human-readable title for display |
| `text` | No | Body text content |
| `sections` | No | Array of child sections |
| `source` | No | RID of referenced document (for reference sections) |

## Resource ID (RID) / Content Hash

### Generation Algorithm

The `rid` is computed by the `contract/hash` script:

1. Parse the YAML file into a JavaScript object
2. Extract the `contract` object
3. Create a copy with the `rid` field removed
4. Serialize using `json-stable-stringify` (deterministic key ordering)
5. Compute SHA-256 hash of the serialized string
6. Encode the hash as base64url

```javascript
const Stringify = require('json-stable-stringify')
const Crypto = require('crypto')

let core = Object.assign({}, contract)
delete core.rid
let strung = Stringify(core)
let digest = Crypto.createHash('sha256').update(strung).digest()
let rid = Buffer.from(digest).toString('base64url')
```

### Reference Validation

The `contract/refcheck` script validates that all `source` references point to valid document hashes:

1. For each section with a `name` and `source`
2. Look up the file `{name}.yaml`
3. Extract its `rid`
4. Compare with the `source` value
5. Update if mismatched

## Vue Editor Component (`strdoc.vue`)

### Features

- **Nested editing**: Recursive component structure mirrors document hierarchy
- **Dual modes**: Toggle between edit mode (form fields) and preview mode (rendered)
- **Drag and drop**: Reorganize sections by dragging
- **Markup support**: Bold (`<b>`), italic (`<i>`), underline (`<u>`) tags
- **Cross-references**: Custom `<x-r>` element for internal links
- **Import/Export**: Save and load documents as JSON files
- **Section numbering**: Automatic outline numbering (1., 1.1., 1.1.1., etc.)

### State Structure

```javascript
stateTpt: {
  title: null,
  text: null,
  name: null,
  sections: [],
  source: null,
  edit: false,
  resource: null,
  dock: {}
}
```

### Cross-References (`crossref.js`)

A custom HTML element `<x-r>` allows linking between sections:

```html
<x-r name="sectionName">displayed text</x-r>
```

The element:
- Defines `name` and `value` attributes
- Fires `connect` and `change` events
- Uses Shadow DOM for display isolation
- Allows sections to reference each other by name

## PDF Generation (`buildpdf.js`)

### Technology

Uses the [pdfmake](http://pdfmake.org/) library with built-in fonts (Courier, Helvetica, Times).

### Document Structure

```javascript
var docTemplate = {
  pageSize: 'Letter',
  defaultStyle: {
    font: 'Helvetica',
    fontSize: 12
  },
  styles: {
    header: { fontSize: 16, bold: true },
    midhead: { fontSize: 11 },
    subhead: { fontSize: 8 },
    par: { fontSize: 10 },
    subpar: { fontSize: 8 }
  },
  footer: function(curPage, pgCount) { ... }
}
```

### Recursive Section Rendering

The `contSection()` method recursively processes sections:

```javascript
contSection(contract, prefix = '') {
  let {host, name, version, language, title, text, rid, sections} = contract
  // ... build title block with subscript metadata ...
  
  if (sections) {
    sections.forEach((sec, idx) => {
      let subPrefix = prefix + (idx + 1) + '.'
      let elements = this.contSection(sec, subPrefix)
      // ... append to body ...
    })
  }
  return content
}
```

### Tally-Specific Sections

For MyCHIPs tally agreements, additional sections are rendered:
- Certificate sections (foil/stock holder identities)
- Credit terms
- Signatures with QR codes
- Tally metadata (UUID, version, date, digest)

## Backend Controllers

### `contract.js`

Handles contract document editing in the wylib web UI:

- **edit()**: Fetch contract JSON from database, return to editor
- **publish()**: 
  1. Fetch contract from database
  2. Remove existing digest
  3. Compute new SHA-256 hash using `json-stable-stringify`
  4. Update database with new digest and publish date

```javascript
let digest = Hash.sha256().update(Stringify(json)).digest('hex')
```

### `agree.js`

Renders tally agreements to PDF:

1. Fetch tally data from database (includes contract reference)
2. Resolve contract document
3. Build PDF using `BuildPDF` class
4. Return PDF buffer with appropriate headers

## Example Documents

### Top-Level Contract (`Tally_Contract.yaml`)

```yaml
contract:
  host: mychips.org
  name: 'Tally_Contract'
  version: 1
  language: eng
  top: true
  published: '2020-04-01'
  rid: 'byZENT6Lqdub9ew8tQnvyTGgVduELz-j6zfjHM-tgs8'
  title: 'MyCHIPs Tally Agreement'
  text: >-
    This written Contract is part of an Agreement...
  sections:
    - name: 'Recitals'
      source: "wSYXyrYBFeRAGJ_5Mzs7ezCNzzmr2m_EOf-P0UPHDjQ"
    - name: 'Values'
      source: "S2JUVE7dOWRtkC_fKNRzgQV1odrDIp1_lz98CM3-rpg"
    # ... more references ...
```

### Inline Content (`Tally_Definition.yaml`)

```yaml
contract:
  host: mychips.org
  name: 'Tally_Definition'
  version: 1
  language: eng
  published: '2020-04-01'
  rid: 'Z2XFBa24t7apXjWaxxqrEEfTDgNnSUPZhshLCs1VmrY'
  title: 'What a Tally is and How it Works'
  text: >-
    Pledges of Value are tracked by means of a Tally...
  sections:
    - title: 'Signing Keys'
      text: >-
        Each Party is in possession of a digital key...
    - title: 'Signing the Tally'
      text: >-
        The Parties agree to the terms and conditions...
```

## Known Shortcomings

### 1. Text as Single String

Each section stores `text` as one monolithic string. This creates several problems:

- **Whitespace variability**: No control over spacing between sentences (one space vs. two, trailing spaces, etc.)
- **Coarse granularity**: Cannot reference or hash individual sentences
- **Diff complexity**: Changes require diffing entire paragraphs

### 2. No Content/Presentation Separation

The YAML format mixes semantic content with presentation concerns:
- `title` is both content (the heading text) and presentation (implies formatting)
- No mechanism to specify "this is bold for emphasis" vs. "this should display bold"

### 3. Cross-References Tied to Vue

The `<x-r>` element is implemented in the Vue component layer, not as part of the document model. This means:
- Cross-references don't survive serialization to plain text
- PDF rendering must handle them separately
- No standard representation in the JSON structure

### 4. External Reference Resolution

When a section has `source: "rid..."`, the document must be fetched from an external source (database, file system). The strdoc format doesn't define:
- How to resolve references
- Caching/bundling strategies
- Handling of missing references

### 5. Limited Markup Support

Only basic HTML tags are supported: `<b>`, `<i>`, `<u>`, `<x-r>`. No support for:
- Lists
- Tables
- Links to external resources
- Semantic markup (emphasis vs. strong, etc.)

### 6. Language as Metadata Only

The `language` field is metadata but doesn't enable:
- Multi-language documents (parallel translations)
- Language-specific formatting rules
- RTL language support

## Workflow

### Creating/Editing Documents

1. Author creates or edits YAML file
2. Run `./hash *.yaml` to regenerate RIDs
3. Run `./refcheck *.yaml` to validate cross-references
4. Repeat until all hashes/references resolve
5. Import to database with `make init`

### Runtime Flow

1. User requests tally agreement
2. Backend fetches tally data (includes contract RID)
3. Contract document fetched by RID
4. References recursively resolved
5. BuildPDF renders to PDF
6. PDF returned to user

