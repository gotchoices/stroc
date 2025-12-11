# Stroc Example Contracts

This folder contains example contracts converted from the legacy MyCHIPs YAML format to the new Stroc JSON format.

## Source

These documents are hand-converted from the original MyCHIPs contracts located at:
`/Users/kyle/share/devel/mc/mychips/contract/*.yaml`

## Conversion Changes

The following transformations were applied:

### Field Changes
- `contract:` wrapper → removed (direct JSON object)
- `host:` → `author:` (optional field)
- `name:` → removed (CID is the identifier)
- `version:` → removed (CID versions content)
- `rid:` → removed (CID is now external)
- `top:` → removed (not needed)
- Added required `stroc: "1.0"` version field

### Section Reference Changes
- `name` + `source` → `as` + `source`
  - `name` was used for file lookups
  - `as` is the alias used in cross-references within this document

### Text Normalization
- YAML multi-line strings (` >-`) converted to single-line JSON strings
- Whitespace collapsed to single spaces (per spec)
- No other content changes

## Documents Included

### Standalone Documents
- `Ethics.json` - Ethical conduct requirements
- `Tally_Definition.json` - What a tally is and how it works

### Composite Documents
- `Tally_Contract.json` - Top-level agreement that includes 9 sub-documents by reference

## CID Notes

**Important:** The `source` CIDs in `Tally_Contract.json` are the **original legacy RIDs** (base64url SHA-256 hashes). These are NOT the new Stroc CIDs (which would be IPFS CIDv1 format starting with `bafy...`).

To generate proper Stroc CIDs:
1. Load each document in the editor
2. Click "Save & Validate"
3. Copy the displayed CID
4. Update the `source` field in referencing documents

Alternatively, use the `/cid` endpoint:
```bash
curl -X POST http://localhost:3000/cid \
  -H "Content-Type: application/json" \
  -d @Ethics.json
```

## Usage

To open in the Stroc editor:
1. Start the server: `yarn dev`
2. Visit http://localhost:3000/
3. Click "Import" (when implemented)
4. Load one of these JSON files

Or manually paste the JSON into the editor by inspecting the browser console and setting:
```javascript
document.querySelector('stroc-editor').doc = <paste JSON here>
```

## Future Work

- Import/export functionality to load these files via UI
- Auto-resolution of included documents by CID
- Regenerate all CIDs using Stroc format
- Create a script to batch-convert all MyCHIPs YAML contracts

