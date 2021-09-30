'use strict';

module.exports = {
  presets: [
    ['@babel/preset-env', {
      modules: false,
      targets: {
        node: '14.18.0',
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
