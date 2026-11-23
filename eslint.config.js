import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'client/dist/**', 'server/dist/**', 'e2e-screens/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  {
    files: ['client/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['server/**/*.ts', 'shared/**/*.ts', 'scripts/**/*.mjs', '*.config.*'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // E2E: deli kode tečejo v brskalniku (page.evaluate).
    files: ['scripts/e2e.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
