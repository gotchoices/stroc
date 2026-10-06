# Stroc and Sereus Apps

How Stroc serves applications built on [Sereus](https://sereus.org), and what those apps are
expected to do themselves. Taleus, the MyCHIPs successor, is the first serious consumer; the same
rules apply to any Sereus app that needs documents with a stable identity, such as agreements,
policies or terms of use.

Related documents:
- [Specification.md](Specification.md): the document format.
- [Rendering.md](Rendering.md): the rendering library and legal layout.
- [STATUS.md](STATUS.md): decisions, checklist and defects.

## Position

Sereus does not implement contracts (agreed by Kyle and Nate, October 2026). An app that wants
documents or agreements manages them itself: storing documents, collecting signatures, deciding
what is in force. Sereus strand invitations are planned to carry app-defined parameters, which an
app may use to refer to a document; Sereus carries the reference and does not interpret it.

Stroc is therefore a **general document library**. It must not depend on Sereus or Taleus, and
it must be usable outside Sereus. This file records what Sereus apps need, so the library serves
them well without becoming part of any of them.

## What a Sereus app is working with

These facts shape what Stroc must provide:

- **No global network.** A Sereus network is a strand: one or more parties and their cadre nodes,
  connected with libp2p. There is no IPFS swarm and no place every node can fetch from.
- **No hosts.** A party's presence is its own devices. Documents cannot be looked up on a
  server by a web address, as MyCHIPs did.
- **Offline and on phones.** Apps run in browsers, Node and React Native, often on a phone that is
  not always connected.
- **Long-lived evidence.** An agreement may need to be read, verified and printed years later, after
  a party has left the strand.

## Division of responsibility

**Stroc handles documents; apps handle acts and distribution.**

| Concern | Owner |
|---|---|
| What a document says, its structure and its identity (CID) | Stroc |
| Validating and linting a document | Stroc |
| Composing documents by inclusion; verifying every part | Stroc |
| Bundling a document with everything it includes; importing a bundle | Stroc |
| Parameter declarations, and checking a data object against them | Stroc |
| Rendering to HTML and PDF, with app-supplied data and blocks | Stroc |
| Comparing two documents (structural diff, later) | Stroc |
| Authoring: the editor and the folder tools | Stroc |
| Where documents are obtained, stored and shared | The app |
| Who signed what, when, in which context | The app |
| Offers, acceptance, expiry, amendment, termination, what is in force | The app |
| What a party has already reviewed and approved | The app |
| Carrying a document reference in a strand invitation | Sereus |

Stroc never verifies an execution signature, never knows what a party or a strand is, and never
decides whether an agreement is in force. A proposed Stroc feature that needs any of those
belongs in the app.

## Distributing documents

A document is identified only by its CID. **Documents contain no web addresses**, unlike MyCHIPs,
which recorded a host for each contract. Where to get a document is the app's knowledge, and
since every copy is verified against its CID, no source needs to be trusted.

A typical flow, using Taleus as the example:

1. **A publisher** (for example sereus.org or mychips.org) maintains a library of documents with
   the Stroc folder tools and publishes it: a static set of files named by CID, and a bundle per
   contract. Any web server can host it; IPFS is optional.
2. **The offering party** chooses a contract from a publisher, fetches its bundle, and Stroc
   verifies every document in it against its CID. The app stores the bundle locally.
3. **The offer** carries only the root CID (Taleus: `TallyContractProposal.ContractCid`). The app
   also makes the bundle available to the other party within the strand, for example by writing
   it into a strand table or answering requests for it.
4. **The receiving party** imports the bundle; Stroc verifies it against the CID in the offer and
   renders it for review. Nothing outside the strand is needed.
5. **After acceptance**, each party keeps the bundle with the agreement, so it can be verified and
   printed without any outside source.

What Stroc provides for this:
- **Bundles** as CAR files (the standard IPLD archive): export a root CID and everything it
  includes; import with every block verified.
- **A resolver interface** (`get(cid)`) the app implements over whatever it has: local storage, a
  strand, a publisher's web server, IPFS.
- **A local store helper** that keeps verified documents by CID, and a **missing check** that lists
  which included documents a store does not yet hold, so an app knows what to ask for.
- **A publish format** for the folder tools: a directory of `<cid>` files, CARs and a catalog, with
  a matching HTTP resolver, so a publisher needs only a static web server.
- **A provenance check**: given the publisher's base URL and a CID, report whether the publisher's
  catalog lists it, and in what status.

What stays with the app: which publishers to offer, how bundles travel within the strand, where
they are stored, and how long they are kept.

## Packaging

A light app may want only a stable CID for a short document; Taleus wants composition, parameters
and PDF output. Each takes only what it needs.

- **`@stroc/core` stays small**: types, validation, canonical encoding, CID compute and verify.
- **Heavier capabilities are separate packages**: YAML reading and linting, composition and
  bundles, rendering, the folder tools, the editor. Core never pulls them in.
- **Everything except the editor and the folder tools runs in browsers, Node and React Native.**
  No Node-only APIs in any package a phone app would import.
- **The development server is not part of the library.** No app needs it.

## Guidance for apps

These belong to the app, not to Stroc, but follow directly from how Stroc works:

- **Sign the root CID and the data object's CID, not rendered text.** The CID covers every included
  document; the data object (party names, dates) is separate from the document and must be covered
  separately. Stroc can compute a CID for any data object.
- **Keep shared values and per-party values apart.** If one party's details enter a shared data
  object, each party's copy hashes differently and they no longer agree on the same thing.
- **Keep changing values out of the agreement.** A value a party may revise later (a credit limit,
  a notice address) should not be a document parameter, or the printed agreement would show only
  the value at signing. Record such values as the app's own signed entries and render them as app
  blocks.
- **Record where a document came from.** Alongside the root CID, an offer can carry the base URL
  of the publisher's set it came from, covered by the offerer's signature. The receiving app runs
  Stroc's provenance check and shows the publisher's domain prominently (a lookalike domain passes
  the same check) and the entry's status. It stores what it found ("listed as current by
  sereus.org, checked 2026-10-06"), since the URL may not last. With no publisher, the honest
  message is "custom contract: read it in full or have it reviewed", not a refusal.
- **Store the full bundle with every agreement.** Do not rely on a publisher or a peer remaining
  available.
- **Say what a match means in review screens.** When a party has seen a document's CID before, the
  honest message is "you have read this text before", not "this text is safe": a clause's meaning
  depends on what surrounds it.

## Possible later features

Ideas from the Sereus review that remain relevant but are not scheduled:

- **Structural diff**: differences between two documents by section, and within a paragraph by
  sentence (computed, never stored). Taleus counter-offers make this valuable: "what changed from
  the contract I already reviewed?" `replaces` gives the earlier version to compare against.
- **`translates`**: a link, like `replaces`, stating that a document translates another, so a reader
  who approved the English clause can see its French counterpart as related rather than new.
- **Publisher signatures**: a publisher signs the CIDs it publishes, so a reader can recognize "the
  standard contract from sereus.org" without reading every clause. Without it, an app can achieve
  much the same with a publisher's list of CIDs fetched over HTTPS. Execution signatures remain the
  app's.
- **Defined terms**: a way for a document to declare the terms ("Pledge of Value", "Product") its
  included clauses use without defining, so a clause library does not silently depend on every
  contract defining them the same way.
- **Markdown** as an additional authoring format. If added, it must be lossless and round-trip
  to the same CID, parsed with a real CommonMark parser, with headings taken as relative so a
  fragment can be included at any depth.

Set aside: an "instrument declaration" stating, in the document, who must sign and with what
keys. Taleus defines its signers in its own schema, and who signs is an act, which is the app's.

## Source material

- Sereus `docs/strand-contracts.md` and `docs/strand-contracts-review.md`: the design work this file
  grew out of, written when Sereus was expected to own contracts. Historical for Stroc; Nate owns
  them.
- MyCHIPs `contract/*.yaml`, `lib/control/buildpdf.js`, `schema/contracts.wms`: the original tally
  contracts, PDF rendering and server-side composition.
- wylib `src/strdoc.vue`: the original structured-document editor.
- Taleus `docs/architecture.md` and `packages/taleus-core/schema/draft1.qsql`: how Taleus refers
  to a contract (`ContractCid`) and its arguments.
