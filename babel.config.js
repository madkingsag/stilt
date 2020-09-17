'use strict';

// eslint-disable-next-line import/no-commonjs
module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: '12.18.3',
      },
    }],
  ],
  plugins: [
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    '@babel/plugin-syntax-class-properties',
  ],
  sourceMaps: 'inline',
  overrides: [{
    test: ['**/*.js'],
    presets: [
      ['@babel/preset-env', {
        targets: {
          node: '12.18.3',
        },
      }],
      '@babel/preset-flow',
    ],

  }, {
    test: ['**/*.ts'],
    presets: [
      ['@babel/preset-env', {
        targets: {
          node: '12.18.3',
        },
      }],
      '@babel/preset-typescript',
    ],
  }],
};
