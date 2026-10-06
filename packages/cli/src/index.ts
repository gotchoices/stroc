#!/usr/bin/env node
// stroc: command-line tools for Stroc documents.
//   stroc lint [--fix] <files...>   check documents; --fix rewrites what can be fixed mechanically
//   stroc cid <files...>            print the CID of each valid document
import { readFileSync, writeFileSync } from 'node:fs'
import { documentCid } from '@stroc/core'
import { lintYaml, fixYaml, type LocatedProblem } from '@stroc/yaml'

const USAGE = `usage:
  stroc lint [--fix] <files...>   check YAML or JSON documents
  stroc cid <files...>            print each valid document's CID`

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

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
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
