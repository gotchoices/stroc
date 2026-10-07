# Writing Stroc Documents

A self-contained guide to writing Stroc documents as YAML files, by hand or with an AI assistant.
Following it produces files that pass `stroc lint`. The full format is in
[Specification.md](Specification.md); nothing here contradicts it.

## A complete example

```yaml
# Comments are allowed anywhere and are not part of the document.
stroc: '0.1'                  # format version, always quoted
language: en                  # BCP 47: en, en-US, fr, es-419...
title: Mutual Confidentiality Agreement
author: example.org           # a domain (verifiable) or a name such as Jane Smith
published: '2026-10-07'       # optional, YYYY-MM-DD, quoted
parameters:                   # optional: values filled in when the agreement is used
  - key: party-a
    label: First Party
  - key: party-b
    label: Second Party
  - key: term-years
    label: Term (years)
    default: '2'              # a parameter with a default is optional
text: >-
  This Agreement is between <param:party-a> (the "First Party") and <param:party-b> (the "Second Party").
  It protects <b>Confidential Information</b> as defined in <ref:definitions>.
sections:
  - id: definitions
    title: Definitions
    text: >-
      In this Agreement the following terms have the meanings given below.
    sections:
      - id: confidential-information
        title: Confidential Information
        text: >-
          Any information disclosed by one party to the other that is marked confidential.
      - text: >-
          An untitled paragraph is simply a section with text and no title.
  - id: obligations
    title: Obligations
    text: >-
      Each party shall keep the other's Confidential Information secret for the period in <ref:term>.
  - id: term
    title: Term
    text: >-
      This Agreement lasts for <param:term-years> years.
  - id: boilerplate
    source: {/: baguqeera...}   # include another published document by its CID
```

## Rules

**The file**
- YAML (or JSON). No anchors (`&x`), aliases (`*x`), tags (`!!str`) or merge keys (`<<`).
- Every value is a string. Quote anything YAML could read as a number, date or boolean: `'0.1'`,
  `'2026-10-07'`, `'2'`, `'yes'`.
- Write paragraphs as folded text (`text: >-`) with **one sentence per line**. The lines are joined
  with single spaces, so a line break is only a convenience. Do not use double-quoted strings for
  text (backslashes mean something else there).

**The document** (top level)
- Required: `stroc: '0.1'`, `language`, `title`.
- Optional: `author` (a lowercase domain the author controls, which can be verified, or a plain
  name), `published`, `text` (a preamble paragraph), `parameters`, `replaces`, `sections`.
- No other fields. Unknown fields are errors (no `name`, `version`, `id` at the top, no `notes`).

**Sections**
- A section has one or more of `title`, `text`, `sections`, and optionally an `id`.
- `text` is **one paragraph**. A second paragraph is another section (usually untitled).
- Sections nest to any depth. Never write numbers in titles or text ("1.2", "Article 3"): numbers
  are computed when the document is rendered, and they change when sections move or the document is
  included elsewhere.
- An **include** is a section with exactly `id` and `source: {/: <cid>}`, nothing else. The included
  document's title becomes this section's heading.
- Omit empty values: no `text: ''`, no `sections: []`.

**Ids**
- Lowercase letters, digits and single hyphens, starting with a letter: `confidential-information`.
- Unique across the whole document (not just among siblings).
- Give an id to any section that is referred to, and to every include. Other sections need none.

**Text**
- Single spaces only; no tabs, line breaks inside a sentence, non-breaking spaces or invisible
  characters. No leading or trailing spaces.
- Characters are literal: write `&`, not `&amp;`. Only `<` and `\` are special (see below);
  `$`, `%`, `#`, `"`, `'`, `*` and everything else are ordinary text. Keep quotation marks as the
  source has them (straight or curly).
- Markup, the only markup there is:
  - `<b>…</b>` bold, `<i>…</i>` italic, `<u>…</u>` underline. Nest them in the order b, i, u
    (`<b><i>x</i></b>`, never `<i><b>x</b></i>`). No space just inside a tag (`<b>x</b> y`, not
    `<b>x </b>y`). Never two of the same tag side by side (`<b>ab</b>`, not `<b>a</b><b>b</b>`).
  - `<param:key>` shows the value of one of this document's parameters (a placeholder). It must name
    a parameter declared in this document's `parameters`.
  - `<ref:id>` refers to a section of this document; `<ref:include-id/section-id>` to a section of an
    included document. It renders as "Section 3.1". A reference can only point into this document
    or what it includes, never to a document that includes this one.
  - Any other `<` is an error. Write a literal `<` as `\<` and a literal backslash as `\\`.
- Titles, labels and the author are plain text: no markup.

**Parameters**
- Each has `key` (same rules as an id), `label`, and optionally `default`.
- Show a value in the text with a placeholder, `<param:key>`, or refer to it by role ("the First
  Party named in the Particulars"). The value is not part of the document: the same document (one
  CID) serves every agreement made from it, and the renderer fills the value in, marked as supplied.
