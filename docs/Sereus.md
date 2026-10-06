# Stroc and Sereus Apps

This file hands Stroc to the next person or agent working on it. It records what was learned
while reviewing Stroc against Sereus (September and October 2026): what Stroc is for, how it
should be shaped so Sereus apps can use it, and the design principles worth keeping. Read it
after [Vision.md](Vision.md) and before [STATUS.md](STATUS.md).

- **This file** holds the principles and the division of responsibility.
- **[STATUS.md](STATUS.md)** holds the verified current state, known defects and the ordered
  roadmap.
- **[Specification.md](Specification.md)** is the protocol. Several principles below are not in
  it yet; moving them in is part of the roadmap.

## The decision

Sereus does not implement contracts. Kyle and Nate agreed in October 2026:

- Contracts are not a Sereus platform feature.
- An app that wants contracts manages them itself: storing documents, collecting signatures,
  deciding what is in force, and enforcing it.
- Sereus strand invitations will carry arbitrary app-defined parameters. A chat invitation
  could, for example, reference a confidentiality agreement the strand proposes or that existing
  members have already accepted. The app interprets the reference; Sereus only carries it.
- Stroc is likely the right tool for Taleus, the MyCHIPs successor, whose tally contracts are
  long, composed from standard clauses, and legally significant. It is probably more than a
  chat app needs.

So Stroc is a **general document library**. Its first serious consumer is Taleus, but it must
not depend on Sereus or Taleus, and it should be usable outside Sereus entirely.

Sereus's `docs/strand-contracts.md` and `docs/strand-contracts-review.md` are the design work
that led here. They assumed Sereus would own contracts, which this decision reverses. Their
document-level ideas are preserved below. Their signing, storage and policy ideas belong to
whichever app adopts them and are not repeated here; see those Sereus documents.

## Division of responsibility

The boundary that keeps Stroc general: **Stroc handles documents, apps handle acts.**

| Concern | Owner |
|---|---|
| What a document says, its structure, and its identity (CID) | Stroc |
| Normalizing and validating a document | Stroc |
| Composing documents by reference, and resolving references | Stroc |
| Comparing two documents (structural diff) | Stroc |
| Templates, parameter declarations, and checking a parameter object against a template | Stroc |
| Rendering a document, with caller-supplied tables, to HTML, PDF, text or Markdown | Stroc |
| Authoring: the editor, Markdown import and export | Stroc |
| Fetching bytes over a network | The app, through an interface Stroc defines |
| Who signed what, when, in which context | The app |
| Offers, acceptance, expiry, amendment, termination, what is currently in force | The app |
| A party's memory of which documents it has reviewed and approved | The app |
| Carrying a document reference in a strand invitation | Sereus |

Stroc never verifies an execution signature, never knows what a party or a strand is, and never
decides whether an agreement is in force. If a proposed Stroc feature needs any of those, it
belongs in the app.

## Packaging for consumers of different weight

A chat app may want nothing more than a stable CID for a short agreement. Taleus wants
composition, review support, parameters and PDF output. Both must be able to use Stroc without
taking more than they need.

- **Keep `@stroc/core` small and dependency-light**: types, normalization, validation, encoding,
  CID compute and verify. A light consumer uses only this.
- **Put heavier capabilities in separate packages** a consumer opts into, for example
  composition and resolution, diff, templates and parameters, rendering, Markdown, and the
  editor. The exact split is a design decision for the next stage; the requirement is that core
  never pulls them in.
- **Everything below the editor must run in browsers, Node and React Native.** Sereus apps run on
  all three. Do not use Node-only APIs in core or in any package a phone app would import.
- **The server is a development tool, not part of the library.** Apps must not need it.

## Principles to keep

### Identity

1. **Presentation never affects identity; wording always does.** This is Stroc's founding
   principle and every rule below serves it.
2. **Exactly one encoding is hashed**: IPLD DAG-JSON, SHA-256, CIDv1. Stroc may read and write
   other serializations (YAML, Markdown, a database row), but they are views. If two encodings
   could produce a CID, one document would have two identities.
3. **The CID is external to the document.** It is computed from the content and never stored
   inside it.
4. **Stroc CIDs begin `baguqeera`**, the base32 form of the DAG-JSON codec. Some existing docs
   show `bafy…`, which is the prefix for other codecs; those examples were wrong and the spec is
   now corrected.
5. **A CID inside a document is a DAG-JSON link** (`{"/": "…"}`), not a plain string (decided
   2026-10-06, reversing an earlier preference for strings). A composed contract is then one IPLD
   DAG. Apps still store and sign the root CID as a plain string; that is outside the document.
6. **The hashing pipeline is pinned by golden-vector tests.** A fixed set of documents with
   expected CIDs. Any change that alters a CID is a breaking change to every published document
   and must fail a test before it ships.

