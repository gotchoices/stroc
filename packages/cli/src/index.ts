#!/usr/bin/env node
// stroc: command-line tools for Stroc documents.
//   stroc lint [--fix] <files...>   check documents; --fix rewrites what can be fixed mechanically
//   stroc cid <files...>            print the CID of each valid document
//   stroc render <file> [options]   compose a document with its includes and write HTML
//   stroc serve <folder> [options]  serve a folder of documents over HTTP
//   stroc link <folder|files...>    replace include links to files with those files' CIDs
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { documentCid } from '@stroc/core'
import { lintYaml, fixYaml, parseYaml, findFileLinks, replaceFileLinks, type LocatedProblem } from '@stroc/yaml'
import { MemoryStore, compose } from '@stroc/compose'
import { layout, toHtml } from '@stroc/render'
import { toPdf } from '@stroc/pdf'
import { startServer, parseServeArgs, SERVE_USAGE } from '@stroc/server'

const USAGE = `usage:
  stroc lint [--fix] <files...>   check YAML or JSON documents
  stroc cid <files...>            print each valid document's CID
  stroc render <file> [--library <dir>] [--data <file>] [--draft] [--qr] [--a4] [-o <out>]
                                  compose <file> with the documents it includes (found among the
                                  documents in --library, default: the file's folder) and write
                                  PDF if <out> ends in .pdf, otherwise HTML (to <out> or standard
                                  output)
  stroc link <folder|files...>    in drafts, replace each include written as a file
                                  (source: {/: ./clause.yaml}) with that file's CID, bottom-up
  stroc serve ${SERVE_USAGE}
                                  serve the folder's documents at /ipfs/<cid>, with a catalog
                                  and index; --watch reloads on change, --editor hosts the editor`

function report(file: string, kind: 'error' | 'warning', p: LocatedProblem) {
  const where = p.line ? `${file}:${p.line}:${p.col}` : file
  const field = p.path.length ? ` (${p.path.join('.')}${p.offset !== undefined ? `, character ${p.offset + 1}` : ''})` : ''
  console.log(`${where}: ${kind} ${p.code}: ${p.message}${field}`)
}

function lint(files: string[], fix: boolean): number {
  let failed = 0
  for (const file of files) {
    let text = readFileSync(file, 'utf8')
    if (fix) {
      const result = fixYaml(text)
      if (result.fixed) {
        writeFileSync(file, result.text)
        console.log(`${file}: fixed ${result.fixed} value${result.fixed === 1 ? '' : 's'}`)
        text = result.text
      }
    }
    const r = lintYaml(text)
    r.problems.forEach(p => report(file, 'error', p))
    r.warnings.forEach(p => report(file, 'warning', p))
    if (!r.valid) failed++
  }
  const ok = files.length - failed
  console.log(`${ok} of ${files.length} document${files.length === 1 ? '' : 's'} valid`)
  return failed ? 1 : 0
}

async function cid(files: string[]): Promise<number> {
  let failed = 0
  for (const file of files) {
    const r = lintYaml(readFileSync(file, 'utf8'))
    const result = r.valid ? await documentCid(r.value) : undefined
    if (result?.cid) console.log(`${result.cid}  ${file}`)
    else {
      failed++
      console.log(`${file}: not valid (run stroc lint ${file})`)
    }
  }
  return failed ? 1 : 0
}

// Load every valid document in a folder into a store, keyed by CID.
async function loadLibrary(dir: string): Promise<MemoryStore> {
  const store = new MemoryStore()
  for (const name of readdirSync(dir).filter(n => /\.(ya?ml|json)$/i.test(n) && !n.startsWith('.'))) {
    const r = lintYaml(readFileSync(path.join(dir, name), 'utf8'))
    if (r.valid) await store.putDocument(r.value)
  }
  return store
}

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

