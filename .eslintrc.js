// @flow

const ruleOverrides = {
  // changed for this project
  'no-undefined': 'off',
  'require-jsdoc': 0,
  'valid-jsdoc': 0,
  'no-console': 2,
  'no-use-before-define': 0,
  'babel/new-cap': 0,
};

// eslint-disable-next-line import/no-commonjs
module.exports = {
  extends: '@foobarhq/eslint-config',
  rules: ruleOverrides,
  env: {
    jest: true,
    node: true,
  },
  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
  },
  overrides: [{
    files: ['*.js', '*.jsx', '*.mjs'],
    settings: {
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
        'babel-eslint': ['.js', '.jsx', '.mjs'],
      },
    },
  }, {
    files: ['*.ts', '*.tsx'],
    extends: '@foobarhq/eslint-config-typescript',
    rules: {
      ...ruleOverrides,
      'no-undef': 'off',
    },
    settings: {
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
        'babel-eslint': ['.js', '.jsx', '.mjs'],
      },
    },
  }],

  ignorePatterns: ['*.d.ts'],
};