### Structure

7. **Sections store nesting, not depth.** A section has no heading level of its own. Its level
   and number are computed at render time from where it sits. This is what lets a clause written
   once be included at any depth, the property the original wylib strdoc had and that plain
   Markdown lacks. It must stay true and should be stated explicitly in the spec.
8. **One paragraph per section.** Additional paragraphs are untitled child sections. Code,
   validation and the sample contracts all already follow this. The spec prose that described
   arrays of sentences was corrected on 2026-10-06.
9. **Addressability stops at the section.** Text inside a paragraph is not separately hashable,
   so a clause that should be reusable or separately reviewable must be its own document,
   included by reference.

### Authoring and interchange

Kyle and Nate discussed whether documents should be authored natively in Markdown. The position
reached: the tree is the native format, and Markdown is an authoring and interchange format that
maps onto it.

10. **The tree is canonical; Markdown is a view of it.** Hashing raw Markdown would let
    presentation affect identity: `*x*` and `_x_` render the same but are different bytes. Parsing
    to the tree first makes them the same document.
11. **Authors need not write JSON.** The editor is one way to author. Compliant Markdown import is
    another, and it is also the path for AI-generated drafts and for authors who prefer a text
    editor. Import is a first-class feature, not an afterthought.
12. **Parse Markdown with a real CommonMark parser** (for example the remark/mdast family), never
    a hand-written one.
13. **Headings in imported Markdown are relative.** The shallowest heading in a fragment becomes
    the fragment's root, whatever level the author typed. That keeps principle 7 true for
    Markdown authors.
14. **The Markdown dialect must be lossless.** Plain Markdown cannot express underline, includes,
    cross-references or document metadata, all of which are hashed content. The dialect needs
    defined syntax for each: front matter for metadata, directives for includes and references,
    and a chosen form for underline. A lossy export would silently drop content when someone
    edits it and imports it back.
15. **The round trip is guaranteed and tested.** Exporting a document to Markdown and importing
    it again must give the same CID. This needs one canonical way to emit each construct.
16. **Two exports, for two jobs.** A *source* export keeps includes as references, so it can be
    edited and re-imported. A *reading* export flattens all includes into one document with
    computed numbering.
17. **Import errors name the line and the rule broken**, such as a duplicate sibling title, an
    unresolved reference, or disallowed markup. Rejection without a reason makes import unusable.

The constraint argument for the tree is weaker than it first looks: a validator can enforce the
same rules on a Markdown dialect, and Markdown import is exactly that validator. The tree's real
advantages are identity (one structure, one hash), composition (relative levels and includes are
natural), and editing (an editor can prevent invalid states as they happen).

### Templates and parameters

A document can be a template that a consumer completes with values: parties, dates, amounts,
specific terms.

18. **Values are never substituted into the text before hashing.** The template keeps one CID
    across every use, which is what lets a reader recognize text already approved elsewhere.
    Values live in a separate parameter object with its own CID. Substitution happens only when
    the document is displayed or rendered.
19. **Placeholders are inline markup** naming a parameter, for example `{{Vendor.name}}` or a
    directive form. The syntax is not chosen yet. It needs a Markdown form as well. The token is
    hashed as part of the text; the value is not.
20. **Every placeholder is declared** in the template's parameter schema, with a type and an
    optional default. Saving a template that uses an undeclared placeholder is a validation
    error.
21. **Placeholders in an included clause are namespaced by the clause's `as` alias**, for example
    `Credit_Terms.limit`, so two clauses that both use `limit` do not collide.
22. **Parameter objects store canonical values** such as ISO dates and plain numbers. The renderer
    formats them for the document's language. Formatting never affects a hash.
23. **A missing value falls back to its declared default**; a missing value with no default is an
    error the consumer sees before signing.
24. **Rendered output marks substituted values visibly**, so a reader can tell the fixed text from
    the deal-specific values. The values are usually what a party most needs to check.
25. **Name the parameter in the prose when writing legal text.** MyCHIPs' `Credit_Terms` headed
    each term with its key, for example "Maximum Balance (limit); Default: 24". This makes a
    template readable before placeholders render.
26. **No conditional text.** Logic such as "if collateral is provided, then…" forces a reader to
    evaluate code to know what they are agreeing to. Optional included sections cover the same
    need.
27. **Do not substitute values that change over the life of an agreement.** If an app lets a party
    change a value later (a credit limit, a notice address), the agreement text should not
    display it inline, or the rendered agreement would read differently from week to week.
    Render such values in a dated table instead; how the app records them is the app's concern.
28. **Stroc should offer two helpers for parameter objects**, which are plain DAG-JSON rather than
    Stroc documents: compute the CID of any canonical DAG-JSON value, and check a parameter
    object against a template's parameter schema.

### Signable documents: the instrument declaration

