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

Included documents are linked by CID. While drafting, write includes as file links
(`source: {/: ./Ethics.yaml}`) and run `yarn stroc link taleus-contracts/` to replace them with CIDs,
bottom-up.

The tools keep two things in the folder, beside the documents:
- `.stroc-record.json`: which CIDs each file has had (rebuilt from `replaces` lists if lost);
- `.stroc-archive/`: the exact bytes of every version the tools have recorded, so editing a file in
  place never loses a published version. The server serves archived versions as `superseded`.

Keep both with the folder: commit them to git and deploy them with the documents.

## 3. Review

```
yarn stroc serve taleus-contracts --editor --watch     # index, catalog, documents and the editor on :3000
yarn stroc render taleus-contracts/Tally_Contract.yaml -o tally.pdf
```

Read the composed contract in the editor (Preview, ⌘E) or as PDF before publishing. Record the
top-level contract's CID: that is what Taleus offers and both parties sign.

## 4. Deploy

Either export the set as static files for the site's existing web server, or run the Stroc server.

**Static files** (no Node process on the web host)

```
yarn stroc export taleus-contracts -o site/      # then copy site/ to the web root
```

The export writes `ipfs/<cid>` (each document's bytes, current and archived), `ipfs/<cid>.html`
(its readable page), `.well-known/stroc/catalog.json`, `index.html`, and header files for common
hosts. Rerun it after every change. It never deletes or replaces a document, and it leaves alone
any `index.html` or `_headers` it did not write, so it can export into an existing site's root.

| Host | What to do |
|------|------------|
| Apache | Nothing: the exported `.htaccess` files set the headers and serve the page to browsers. Needs `mod_headers`, `mod_rewrite` and `AllowOverride FileInfo` |
| nginx | Add the snippet below |
| Netlify, Cloudflare Pages | Nothing: `_headers` sets the headers. A browser opening `/ipfs/<cid>` gets the bytes, not the page (these hosts cannot choose by `Accept`); the index links to the pages |
| GitHub Pages | Nothing: `.nojekyll` keeps the `.well-known` folder. GitHub Pages sends `Access-Control-Allow-Origin: *` itself; the page for browsers is reached from the index |

nginx (not yet tested against a real nginx):

```
location /ipfs/ {
  default_type application/vnd.ipld.raw;
  add_header Access-Control-Allow-Origin * always;
  add_header X-Content-Type-Options nosniff always;
  add_header Vary Accept always;
  set $page "";
  if ($http_accept ~* "text/html") { set $page ".html"; }
  if ($arg_format) { set $page ""; }
  try_files $uri$page $uri =404;
}
location /.well-known/stroc/ {
  add_header Access-Control-Allow-Origin * always;
  add_header X-Content-Type-Options nosniff always;
}
```

Compared with the server, a static host has no `406` for CAR requests (none are served yet) and
picks up changes only when you export again.

**The Stroc server**

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

With static files, also check the headers: `curl -sI https://sereus.org/.well-known/stroc/catalog.json`
should show `Access-Control-Allow-Origin: *` (browser-based clients need it).

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

- **Never delete a published version.** Signed tallies refer to it by CID for as long as they exist.
  Editing a file in place is fine once the tools have recorded its current version (run
  `stroc status` before editing a published set): the old bytes stay in `.stroc-archive/` and are
  still served. Do not delete the archive.
- Revise a document by editing it and adding `replaces: [{/: <old cid>}]` (`stroc status` reminds
  you). Then bring the documents that include it up to date:

  ```
  yarn stroc status taleus-contracts       # what is outdated, and where
  yarn stroc update taleus-contracts --all # update includes up to the top; each changed document
                                           # records the version it replaces
  ```

  The catalog marks replaced and archived versions `superseded` automatically.
- To stop recommending a document, list its CID under `withdrawn` in `.stroc.yaml`.
- After changing files, reload the server (`docker kill -s HUP <container>`, or restart it), or
  export again and copy the new files to the web root.

## Several apps on one domain

A domain has one catalog, because authorship is confirmed from the domain alone. Options when one
domain hosts documents for several apps (Taleus, chat, bonum...):

- **One shared set** (recommended when the domain issues all of them): one folder, one catalog.
  Mixing is harmless, since CIDs are global and each app uses only the documents it is given.
  An optional `collections` field on catalog entries (`taleus`, `chat`), so an app could list only
  its own, was considered and deferred (2026-10-07) until a need appears.
- **A subdomain per app** (`taleus.sereus.org`): its own folder, server and catalog, with
  `author: taleus.sereus.org`. Use this when an app is, or may become, a separate publisher.
- Not supported: one set per path (`sereus.org/taleus/...`). It would put a URL path into the
  author's identity.
