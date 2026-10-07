# Testing

How Stroc is tested, and the rules that keep the tests useful as the code changes.

## Layers

| Layer | Command | What it pins | Breaks when |
|-------|---------|--------------|-------------|
| Unit (Vitest), every package | `yarn test` | Hashing (golden CIDs), canonical text and markup, validation rules, YAML read/write/fix, composition and references, layout and PDF definition, the editor's document model, the server, CLI commands (run as built) | Behavior changes |
| Sample library | `yarn test` (yaml, render) | Every `contracts/*.yaml` valid, includes current, and the rendered outline of the Tally Contract (snapshot) | A document, composition or numbering changes |
| End to end (Playwright) | `yarn test:e2e` | The editor's established features, as a user exercises them, in Chromium, WebKit (Safari's engine) and Firefox | A feature stops working in some browser |

Most behavior lives below the UI and is tested there: those tests do not care what the editor looks
like. The end-to-end suite is small: one journey per established feature.

## Rules for end-to-end tests

1. **Assert outcomes, not appearance.** Check the document model, the CID or a downloaded file
   after an action, not pixels or exact wording. Layout is checked only where a feature depends on
   it (for example, that Preview keeps the full width), as a proportion, never in pixels.
2. **Find controls by `data-test` ids** (`page.getByTestId('cmd-open-sources')`), not by CSS classes
   or label text. Commands are `cmd-<name>`, menus `menu-<name>`, dialogs `dialog-<name>`; sections
   are found by `data-sec`, paragraphs by `stroc-paragraph[data-key]`. Renaming or restyling a
   control must not break a test; removing a feature should.
3. **Use real input.** Type with the keyboard, drag with the mouse. Set up state directly (seed
   sections through the component) only to reach the behavior under test quickly.
4. **Every bug found becomes a test**, in the layer where it can be caught most cheaply. Current
   examples: editing failed in Safari (selection inside shadow DOM), the reference picker lost the
   caret on redraw, paste dropped a space at the caret, Preview collapsed to a narrow column.

## Snapshots

`packages/render/test/__snapshots__/` holds the semantic outline of the rendered sample contract:
block kinds, section numbers, titles, include CIDs and which paragraphs contain references. It
changes only when composition or numbering changes. When a change is intended, review the diff and
update it with `yarn workspace @stroc/render test -u`.

## Golden vectors

`packages/core/test/cid.test.ts` pins the CIDs of fixed documents. A failure there means every
published document would get a new identity. Change an expected value only as a deliberate format
change, together with the `stroc` version.

## Running everything

```
yarn build && yarn test && yarn lint && yarn test:e2e
```

`yarn test:e2e` builds and starts its own server on port 3990 and uses Playwright's browsers
(`yarn playwright install` once). Failures keep a trace: `yarn playwright show-trace <path>`.
