const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    ignores: [
      'node_modules',
      'dist',
      'coverage',
      '.automation',
      'infrastructure'
    ],
  },
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error'
    }
  },
  // Module boundary safeguards: prevent cross-service deep imports
  {
    files: ['packages/gateway/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@autonomous/mca/**', '@autonomous/planner/**'],
            message: 'Cross-service imports are forbidden. Use events/contracts.'
          }
        ]
      }]
    }
  },
  {
    files: ['packages/mca/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@autonomous/gateway/**', '@autonomous/planner/**'],
            message: 'Cross-service imports are forbidden. Use events/contracts.'
          }
        ]
      }]
    }
  },
  {
    files: ['packages/planner/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@autonomous/gateway/**', '@autonomous/mca/**'],
            message: 'Cross-service imports are forbidden. Use events/contracts.'
          }
        ]
      }]
    }
  }
];
