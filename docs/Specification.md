# Stroc Specification

**Status**: Frozen  
**Version**: 1.0 (2026-10-07)

Documents in this format carry `stroc: "1.0"`. The format is frozen: a change to anything that
affects a document's bytes, and so its CID, requires a new format version. Documents made with the
pre-release drafts (`stroc: "1.0"`) are not accepted; they must be changed to `"1.0"`, which gives
them new CIDs.

## Overview

Stroc (Structured Documents) is a protocol for creating legal documents where content determines identity, and presentation is secondary. Documents are identified by their content hash (CID), enabling deterministic referencing in Taleus/MyCHIPs tallies.

## Design Principles

1. **Content is canonical**: The hash is computed from normalized content only
2. **Whitespace is not content**: Spacing variations do not affect document identity
3. **Normalize on input**: Editors normalize as the author types; a hand-written file is linted and must already be canonical (a fix is offered)
4. **What you store is what hashes**: No hidden normalization at hash time
5. **CID is external**: The content hash is not stored in the document; it's derived from the content

## Document Structure

### Top-Level Document

```json
{
  "stroc": "1.0",
  "language": "en",
  "title": "Standard MyCHIPs Tally Contract",
  "author": "mychips.org",
  "published": "2024-01-15",
  "text": "The preamble paragraph. It may contain several sentences.",
  "sections": [
    {"source": {"/": "baguqeera..."}, "id": "recitals"},
    {"source": {"/": "baguqeera..."}, "id": "ethics"},
    {"title": "Additional Terms", "text": "...", "sections": [{"text": "A second paragraph, as an untitled child section."}]}
  ]
}
```

The document's CID is computed by hashing the entire document. It is not stored within the document.

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stroc` | string | Yes | Format version: `"1.0"`. A tool rejects a document whose version is newer than it supports, rather than processing it partially. |
| `language` | string | Yes | BCP 47 language tag (e.g. `en`, `en-US`, `sr-Latn`), in its canonical case |
| `title` | string | Yes | Human-readable document title |
| `author` | string | No | Who issues the document: a domain (verifiable) or a name (see [Author](#author)) |
| `published` | string | No | ISO 8601 date of publication |
| `text` | string | No | One paragraph (see Text Structure) |
| `sections` | array | No | Child sections |
| `replaces` | array | No | Links to earlier versions this document supersedes (see [Lineage](#lineage)) |
| `parameters` | array | No | Values the document expects at render time (see [Parameters](#parameters)) |

### Author

`author` says who issues the document and stands behind it. It takes one of two forms:

- **A domain**, such as `sereus.org` or `contracts.mychips.org`: lowercase ASCII DNS labels
  separated by dots, with at least one dot. This is a **verifiable claim**: the domain's catalog
  must list the document (see [Published Sets and Catalogs](#published-sets-and-catalogs)).
- **A name**, such as `Bob Anderson`: anything else. It is shown as written and is not verifiable.

A value is a domain only if it is written in lowercase; a linter warns about values that look like
a domain in another case (`MyCHIPs.org`). Internationalized domains are written in their ASCII
(`xn--`) form. A drafter who wants to be credited by name can be named in the text.

What a confirmed domain proves, and its limits:
- The holder of the domain, reached over HTTPS, lists this exact CID in its catalog. HTTPS proves
  control of the domain, not real-world identity; the reader must recognize the domain.
- A domain can lapse and pass to someone else, who then controls its catalog. Applications record
  what they confirmed and when ("listed by sereus.org, 2026-10-07"). Publisher signatures (a
  possible later feature) would remove this dependence on the domain.

### Lineage

`replaces` is an optional, non-empty array of IPLD links (`{"/": "baguqeera..."}`), each to a
CIDv1 DAG-JSON document, without duplicates. It is allowed on the top-level document only.

- It is the author's statement that this document supersedes those versions. It is hashed, so the
  statement cannot be altered after publication.
- Following `replaces` links backwards gives a document's version history. Tools use it to
  identify outdated `source` links and to show what changed.
- It is **advisory**. Anyone can publish a document claiming to replace any other. It never
  transfers approval or acceptance from the old version to the new one.
- The replaced documents need not be available; a tool that cannot fetch one reports it, but the
  document remains valid.

### Parameters

A document may declare values it expects to be supplied when it is rendered: party names, an
effective date, a credit limit. The declarations are hashed with the document; the values are not.
One document (one CID) can therefore be used for any number of agreements.

```yaml
parameters:
  - key: stock-name
    label: Stock Holder
  - key: foil-name
    label: Foil Holder
  - key: effective
    label: Effective Date
  - key: limit
    label: Maximum Balance
    default: '24'
