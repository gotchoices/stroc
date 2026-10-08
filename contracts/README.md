# Sample Library

**A reference example, not a live document set.** The 13 MyCHIPs contract documents, converted to
Stroc YAML, used to develop and test Stroc (the tests depend on them) and to show what a real set
looks like. They are not legal documents in force. Taleus's own contracts will be drafted, kept and
published elsewhere, following [Authoring.md](../docs/Authoring.md) and
[Deploying.md](../docs/Deploying.md); they are not expected to live in this repository. Stroc does not support the legacy
MyCHIPs format; these were converted once, and the converter is not part of Stroc.

## What the conversion did

- `contract:` wrapper, `host`, `name`, `version`, `top` and `rid` removed; `host` kept as `author`.
- `language: eng` became `en` (BCP 47).
- Paragraph text: whitespace collapsed to single spaces, written one sentence per line.
- Each reference section (`name` + legacy `source` RID) became an include: an `id` derived from the
  name (`Tally_Definition` → `tally-definition`) and a link to the included file's CID.
- No wording was changed (the original "MyCHIPS Tally Agreement" title is kept as written).

## Structure

`Tally_Contract.yaml` includes nine documents; `Free.yaml` includes five; `Tally_Testing.yaml`
includes `Tally_Contract.yaml`. The other ten are standalone clauses.

| CID | File |
|-----|------|
| `baguqeerauek75qdl53uefgd6veslemr3qr6vyu3xj7nsatxzhwzwcnw2ojta` | CHIP_Definition.yaml |
| `baguqeera5vr3prrozxdee6c3si4qzsk6ifgoucbnolyucjtfapvofxntldna` | Credit_Terms.yaml |
| `baguqeeraufonkmm5gpx3tfx6nxf3hpkp6ovcbep5eq66u3fsw2vxfrfatxsq` | Defaults.yaml |
| `baguqeerawnskbxtditnnnoevid4vp34vnssieony3rmo2m7spldrasyp24rq` | Duties_Rights.yaml |
| `baguqeerads4vaakixvziadouqdplvj5lohjeydij3iiesdfuut4ueerp6giq` | Ethics.yaml |
| `baguqeeralhnuqd3x7yvqwkpyoeyejsqzscja246wx4r7smklgnijhnwwscrq` | Free.yaml |
| `baguqeeralehwsoiftek3dxfsdy5fpj3zp3bf3kvlboxbj6ilq6iyoeyz4a3a` | Recitals.yaml |
| `baguqeera2czwvp2jqycr6emklk7w6mfw435djhstbo7mjb4adz6x673nt6la` | Representations.yaml |
| `baguqeerajfdhmxqwvqxh7fpggdkphxtc4wxp77xkwwgwcuc6hiavdwxwgl4q` | Sending_Value.yaml |
| `baguqeerax7desqybsjlnvrs6p4y4o56prwmlesdwr2xqaegw4fm7n7aqmfka` | Tally_Contract.yaml |
| `baguqeerao5vxoukkxekl2bh35cgvdqmr3yuugqy4yyb2ryhhlwk7fh4whalq` | Tally_Definition.yaml |
| `baguqeeraf7u65pfqeywbf2qqihx6oapsweb6tumwfgxweitxejwi3sx4gvca` | Tally_Testing.yaml |
| `baguqeerawvjgodxyurxfhm5tinrsehqx6c54fce4y4jpptbemh76jkr3eegq` | Values.yaml |

These are the CIDs under format `1.0` (frozen 2026-10-07). They change only when a document changes.

## Using them

```
yarn stroc lint contracts/*.yaml     # check every document
yarn stroc cid contracts/*.yaml      # print each document's CID
```

`yarn stroc serve contracts` serves them over HTTP (index at `/`, documents at `/ipfs/<cid>`,
catalog at `/.well-known/stroc/catalog.json`). `.stroc.yaml` in this folder says they are served for
`mychips.org`, so the catalog lists them with role `author`.

In the editor (`yarn dev`, then `http://localhost:3000/editor/`), File → Open accepts these files.

If you edit a clause, its CID changes and every document that includes it must be updated; the
test in `packages/yaml/test/corpus.test.ts` fails until they are. Until `stroc update` exists
(STATUS, Stage 2), update the `source` links by hand using `stroc cid`.
