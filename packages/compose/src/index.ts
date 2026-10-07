// Composition: fetch and verify a document and everything it includes, number the whole tree,
// resolve cross-references and gather parameters (Specification: Composition, Cross-References,
// Parameters, Document Resolution and Verification).
//
// Where bytes come from is the app's business: it supplies a Resolver. Every fetched document is
// verified against its CID before use.

import { CID } from 'multiformats/cid'
import {
  verifyDocument, computeCid, encodeDagJson, parseMarkup,
  type MarkupNode, type Problem, type StrocDocument, type StrocSection, type Parameter,
} from '@stroc/core'

// ---------------------------------------------------------------------------------------------
// Resolvers and stores

export interface Resolver {
  // The bytes of the document with this CID, or undefined if not available.
  get(cid: CID): Promise<Uint8Array | undefined>
}

// An in-memory content-addressed store. Documents are keyed by the CID of their bytes.
export class MemoryStore implements Resolver {
  private blocks = new Map<string, Uint8Array>()

  async get(cid: CID): Promise<Uint8Array | undefined> {
    return this.blocks.get(cid.toString())
  }

  has(cid: CID): boolean {
    return this.blocks.has(cid.toString())
  }

  // Store bytes under their CID and return it. (Bytes are verified when read, not here.)
  async put(bytes: Uint8Array): Promise<CID> {
    const cid = await computeCid(bytes)
    this.blocks.set(cid.toString(), bytes)
    return cid
  }

  // Store a document from the data model in its canonical encoding.
  async putDocument(doc: unknown): Promise<CID> {
    return this.put(encodeDagJson(doc))
  }

  get size(): number {
    return this.blocks.size
  }
}

// Try several resolvers in order (for example a local store, then a peer, then a publisher).
export function firstOf(...resolvers: Resolver[]): Resolver {
  return {
    async get(cid) {
      for (const r of resolvers) {
        const bytes = await r.get(cid)
        if (bytes) return bytes
      }
      return undefined
    },
  }
}

// The CIDs reachable from root that the resolver cannot supply. Documents that are present are
// verified and followed; an empty result means the whole composition is available.
export async function findMissing(root: CID, resolver: Resolver): Promise<CID[]> {
  const missing: CID[] = []
  const seen = new Set<string>()
  const visit = async (cid: CID) => {
    if (seen.has(cid.toString())) return
    seen.add(cid.toString())
    const bytes = await resolver.get(cid)
    if (!bytes) { missing.push(cid); return }
    const v = await verifyDocument(bytes, cid)
    if (v.document) for (const link of includeLinks(v.document.sections)) await visit(link)
  }
  await visit(root)
  return missing
}