- Do not invent other placeholder syntaxes (`{{name}}`, `[NAME]`, `____`): they are plain text.
- **The Particulars** is a table the renderer generates near the top of the document, listing each
  parameter's label and value. Do not write it yourself.
- Every parameter is listed there whether or not the text mentions it; mentioning it by role is
  good practice, not a requirement.

## Turning an existing document into Stroc

1. **Keep the wording exactly.** Stroc records text; it does not improve it. Fix only spacing and
   formatting. Keep original spelling and capitalization.
2. **Drop the numbering.** "3.2 Notice" becomes a section titled `Notice` nested under the section
   for article 3; an unheaded "3.2 The Renter shall…" becomes an untitled child of article 3.
3. **Cross-references** replace the whole phrase that names a number: "in accordance with Section 4"
   becomes `in accordance with <ref:return>`, because the reference itself renders as "Section 4".
   A reference to an article renders as "Section 3", to a clause as "Section 3.2". If the original
   says "clause 3.2" or "Article 3", the rendered word becomes "Section"; that is accepted. Make
   these changes carefully and only where the original refers to a numbered part.
4. **One paragraph per section.** A clause with three paragraphs is a section with the first
   paragraph as its `text` and two untitled child sections (this works whether or not the clause has
   a title), or a titled section with no text and three untitled children. An unnumbered paragraph
   that continues a clause is a child of that clause; one that stands on its own is a sibling.
   A section whose only content is untitled children is fine.
5. **Headings**: a run-in heading ("5.1 Entire Agreement. This Agreement is…") becomes a `title`
   (without its final period) and `text`. Headings set in capitals only for typography
   ("DEFINITIONS") may be written in normal title case; the renderer styles headings. Keep the
   capitalization of everything else.
6. **Emphasis**: keep bold, italic and underline where the original uses them for meaning; ignore
   fonts, colors, sizes and layout. Words in capitals for emphasis ("shall NOT") stay as written.
7. **Defined terms**: keep them as written (quoted, capitalized, bold if the original bolds them).
8. **Blanks** ("________"): every blank becomes a parameter, labelled with the defined term or a
   short description, and a placeholder where the blank was. The wording stays as it was:
   - `______________ (the "Owner")` becomes `<param:owner> (the "Owner")`;
   - `a weekly rent of $______` becomes `a weekly rent of $<param:weekly-rent>` (or put the currency
     in the value and write `a weekly rent of <param:weekly-rent>`).
9. **Things Stroc cannot express** (tables, images, footnotes, attached schedules): leave the
   reference to them in the text ("the attached schedule") and report them to the author.

## Splitting a document into reusable clauses

Split out a part as its own document when it is reusable across agreements (boilerplate, an ethics
clause, a definitions schedule) or should be reviewable on its own.

- Each part becomes its own file, a complete Stroc document with its own `stroc`, `language` and
  `title`. Its title becomes the heading where it is included.
- A clause must make sense on its own: it may refer only to its own sections. Refer to anything
  outside it by defined terms ("this Agreement", "the Seller"), never by section reference.
- The including document lists it as `- id: <name>` with `source: {/: <cid>}` and nothing else: no
  title (the included document's title becomes the heading there).
- A clause may use terms defined by the documents that include it ("the Owner's premises", "the
  parties"). That is allowed, but makes it reusable only in agreements that define those terms the
  same way; prefer neutral wording in clauses meant for wide reuse.

**CIDs**: a published `source` is the included file's CID. While drafting, write the file instead,
`source: {/: ./general-provisions.yaml}`, and run

```
yarn stroc link drafts/
```

It replaces every such file link with that file's CID, working bottom-up through the files (a
clause's own links first), and touches nothing else in the files. Until then, `stroc lint` reports
each file link. When a clause changes later, its CID changes and the documents that include it must
be updated with its new CID.

## Checking

```
yarn stroc link docs/                # turn include file links into CIDs (drafts)
yarn stroc lint docs/*.yaml          # report problems with line numbers
yarn stroc lint --fix docs/*.yaml    # fix spacing, markup spelling, language case, unquoted values
yarn stroc cid docs/*.yaml           # print each document's CID
yarn stroc render docs/contract.yaml -o contract.pdf   # see the composed result
```

## Instructions for an AI assistant

When asked to express a document in Stroc, give the assistant this file and the source text, and ask
it to:
- produce one YAML file per document (one, or a main document plus clause files), following every
  rule above;
- keep the wording exactly, except for converting cross-references to `<ref:…>`;
- give ids to every referenced section and every include;
- write each include as a link to the clause's file, `source: {/: ./<file-name>.yaml}`; the author
  runs `stroc link` to turn these into CIDs;
- report anything in the source it could not express (tables, images, footnotes).
