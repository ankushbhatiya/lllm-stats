const { createProvider, detectProvider } = require('../../src/providers/factory');
const LMStudioProvider = require('../../src/providers/lmstudio');

describe('Provider Factory', () => {
    describe('createProvider', () => {
        test('should create LMStudio provider by default', () => {
            const provider = createProvider();
            expect(provider).toBeInstanceOf(LMStudioProvider);
            expect(provider.name).toBe('LM Studio');
        });

        test('should create LMStudio provider by name', () => {
            const provider = createProvider('lmstudio');
            expect(provider).toBeInstanceOf(LMStudioProvider);
        });

        test('should create LMStudio provider with hyphenated name', () => {
            const provider = createProvider('lm-studio');
            expect(provider).toBeInstanceOf(LMStudioProvider);
        });

        test('should be case insensitive', () => {
            const provider = createProvider('LMSTUDIO');
            expect(provider).toBeInstanceOf(LMStudioProvider);
        });

        test('should throw for unknown provider', () => {
            expect(() => createProvider('unknown')).toThrow('Unknown provider');
        });

        test('should throw with available providers listed', () => {
            expect(() => createProvider('invalid')).toThrow(/lmstudio/);
        });
    });

    describe('detectProvider', () => {
        test('should return default provider', () => {
            const provider = detectProvider();
            expect(provider).toBeInstanceOf(LMStudioProvider);
        });
    });
});
