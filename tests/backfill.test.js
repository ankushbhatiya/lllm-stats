const backfill = require('../src/backfill');
const fs = require('fs');

jest.mock('fs');
jest.mock('../src/db');
jest.mock('../src/parser');

const db = require('../src/db');
const Parser = require('../src/parser');

describe('Backfill', () => {
    let provider;
    let mockParser;

    beforeEach(() => {
        jest.clearAllMocks();

        provider = {
            name: 'TestProvider',
            logDir: '/test/logs'
        };

        mockParser = {
            parseChunk: jest.fn().mockReturnValue([]),
            reset: jest.fn()
        };
        Parser.mockImplementation(() => mockParser);

        db.getProcessedOffset.mockReturnValue(0);
        db.pruneOldData.mockReturnValue(0);
    });

    test('should return 0 when logDir does not exist', () => {
        fs.existsSync.mockReturnValue(false);

        const result = backfill(provider);

        expect(result).toBe(0);
    });

    test('should process log files in directories', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockImplementation((path) => {
            if (path === '/test/logs') return ['2024-01'];
            return ['app.log'];
        });
        fs.statSync.mockImplementation((path) => ({
            isDirectory: () => path.includes('2024-01'),
            size: 100
        }));
        fs.readFileSync.mockReturnValue('log content');

        backfill(provider);
        
        expect(db.updateProcessedOffset).toHaveBeenCalled();
    });

    test('should skip already processed files', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockImplementation((path) => {
            if (path === '/test/logs') return ['2024-01'];
            return ['app.log'];
        });
        fs.statSync.mockReturnValue({
            isDirectory: () => false,
            size: 100
        });
        db.getProcessedOffset.mockReturnValue(100); // Same as file size

        const result = backfill(provider);

        expect(result).toBe(0);
        expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('should parse and save stats', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockImplementation((path) => {
            if (path === '/test/logs') return ['2024-01'];
            return ['app.log'];
        });
        fs.statSync.mockImplementation((path) => ({
            isDirectory: () => path.includes('2024-01') || !path.endsWith('.log'),
            size: 200
        }));
        fs.readFileSync.mockReturnValue('log content');

        const mockStats = {
            model_id: 'test-model',
            generation_tps: 45.5,
            prompt_tps: 100,
            total_tokens: 500,
            timestamp: new Date()
        };
        mockParser.parseChunk.mockReturnValue([mockStats, mockStats]);

        const result = backfill(provider);

        expect(db.saveStat).toHaveBeenCalledTimes(2);
        expect(result).toBe(2);
    });

    test('should update processed offset after file', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockImplementation((path) => {
            if (path === '/test/logs') return ['2024-01'];
            return ['app.log'];
        });
        fs.statSync.mockImplementation((path) => ({
            isDirectory: () => path.includes('2024-01'),
            size: 500
        }));
        fs.readFileSync.mockReturnValue('content');

        backfill(provider);

        expect(db.updateProcessedOffset).toHaveBeenCalledWith(
            expect.stringContaining('app.log'),
            expect.any(Number)
        );
    });

    test('should prune old data after backfill', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue([]);

        backfill(provider);

        expect(db.pruneOldData).toHaveBeenCalled();
    });

    test('should handle empty directories', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue([]);

        const result = backfill(provider);

        expect(result).toBe(0);
    });
});
