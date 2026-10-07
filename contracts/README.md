# Sample Library

The 13 MyCHIPs contract documents, converted to Stroc format `0.1` YAML. They are sample content
for developing and testing Stroc, not legal documents in force. Stroc does not support the legacy
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
| `baguqeeravcxd6xe4hiwi37cc5kzkqcac6ckgvfs7vwsqfrq7oxthfmjwiqga` | CHIP_Definition.yaml |
| `baguqeera6bvvt35rmwsrnobp4hhctkpzvex5365yll4xxuwwd63tchdsdslq` | Credit_Terms.yaml |
| `baguqeeramtnbavhp2wz7wnovfcanrjn7rv6kozrlwryslhwqr7cecvruhc4q` | Defaults.yaml |
| `baguqeeraf7zzdx4c4pagt6lpk6ybquckd4idmwptqf4eafjfwn4cxrg5csea` | Duties_Rights.yaml |
| `baguqeera7ng4eluiooneaufkarxpbk6iwf77e6mqmt44lpcvvstftqojxamq` | Ethics.yaml |
| `baguqeeraype3mnrczouljhczmuyulnn34gx5trbtukftyej42cvets7h4x6a` | Free.yaml |
| `baguqeeraurtgopiqpgclt7x76s72365z73yyuw7ku5vvepns7dllrmxacqrq` | Recitals.yaml |
| `baguqeerardiejtjw7p75ptrt442fsnt3cxbbovp5avlr2wzarmrgjt4hjqzq` | Representations.yaml |
| `baguqeerawiiy2wqafvg7rftiojfvrcxhwp52yckmmidgzk3pjilxsueva62q` | Sending_Value.yaml |
| `baguqeera56bfnrqnf54kmd3c6ovga3mbinfdkwrdqwks6mntqpez22cjszea` | Tally_Contract.yaml |
| `baguqeeraq6zgmmt5c3e3bhvalz2gwvhyz4ik37zlex5hfmh6mfugxdfk5npa` | Tally_Definition.yaml |
| `baguqeeraawxjedwf3rqmgggak6ly64qzbpwlpochthuq56rszxeg3ggcc7hq` | Tally_Testing.yaml |
| `baguqeera6i3jqel72deg3krtailz6oo4km2ahexq5johl6duqojm3jeqohea` | Values.yaml |

The CIDs change whenever the format changes before it is frozen at `1.0`.

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
