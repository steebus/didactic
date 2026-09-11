import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

/**
 * The same boundary `core` keeps, for the same reason.
 *
 * This package is the phone's only way to reach the backend, so it must
 * not reach for anything that exists on one platform: no `next`, no
 * `react`, no live Supabase client. It talks to the API over `fetch`
 * and nothing else.
 */
export default defineConfig([
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'next', allowTypeImports: true },
          { name: 'react', allowTypeImports: true },
          { name: 'react-dom', allowTypeImports: true },
          { name: '@supabase/supabase-js', allowTypeImports: true },
          { name: '@supabase/ssr', allowTypeImports: true },
        ],
        patterns: [
          { group: ['next/*'], allowTypeImports: true },
          { group: ['@supabase/*'], allowTypeImports: true },
        ],
      }],
    },
  },
  { files: ['tests/**/*.ts'] },
  { ignores: ['node_modules/**'] },
])
