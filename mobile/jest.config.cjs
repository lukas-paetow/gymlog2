process.env.TZ = 'Europe/Berlin';

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts', '<rootDir>/__tests__/**/*.test.tsx'],
  maxWorkers: 2,
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!node_modules/**', '!docs/**', '!coverage/**', '!__tests__/**', '!**/*.d.ts',
  ],
  coverageReporters: ['text', 'json-summary', 'html', 'lcov'],
  coverageThreshold: {
    // Jest subtracts explicitly gated files from this remaining-app aggregate.
    global: { statements: 95, branches: 87, functions: 96, lines: 99 },
    './database.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './dateFormat.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
