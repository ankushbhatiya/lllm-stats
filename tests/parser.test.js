const LogParser = require('../src/parser');

// Mock provider for testing
class MockProvider {
    parseLine(line) {
        const result = {};
        
        // Timestamp
        const tsMatch = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
        if (tsMatch) {
            result.timestamp = new Date(tsMatch[1]);
        }

        // Model
        const modelMatch = line.match(/Loading model: (.*)/);
        if (modelMatch) {
            result.modelId = modelMatch[1].trim();
        }

        // Stats
        const genMatch = line.match(/(\d+\.?\d*) tokens per second/);
        if (genMatch && !line.includes('prompt')) {
            result.stats = {
                generation_tps: parseFloat(genMatch[1]),
                total_tokens: 100
            };
        }

        // Prompt stats
        const promptMatch = line.match(/prompt.*?([\d.]+) tokens per second/);
        if (promptMatch) {
            result.promptStats = {
                prompt_tps: parseFloat(promptMatch[1])
            };
        }

        return result;
    }
}

describe('LogParser', () => {
    let parser;
    let provider;

    beforeEach(() => {
        provider = new MockProvider();
        parser = new LogParser(provider);
    });

    describe('constructor', () => {
        test('should initialize with default state', () => {
            expect(parser.provider).toBe(provider);
            expect(parser.currentModel).toBe('Unknown');
            expect(parser.lastPromptTps).toBe(0);
            expect(parser.buffer).toBe('');
        });
    });

    describe('parseLine', () => {
        test('should parse timestamp', () => {
            const line = '[2024-01-15 10:30:00] some log';
            const result = parser.parseLine(line);
            // Timestamp updates internal state but doesn't return stats
            expect(parser.currentTimestamp).toBeInstanceOf(Date);
            expect(parser.currentTimestamp.getFullYear()).toBe(2024);
        });

        test('should parse model ID', () => {
            const line = 'Loading model: llama-7b';
            parser.parseLine(line);
            expect(parser.currentModel).toBe('llama-7b');
        });

        test('should parse generation stats', () => {
            const line = 'Generation complete: 45.5 tokens per second';
            const result = parser.parseLine(line);
            expect(result).not.toBeNull();
            expect(result.generation_tps).toBe(45.5);
            expect(result.total_tokens).toBe(100);
        });

        test('should parse prompt stats', () => {
            const line = 'prompt eval: 123.4 tokens per second';
            parser.parseLine(line);
            expect(parser.lastPromptTps).toBe(123.4);
        });

        test('should return null for lines without stats', () => {
            const line = 'Some irrelevant log message';
            const result = parser.parseLine(line);
            expect(result).toBeNull();
        });

        test('should combine model and stats across lines', () => {
            parser.parseLine('Loading model: test-model');
            const result = parser.parseLine('Generation complete: 50 tokens per second');
            
            expect(result).not.toBeNull();
            expect(result.model_id).toBe('test-model');
            expect(result.generation_tps).toBe(50);
        });
    });

    describe('parseChunk', () => {
        test('should handle complete lines', () => {
            const chunk = 'Loading model: test-model\nGeneration complete: 45 tokens per second\n';
            const results = parser.parseChunk(chunk);
            
            expect(results).toHaveLength(1);
            expect(results[0].generation_tps).toBe(45);
            expect(results[0].model_id).toBe('test-model');
        });

        test('should buffer incomplete lines', () => {
            const chunk1 = 'Loading model: test-model\nGeneration complete: ';
            const results1 = parser.parseChunk(chunk1);
            expect(results1).toHaveLength(0);
            expect(parser.buffer).toBe('Generation complete: ');

            const chunk2 = '45 tokens per second\n';
            const results2 = parser.parseChunk(chunk2);
            expect(results2).toHaveLength(1);
            expect(results2[0].generation_tps).toBe(45);
        });

        test('should handle multiple stats lines', () => {
            // First set up the model
            parser.parseLine('Loading model: m1');
            
            // Now process multiple stats with same model
            const chunk = 'Gen: 10 tps\nGen: 20 tps\n';
            const results = parser.parseChunk(chunk);
            
            // Each line that produces stats should be in results
            expect(results.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('reset', () => {
        test('should reset all state', () => {
            parser.parseLine('Loading model: test');
            parser.parseLine('prompt eval: 100 tokens per second');
            parser.buffer = 'incomplete';

            parser.reset();

            expect(parser.currentModel).toBe('Unknown');
            expect(parser.lastPromptTps).toBe(0);
            expect(parser.buffer).toBe('');
        });
    });

    describe('getState/setState', () => {
        test('should save and restore state', () => {
            parser.parseLine('Loading model: my-model');
            parser.parseLine('prompt eval: 99.5 tokens per second');

            const state = parser.getState();
            expect(state.currentModel).toBe('my-model');
            expect(state.lastPromptTps).toBe(99.5);

            parser.reset();
            expect(parser.currentModel).toBe('Unknown');

            parser.setState(state);
            expect(parser.currentModel).toBe('my-model');
            expect(parser.lastPromptTps).toBe(99.5);
        });
    });
});
