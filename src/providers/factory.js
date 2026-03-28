/**
 * Provider factory for creating provider instances
 */
const LMStudioProvider = require('./lmstudio');
const CONFIG = require('../config');

/**
 * Create a provider instance by name
 * @param {string} name - Provider name
 * @returns {BaseProvider} Provider instance
 * @throws {Error} If provider is not supported
 */
function createProvider(name = CONFIG.DEFAULT_PROVIDER) {
    const providerName = name.toLowerCase().trim();
    
    switch (providerName) {
        case 'lmstudio':
        case 'lm-studio':
            return new LMStudioProvider();
        
        // Future providers:
        // case 'ollama':
        //     return new OllamaProvider();
        
        default:
            throw new Error(
                `Unknown provider: "${name}". ` +
                `Available: ${CONFIG.AVAILABLE_PROVIDERS.join(', ')}`
            );
    }
}

/**
 * Detect provider from environment or config
 * Currently defaults to LM Studio
 * @returns {BaseProvider} Provider instance
 */
function detectProvider() {
    // Future: Check environment variables or config files
    // const envProvider = process.env.LLLM_PROVIDER;
    // if (envProvider) return createProvider(envProvider);
    
    return createProvider(CONFIG.DEFAULT_PROVIDER);
}

module.exports = {
    createProvider,
    detectProvider
};
