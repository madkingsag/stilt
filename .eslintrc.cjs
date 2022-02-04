module.exports = {
  extends: [
    '@ephys/eslint-config-typescript',
    '@ephys/eslint-config-typescript/jest',
    '@ephys/eslint-config-typescript/node',
  ],
  ignorePatterns: ['types', 'dist'],
};