function includeLinks(sections?: StrocSection[]): CID[] {
  const out: CID[] = []
  for (const s of sections ?? []) {
    if ('source' in s) out.push(s.source)
    else out.push(...includeLinks(s.sections))
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// The composed tree

// A reference after composition: the target's number in the composed document, if it resolved.
export type ComposedInline =
  | { type: 'text', value: string }
  | { type: 'emphasis', tag: 'b' | 'i' | 'u', children: ComposedInline[] }
  | { type: 'ref', path: string[], target?: number[] }

export interface ComposedSection {
  number: number[]               // e.g. [3, 1] for section 3.1
  id?: string                    // the section's id within its own document
  title?: string
  text?: ComposedInline[]
  sections: ComposedSection[]
  include?: {                    // present when this section is an included document
    cid: CID
    document: StrocDocument
  }
}

export interface ParameterGroup {
  section?: { number: number[], title: string }   // absent for the root document's own parameters
  prefix: string[]                                // include ids leading to the declaring document
  parameters: Parameter[]
}

export interface Composed {
  cid: CID
  document?: StrocDocument       // absent if the root itself could not be loaded
  title: string
  language: string
  text?: ComposedInline[]
  sections: ComposedSection[]
  parameters: ParameterGroup[]
  problems: Problem[]             // missing or invalid documents, unresolved references
}

interface Scope {
  ids: Map<string, ComposedSection>              // ids declared in this document
  includes: Map<string, Scope>                   // scopes of included documents, by include id
}

interface Pending {
  nodes: ComposedInline[]
  scope: Scope
  at: string                                     // where, for messages
}

const MAX_DEPTH = 64

// Compose a document by CID. Never throws: anything missing, invalid or unresolved is reported in
// `problems`, and the parts that could not be composed are left out.
export async function compose(root: CID | string, resolver: Resolver): Promise<Composed> {
  const rootCid = typeof root === 'string' ? CID.parse(root) : root
  const problems: Problem[] = []
  const pending: Pending[] = []
  const parameters: ParameterGroup[] = []
  const cache = new Map<string, StrocDocument | null>()

  const load = async (cid: CID, at: string): Promise<StrocDocument | undefined> => {
    const key = cid.toString()
    if (cache.has(key)) return cache.get(key) ?? undefined
    const bytes = await resolver.get(cid)
    if (!bytes) {
      problems.push({ path: [], code: 'missing-document', message: `${at}: document ${key} is not available` })
      cache.set(key, null)
      return undefined
    }
    const v = await verifyDocument(bytes, cid)
    if (!v.ok || !v.document) {
      const why = v.problems.map(p => `${p.path.join('.') || 'document'}: ${p.message}`).join('; ')
      problems.push({ path: [], code: 'invalid-document', message: `${at}: document ${key} failed verification: ${why}` })
      cache.set(key, null)
      return undefined
    }
    cache.set(key, v.document)
    return v.document
  }

  const convertText = (text: string, scope: Scope, at: string): ComposedInline[] => {
    const convert = (nodes: MarkupNode[]): ComposedInline[] => nodes.map(n =>
      n.type === 'text' ? { type: 'text', value: n.value } :
      n.type === 'ref' ? { type: 'ref', path: n.path } :
      { type: 'emphasis', tag: n.tag, children: convert(n.children) })
    const nodes = convert(parseMarkup(text).nodes)
    pending.push({ nodes, scope, at })
    return nodes
  }

  // Compose a document's sections under a parent number, in the document's own id scope.
  const composeSections = async (
    sections: StrocSection[] | undefined, parent: number[], scope: Scope, prefix: string[], depth: number, at: string,
  ): Promise<ComposedSection[]> => {
    const out: ComposedSection[] = []
    let n = 0
    for (const sec of sections ?? []) {
      n++
      const number = [...parent, n]
      if ('source' in sec) {
        const placeholder: ComposedSection = { number, id: sec.id, sections: [] }
        scope.ids.set(sec.id, placeholder)
        out.push(placeholder)
        if (depth >= MAX_DEPTH) {
          problems.push({ path: [], code: 'too-deep', message: `${at}: includes nested more than ${MAX_DEPTH} deep` })
          continue
        }
        const doc = await load(sec.source, `${at} > ${sec.id}`)
        if (!doc) continue
        const inner: Scope = { ids: new Map(), includes: new Map() }
        scope.includes.set(sec.id, inner)
        const innerPrefix = [...prefix, sec.id]
        placeholder.title = doc.title
        placeholder.include = { cid: sec.source, document: doc }
        if (doc.parameters) parameters.push({ section: { number, title: doc.title }, prefix: innerPrefix, parameters: doc.parameters })
        if (doc.text) placeholder.text = convertText(doc.text, inner, `${at} > ${sec.id}`)
        placeholder.sections = await composeSections(doc.sections, number, inner, innerPrefix, depth + 1, `${at} > ${sec.id}`)
      } else {
        const section: ComposedSection = { number, sections: [] }
        if (sec.id) { section.id = sec.id; scope.ids.set(sec.id, section) }
        if (sec.title) section.title = sec.title
        if (sec.text) section.text = convertText(sec.text, scope, at)
        section.sections = await composeSections(sec.sections, number, scope, prefix, depth, at)
        out.push(section)
      }
    }
    return out
  }

  const document = await load(rootCid, 'root')
  if (!document) {
    return { cid: rootCid, title: '', language: '', sections: [], parameters: [], problems }
  }
  const rootScope: Scope = { ids: new Map(), includes: new Map() }
  if (document.parameters) parameters.unshift({ prefix: [], parameters: document.parameters })
  const text = document.text ? convertText(document.text, rootScope, 'root') : undefined
  const sections = await composeSections(document.sections, [], rootScope, [], 0, 'root')
  // Root parameters first, then included documents' in document order.
  parameters.sort((a, b) => compareNumbers(a.section?.number ?? [], b.section?.number ?? []))

  // Resolve references now that every scope is complete.
  for (const p of pending) resolveRefs(p.nodes, p.scope, p.at, problems)

  return { cid: rootCid, document, title: document.title, language: document.language, text, sections, parameters, problems }
}

function resolveRefs(nodes: ComposedInline[], scope: Scope, at: string, problems: Problem[]) {
  for (const node of nodes) {
    if (node.type === 'emphasis') resolveRefs(node.children, scope, at, problems)
    if (node.type !== 'ref') continue
    let current: Scope | undefined = scope
    let target: ComposedSection | undefined
    for (let i = 0; i < node.path.length && current; i++) {
      target = current.ids.get(node.path[i])
      if (!target) break
      current = i < node.path.length - 1 ? current.includes.get(node.path[i]) : undefined
      if (i < node.path.length - 1 && !current) { target = undefined; break }
    }
    if (target) node.target = target.number
    else problems.push({ path: [], code: 'unresolved-ref', message: `${at}: <ref:${node.path.join('/')}> does not resolve in the composed document` })
  }
}

function compareNumbers(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d) return d
  }
  return 0
}

// "3.1" for [3, 1].
export function formatNumber(number: number[]): string {
  return number.join('.')
}
