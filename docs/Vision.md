# Stroc Design Vision

## Goals
Stroc is intended to become part of the [Sereus Fabric](https://sereus.org) family of software.
It will likely be incorporated into:
- Taleus: a Unit-of-Account-agnostic version of MyCHIPs (currency based on private credit ledgers)
- Sereus MyCHIPs: focused on the [chip](https://chipcentral.net) UoA

## History
Its predecessor (strdoc) is part of the [wylib](https://github.com/gotchoices/wylib) library.
It was incorporated into [MyCHIPs](https://github.com/gotchoices/mychips) in several ways.
The original browser SPA app used the wylib strdoc module (`wylib/src/strdoc/vue`) to view and edit tally contract documents.
This code can be seen in the MyCHIPs control layer (`mychips/lib/control/contract.js`).

Later, the MyCHIPs mobile app used the same format, but incorporated its own modules in order to format structured documents.
See:
  - `mychips/lib/control/agree.js`
  - `mychips/lib/control/buildpdf.js`

The MyCHIPs tally documents can be found in `mychips/contract/*.yaml`.

## Technical Requirements
- A structured document is a data structure that houses a (typically legal) document.
- The document is intended to be a collection of sentences, organized in paragraphs, organized into sections, which can be incorporated into other sections, to any depth.
- The document is organized in an outline format.
- It must be possible to serialize and hash (Content-ID, cid) the document in a way that is reasonably deterministic.
  - Example: Two documents with the same legal structure and effect (in the same language) have the same cid.
  - If I change a word in the document, that changes the cid.
  - If I change the way it displays, that does not change the cid.
  - Indentation, bold, italics, spacing and similar things do not change the cid.
- A document will be specified and/or requested based on its cid, much like (or possibly using) the IPFS standard.
- A document will be incorporated into a Taleus tally by referencing its cid.

## Strategy
- Analyze the previous implementation strdoc
- Learn all we can from it
- Quantify its shortcomings (for example, it stores each paragraph as a single string rather than an array of sentences)
- Specify what Stroc must accomplish
- Research and determine if there is an existing standard we should adopt instead of Stroc
- If not, proceed to write a full specification for Stroc
- Implement Stroc as follows:
  - A document parser
  - A TypeScript module for rendering to PDF (usable by web and mobile apps)
  - A document authoring tool as a web module (so it can be incorporated into web pages)
  - An example web application users can use to:
    - Import existing document text
    - Organize it as a Stroc document
    - Edit it
    - Save it into the cloud or on a server for use in tallies
