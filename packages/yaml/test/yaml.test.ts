import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fromPlain, documentCid } from '@stroc/core'
import { parseYaml, lintYaml, fixYaml, stringifyDocument, sentenceLines } from '../src/index.js'

const coreFixture = (name: string) => fromPlain(JSON.parse(readFileSync(
  new URL(`../../core/test/fixtures/${name}.json`, import.meta.url), 'utf8'))).value

const cidOf = async (doc: unknown) => (await documentCid(doc)).cid?.toString()

describe('stringify then parse gives the same document', () => {
  for (const name of ['minimal', 'clause', 'markup', 'unicode', 'contract']) {
    it(`round-trips ${name} with the same CID`, async () => {
      const doc = coreFixture(name)
      const text = stringifyDocument(doc)
      const back = lintYaml(text)
      expect(back.problems).toEqual([])
      expect(await cidOf(back.value)).toBe(await cidOf(doc))
    })
  }
})

describe('sentenceLines', () => {
  const samples = [
    'One. Two! Three? Four.',
    'Abbreviations such as e.g. and U.S. law may or may not split. Either way the text survives.',
    'He said "Stop." Then left.',
    'A literal \\< escape. <b>Bold sentence.</b> After.',
    'No sentence end',
    'Ends with a colon: then continues.',
  ]
  for (const text of samples) {
    it(`folds back exactly: ${text.slice(0, 30)}`, () => {
      const lines = sentenceLines(text)
      expect(lines.join(' ')).toBe(text)
      for (const line of lines) expect(line).not.toMatch(/^ | $/)
    })
  }
})

describe('YAML rules', () => {
  it('requires values YAML reads as numbers to be quoted', () => {
    const r = lintYaml("stroc: 0.1\nlanguage: en\ntitle: T\n")
    expect(r.problems.map(p => `${p.line} ${p.code}`)).toEqual(['1 not-string'])
  })
  it('rejects anchors, aliases, tags and merge keys', () => {
    expect(lintYaml("stroc: '0.1'\nlanguage: &l en\ntitle: *l\n").problems.map(p => p.code)).toEqual(['yaml-anchor', 'yaml-alias'])
    expect(lintYaml("stroc: !!str 0.1\nlanguage: en\ntitle: T\n").problems.map(p => p.code)).toEqual(['yaml-tag'])
    expect(lintYaml("stroc: '0.1'\nlanguage: en\ntitle: T\n<<: {author: A}\n").problems.map(p => p.code)).toContain('yaml-merge')
  })
  it('rejects duplicate keys', () => {
    expect(lintYaml("stroc: '0.1'\nlanguage: en\ntitle: A\ntitle: B\n").problems.map(p => p.code)).toEqual(['yaml-error'])
  })
  it('accepts JSON, which is YAML', async () => {
    const json = readFileSync(new URL('../../core/test/fixtures/contract.json', import.meta.url), 'utf8')
    const r = lintYaml(json)
    expect(r.problems).toEqual([])
    expect(await cidOf(r.value)).toBe('baguqeera7usd5pm43tx4rx6nretjizkmq3mvlprxhoodwqvgqmnoblz37swq')
  })
  it('reads a link written {/: cid}', () => {
    const r = parseYaml("source: {/: baguqeeraoqsvkl57icpvp2tm52uhmryobrrof557ya5cpnq7isfstfgsxwoa}\n")
    expect(String((r.value as { source: unknown }).source)).toBe('baguqeeraoqsvkl57icpvp2tm52uhmryobrrof557ya5cpnq7isfstfgsxwoa')
  })
  it('reports a malformed link with its line', () => {
    const r = parseYaml("a: 1\nsource: {/: nope}\n")
    expect(r.problems.map(p => `${p.line} ${p.code}`)).toEqual(['2 bad-link'])
  })
  it('locates validation problems by line', () => {
    const text = "stroc: '0.1'\nlanguage: en\ntitle: T\nsections:\n  - title: A\n  - id: Bad\n    text: x\n"
    expect(lintYaml(text).problems.map(p => `${p.line}:${p.col} ${p.code}`)).toEqual(['6:9 bad-id'])
  })
  it('treats double-quoted backslash escapes as YAML errors', () => {
    expect(lintYaml("stroc: '0.1'\nlanguage: en\ntitle: T\ntext: \"a \\< b\"\n").problems[0].code).toBe('yaml-error')
  })
})

describe('fixYaml', () => {
  const messy = [
    '# Keep this comment',
    'stroc: 0.1',
    'language: EN-us',
    'title: Tally  Agreement   # and this one',
    'text: >-',
    '  First  sentence.',
    '  Second sentence.',
    'sections:',
    '  - title: Inner',
    '    text: >-',
    '      Has   extra spaces.',
    '    sections:',
    '      - text: ok',
    '',
  ].join('\n')

  it('fixes what it can and keeps comments and layout', () => {
    const { text, fixed } = fixYaml(messy)
    expect(fixed).toBe(5)
    expect(lintYaml(text).problems).toEqual([])
    expect(text).toContain('# Keep this comment')
    expect(text).toContain('# and this one')
    expect(text).toContain("stroc: '0.1'")
    expect(text).toContain('language: en-US')
    expect(text).toContain('text: >-\n  First sentence.\n  Second sentence.\nsections:')
    expect(text).toContain('      Has extra spaces.\n    sections:')
  })
  it('leaves canonical files untouched', () => {
    const clean = stringifyDocument(coreFixture('clause'))
    expect(fixYaml(clean)).toEqual({ text: clean, fixed: 0 })
  })
  it('does not touch what it cannot fix', () => {
    const text = "stroc: '0.1'\nlanguage: en\ntitle: T\ntext: if a < b\n"
    expect(fixYaml(text).fixed).toBe(0)
    expect(lintYaml(text).problems.map(p => p.code)).toEqual(['bad-tag'])
  })
})
