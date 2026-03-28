/**
 * Centralized configuration for LLLM-Stats
 */
const path = require('path');
const os = require('os');

const CONFIG = {
    // Polling intervals (ms)
    POLL_INTERVAL_MS: 10000,
    WATCH_INTERVAL_MS: 1000,
    
    // Data retention
    MAX_DB_AGE_DAYS: 90,
    
    // UI Limits
    CHART_LIMIT: 20,
    RECENT_TPS_LIMIT: 20,
    
    // Paths
    DATA_DIR: path.join(os.homedir(), '.lllm-stats'),
    DB_PATH: path.join(os.homedir(), '.lllm-stats', 'stats.db'),
    
    // Provider settings
    DEFAULT_PROVIDER: 'lmstudio',
    AVAILABLE_PROVIDERS: ['lmstudio', 'ollama'],
    
    // Watch settings
    WATCH_DEPTH: 2,
    
    // Debug
    DEBUG: process.env.DEBUG === '1' || process.env.DEBUG === 'true'
};

module.exports = CONFIG;
