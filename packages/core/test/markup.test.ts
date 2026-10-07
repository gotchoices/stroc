import { describe, it, expect } from 'vitest'
import { parseMarkup, findReferences, markupToPlainText, escapeMarkupText, canonicalMarkup } from '../src/index.js'

const codes = (s: string) => parseMarkup(s).issues.map(i => i.code)

describe('parseMarkup: valid text', () => {
  it('parses plain text', () => {
    expect(parseMarkup('Hello.')).toEqual({ nodes: [{ type: 'text', value: 'Hello.' }], issues: [] })
  })
  it('parses emphasis and references', () => {
    const { nodes, issues } = parseMarkup('The <b>Stock Holder</b> must <i>not</i> see <ref:ethics/good-faith>.')
    expect(issues).toEqual([])
    expect(nodes.map(n => n.type)).toEqual(['text', 'emphasis', 'text', 'emphasis', 'text', 'ref', 'text'])
    expect(findReferences(nodes)).toEqual([{ path: ['ethics', 'good-faith'], offset: 44 }])
    expect(markupToPlainText(nodes)).toBe('The Stock Holder must not see ethics/good-faith.')
  })
  it('accepts canonical nesting', () => {
    expect(codes('<b><i><u>x</u></i></b>')).toEqual([])
    expect(codes('<b>a <i>b</i> c</b>')).toEqual([])
    expect(codes('<b>see <ref:cure></b>')).toEqual([])
    expect(codes('<b>a</b> <b>b</b>')).toEqual([])
  })
  it('resolves escapes', () => {
    const { nodes, issues } = parseMarkup('if a \\< b and c\\\\d')
    expect(issues).toEqual([])
    expect(markupToPlainText(nodes)).toBe('if a < b and c\\d')
  })
  it('treats > and & as literal', () => {
    expect(codes('a > b & c')).toEqual([])
  })
})

describe('parseMarkup: errors', () => {
  it('rejects a bare <', () => expect(codes('if a < b')).toEqual(['bad-tag']))
  it('rejects tag look-alikes', () => {
    expect(codes('<B>x</B>')).toEqual(['bad-tag', 'bad-tag'])
    expect(codes('<b class="x">y</b>')).toEqual(['bad-tag', 'unbalanced'])
    expect(codes('<script>x</script>')).toEqual(['bad-tag', 'bad-tag'])
    expect(codes('<br>')).toEqual(['bad-tag'])
  })
  it('rejects bad escapes', () => {
    expect(codes('a\\nb')).toEqual(['bad-escape'])
    expect(codes('trailing\\')).toEqual(['bad-escape'])
  })
  it('rejects bad references', () => {
    expect(codes('<ref:>')).toEqual(['bad-ref'])
    expect(codes('<ref:Cure>')).toEqual(['bad-ref'])
    expect(codes('<ref:a//b>')).toEqual(['bad-ref'])
    expect(codes('<ref:cure')).toEqual(['bad-ref'])
    expect(codes('<ref:a b>')).toEqual(['bad-ref'])
  })
  it('rejects unbalanced and unclosed tags', () => {
    expect(codes('<b>x')).toEqual(['unclosed'])
    expect(codes('x</b>')).toEqual(['unbalanced'])
    expect(codes('<b><i>x</b></i>')).toContain('unbalanced')
  })
  it('enforces one spelling', () => {
    expect(codes('<b></b>')).toEqual(['empty-emphasis'])
    expect(codes('<b>a <b>b</b></b>')).toEqual(['nested-same'])
    expect(codes('<i><b>x</b></i>')).toEqual(['emphasis-order'])
    expect(codes('<u><i>x</i></u>')).toEqual(['emphasis-order'])
    expect(codes('<i>a<b>b</b>c</i>')).toEqual(['emphasis-order'])
    expect(codes('<u>a <b>b</b></u>')).toEqual(['emphasis-order'])
    expect(codes('<i>a</i><b><i>b</i></b><i>c</i>')).toEqual([])
    expect(codes('<b>a</b><b>b</b>')).toEqual(['adjacent-emphasis'])
    expect(codes('<b> a</b>')).toEqual(['emphasis-edge-space'])
    expect(codes('<b>a </b>b')).toEqual(['emphasis-edge-space'])
  })
  it('reports offsets', () => {
    expect(parseMarkup('ok <x> ok').issues[0].offset).toBe(3)
  })
})

