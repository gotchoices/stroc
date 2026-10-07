// Arguments shared by `stroc-server` and `stroc serve`.
export const SERVE_USAGE = '[<folder>] [--port N] [--host H] [--domain D] [--watch] [--editor]'

export function parseServeArgs(args: string[], env: Record<string, string | undefined> = {}) {
  const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
  const valued = new Set(['--port', '--host', '--domain'])
  const folder = args.find((a, i) => !a.startsWith('-') && !valued.has(args[i - 1]))
  return {
    folder,
    port: Number(value('--port') ?? env.PORT ?? 3000),
    host: value('--host') ?? env.HOST ?? 'localhost',
    domain: value('--domain') ?? env.STROC_DOMAIN,
    watch: args.includes('--watch'),
    editor: args.includes('--editor'),
  }
}
