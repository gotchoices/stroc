# Releasing to npm

All `@stroc/*` packages share one version and are released together. Package versions are separate
from the document format version (`stroc: "1.0"`).

## Once

Publishing uses an npm token, so no one-time codes are asked for:

1. On npmjs.com, create a granular access token: read and write on the `@stroc` packages, with
   "Bypass two-factor authentication" ticked. Write tokens expire (at most 90 days); renew it then.
2. Keep it out of the repository, in your account-wide Yarn config:
   `yarn config set npmAuthToken <token> --home` (without `--home` it would go into this
   repository's `.yarnrc.yml`).
3. If `~/.yarnrc.yml` also has an `npmRegistries:` entry (left by `yarn npm login`), delete it:
   it overrides the token above.
4. `yarn npm whoami` prints your npm user name.

## Each release

1. List the changes under `## Unreleased` in [CHANGELOG.md](../CHANGELOG.md) (`git log` since the
   last tag helps). Check `docs/` for anything the changes affect.
2. Commit everything. The release commands refuse to run with uncommitted changes.
3. `yarn release:check`: build, unit tests, lint, browser tests, then packs every package, installs
   the tarballs in a scratch project, and imports, lints and renders with them.
4. `yarn release:version patch` (or `minor`, `major`, or an exact `x.y.z`): sets the version in
   every package, dates the changelog section, commits `Release vX` and tags `vX`.
5. `yarn release:publish`: builds, publishes every package to npm in dependency order, then pushes
   the commit and the tag.

If publishing stops partway, fix the cause and run `yarn release:publish` again. It asks npm
(through your login, which sees new versions at once) which packages already have this version,
and skips them.

Without a token, npm asks for a one-time code for every package (a browser page, then the code at
the prompt; each code works once). A package published for the first time also gets a placeholder
version `0.0.0-stage` (from npm's staged publishing); it is harmless, and `latest` points at the
real version. A new version can take a few minutes to appear to everyone.

## Which number

- **patch**: fixes, no API change
- **minor**: new features, compatible
- **major**: an incompatible API change (after 1.0.0)

Until 1.0.0, a minor bump may break the API. A change to the document format is not a package
release decision: it needs a new format version (see the Specification).

## Notes

- `workspace:*` dependencies are replaced with the exact released version when packed, so a
  release is always a matched set.
- `@stroc/ui` publishes only the built editor bundle (its libraries are bundled in).
- Not yet done: publishing from CI with npm provenance.
