import antfu from '@antfu/eslint-config'

export default antfu({ test: false, ignores: ['src-tauri/runtime/**', 'src-tauri/target/**', 'web-dist/**', 'dist/**'], rules: { 'antfu/if-newline': 'off', 'style/max-statements-per-line': 'off', 'curly': 'off' } }, { files: ['tools/**/*.mjs'], rules: { 'no-console': 'off', 'antfu/no-top-level-await': 'off', 'unicorn/prefer-dom-node-text-content': 'off' } })
