// The library maintenance cycle: link, edit, status, update, with every version archived and served.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { startServer } from '@stroc/server'

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/src/index.js')
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
const doc = (title: string, extra = '') => `stroc: '0.1'\nlanguage: en\ntitle: ${title}\nauthor: example.org\n${extra}`
const cidOf = (f: string) => run('cid', f).stdout.split(' ')[0]

let dir: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'stroc-maintain-'))
  writeFileSync(path.join(dir, '.stroc.yaml'), 'domain: example.org\n')
  writeFileSync(path.join(dir, 'clause.yaml'), doc('Clause', 'text: >-\n  The original wording.\n'))
  writeFileSync(path.join(dir, 'contract.yaml'), doc('Contract', 'sections:\n  - id: clause\n    source: {/: ./clause.yaml}\n'))
  writeFileSync(path.join(dir, 'master.yaml'), doc('Master', 'sections:\n  - id: contract\n    source: {/: ./contract.yaml}\n'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))
const f = (n: string) => path.join(dir, n)

describe('stroc status and update', () => {
  it('finds outdated includes after an edit and brings everything up to date, archiving every version', async () => {
    expect(run('link', dir).status).toBe(0)
    const v1 = { clause: cidOf(f('clause.yaml')), contract: cidOf(f('contract.yaml')), master: cidOf(f('master.yaml')) }
    expect(run('status', dir).stdout).toContain('every include in this folder is current')

    writeFileSync(f('clause.yaml'), doc('Clause', 'text: >-\n  The revised wording.\n'))
    const st = run('status', dir)
    expect(st.status).toBe(1)
    expect(st.stdout).toContain('OUTDATED: an earlier version of clause.yaml')
    expect(st.stdout).toContain('add it to replaces')

    const up = run('update', dir, '--all')
    expect(up.stdout).toContain('contract.yaml: updated 1 include')
    expect(up.stdout).toContain('master.yaml: updated 1 include')   // the cascade
    expect(run('status', dir).status).toBe(0)
    expect(run('lint', f('clause.yaml'), f('contract.yaml'), f('master.yaml')).stdout).toContain('3 of 3 documents valid')
    expect(readFileSync(f('contract.yaml'), 'utf8')).toContain(`replaces:\n  - {/: ${v1.contract}}`)

    // Every recorded version is archived, so the original contract can still be served.
    const archived = readdirSync(f('.stroc-archive')).map(n => n.replace('.json', ''))
    for (const cid of Object.values(v1)) expect(archived).toContain(cid)
    const server = await startServer({ folder: dir, port: 0 })
    try {
      expect((await fetch(`${server.url}/ipfs/${v1.master}?format=raw`)).status).toBe(200)
      const catalog = await (await fetch(`${server.url}/.well-known/stroc/catalog.json`)).json()
      const entry = (cid: string) => catalog.entries.find((e: { cid: string }) => e.cid === cid)
      expect(entry(v1.clause).status).toBe('superseded')
      expect(entry(v1.master).status).toBe('superseded')
      expect(entry(cidOf(f('master.yaml'))).status).toBe('current')
    } finally { server.close() }
  })

  it('updates only the files named, then reports what is newly outdated', () => {
    run('link', dir)
    writeFileSync(f('clause.yaml'), doc('Clause', 'text: >-\n  Changed.\n'))
    const up = run('update', dir, 'contract.yaml')
    expect(up.stdout).toContain('contract.yaml: updated 1 include')
    expect(up.stdout).toContain('now outdated: master.yaml')
  })

  it('rebuilds what it can when the record file is lost', () => {
    run('link', dir)
    writeFileSync(f('clause.yaml'), doc('Clause', 'text: >-\n  Changed.\n'))
    run('update', dir, '--all')
    rmSync(f('.stroc-record.json'))
    expect(existsSync(f('.stroc-record.json'))).toBe(false)
    // replaces lists still connect the old CIDs to their files
    expect(run('status', dir).stdout).toContain('every include in this folder is current')
  })
})
