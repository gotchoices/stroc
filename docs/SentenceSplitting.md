# Sentence Splitting Options (Resource)

This document lists candidate libraries/approaches for editors to propose sentence boundaries. The Stroc specification does **not** mandate any specific splitter; editors must produce one sentence per slot and let authors merge/split as needed.

## Candidate Libraries

| Library | Notes | Best For |
|---------|-------|----------|
| `Intl.Segmenter` (native) | Locale-aware, built into modern browsers/Node | UX convenience in modern environments |
| `@echogarden/text-segmentation` | Multilingual (Latin, Cyrillic, CJK) | Robust, mixed-language text |
| `sbd` | Lightweight, simple | European-language text |
| `sentencex-js` | Conservative splits, broad coverage | Wide-language fallback |
| `winkNLP` | Heavier, full NLP pipeline | If additional NLP is desired |

## Usage Guidance
- Use any locale-aware splitter to propose boundaries.
- Always let the author merge/split; author decision is final.
- Splitting is only during edit; stored sentences are what get hashed. Consumers never split.