```

| Field | Required | Description |
|-------|----------|-------------|
| `key` | Yes | Same syntax as a section id; unique within the document's parameters |
| `label` | Yes | Plain text shown beside the value |
| `default` | No | Plain text used when no value is supplied. A parameter without a default is required. |

- `parameters` is allowed on the top-level document only, not on inner sections. Order is the
  order of presentation.
- Parameters have no types. Values are plain text, presented as given; formatting dates or
  amounts is the supplier's job.
- The text either shows a value in place with a placeholder (`<param:key>`, see Placeholders) or
  refers to it by role ("the Stock Holder named in the Particulars").

#### Supplying values

Values are supplied in a **data object**, separate from the document: a map from parameter path to
non-empty plain-text value. A path is the parameter's key, prefixed by the ids of the reference
sections that lead to the declaring document, as in a cross-reference:

```yaml
stock-name: Acme Widgets LLC
foil-name: Jane Doe
effective: '2026-10-06'
terms/limit: '2400'          # "limit" declared by the document included as "terms"
```

- Checking a data object against a composed document reports: a required parameter with no value,
  a key that matches no declared parameter, and a value that is not a non-empty string.
- If the same document is included twice, its parameters have two paths and take values separately.
- Stroc does not hash, sign or store data objects. An app that needs to may compute a CID for one
  with the same DAG-JSON encoding.
- Values that change during the life of an agreement (a credit limit later revised) are not good
  parameters: the rendered document would show only the value given at rendering. Apps present such
  values separately.

When rendered, the parameters of the whole composed document are presented together in one table
near the top, grouped by the document that declares them (see [Rendering.md](Rendering.md)).

#### Placeholders

A paragraph can show a parameter's value inside a sentence with a placeholder token:

```yaml
parameters:
  - key: weekly-rent
    label: Weekly Rent
text: >-
  The Renter shall pay the Owner a weekly rent of <param:weekly-rent> in advance.
