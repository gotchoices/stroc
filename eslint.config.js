import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.yarn/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node scripts outside the packages.
    files: ['tools/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly', fetch: 'readonly', WebSocket: 'readonly', URL: 'readonly' },
    },
  },
  {
    rules: {
      // The prototype editor is untyped in places; it is being rewritten (docs/Editor.md).
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
