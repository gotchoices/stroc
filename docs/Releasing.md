# Releasing to npm

All `@stroc/*` packages share one version and are released together. Package versions are separate
from the document format version (`stroc: "1.0"`).

## Once

- `yarn npm login` (account with publish rights in the `stroc` npm organization; two-factor on)

## Each release

1. List the changes under `## Unreleased` in [CHANGELOG.md](../CHANGELOG.md) (`git log` since the
   last tag helps). Check `docs/` for anything the changes affect.
2. Commit everything. The release commands refuse to run with uncommitted changes.
3. `yarn release:check`: build, unit tests, lint, browser tests, then packs every package, installs
   the tarballs in a scratch project, and imports, lints and renders with them.
4. `yarn release:version patch` (or `minor`, `major`, or an exact `x.y.z`): sets the version in
   every package, dates the changelog section, commits `Release vX` and tags `vX`.
5. `yarn release:publish`: builds, publishes every package to npm in dependency order (prompts for
   the one-time password), then pushes the commit and the tag.

If publishing stops partway, fix the cause and run `yarn release:publish` again: packages already
published at this version are skipped.

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