A document intended to be signed declares that it is one, and describes how. This replaces the
MyCHIPs `top: true` marker, which said only "this may be used directly".

29. **The declaration is part of the template and is hashed with it.** It carries safety
    properties (who must sign, how strong a key is required). If it lived in the parameter
    object, a counterparty could propose the same template under weaker terms.
30. **The declaration is optional.** A document without one is an ordinary document and is not
    offered for signature.
31. **Its contents, as identified so far**: the roles the document defines and whether each is
    transferable; which roles must sign for it to take effect; the parameter schema with
    defaults; whether a one-party instrument may be revoked by its signer; which sections survive
    termination; the longest expiry an offer under it may carry; and a key requirement.
32. **Stroc defines the shape and validates it; the app defines the meaning.** For example, the
    key requirement should be an app-interpreted value, not an enumeration of Sereus key types.
    Taleus-specific concepts must not be built into Stroc.

### Lineage

33. **`replaces`**: an optional array of CIDs, hashed, in which the author says this document
    supersedes those versions. It gives a review tool a definite earlier version to diff against.
34. **`translates`**: the same shape, saying this document is a translation of those. Without it a
    reader who approved a clause in English sees its translation as entirely new.
35. **Both are advisory.** Anyone can publish a document claiming to replace or translate
    anything. They are hints for display and diffing, never inherited approval.

### Composition

36. **Inclusion by CID with a local name** (`source` and `id`) stays. It is what makes clause
    libraries possible, and MyCHIPs' Tally Contract was already composed this way. (The separate
    `as` alias was folded into `id` on 2026-10-06; spec 0.6.)
37. **References stay inside the document and its includes** (settled 2026-10-06). A reusable
    clause refers to anything outside itself by defined terms, never by section reference.
38. **Defined terms need a mechanism.** A template should declare the defined terms (such as
    "Product" or "Pledge of Value") that included clauses use without owning. MyCHIPs relied on
    every tally using the same composition, and a shared library breaks that assumption.

### Review support

Taleus-style apps want to show a party what is new in a document compared with what it has
already approved. Stroc supplies the document side of that.

39. **Structural diff is Stroc's**: given two documents, report differences by section and, within
    a section's paragraph, by sentence. Sentence splitting is computed over the stored paragraph
    string; it is not a storage property.
40. **The memory of what a party approved is the app's.** A typical app classifies each section
    as approved (exact CID seen before), modified (a `replaces` link or similar to an approved
    version, shown as a diff), rejected, or new.
41. **Every review UI must say what a match means**: "you have read this text before", never "this
    text is safe in any context". A clause's meaning depends on its neighbors.

### Resolution

42. **Stroc defines the resolution interface, not the transport.** Given a CID, return the
    document; the app supplies how bytes are fetched (local cache, a peer, a Sereus strand, IPFS,
    HTTP).
43. **Every fetch is verified by recomputing the CID.** No source needs to be trusted.
44. **Provide a bundle helper**: given a root CID, collect the document and everything it includes,
    transitively, into one package. An app can then ship a whole agreement in one message, for
    example alongside a strand invitation.
45. **IPFS is an optional transport, not a dependency.** Stroc's earlier roadmap waited on IPFS
    support; nothing needs it.

### Rendering

46. **The renderer is generic.** It renders a document and resolves placeholders from a supplied
    parameter object. Anything else an app wants on the page (parties, signatures, dates of
    acceptance) the app supplies as tables or blocks. The renderer never interprets them.
47. **Output can be produced offline** from the document bundle and the supplied data.
48. **Output shows each section's CID**, so a printed or saved copy can be checked against the
    original. MyCHIPs' `lib/control/buildpdf.js` is the reference for what a complete executed
    agreement contained: contract text with hashes, party certificates, terms tables, the tally
    id, date and digest, both signatures, and QR codes.

### Signatures

49. **Publisher signatures may belong in Stroc.** An author signing a document they publish lets a
    reader trust a publisher's whole library ("not read yet, but signed by a publisher I trust").
    This is optional and later.
50. **Execution signatures do not belong in Stroc.** Signing an agreement is an act, and acts are
    the app's (see the division of responsibility).

## Where to start

Follow the checklist in [STATUS.md](STATUS.md). Its blocking questions decide several of the
principles above (notably 5, 18 to 32 and 37); this file will be trimmed to match once they are
answered.

## Source material

- Sereus `docs/strand-contracts.md` and `docs/strand-contracts-review.md`: the design and review
  this file distills. Historical for Stroc's purposes; Nate owns them.
- MyCHIPs `contract/*.yaml`, `doc/learn-contract.md`, `doc/learn-tally.md`,
  `lib/control/buildpdf.js`: the original tally contracts and agreement rendering.
- wylib `src/strdoc.vue`: the original structured-document editor, and the origin of relative
  section levels.