```

- `<param:key>` names a parameter **declared by the same document**; an undeclared key is an error.
  A clause therefore stays self-contained: when it is included, its values are supplied under the
  include's path (`terms/weekly-rent`), as for any parameter.
- The token is hashed as written; the value is not. One template has one CID however it is filled.
- When rendered, the value replaces the token and is visibly marked as supplied data, whether it
  came from the data object or the declared default. Where there is no value (a blank template), the
  parameter's label is shown in brackets: `[Weekly Rent]`.
- Values are plain text, inserted as written; no markup, no formatting by the renderer.
- There is no conditional text: a placeholder only shows a value, never selects wording.
- A value that changes during the life of an agreement should not be a placeholder (see above).

### Removed Fields (from Legacy)

| Field | Reason for Removal |
|-------|-------------------|
| `host` | Replaced by `author`; fetch location handled by CID/IPFS |
| `name` | CID is the document identifier; sections that are reference targets carry an `id` local to the document |
| `version` | CID versions content; history is expressed by `replaces`. (An optional display label is under discussion: STATUS Q9) |
| `cid`/`rid` | Now external, not stored in document |

### Text Structure

Each section stores a **single paragraph string** in `text`. Additional paragraphs are represented as child sections (which may omit `title` if they are simple paragraphs within a parent section). There is no sentence-level storage.

This is deliberate. In a document that people sign and later cite, every paragraph should be
addressable: each one gets a number when rendered ("Section 4.2"), and any one can carry an `id`
for references. A list of paragraphs inside `text` would give paragraphs with neither, so a dispute
would be back to "the second paragraph of Section 4". It would also give two ways to write the same
content (a list, or untitled child sections), and so two CIDs for it. A section may have as many
paragraphs as it needs; each is an untitled child section.

**Sections store nesting, not depth.** A section has no heading level or number of its own; both
are computed when rendering, from where the section sits in the composed document. This is what
lets a document written once be included at any depth.

**Identity stops at the document.** A section inside a document has no CID of its own. Text that
should be reusable, or reviewable separately, belongs in its own document, included by reference.

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

| Field | Required | Description |
|-------|----------|-------------|
| `id` | No | Reference target (see [Section Ids](#section-ids)) |
| `title` | No | Heading text |
| `text` | No | One paragraph |
| `sections` | No | Child sections |

A section must have at least one of `title`, `text` or `sections`.

#### Reference Section

Content included by reference to another document's CID:

```json
{
  "source": {"/": "baguqeera..."},
  "id": "ethics"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `source` | Yes | IPLD link to the document to incorporate: a CIDv1 with the DAG-JSON codec, encoded `{"/": "baguqeera..."}` |
| `id` | Yes | Local name for the included document; the first segment of references into it |

A reference section has exactly these two fields. (Earlier drafts used a separate `as` alias; it is replaced by `id`.)

#### Composition

When a document is rendered, each reference section is replaced by the document it links to,
recursively:

- The included document's `title` becomes the heading of the section, numbered in place.
- Its `text` and `sections` follow, numbered beneath that heading.
- Its `parameters` join the composed document's parameters (see [Parameters](#parameters)).
- Its `stroc`, `language`, `author`, `published` and `replaces` are not rendered as content. Its
  CID is shown beside its heading so each part of a printed document can be checked.
- An included document may be in a different language (see Multilingual Documents) and may use
  any `stroc` version the tool supports.

Layout details are in [Rendering.md](Rendering.md).

### Document Resolution and Verification

A document records only the CIDs of what it includes, never where to obtain them. Where documents
come from is the concern of the application using Stroc (a local store, a peer, a publisher's web
server, IPFS); Stroc defines how they are checked.

- **Resolver**: an application supplies a function that returns a document's bytes for a CID.
  Stroc places no requirement on where the bytes come from.
- **Verify every fetch**: the bytes are hashed and compared with the CID as described under
  [Verification](#verification). A mismatch is rejected; no source needs to be trusted.
- **Composition** fetches the root and every document it includes, transitively, verifying each.
  A document that cannot be obtained is reported by CID; rendering stops rather than showing a
  partial document.
- **Bundles**: a document and everything it includes can be exported as one CAR file (the standard
  IPLD archive format) and imported elsewhere, with every block verified on import. This is how a
  complete document travels between parties or is kept with an agreement.
- **Published sets**: see below.

#### Published Sets and Catalogs

Documents are served over HTTP using the path convention of the IPFS **trustless gateway**, so the
same client can fetch from a Stroc server, a static web host, a local IPFS node or a public IPFS
gateway, and verifies everything it receives.

| Request | Response |
|---------|----------|
| `GET /ipfs/<cid>` (clients add `?format=raw` and `Accept: application/vnd.ipld.raw`) | The document's canonical DAG-JSON bytes |
| `GET /ipfs/<cid>?format=car` (optional) | A CAR bundle of the document and everything it includes |
| `GET /.well-known/stroc/catalog.json` | The catalog |
| `GET /ipfs/<cid>` with `Accept: text/html` and no `format` (optional) | The composed document as a readable page, for a person following a link or QR code |
| `GET /` (optional) | A human-readable index of the catalog |

- A static host ignores the query string and serves the file, so publishing needs nothing but a web
  server. A client that asks for a CAR must check that it received one (a static host returns the
  document's bytes); otherwise it fetches included documents one by one. Files are named by the
  CID's canonical form (CIDv1, base32), so clients request that form.
- Responses for `/ipfs/<cid>` with `format=raw` never change and may be cached indefinitely. A
  server that also offers the readable page sends `Vary: Accept`. The page is a convenience: it
  proves nothing, and verifying still means fetching the bytes and checking the CID.
- **Linking to a document**: `https://<author-domain>/ipfs/<cid>` fetches a document from the domain
  that issues it (for example from a QR code printed on a contract). The CID in the URL lets the
  reader verify whatever comes back. For documents on IPFS, `ipfs://<cid>` or a public gateway's
  `https://<gateway>/ipfs/<cid>` find the document wherever it is kept.
- Servers send `Access-Control-Allow-Origin: *` on `/ipfs/` and catalog responses, so browser-based
  editors and readers on other origins can fetch them. The data is public and is verified by the
  client, so this is safe.
- The catalog is at a fixed path under the domain (RFC 8615), so it can be found from an `author`
  domain alone. Documents may also be served from any other origin (a mirror or gateway); only
  the author domain's catalog confirms authorship.

The **catalog** is the server's statement about the documents it serves. Serving a file proves only
that the server has it; the catalog states what the server claims about it.

```json
{
  "stroc-catalog": "1.0",
  "domain": "sereus.org",
  "entries": [
    {
      "cid": "baguqeera...",
      "title": "Tally Agreement",
      "role": "author",
      "status": "current",
      "published": "2026-10-06",
      "replaces": ["baguqeera..."]
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `stroc-catalog` | Catalog format version |
| `domain` | The domain the catalog speaks for |
| `entries[].cid` | A document CID (string) |
| `entries[].title` | The document's title, copied by the serving tool |
| `entries[].role` | `author` (we issue it), `endorse` (someone else issues it; we recommend it) or `mirror` (we only host it; no claim) |
| `entries[].status` | `current`, `superseded` (a newer version exists) or `withdrawn` (no longer recommended) |
| `entries[].published` | ISO 8601 date first listed |
| `entries[].replaces` | CIDs (strings) of earlier versions, copied from the document's `replaces` |

- The catalog is ordinary JSON, not a Stroc document. It is not content-addressed, and the domain
  may update it at any time (for example to mark an entry superseded or withdrawn).
- A server's catalog lists **every** document it serves (with role `mirror` where it makes no
  claim), so the catalog is also the index of what is available there. Clients use it to offer a
  list of documents to choose from. (IPFS gateways have no catalog; documents there are found by
  CID only.)
- **Confirming an author**: for a document whose `author` is a domain, fetch
  `https://<domain>/.well-known/stroc/catalog.json` and find the document's CID. The claim is
  confirmed if the entry's role is `author`; report the status and the date checked. An entry with
  role `endorse` or `mirror`, or no entry, does not confirm authorship.
- **Endorsements**: any domain's catalog can be consulted for entries with role `endorse`, for
  example to show "recommended by sereus.org" for a clause another domain wrote.
- Documents never contain URLs. Where to fetch a document is the application's knowledge; who
  issues it is the document's `author`.

#### Reference Validation

When saving a document:
- Validate that every `<ref:...>` resolves (see [Cross-References](#cross-references))
- References into included documents require fetching them; a document with unresolved references must not be published
- Block save if any reference is invalid

This ensures all cross-references are valid at the time of document creation, and remain valid due to content-addressability (CIDs are immutable).

---

## Multilingual Documents

To include multiple language versions of a contract, create a **wrapper document**:

```json
{
  "stroc": "1.0",
  "language": "en",
  "title": "Tally Agreement (Multilingual)",
  "author": "mychips.org",
  "text": "This Agreement is presented in English and French. In case of any conflict between versions, the English version shall govern.",
  "sections": [
    {"source": {"/": "baguqeera..."}, "id": "english"},
    {"source": {"/": "baguqeera..."}, "id": "french"}
  ]
}
```

**Benefits**:
- Tally references ONE CID (the wrapper)
- Both translations are included by reference
- Governing language clause is explicit content, part of the hash
- Each translation is a standalone single-language document

---

## YAML Authoring Format

YAML is the standard format for writing Stroc documents by hand. A YAML file **is** the
document: it and the DAG-JSON encoding are two spellings of the same data, and the CID is the
hash of the DAG-JSON spelling. There is no build or compile step between them.

```yaml
# Comments are allowed and are not content.
stroc: '1.0'
language: en
title: MyCHIPs Tally Agreement
text: >-
  This written Contract is part of an Agreement by and between the Parties.
  A digital hash of this Contract has been incorporated into a Tally.
sections:
  - id: ethics
    source: {/: baguqeeraoqsvkl57icpvp2tm52uhmryobrrof557ya5cpnq7isfstfgsxwoa}
  - title: Additional Terms
    text: >-
      One sentence per line is a convenient style.
      Folded text joins the lines with single spaces.
```

Rules:
- YAML 1.2, core schema. Mappings, sequences and strings only; every value in a Stroc document is
  a string, so values YAML would read as numbers or booleans must be quoted (`stroc: '1.0'`, not
  `stroc: 1.0`, which is a number).
- A link is written as a one-key mapping `{/: <cid>}`; standard YAML and DAG-JSON libraries turn it
  into a link without Stroc-specific conversion.
- Anchors, aliases, tags and merge keys are not allowed.
- Comments, indentation, quoting style and line folding are presentation and do not affect the CID.
- The parsed values must already be canonical (see [Normalization Rules](#normalization-rules)).
  Tools never normalize silently before hashing; a linter reports anything non-canonical and may
  offer to fix the file.
- JSON documents are accepted on the same terms.

## Normalization Rules

### Canonical Form

A document is valid only if it is already canonical. Tools never transform a document before
hashing it; a linter reports violations, and editors and fix commands may correct them.

1. **Known fields only**: Every field must be defined by the document's `stroc` version. Unknown
   fields are an error, never ignored.
2. **Strings only**: Every value is a string, link, array or object as defined; no numbers,
   booleans or nulls.
3. **No empty values**: Empty strings, empty arrays and empty objects are omitted, not stored.
4. **Unicode NFC** (Canonical Composition).
5. **Whitespace**: Text contains only the ordinary space (U+0020) as whitespace, never two in a
   row, never at the start or end. Tabs, line breaks and no-break spaces (U+00A0, U+202F) are not
   allowed. (Spacing is presentation; renderers decide line breaking.)
6. **Invisible characters**: Control characters (U+0000–U+001F, U+007F–U+009F), zero-width space
   (U+200B), word joiner (U+2060), byte-order mark (U+FEFF) and soft hyphen (U+00AD) are not
   allowed. Zero-width non-joiner and joiner (U+200C, U+200D) and the bidirectional marks and
   isolates (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069) are allowed, because removing them
   changes how some scripts read.
7. **Literal characters**: Text has no entity encoding. `&amp;` is five literal characters. A
   linter warns about sequences that look like HTML entities. (Editors decode entities when the
   author pastes HTML, before the text reaches the document.)
8. **Markup** appears only in `text`, and only as defined in [Inline Markup](#inline-markup).
   Titles, `author` and other fields are plain text.

### Paragraphs, Not Sentences

- Each section has a single `text` paragraph (string). Additional paragraphs are child sections (which may omit `title`).
- Sentences are not stored separately. Tools may split a paragraph into sentences for display or diffing, but that never affects the hash.
- Consumers never split; they only serialize the stored structure for CID verification.

---

## Authoring

Editor behavior is not part of the format; see [Editor.md](Editor.md).

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
- Special encoding for CID links: `{"/": "baguqeera..."}`. Every reference to another document (`source`) uses this form, so a composed document is a single IPLD DAG.
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
  language: "en",
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
// "baguqeeracqxwoqi4pg3ab52w46ilo7rshuk7l2agc7erux64ocjkiqk22zeq"
```

### CID Format

Stroc CIDs are standard IPFS CIDv1:
- Version: 1
- Codec: DAG-JSON (0x0129)
- Hash: SHA-256 (0x12)
- Encoding: base32 lowercase (multibase prefix `b`)

Because the codec is DAG-JSON, every Stroc CID begins `baguqeera`. (`bafy…` is the prefix for DAG-PB and DAG-CBOR CIDs; a value starting that way is not a Stroc CID.)

Example (the document above): `baguqeeracqxwoqi4pg3ab52w46ilo7rshuk7l2agc7erux64ocjkiqk22zeq`

### Verification

To verify a document:
1. Receive the document's bytes and the claimed CID
2. Parse the CID to extract codec and hash algorithm; the codec must be DAG-JSON
3. Hash the bytes **exactly as received** and compare with the claimed CID
4. Decode the bytes; re-encoding must reproduce them exactly (canonical DAG-JSON)
5. Validate the decoded document

No normalization or cleanup happens before the comparison, so a match always covers exactly the
content that was received.

### IPFS Compatibility

Stroc documents are valid IPLD blocks, so IPFS can be used as one optional source among others:
- `ipfs dag put` to store, `ipfs dag get <cid>` to retrieve
- Because includes are links, pinning a root pins the whole composed document, and
  `ipfs dag export` produces the same CAR bundle Stroc does

Stroc does not require IPFS.

---

## Inline Markup

### Principle

Inline emphasis (bold, italic, underline) within **paragraph text** is legally meaningful and part of the content hash. Styling of **structural elements** (titles, headers, section numbers) is presentational and determined by the renderer.

### Markup Grammar

Stroc markup is its own small grammar. It borrows the look of HTML tags but **is not HTML**:
renderers must parse it and generate their output, never pass text through as HTML.

```
text    = { char | escape | token }
escape  = "\<" | "\\"                       literal "<" and literal "\"
token   = "<b>" | "</b>" | "<i>" | "</i>" | "<u>" | "</u>"
        | "<ref:" path ">" | "<param:" id ">"
path    = id { "/" id }                       ids as in Section Ids
char    = any character allowed in text, except "<" and "\"
```

| Token | Meaning |
|-------|---------|
| `<b>...</b>` | Bold emphasis |
| `<i>...</i>` | Italic emphasis |
| `<u>...</u>` | Underline emphasis |
| `<ref:path>` | Cross-reference (see [Cross-References](#cross-references)) |
| `<param:key>` | Placeholder for a parameter's value (see [Placeholders](#placeholders)) |

Rules:
- **Every `<` begins a token.** A `<` that does not begin one of the tokens above is an error; a
  literal `<` is written `\<` ("if the balance is \< 0").
- **A literal backslash is `\\`.** A backslash followed by anything other than `<` or `\` is an error.
- `>` and `&` are always literal outside a token and need no escape.
- Tokens are exact: lowercase, no spaces, no attributes or options. Anything a token needs follows
  its colon. (`<b class="x">` is simply not a token, so it is an error.)
- Markup is allowed only in `text`. Titles and other fields are plain text, where `<` and `\` are
  ordinary characters.
- Further tokens (for example `<nbsp>`) can be added only by a new `stroc` version.

### Nesting and One Spelling

Each piece of formatted text has exactly one valid spelling, so it has exactly one hash.

- Emphasis tags must be balanced and properly nested, and must not be empty.
- A tag must not be nested inside the same tag (`<b>a <b>b</b></b>` is an error).
- Emphasis nests in the order `b`, `i`, `u` at every depth: `<b>` never inside `<i>` or `<u>`, and
  `<i>` never inside `<u>`. So `<b><i>x</i></b>`, not `<i><b>x</b></i>`; and `<i>a</i><b><i>b</i></b><i>c</i>`,
  not `<i>a<b>b</b>c</i>`. (Until 0.16 this applied only when one emphasis wrapped exactly one
  other, which left two spellings for the same formatting.)
- Two identical emphasis elements must not be adjacent (`<b>a</b><b>b</b>` must be `<b>ab</b>`).
- Emphasized content must not begin or end with a space (`<b>a </b>b` must be `<b>a</b> b`).
- `<ref:…>` and `<param:…>` may appear inside emphasis.
- The linter reports each violation and offers the single correct spelling.
- In YAML, write paragraphs as plain, single-quoted or folded (`>-`) scalars. Inside double-quoted
  YAML scalars, backslash is YAML's own escape and `\<` is a YAML error.

### Storage Model

Inline markup is stored within paragraph strings and included in the hash:

```json
{
  "stroc": "1.0",
  "language": "en",
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

### Section Ids

Any section may carry an `id`, which makes it a reference target. Reference (include) sections
must carry one.

- Syntax: lowercase ASCII letters, digits and single hyphens, starting with a letter:
  `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, at most 64 characters.
- Unique across the whole document, at every depth. Ids need not be unique across documents:
  a document's ids are only reachable from outside through the `id` of the section that includes it.
- Hashed like any other content. Changing an id changes the document's CID.
- Optional on inline sections. Sections that are never referenced need no id.
- Titles carry no identity: they need not be unique and may be reworded without breaking any reference.

### Reference Syntax

Cross-references use the `<ref:...>` tag within paragraph text. The path is one or more ids
separated by `/`:

```
<ref:cure>                      → a section in this document with id "cure"
<ref:ethics>                    → the included document with id "ethics", as a whole
<ref:ethics/good-faith>         → section "good-faith" inside that included document
<ref:free/ethics/good-faith>    → through two levels of inclusion
```

Resolution:
1. The first segment names a section anywhere in the current document.
2. If more segments follow, that section must be a reference section; the next segment is looked up
   in the included document by the same rule, and so on.
3. A section inside an included document can only be reached through the include's id.
   `<ref:good-faith>` does not find a `good-faith` section inside `ethics`.

Example: two clause documents may both use `good-faith`; a contract including them as `ethics` and
`duties` refers to `<ref:ethics/good-faith>` and `<ref:duties/good-faith>`.

### Scope

A reference may only point within the document and the documents it includes, directly or
transitively. A document cannot refer to a sibling or a parent: it does not know where it will be
included. Clauses intended for reuse refer to things outside themselves by defined terms
("the Stock Holder", "this Agreement"), not by section reference.

### Rendering

- References are resolved at **render time**, against the composed document.
- A reference renders as the target's number in the composed document, e.g. "Section 3.1". The
  same clause included in two contracts may therefore render with different numbers.
- The reference path is part of the hash; the rendered number is not.

### Validation

- References are validated at **save time**; an invalid reference blocks save.
- Every segment must resolve as described above; every non-final segment must be a reference section.
- Included documents are CID-addressed and immutable, so a reference that resolves once stays valid.
- Renaming an id is a content change; editors should update references within the document.

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

9. **Cross-references**: Targets are section `id`s, unique within a document; paths step into included documents through the include's `id`. Reference paths are hashed; rendered numbers are computed at render time. (Decided 2026-10-06, replacing title paths and the `as` alias.)

10. **Multilingual documents**: Use a wrapper document that includes multiple language versions by reference, with explicit governing language clause.

11. **Serialization**: Use IPLD DAG-JSON for IPFS compatibility from the start. CIDs will be standard IPFS CIDs.

12. **Reference validation**: Validate at save time only. Invalid references block save. No publish-time check needed because CID-addressed documents are immutable.

13. **Reference scope**: References point only within the document and what it includes. Reusable clauses use defined terms for anything outside themselves. (Decided 2026-10-06.)

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | Draft | Initial structure and text model |
| 0.2 | Draft | Removed `name`, `version`, `host`; added `author`; CID now external; added multilingual wrapper pattern; defined cross-reference syntax |
| 0.3 | Draft | Empty paragraph stripping; `Intl.Segmenter` for sentence detection; NFC Unicode normalization; serialization details |
| 0.4 | Draft | IPLD DAG-JSON for IPFS-compatible CIDs; updated CID generation algorithm |
| 0.5 | 2026-10-06 | Prose aligned with the one-paragraph-string model (no sentence arrays); CID prefix corrected to `baguqeera`; removed the nested-markup open question (already settled under Inline Markup); pending items marked |
| 0.6 | 2026-10-06 | Section `id`s as reference targets, replacing title paths and `as`; ids unique within a document; reference scope limited to the document and its includes; title uniqueness and path normalization rules removed |
| 0.7 | 2026-10-06 | `source` is an IPLD link; YAML authoring format defined (the YAML file is the document; no build step; lint instead of silent normalization) |
| 0.8 | 2026-10-06 | `replaces` lineage field |
| 0.9 | 2026-10-06 | Canonical form replaces input normalization (unknown fields rejected, whitespace, invisible characters, literal text); verification hashes received bytes; newer `stroc` versions rejected |
| 0.10 | 2026-10-06 | Markup grammar: exact tokens, every `<` begins a token, backslash escapes `\<` and `\\`; one-spelling nesting rules; markup is not HTML |
| 0.11 | 2026-10-06 | `parameters` declarations and data objects; composition of included documents; inline placeholders described as future |
| 0.12 | 2026-10-06 | Resolution rewritten: app-supplied resolver, verified fetches, CAR bundles, static published sets, no addresses in documents; removed the HTTP endpoint and Sereus-node strategy; nesting-not-depth and document-level identity stated |
| 0.13 | 2026-10-06 | Published sets: file layout under a base URL, `catalog.json` format with entry status, provenance check |
| 0.14 | 2026-10-06 | `language` is a BCP 47 tag; documents carry `stroc: "0.1"` until the format is frozen; editor behavior moved to Editor.md |
| 0.15 | 2026-10-07 | `author` is a verifiable domain or a plain name; published sets use the IPFS trustless-gateway path `/ipfs/<cid>`; catalog at `/.well-known/stroc/catalog.json` with `domain` and per-entry `role` |
| 0.16 | 2026-10-07 | Emphasis order b, i, u applies at every depth, so each formatting has exactly one spelling |
| 0.17 | 2026-10-07 | Inline placeholders `<param:key>` for a document's own parameters; collections for catalogs deferred |
| 1.0 | 2026-10-07 | Frozen. Documents carry `stroc: "1.0"` and catalogs `stroc-catalog: "1.0"`; pre-release `"0.1"` documents are rejected |
