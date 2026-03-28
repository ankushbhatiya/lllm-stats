const LogWatcher = require('../src/watcher');
const EventEmitter = require('events');
const fs = require('fs');

jest.mock('fs');
jest.mock('../src/db');
jest.mock('../src/parser');

const db = require('../src/db');
const Parser = require('../src/parser');

describe('LogWatcher', () => {
    let provider;
    let watcher;
    let mockParser;

    beforeEach(() => {
        jest.clearAllMocks();
        
        provider = {
            name: 'TestProvider',
            logDir: '/test/logs',
            findLatestLog: jest.fn()
        };

        mockParser = {
            parseChunk: jest.fn().mockReturnValue([]),
            reset: jest.fn(),
            getState: jest.fn(),
            setState: jest.fn()
        };
        Parser.mockImplementation(() => mockParser);

        watcher = new LogWatcher(provider);
    });

    describe('constructor', () => {
        test('should initialize with provider', () => {
            expect(watcher.provider).toBe(provider);
            expect(watcher.logDir).toBe('/test/logs');
            expect(watcher.currentFile).toBeNull();
        });

        test('should extend EventEmitter', () => {
            expect(watcher).toBeInstanceOf(EventEmitter);
        });

        test('should create parser instance', () => {
            expect(Parser).toHaveBeenCalledWith(provider);
        });
    });

    describe('watchFile', () => {
        beforeEach(() => {
            fs.existsSync.mockReturnValue(true);
            fs.statSync.mockReturnValue({ size: 100 });
            fs.watchFile.mockImplementation(() => {});
            fs.unwatchFile.mockImplementation(() => {});
        });

        test('should set up file watcher', () => {
            watcher.watchFile('/test/file.log');
            expect(fs.watchFile).toHaveBeenCalled();
            expect(watcher.currentFile).toBe('/test/file.log');
        });

        test('should unwatch previous file', () => {
            watcher.currentFile = '/test/old.log';
            watcher.watchFile('/test/new.log');
            expect(fs.unwatchFile).toHaveBeenCalledWith('/test/old.log');
        });
    });

    describe('parseChunk', () => {
        test('should emit stats event', () => {
            const mockStats = {
                model_id: 'test-model',
                generation_tps: 45.5,
                prompt_tps: 100,
                total_tokens: 500,
                timestamp: new Date(),
                hasModelChange: false
            };
            mockParser.parseChunk.mockReturnValue([mockStats]);

            const statsSpy = jest.fn();
            watcher.on('stats', statsSpy);

            watcher.parseChunk('some data', '/test/file.log', 100);

            expect(statsSpy).toHaveBeenCalledWith(expect.objectContaining({
                model_id: 'test-model',
                generation_tps: 45.5
            }));
        });

        test('should emit modelChange event', () => {
            const mockStats = {
                model_id: 'new-model',
                generation_tps: 45.5,
                prompt_tps: 100,
                total_tokens: 500,
                timestamp: new Date(),
                hasModelChange: true
            };
            mockParser.parseChunk.mockReturnValue([mockStats]);

            const modelSpy = jest.fn();
            watcher.on('modelChange', modelSpy);

            watcher.parseChunk('some data', '/test/file.log', 100);

            expect(modelSpy).toHaveBeenCalledWith('new-model');
        });

        test('should update processed offset', () => {
            mockParser.parseChunk.mockReturnValue([]);
            watcher.parseChunk('data', '/test/file.log', 200);
            expect(db.updateProcessedOffset).toHaveBeenCalledWith('/test/file.log', 200);
        });
    });

    describe('stop', () => {
        test('should handle stop when not started', () => {
            expect(() => watcher.stop()).not.toThrow();
        });

        test('should clear current file', () => {
            fs.unwatchFile.mockImplementation(() => {});
            watcher.currentFile = '/test/file.log';
            watcher.stop();
            expect(fs.unwatchFile).toHaveBeenCalledWith('/test/file.log');
            expect(watcher.currentFile).toBeNull();
        });
    });
});
