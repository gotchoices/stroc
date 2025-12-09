import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagJson from '@ipld/dag-json'

export async function encodeDagJson(doc: unknown): Promise<Uint8Array> {
  return dagJson.encode(doc)
}

export async function computeCid(bytes: Uint8Array): Promise<string> {
  const hash = await sha256.digest(bytes)
  const cid = CID.create(1, dagJson.code, hash)
  return cid.toString()
}

