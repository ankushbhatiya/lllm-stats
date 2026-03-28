const CONFIG = require('../src/config');

describe('CONFIG', () => {
    test('should have all required properties', () => {
        expect(CONFIG).toHaveProperty('POLL_INTERVAL_MS');
        expect(CONFIG).toHaveProperty('WATCH_INTERVAL_MS');
        expect(CONFIG).toHaveProperty('MAX_DB_AGE_DAYS');
        expect(CONFIG).toHaveProperty('CHART_LIMIT');
        expect(CONFIG).toHaveProperty('RECENT_TPS_LIMIT');
        expect(CONFIG).toHaveProperty('DATA_DIR');
        expect(CONFIG).toHaveProperty('DB_PATH');
        expect(CONFIG).toHaveProperty('DEFAULT_PROVIDER');
        expect(CONFIG).toHaveProperty('AVAILABLE_PROVIDERS');
        expect(CONFIG).toHaveProperty('WATCH_DEPTH');
        expect(CONFIG).toHaveProperty('DEBUG');
    });

    test('should have correct types', () => {
        expect(typeof CONFIG.POLL_INTERVAL_MS).toBe('number');
        expect(typeof CONFIG.WATCH_INTERVAL_MS).toBe('number');
        expect(typeof CONFIG.MAX_DB_AGE_DAYS).toBe('number');
        expect(typeof CONFIG.CHART_LIMIT).toBe('number');
        expect(typeof CONFIG.DATA_DIR).toBe('string');
        expect(typeof CONFIG.DB_PATH).toBe('string');
        expect(typeof CONFIG.DEFAULT_PROVIDER).toBe('string');
        expect(Array.isArray(CONFIG.AVAILABLE_PROVIDERS)).toBe(true);
    });

    test('should have positive numeric values', () => {
        expect(CONFIG.POLL_INTERVAL_MS).toBeGreaterThan(0);
        expect(CONFIG.WATCH_INTERVAL_MS).toBeGreaterThan(0);
        expect(CONFIG.MAX_DB_AGE_DAYS).toBeGreaterThan(0);
        expect(CONFIG.CHART_LIMIT).toBeGreaterThan(0);
    });

    test('should have lmstudio in available providers', () => {
        expect(CONFIG.AVAILABLE_PROVIDERS).toContain('lmstudio');
    });

    test('should use homedir for data paths', () => {
        const os = require('os');
        expect(CONFIG.DATA_DIR).toContain(os.homedir());
        expect(CONFIG.DB_PATH).toContain(os.homedir());
    });
});
