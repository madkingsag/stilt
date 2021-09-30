'use strict';

module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: '12.18.3',
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
