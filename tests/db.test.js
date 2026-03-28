const fs = require('fs');
const path = require('path');
const os = require('os');

// Create mock paths before jest.mock
const mockDataDir = path.join(os.tmpdir(), 'lllm-stats-test-db-' + Date.now());
const mockDbPath = path.join(mockDataDir, 'test.db');

// Mock config
jest.mock('../src/config', () => ({
    DATA_DIR: mockDataDir,
    DB_PATH: mockDbPath,
    RECENT_TPS_LIMIT: 20,
    MAX_DB_AGE_DAYS: 90,
    DEBUG: false
}));

// Mock better-sqlite3 with state tracking
const mockOffsets = new Map();

jest.mock('better-sqlite3', () => {
    return class MockDatabase {
        constructor(path) {
            this.path = path;
        }
        exec() {}
        pragma() { return {}; }
        close() {}
        prepare(sql) {
            return {
                run: (...args) => {
                    if (sql.includes('INSERT OR REPLACE') && args[0]?.includes('.log')) {
                        mockOffsets.set(args[0], args[1]);
                    }
                    return { changes: 1 };
                },
                get: (...args) => {
                    if (sql.includes('last_offset')) {
                        const value = mockOffsets.get(args[0]);
                        return value !== undefined ? { last_offset: value } : undefined;
                    }
                    return {
                        avg_tps: 45.5,
                        max_tps: 60.2,
                        total_tokens: 1000,
                        model_id: 'test-model',
                        generation_tps: 50,
                        prompt_tps: 100,
                        timestamp: new Date().toISOString()
                    };
                },
                all: () => [
                    { bucket: '10:00', avg_tps: 45.5, count: 5 },
                    { bucket: '10:15', avg_tps: 48.2, count: 3 }
                ]
            };
        }
    };
});

// Now require db after mock is set up
const db = require('../src/db');

describe('Database Module', () => {
    afterAll(() => {
        db.close();
        // Cleanup
        try {
            fs.rmSync(mockDataDir, { recursive: true, force: true });
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    describe('saveStat', () => {
        test('should save a stat record', () => {
            const data = {
                model_id: 'test-model',
                generation_tps: 45.5,
                prompt_tps: 123.4,
                total_tokens: 1000,
                timestamp: new Date()
            };

            const result = db.saveStat(data);
            expect(result.changes).toBe(1);
        });

        test('should save with string timestamp', () => {
            const data = {
                model_id: 'test-model-2',
                generation_tps: 50,
                prompt_tps: 100,
                total_tokens: 500,
                timestamp: '2024-01-15T10:00:00.000Z'
            };

            const result = db.saveStat(data);
            expect(result.changes).toBe(1);
        });
    });

    describe('getDailyStats', () => {
        test('should return stats for today', () => {
            const stats = db.getDailyStats();
            expect(stats).toHaveProperty('avg_tps');
            expect(stats).toHaveProperty('max_tps');
            expect(stats).toHaveProperty('total_tokens');
        });
    });

    describe('getWeeklyStats', () => {
        test('should return array of daily stats', () => {
            const stats = db.getWeeklyStats();
            expect(Array.isArray(stats)).toBe(true);
        });
    });

    describe('getRecentTPS', () => {
        test('should return recent TPS records', () => {
            const stats = db.getRecentTPS(3);
            expect(Array.isArray(stats)).toBe(true);
        });

        test('should use default limit', () => {
            const stats = db.getRecentTPS();
            expect(Array.isArray(stats)).toBe(true);
        });
    });

    describe('getLastStat', () => {
        test('should return most recent stat', () => {
            const stat = db.getLastStat();
            expect(stat).toHaveProperty('model_id');
            expect(stat).toHaveProperty('generation_tps');
            expect(stat).toHaveProperty('timestamp');
        });
    });

    describe('Processed Offset Tracking', () => {
        test('should save and retrieve offset', () => {
            const filePath = '/test/file.log';
            const offset = 12345;

            db.updateProcessedOffset(filePath, offset);
            const retrieved = db.getProcessedOffset(filePath);
            
            expect(retrieved).toBe(offset);
        });

        test('should return 0 for unknown file', () => {
            const offset = db.getProcessedOffset('/unknown/file.log');
            expect(offset).toBe(0);
        });

        test('should update existing offset', () => {
            const filePath = '/test/update.log';
            
            db.updateProcessedOffset(filePath, 100);
            db.updateProcessedOffset(filePath, 200);
            
            const retrieved = db.getProcessedOffset(filePath);
            expect(retrieved).toBe(200);
        });
    });

    describe('getAggregatedStats', () => {
        test('should return today view', () => {
            const stats = db.getAggregatedStats('today');
            expect(Array.isArray(stats)).toBe(true);
            if (stats.length > 0) {
                expect(stats[0]).toHaveProperty('bucket');
                expect(stats[0]).toHaveProperty('avg_tps');
                expect(stats[0]).toHaveProperty('count');
            }
        });

        test('should return weekly view', () => {
            const stats = db.getAggregatedStats('weekly');
            expect(Array.isArray(stats)).toBe(true);
        });

        test('should return monthly view', () => {
            const stats = db.getAggregatedStats('monthly');
            expect(Array.isArray(stats)).toBe(true);
        });
    });

    describe('pruneOldData', () => {
        test('should run without error', () => {
            const result = db.pruneOldData();
            expect(typeof result).toBe('number');
        });
    });

    describe('close', () => {
        test('should close database without error', () => {
            expect(() => db.close()).not.toThrow();
        });
    });
});