async function render(args: string[]): Promise<number> {
  const valued = new Set(['--library', '--data', '-o'])
  const file = args.find((a, i) => !a.startsWith('-') && !valued.has(args[i - 1]))
  if (!file) { console.error(USAGE); return 2 }
  const lint = lintYaml(readFileSync(file, 'utf8'))
  if (!lint.valid) {
    lint.problems.forEach(p => report(file, 'error', p))
    return 1
  }
  const store = await loadLibrary(option(args, '--library') ?? path.dirname(file))
  const root = await store.putDocument(lint.value)
  const composed = await compose(root, store)
  const dataFile = option(args, '--data')
  const data = dataFile ? parseYaml(readFileSync(dataFile, 'utf8')).value as Record<string, string> : {}
  const result = layout(composed, { data, options: { draft: args.includes('--draft'), cidQr: args.includes('--qr') } })
  result.problems.forEach(p => console.error(`${file}: ${result.layout ? 'warning' : 'error'} ${p.code}: ${p.message}`))
  if (!result.layout) {
    console.error('not rendered (use --draft to render anyway)')
    return 1
  }
  const out = option(args, '-o')
  const output = out?.toLowerCase().endsWith('.pdf')
    ? await toPdf(result.layout, { pageSize: args.includes('--a4') ? 'A4' : 'LETTER' })
    : toHtml(result.layout)
  if (out) {
    writeFileSync(out, output)
    console.error(`${root}  ${file} -> ${out}`)
  } else {
    process.stdout.write(output)
  }
  return 0
}

// Replace file links with CIDs, bottom-up through the files they name.
async function link(args: string[]): Promise<number> {
  const files = args.flatMap(a => statSync(a).isDirectory()
    ? readdirSync(a).filter(n => /\.(ya?ml|json)$/i.test(n) && !n.startsWith('.')).map(n => path.join(a, n))
    : [a]).map(f => path.resolve(f))
  const cids = new Map<string, string>()          // file -> CID, once linked and valid
  const state = new Map<string, 'visiting' | 'done' | 'failed'>()
  let failed = false
  let changed = 0
  const visit = async (file: string, from?: string): Promise<string | undefined> => {
    if (state.get(file) === 'done') return cids.get(file)
    if (state.get(file) === 'failed') return undefined
    if (state.get(file) === 'visiting') { console.log(`${from}: include cycle through ${path.relative('.', file)}`); failed = true; return undefined }
    if (!existsSync(file)) { console.log(`${from}: no such file ${path.relative('.', file)}`); failed = true; return undefined }
    state.set(file, 'visiting')
    let text = readFileSync(file, 'utf8')
    const targets = new Map<string, string | undefined>()
    for (const l of findFileLinks(text)) {
      if (!targets.has(l.target)) targets.set(l.target, await visit(path.resolve(path.dirname(file), l.target), `${path.relative('.', file)}:${l.line}`))
    }
    if (targets.size) {
      const r = replaceFileLinks(text, t => targets.get(t))
      if (r.replaced) {
        writeFileSync(file, r.text)
        changed++
        console.log(`${path.relative('.', file)}: linked ${r.replaced} include${r.replaced === 1 ? '' : 's'}`)
        text = r.text
      }
      for (const u of r.unresolved) console.log(`${path.relative('.', file)}:${u.line}: could not link ${u.target}`)
    }
    const lint = lintYaml(text)
    const result = lint.valid ? await documentCid(lint.value) : undefined
    if (!result?.cid) {
      console.log(`${path.relative('.', file)}: not a valid document yet (run stroc lint ${path.relative('.', file)})`)
      state.set(file, 'failed')
      failed = true
      return undefined
    }
    cids.set(file, result.cid.toString())
    state.set(file, 'done')
    return cids.get(file)
  }
  for (const f of files) await visit(f)
  console.log(`${changed} file${changed === 1 ? '' : 's'} changed; ${cids.size} of ${files.length} valid`)
  return failed ? 1 : 0
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  if (command === 'render') return render(rest)
  if (command === 'link') return rest.length ? link(rest) : (console.error(USAGE), 2)
  if (command === 'serve') {
    const opts = parseServeArgs(rest, process.env)
    if (!opts.folder && !opts.editor) { console.error(USAGE); return 2 }
    await startServer({ ...opts, log: m => console.log(m) })
    return await new Promise<number>(() => undefined)   // runs until interrupted
  }
  const fix = rest.includes('--fix')
  const files = rest.filter(a => a !== '--fix')
  if (!files.length) { console.error(USAGE); return 2 }
  if (command === 'lint') return lint(files, fix)
  if (command === 'cid') return cid(files)
  console.error(USAGE)
  return 2
}

main(process.argv.slice(2)).then(code => { process.exitCode = code }, err => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 2
})
