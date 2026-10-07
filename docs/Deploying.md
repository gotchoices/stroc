# Publishing a Document Set

How to prepare a set of Stroc documents (for example the tally contracts Taleus offers) and publish
it on a domain (for example sereus.org) so apps can fetch it and confirm who issued it.

The background is in [Specification.md](Specification.md) (Published Sets and Catalogs) and
[Sereus.md](Sereus.md) (Distributing documents). This guide is the practical sequence.

## What gets published

- A **document set** is a folder of Stroc YAML files issued by one publisher, identified by a
  domain.
- Each document the publisher issues says so: `author: sereus.org`.
- The server publishes, for that domain:
  - `/ipfs/<cid>`: each document's canonical bytes (and, for a browser, a readable page);
  - `/.well-known/stroc/catalog.json`: the catalog, saying which documents the domain issues
    (`author`), recommends (`endorse`) or only hosts (`mirror`), and whether each is current,
    superseded or withdrawn;
  - `/`: a human-readable index.
- Apps fetch documents by CID from wherever they like and verify them; they confirm authorship by
  reading the author domain's catalog over HTTPS.

## 1. Prepare the folder

```
taleus-contracts/
  .stroc.yaml              # folder configuration (not a document)
  Tally_Contract.yaml
  Ethics.yaml
  ...
```

`.stroc.yaml`:

```yaml
domain: sereus.org         # the domain this set is served for
endorse: []                # CIDs of documents by other authors that this domain recommends
withdrawn: []              # CIDs no longer recommended
```

Write the documents following [Authoring.md](Authoring.md), with `author: sereus.org` on every
document the domain issues. Starting from the MyCHIPs set: copy `contracts/*.yaml`, change `author`,
and revise the wording for Taleus (for example, any denomination rather than CHIPs).

## 2. Check and link

```
yarn stroc lint taleus-contracts/*.yaml
yarn stroc cid taleus-contracts/*.yaml
```

Included documents are linked by CID, so work bottom-up: finish the clauses, take their CIDs, put
them in the documents that include them, repeat up to the top-level contract. (`stroc update`, which
will do this automatically, is planned; see STATUS.)

## 3. Review

```
yarn stroc serve taleus-contracts --editor --watch     # index, catalog, documents and the editor on :3000
yarn stroc render taleus-contracts/Tally_Contract.yaml -o tally.pdf
```

Read the composed contract in the editor (Preview, ⌘E) or as PDF before publishing. Record the
top-level contract's CID: that is what Taleus offers and both parties sign.

## 4. Deploy

The server is read-only and serves exactly the folder. Two ways to run it:

**Docker**

```
docker build -t stroc-server .
docker run -d --restart unless-stopped -p 127.0.0.1:3100:3000 \
  -v /srv/taleus-contracts:/documents:ro -e STROC_DOMAIN=sereus.org stroc-server
```

**Node directly**: `node packages/server/dist/src/bin.js /srv/taleus-contracts --port 3100 --domain sereus.org`
(settings may also come from `PORT`, `HOST`, `STROC_DOMAIN`).

**Behind the site's HTTPS front end.** The domain's existing web server keeps serving everything
else and forwards only Stroc's paths. Author confirmation requires HTTPS on the domain itself.

Caddy:

```
sereus.org {
  handle /ipfs/* { reverse_proxy 127.0.0.1:3100 }
  handle /.well-known/stroc/* { reverse_proxy 127.0.0.1:3100 }
  # ... the rest of the site as before
}
```

nginx:

```
location /ipfs/ { proxy_pass http://127.0.0.1:3100; }
location /.well-known/stroc/ { proxy_pass http://127.0.0.1:3100; }
```

A human-readable index can be exposed at a page of your choosing by proxying it to the server's `/`.

## 5. Verify

```
curl -s https://sereus.org/.well-known/stroc/catalog.json | head
curl -s -H 'Accept: application/vnd.ipld.raw' https://sereus.org/ipfs/<contract-cid> | head -c 200
```

Then open the contract in the editor with `https://sereus.org` as a source: each included document
should show **✓ Verified** and **✓ Author sereus.org confirmed**.

## 6. Use from Taleus

- Taleus lists `https://sereus.org` among its document sources, and can offer the contracts in that
  catalog marked `author` and `current`.
- A tally proposal records the top-level contract's CID (`TallyContractProposal.ContractCid`); the
  app passes the full bundle to the other party within the strand (see [Sereus.md](Sereus.md)).
- When rendering a contract a party agreed to, the app confirms each document's author domain and
  shows the result.

## 7. Revising and retiring

- **Never delete a published document.** Signed tallies refer to it by CID for as long as they
  exist; keep its file in the folder.
- A revision is a new document with `replaces: [{/: <old cid>}]`. The catalog then marks the old
  one `superseded` automatically. Re-link everything that includes it (step 2).
- To stop recommending a document, list its CID under `withdrawn` in `.stroc.yaml`.
- After changing files, reload the server: `docker kill -s HUP <container>` (or restart it).

## Several apps on one domain

A domain has one catalog, because authorship is confirmed from the domain alone. Options when one
domain hosts documents for several apps (Taleus, chat, bonum...):

- **One shared set** (recommended when the domain issues all of them): one folder, one catalog.
  Mixing is harmless, since CIDs are global and each app uses only the documents it is given.
  *Pending decision*: an optional `collections` field on catalog entries (`taleus`, `chat`), so an
  app can list only its own, and `stroc serve` accepting one folder per collection.
- **A subdomain per app** (`taleus.sereus.org`): its own folder, server and catalog, with
  `author: taleus.sereus.org`. Use this when an app is, or may become, a separate publisher.
- Not supported: one set per path (`sereus.org/taleus/...`). It would put a URL path into the
  author's identity.
