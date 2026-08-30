// @ts-check
const tseslint = require('typescript-eslint');
const globals = require('globals');

const sharedRules = {
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
};

module.exports = tseslint.config(
  {
    ignores: ['node_modules/**', 'data/**', 'web/generated/**', 'web/views/**', 'dist/**'],
  },
  // TypeScript files: use @typescript-eslint recommended rules
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    ignores: ['web/client/**'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      ...sharedRules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  // Client-side TypeScript: browser globals
  {
    files: ['web/client/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...sharedRules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Hand-written client JavaScript: browser globals
  {
    files: ['web/client/static/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.browser,
    },
    rules: {
      ...sharedRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-undef': 'error',
    },
  },
  // JavaScript files: standard rules only
  {
    files: ['**/*.js'],
    ignores: ['web/client/static/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.node,
    },
    rules: {
      ...sharedRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-undef': 'error',
    },
  }
);
