module.exports = {
  transform: {
    '\\.[jt]sx?$': ['babel-jest', { configFile: './babel.config.js' }],
  },
  testEnvironment: 'node',
  resolver: '<rootDir>/jest-ts-resolver.cjs',
};
