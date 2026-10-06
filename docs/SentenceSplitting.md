# Sentence Splitting Options (Resource)

This document lists candidate libraries for tools that want to show sentence boundaries (for example, a sentence-level diff or one-sentence-per-line source formatting). Stroc stores one paragraph string per section; sentences are never stored or hashed separately, and the specification does **not** mandate any splitter.

## Candidate Libraries

| Library | Notes | Best For |
|---------|-------|----------|
| `Intl.Segmenter` (native) | Locale-aware, built into modern browsers/Node | UX convenience in modern environments |
| `@echogarden/text-segmentation` | Multilingual (Latin, Cyrillic, CJK) | Robust, mixed-language text |
| `sbd` | Lightweight, simple | European-language text |
| `sentencex-js` | Conservative splits, broad coverage | Wide-language fallback |
| `winkNLP` | Heavier, full NLP pipeline | If additional NLP is desired |

## Usage Guidance
- Use any locale-aware splitter.
- Splitting is a display or tooling aid only; it never changes the stored paragraph or its hash.

