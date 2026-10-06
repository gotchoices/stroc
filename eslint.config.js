import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.yarn/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The prototype editor is untyped in places; it is being rewritten (docs/Editor.md).
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
