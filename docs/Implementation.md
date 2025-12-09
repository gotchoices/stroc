# Stroc Implementation Plan (Draft)

## Architecture Overview

- **Core Library (TypeScript, framework-agnostic)**
  - Types for Stroc documents
  - Normalization (whitespace, entities, control stripping, NFC)
  - DAG-JSON encoding and CID generation
  - Validation (schema, refs, uniqueness, paths)
  - Import/export (YAML legacy → Stroc JSON; Stroc JSON → YAML/JSON)

- **UI Component (Web Component via Lit)**
  - Embeddable custom element usable in any web framework or plain HTML
  - WYSIWYG + structure edit mode
  - Sentence/paragraph/section editing with auto-split proposals + author override
  - Drag/drop: sections, paragraphs, sentences (move/copy/delete/cross-level)
  - Toolbar: bold/italic/underline; cross-reference insertion; include-by-CID
  - File import/export (YAML/JSON); persistence via host callbacks
  - Optional: theming hooks for host apps

- **Server (Node)**
  - Serve static editor build
  - Endpoints: import/export, DAG-JSON encode, CID generation, IPFS publish/get
  - Thin: delegates logic to the shared core library

## Technology Choices

- **Core**: TypeScript, no UI framework dependency
- **UI**: Lit to build a Web Component (lightweight, embeddable)
- **Server**: Node (Express/Fastify), IPFS client
- **Packaging**: Monorepo with separate packages:
  - `@stroc/core`
  - `@stroc/ui` (Lit Web Component)
  - `@stroc/server` (optional reference server)

## Editor Feature Checklist

- WYSIWYG display; click-to-structure edit
- Auto sentence split proposals; author can merge/split
- Bold/italic/underline (normalized tags, hashed)
- Drag/drop: sections, paragraphs, sentences (move/copy/delete; cross-level)
- Cross-references (`<ref:...>`), validation on save
- Include documents by CID (`source`) with `as` alias
- Import/export: YAML (legacy), JSON (Stroc), DAG-JSON bytes
- Entity decode, control/bidi handling per spec
- Path normalization and uniqueness checks
- Outline panel (optional toggle) to navigate/reorder sections

## UI Interaction Model (Lit Web Component)

- **Layout**: Toolbar + main document surface; optional outline panel (toggle).
- **Toolbar**: Import (YAML/JSON), Export (YAML/JSON/DAG-JSON), Save, Bold/Italic/Underline, Add Section/Paragraph/Sentence, Insert Cross-ref, Include by CID+alias, Toggle “Show structure”.
- **WYSIWYG default**: Document renders normally; click to edit reveals structure for that block.
- **Sentence splitting**: On paragraph edit, propose splits; user can merge/split chips inline; stored sentences are whatever the user confirms.
- **Drag/drop**: Sections, paragraphs, sentences; move/copy/delete; cross-level moves. Outline panel may also support drag/drop.
- **Inline formatting**: Select text → B/I/U; saved markup normalized to canonical order `<b><i><u>...</u></i></b>`.
- **Cross-reference insertion**: Prompt for target path (`as/path`); insert `<ref:...>` token.
- **Include by CID**: Prompt for CID + `as`; insert reference section at selection.
- **Validation UX**: On save, block with inline errors (refs, uniqueness, disallowed chars).
- **Import/Export**: Normalize on import; export Stroc JSON/YAML; DAG-JSON/CID via server.

## Outstanding Implementation Decisions

- IPFS deployment: public network vs private Sereus nodes vs both; gateway strategy
- Tally integration: How Stroc CIDs are referenced in Taleus/MyCHIPs tallies (needs Taleus review)
- Target environments to support for the UI component (browser baseline, mobile PWA expectations)


