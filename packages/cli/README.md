# @stroc/cli

The `stroc` command.

```
npm install -g @stroc/cli

stroc lint [--fix] <files...>     check documents (and fix spelling)
stroc cid <files...>              print each document's CID
stroc render <file> -o out.pdf    compose with its includes and write PDF or HTML
stroc link <folder>               replace file links in drafts with CIDs
stroc status | update [folder]    keep includes current as documents are revised
stroc serve <folder> --editor     serve documents, catalog and the editor
stroc export <folder> -o <dir>    the same as static files, for any web server
```

`stroc` with no arguments prints the full usage.

Part of [Stroc](https://github.com/gotchoices/stroc), a format for structured legal documents
identified by content (IPLD CIDs). The format is specified in
[docs/Specification.md](https://github.com/gotchoices/stroc/blob/main/docs/Specification.md).
MIT license.