describe('escapeMarkupText', () => {
  it('round-trips literal text', () => {
    const literal = 'if a < b then c\\d'
    expect(markupToPlainText(parseMarkup(escapeMarkupText(literal)).nodes)).toBe(literal)
  })
})

describe('canonicalMarkup', () => {
  const cases: [string, string][] = [
    ['plain text', 'plain text'],
    ['<i><b>x</b></i>', '<b><i>x</i></b>'],
    ['<i>a<b>b</b>c</i>', '<i>a</i><b><i>b</i></b><i>c</i>'],
    ['<b>a</b><b>b</b>', '<b>ab</b>'],
    ['<b> a </b>b', 'a b'.replace('a', '<b>a</b>')],
    ['  lots   of\tspace\n', 'lots of space'],
    ['<b></b>x', 'x'],
    ['x <b> </b> y', 'x y'],
    ['see <b><ref:cure></b> now', 'see <b><ref:cure></b> now'],
    ['a \\< b \\\\ c', 'a \\< b \\\\ c'],
    ['zero\u200Bwidth\u00A0nbsp', 'zerowidth nbsp'],
  ]
  for (const [input, expected] of cases) {
    it(`writes ${JSON.stringify(input)} canonically`, () => {
      expect(canonicalMarkup(input)).toBe(expected)
    })
  }
  it('always produces valid, idempotent markup', () => {
    const samples = [
      '<u>x <i>y <b>z</b></i></u>', '<i>a</i> <i>b</i>', '<u><u>x</u></u>', '<b>a <i> b </i> c</b>',
      ...cases.map(c => c[0]),
    ]
    for (const s of samples) {
      const once = canonicalMarkup(s)
      expect(parseMarkup(once).issues, `${s} -> ${once}`).toEqual([])
      expect(canonicalMarkup(once)).toBe(once)
    }
  })
  it('gives the same spelling for the same formatting', () => {
    expect(canonicalMarkup('<i>a<b>b</b>c</i>')).toBe(canonicalMarkup('<i>a</i><b><i>b</i></b><i>c</i>'))
    expect(canonicalMarkup('<u><i><b>x</b></i></u>')).toBe(canonicalMarkup('<b><u><i>x</i></u></b>'))
  })
  it('leaves the golden fixture text unchanged', () => {
    const t = 'Plain, <b>bold</b>, <i>italic</i>, <u>underlined</u>, <b><i><u>all three</u></i></b>, <b>bold with <i>italic</i> inside</b>, a literal \\< and a literal \\\\, plus > and & as typed.'
    expect(canonicalMarkup(t)).toBe(t)
  })
})

describe('placeholders', () => {
  it('parses <param:key>', () => {
    const { nodes, issues } = parseMarkup('Rent of <b><param:weekly-rent></b> weekly.')
    expect(issues).toEqual([])
    expect(markupToPlainText(nodes)).toBe('Rent of [weekly-rent] weekly.')
  })
  it('rejects malformed placeholders', () => {
    expect(codes('<param:>')).toEqual(['bad-param'])
    expect(codes('<param:Weekly Rent>')).toEqual(['bad-param'])
    expect(codes('<param:rent')).toEqual(['bad-param'])
  })
  it('keeps placeholders in canonical markup', () => {
    expect(canonicalMarkup('<i>pay <param:rent> </i>now')).toBe('<i>pay <param:rent></i> now')
  })
})
