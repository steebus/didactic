import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

// The package is TypeScript, so it needs the TypeScript parser: the
// default parser reads `as const` as a syntax error.
export default defineConfig([
  ...tseslint.configs.recommended,
  { files: ['src/**/*.ts', 'tests/**/*.ts'] },
  { ignores: ['node_modules/**'] },
])
