import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

/**
 * The boundary, enforced rather than remembered.
 *
 * `core` is what both front ends read, so anything that only exists on
 * one of them cannot be in here: no `next`, no `react`, no DOM
 * purifier or parser, and no live Supabase client. Types from those
 * packages are fine -- a row shape is not a runtime dependency -- so
 * the rule allows `import type` and bans the rest.
 *
 * Without this the drift is silent and one-way: someone reaches for
 * `next/cache` in a helper, the web keeps working, and the phone
 * cannot import that file at all.
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
          { name: 'dompurify', allowTypeImports: true },
          { name: 'jsdom', allowTypeImports: true },
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
