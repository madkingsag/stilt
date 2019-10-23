'use strict';

// eslint-disable-next-line import/no-commonjs
module.exports = {
  presets: [['@babel/preset-env', {
    targets: {
      node: '12.13.0',
    },
  }]],
  plugins: [
    '@babel/plugin-transform-flow-strip-types',
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    ['@babel/plugin-proposal-class-properties', { loose: true }],
  ],
  sourceMaps: 'inline',
};
