const LMStudioProvider = require('../../src/providers/lmstudio');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('fs');
jest.mock('child_process');

describe('LMStudioProvider', () => {
    let provider;
    const lmsPath = path.join(os.homedir(), '.lmstudio/bin/lms');

    beforeEach(() => {
        jest.clearAllMocks();
        provider = new LMStudioProvider();
    });

    describe('constructor', () => {
        test('should set correct name', () => {
            expect(provider.name).toBe('LM Studio');
        });

        test('should set correct logDir', () => {
            expect(provider.logDir).toContain('.lmstudio/server-logs');
        });
    });

    describe('findLatestLog', () => {
        test('should return null when logDir does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            expect(provider.findLatestLog()).toBeNull();
        });

        test('should return null when no months directory', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([]);
            expect(provider.findLatestLog()).toBeNull();
        });

        test('should find latest log file', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((p) => {
                if (p.endsWith('server-logs')) {
                    return ['2024-01'];
                }
                if (p.includes('2024-01')) {
                    return ['app.log', 'older.log'];
                }
                return [];
            });
            fs.statSync.mockImplementation((p) => {
                const isDir = !p.endsWith('.log');
                return {
                    isDirectory: () => isDir,
                    mtimeMs: 1000
                };
            });

            const result = provider.findLatestLog();
            expect(result).not.toBeNull();
        });

        test('should handle stat errors gracefully', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((p) => {
                if (p.endsWith('server-logs')) return ['2024-01'];
                if (p.includes('2024-01')) return ['file.log'];
                return [];
            });
            fs.statSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const result = provider.findLatestLog();
            expect(result).toBeNull();
        });
    });

    describe('parseLine', () => {
        test('should parse timestamp', () => {
            const line = '[2024-01-15 10:30:00] Info message';
            const result = provider.parseLine(line);
            expect(result.timestamp).toBeInstanceOf(Date);
            expect(result.timestamp.getFullYear()).toBe(2024);
        });

        test('should parse model from chat completion', () => {
            const line = '[2024-01-15][INFO][model-123] Running chat completion';
            const result = provider.parseLine(line);
            expect(result.modelId).toBe('model-123');
        });

        test('should parse model from loading message', () => {
            const line = '[2024-01-15][INFO] Loading model: my-model-v1';
            const result = provider.parseLine(line);
            expect(result.modelId).toBe('my-model-v1');
        });

        test('should parse generation TPS', () => {
            const line = 'eval time = 100 tokens ( 20 ms per token, 45.50 tokens per second)';
            const result = provider.parseLine(line);
            expect(result.stats).toEqual({
                generation_tps: 45.50,
                total_tokens: 100
            });
        });

        test('should ignore prompt eval time for gen TPS', () => {
            const line = 'prompt eval time = 50 tokens ( 10 ms per token, 100 tokens per second)';
            const result = provider.parseLine(line);
            expect(result.stats).toBeUndefined();
        });

        test('should parse prompt TPS', () => {
            const line = 'prompt eval time = 50 tokens ( 10 ms per token, 100.5 tokens per second)';
            const result = provider.parseLine(line);
            expect(result.promptStats).toEqual({
                prompt_tps: 100.5
            });
        });

        test('should parse MLX prompt progress', () => {
            const line = 'Prompt processing progress: 75.5%';
            const result = provider.parseLine(line);
            expect(result.promptProgress).toBe(75.5);
        });

        test('should detect MLX stream start', () => {
            const line = '[2024-01-15] Streaming response';
            const result = provider.parseLine(line);
            expect(result.mlxActivity).toBeDefined();
            expect(result.mlxActivity.type).toBe('stream_start');
        });

        test('should detect MLX stream end', () => {
            const line = '[2024-01-15] Finished streaming response';
            const result = provider.parseLine(line);
            expect(result.mlxActivity).toBeDefined();
            expect(result.mlxActivity.type).toBe('stream_end');
        });
    });

    describe('getLiveModelInfo', () => {
        test('should return null when lms CLI not found', () => {
            fs.existsSync.mockReturnValue(false);
            const result = provider.getLiveModelInfo();
            expect(result).toBeNull();
        });

        test('should parse lms ps output', () => {
            // Return true for any path check
            fs.existsSync.mockReturnValue(true);
            
            execSync.mockReturnValue(Buffer.from('IDENTIFIER  MODEL  STATUS  SIZE\nmodel-1  llama-7b  LOADED  4GB\n'));

            const result = provider.getLiveModelInfo();
            expect(result).not.toBeNull();
            if (result) {
                expect(result.identifier).toBe('model-1');
            }
        });

        test('should return null on command error', () => {
            fs.existsSync.mockImplementation((p) => p.includes('.lmstudio/bin/lms'));
            execSync.mockImplementation(() => {
                throw new Error('Command failed');
            });

            const result = provider.getLiveModelInfo();
            expect(result).toBeNull();
        });

        test('should handle empty output', () => {
            fs.existsSync.mockImplementation((p) => p.includes('.lmstudio/bin/lms'));
            execSync.mockReturnValue(Buffer.from('IDENTIFIER  MODEL  STATUS  SIZE'));

            const result = provider.getLiveModelInfo();
            expect(result).toBeNull();
        });
    });

    describe('getServerStatus', () => {
        test('should return online when server is ON', () => {
            fs.existsSync.mockImplementation((p) => p.includes('.lmstudio/bin/lms'));
            execSync.mockReturnValue(Buffer.from('Server: ON\n'));

            const result = provider.getServerStatus();
            expect(result.serverOn).toBe(true);
        });

        test('should return offline when server is OFF', () => {
            fs.existsSync.mockImplementation((p) => p.includes('.lmstudio/bin/lms'));
            execSync.mockReturnValue(Buffer.from('Server: OFF\n'));

            const result = provider.getServerStatus();
            expect(result.serverOn).toBe(false);
        });

        test('should return offline when CLI not found', () => {
            fs.existsSync.mockReturnValue(false);
            const result = provider.getServerStatus();
            expect(result.serverOn).toBe(false);
        });

        test('should return offline on error', () => {
            fs.existsSync.mockImplementation((p) => p.includes('.lmstudio/bin/lms'));
            execSync.mockImplementation(() => {
                throw new Error('Connection failed');
            });

            const result = provider.getServerStatus();
            expect(result.serverOn).toBe(false);
        });
    });

    describe('isMLXBackend', () => {
        test('should detect MLX in model ID', () => {
            expect(provider.isMLXBackend('model-MLX-v1')).toBe(true);
            expect(provider.isMLXBackend('mlxamphibian-model')).toBe(true);
            expect(provider.isMLXBackend('regular-model')).toBe(false);
        });

        test('should check log file for MLXAmphibianEngine', () => {
            // Mock findLatestLog to return a specific path
            const mockLogPath = '/test/latest.log';
            provider.findLatestLog = jest.fn().mockReturnValue(mockLogPath);
            
            fs.existsSync.mockImplementation((p) => p === mockLogPath);
            fs.statSync.mockReturnValue({ size: 100 });
            fs.openSync.mockReturnValue(1);
            fs.readSync.mockImplementation((fd, buf) => {
                const data = Buffer.from('Contains MLXAmphibianEngine pattern');
                data.copy(buf);
                return { bytesRead: data.length };
            });
            fs.closeSync.mockImplementation(() => {});

            const result = provider.isMLXBackend('some-model');
            expect(result).toBe(true);
        });

        test('should check log file for TruncateMiddle policy', () => {
            const mockLogPath = '/test/latest.log';
            provider.findLatestLog = jest.fn().mockReturnValue(mockLogPath);
            
            fs.existsSync.mockImplementation((p) => p === mockLogPath);
            fs.statSync.mockReturnValue({ size: 100 });
            fs.openSync.mockReturnValue(1);
            fs.readSync.mockImplementation((fd, buf) => {
                const data = Buffer.from('Contains TruncateMiddle policy');
                data.copy(buf);
                return { bytesRead: data.length };
            });
            fs.closeSync.mockImplementation(() => {});

            const result = provider.isMLXBackend('some-model');
            expect(result).toBe(true);
        });

        test('should return false for non-MLX model', () => {
            const mockLogPath = '/test/latest.log';
            provider.findLatestLog = jest.fn().mockReturnValue(mockLogPath);
            
            fs.existsSync.mockImplementation((p) => p === mockLogPath);
            fs.statSync.mockReturnValue({ size: 100 });
            fs.openSync.mockReturnValue(1);
            fs.readSync.mockImplementation((fd, buf) => {
                const data = Buffer.from('Regular llama.cpp log content');
                data.copy(buf);
                return { bytesRead: data.length };
            });
            fs.closeSync.mockImplementation(() => {});

            const result = provider.isMLXBackend('llama-model');
            expect(result).toBe(false);
        });

        test('should handle file read errors', () => {
            fs.existsSync.mockImplementation(() => {
                throw new Error('Disk error');
            });

            const result = provider.isMLXBackend('model');
            expect(result).toBe(false);
        });

        test('should return false when no log file found', () => {
            fs.existsSync.mockReturnValue(false);

            const result = provider.isMLXBackend('model');
            expect(result).toBe(false);
        });
    });
});
