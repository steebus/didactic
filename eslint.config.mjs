import { defineConfig, globalIgnores } from 'eslint/config'

// The root config lints what lives outside the workspaces: scripts/.
// Each workspace carries its own config for its own code -- apps/web
// keeps the Next rules, which need the app directory to sit beside them.
const eslintConfig = defineConfig([
  globalIgnores(['node_modules/**', 'apps/**', 'packages/**', 'supabase/functions/**']),
  {
    files: ['scripts/**/*.{ts,mts,mjs}'],
  },
])

export default eslintConfig
