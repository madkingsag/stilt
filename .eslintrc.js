// TODO: split config
// @foobarhq/eslint-config (vanilla)
// @foobarhq/eslint-config/react
// @foobarhq/eslint-config-flow
// @foobarhq/eslint-config-typescript

// TODO enable tslint

module.exports = {
  extends: '@foobarhq/eslint-config',
  rules: {
    // changed for this project
    'no-undefined': 'off',
    'require-jsdoc': 0,
    'valid-jsdoc': 0,
    'no-console': 2,
    'no-use-before-define': 0,
    'babel/new-cap': 0,
  },
  env: {
    jest: true,
    node: true,
  },
  globals: {
    globalThis: true,
  },
  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
    'import/resolver': {
      node: {
        extensions: [
          '.js',
          '.jsx',
          '.mjs',
          '.ts',
          '.tsx',
        ],
      },
    },
  },
  overrides: [{
    files: ['*.js', '*.jsx', '*.mjs'],
    extends: [
      '@foobarhq/eslint-config/flow',
    ],
  }, {
    files: ['*.ts', '*.tsx'],
    parser: '@typescript-eslint/parser',
    plugins: [
      '@typescript-eslint',
      // '@typescript-eslint/tslint',
    ],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        'varsIgnorePattern': '^ignore',
        'argsIgnorePattern': '^ignore|^_',
      }],

      'no-useless-constructor': 'off',
      '@typescript-eslint/no-useless-constructor': 'error',

      // method signature overloading conflicts. Replaced by TSC in this case
      'no-dupe-class-members': 'off',

      // support parameters tagged optional with "?"
      'default-param-last': 'off',
      '@typescript-eslint/default-param-last': ['error'],
    },
  }],

  ignorePatterns: ['*.d.ts'],
};
