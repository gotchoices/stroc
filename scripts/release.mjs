#!/usr/bin/env node
// Release steps for the @stroc packages (see docs/Releasing.md). All packages share one version.
//
//   yarn release:check                     build, every test suite, then pack each package and
//                                          install the tarballs in a scratch project to try them
//   yarn release:version <patch|minor|major|x.y.z>
//                                          set the version everywhere, date the changelog's
//                                          Unreleased section, commit and tag v<version>
//   yarn release:publish                   publish the tagged version to npm and push to git

import { execSync, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', ...opts })
const out = (cmd, opts = {}) => execSync(cmd, { cwd: root, encoding: 'utf8', ...opts }).trim()
const fail = msg => { console.error(`\nrelease: ${msg}`); process.exit(1) }
const step = msg => console.log(`\n== ${msg}`)

// The published packages, in dependency order.
const ORDER = ['core', 'yaml', 'compose', 'render', 'pdf', 'ui', 'server', 'cli']
const manifestPath = dir => path.join(root, 'packages', dir, 'package.json')
const readManifest = dir => JSON.parse(readFileSync(manifestPath(dir), 'utf8'))
const packages = () => {
  const dirs = readdirSync(path.join(root, 'packages')).filter(d => existsSync(manifestPath(d)))
  const public_ = dirs.filter(d => !readManifest(d).private)
  const missing = public_.filter(d => !ORDER.includes(d))
  if (missing.length) fail(`add ${missing.join(', ')} to ORDER in scripts/release.mjs`)
  return ORDER.filter(d => public_.includes(d))
}
const currentVersion = () => readManifest('core').version

function requireClean() {
  if (out('git status --porcelain')) fail('the working tree has uncommitted changes; commit or stash them first')
}

function check() {
  step('build');           run('yarn build')
  step('unit tests');      run('yarn test')
  step('lint');            run('yarn lint')
  step('browser tests');   run('yarn test:e2e')
  step('pack and install')
  const dirs = packages()
  const scratch = mkdtempSync(path.join(tmpdir(), 'stroc-release-'))
  try {
    const tarballs = []
    for (const dir of dirs) {
      const m = readManifest(dir)
      const file = path.join(scratch, `${dir}.tgz`)
      run(`yarn workspace ${m.name} pack --out ${file}`, { stdio: 'pipe' })
      const listing = out(`tar -tzf ${file}`).split('\n')
      for (const need of ['package/LICENSE', 'package/README.md', 'package/package.json']) {
        if (!listing.includes(need)) fail(`${m.name}: the package has no ${need.slice(8)}`)
      }
      const packed = JSON.parse(out(`tar -xOzf ${file} package/package.json`))
      for (const field of ['dependencies', 'peerDependencies']) {
        for (const [name, range] of Object.entries(packed[field] ?? {})) {
          if (String(range).startsWith('workspace:')) fail(`${m.name}: ${field} ${name} is still ${range}`)
        }
      }
      for (const entry of [packed.main, ...Object.values(packed.bin ?? {}), ...Object.values(packed.exports ?? {}).map(e => e.import ?? e)]) {
        if (typeof entry === 'string' && !listing.includes(`package/${entry.replace(/^\.\//, '')}`)) fail(`${m.name}: ${entry} is not in the package`)
      }
      console.log(`${m.name}@${m.version}: ${listing.length} files`)
      tarballs.push(file)
    }
    // Install the tarballs together (so they satisfy each other) in an empty project, then use them.
    const app = path.join(scratch, 'app')
    run(`mkdir -p ${app} && cd ${app} && npm init -y >/dev/null && npm install --no-audit --no-fund ${tarballs.join(' ')}`, { stdio: 'pipe' })
    const libraries = dirs.filter(d => !['ui', 'cli'].includes(d)).map(d => readManifest(d).name)
    run(`node --input-type=module -e "for (const m of ${JSON.stringify(libraries).replace(/"/g, "'")}) await import(m)"`, { cwd: app })
    const contract = path.join(root, 'contracts', 'Tally_Contract.yaml')
    run(`npx --no stroc lint ${contract}`, { cwd: app })
    run(`npx --no stroc render ${contract} -o ${path.join(scratch, 'contract.pdf')}`, { cwd: app })
    if (!existsSync(path.join(app, 'node_modules/@stroc/ui/dist/stroc-editor.js'))) fail('@stroc/ui: the editor bundle is missing')
    console.log('installed packages import, lint and render')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  console.log(`\nrelease check passed for ${currentVersion()}`)
}

function bump(current, how) {
  if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(how)) return how
  const [major, minor, patch] = current.split('-')[0].split('.').map(Number)
  if (how === 'major') return `${major + 1}.0.0`
  if (how === 'minor') return `${major}.${minor + 1}.0`
  if (how === 'patch') return `${major}.${minor}.${patch + 1}`
  fail('usage: yarn release:version <patch|minor|major|x.y.z>')
}

function version(how) {
  requireClean()
  const next = bump(currentVersion(), how)
  if (out(`git tag -l v${next}`)) fail(`tag v${next} already exists`)

  const changelogFile = path.join(root, 'CHANGELOG.md')
  const changelog = readFileSync(changelogFile, 'utf8')
  const m = /^## Unreleased\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(changelog)
  if (!m || !m[1].trim()) fail('CHANGELOG.md: list the changes under "## Unreleased" first')
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  writeFileSync(changelogFile, changelog.replace(m[0], `## Unreleased\n\n## ${next} (${date})\n${m[1]}`))

  for (const dir of packages()) {
    const file = manifestPath(dir)
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^( {2}"version": )"[^"]*"/m, `$1"${next}"`))
  }
  run('git add -A CHANGELOG.md packages/*/package.json')
  run(`git commit -q -m "Release v${next}"`)
  execFileSync('git', ['tag', '-a', `v${next}`, '-m', `v${next}\n\n${m[1].trim()}`], { cwd: root, stdio: 'inherit' })
  console.log(`\nversion ${next}: committed and tagged v${next}. Next: yarn release:publish`)
}

function publish() {
  requireClean()
  const v = currentVersion()
  const tags = out('git tag --points-at HEAD').split('\n')
  if (!tags.includes(`v${v}`)) fail(`HEAD is not tagged v${v}; run yarn release:version first`)
  try { out('yarn npm whoami', { stdio: 'pipe' }) } catch { fail('not logged in to npm; run yarn npm login') }
  step('build'); run('yarn build')
  for (const dir of packages()) {
    const { name } = readManifest(dir)
    step(`publish ${name}@${v}`)
    run(`yarn workspace ${name} npm publish --tolerate-republish`)
  }
  step('push to git')
  run('git push')
  run(`git push origin v${v}`)
  console.log(`\npublished ${v}`)
}

const [command, arg] = process.argv.slice(2)
if (command === 'check') check()
else if (command === 'version') version(arg)
else if (command === 'publish') publish()
else fail('usage: release.mjs check | version <patch|minor|major|x.y.z> | publish')
