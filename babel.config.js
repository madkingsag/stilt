/* eslint-disable unicorn/prefer-module,import/no-commonjs */

'use strict';

module.exports = api => {
  const isTest = api.env('test');

  return {
    presets: [
      ['@babel/preset-env', {
        modules: isTest ? 'commonjs' : false,
        targets: {
          node: '16.13.2',
        },
      }],
      '@babel/preset-typescript',
    ],
    plugins: [
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      '@babel/plugin-syntax-class-properties',
    ],
    sourceMaps: 'inline',
  };
};
