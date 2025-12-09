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

## Outstanding Implementation Decisions

- IPFS deployment: public network vs private Sereus nodes vs both; gateway strategy
- Tally integration: How Stroc CIDs are referenced in Taleus/MyCHIPs tallies (needs Taleus review)
- Target environments to support for the UI component (browser baseline, mobile PWA expectations)


