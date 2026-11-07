module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/scripts/jest-test-db-guard.cjs'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  moduleNameMapper: {
    // npm workspaces hoist zod to the repository root; rootDir is services/api.
    '^zod$': '<rootDir>/../../node_modules/zod',
  },
  transformIgnorePatterns: ['/node_modules/(?!@aarogyadamu)'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
