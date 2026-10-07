// `stroc link`, run as the built command on temporary folders.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/src/index.js')
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })

const doc = (title: string, extra = '') => `stroc: '0.1'\nlanguage: en\ntitle: ${title}\n${extra}`

let dir: string
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'stroc-link-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))
const file = (name: string) => path.join(dir, name)

describe('stroc link', () => {
  it('replaces file links with CIDs, bottom-up, keeping comments', () => {
    writeFileSync(file('leaf.yaml'), doc('Leaf', 'text: A leaf clause.\n'))
    writeFileSync(file('middle.yaml'), doc('Middle', 'sections:\n  - id: leaf\n    source: {/: ./leaf.yaml}   # the leaf clause\n'))
    writeFileSync(file('top.yaml'), doc('Top', 'text: See <ref:middle/leaf>.\nsections:\n  - id: middle\n    source: {/: middle.yaml}\n'))
    const before = run('lint', file('top.yaml'))
    expect(before.stdout).toContain('is a file, not a CID: run `stroc link`')

    const r = run('link', dir)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('3 of 3 valid')
    const middle = readFileSync(file('middle.yaml'), 'utf8')
    expect(middle).toMatch(/source: \{\/: baguqeera[a-z0-9]+\} {3}# the leaf clause/)
    const leafCid = run('cid', file('leaf.yaml')).stdout.split(' ')[0]
    expect(middle).toContain(leafCid)
    expect(run('lint', file('top.yaml')).status).toBe(0)
    expect(run('link', dir).stdout).toContain('0 files changed')   // nothing left to link
  })

  it('reports a missing file and a cycle, and changes nothing it cannot link', () => {
    writeFileSync(file('a.yaml'), doc('A', 'sections:\n  - id: b\n    source: {/: ./b.yaml}\n'))
    writeFileSync(file('b.yaml'), doc('B', 'sections:\n  - id: a\n    source: {/: ./a.yaml}\n'))
    writeFileSync(file('c.yaml'), doc('C', 'sections:\n  - id: gone\n    source: {/: ./gone.yaml}\n'))
    const r = run('link', dir)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('include cycle')
    expect(r.stdout).toContain('no such file')
    expect(readFileSync(file('c.yaml'), 'utf8')).toContain('./gone.yaml')
  })
})
