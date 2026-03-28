module.exports = {
    testEnvironment: 'node',
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/ui.js',
        '!src/menubar.js'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    testMatch: ['**/tests/**/*.test.js'],
    verbose: true,
    moduleNameMapper: {
        '^chokidar$': '<rootDir>/tests/__mocks__/chokidar.js',
        '^better-sqlite3$': '<rootDir>/tests/__mocks__/better-sqlite3.js'
    }
};
