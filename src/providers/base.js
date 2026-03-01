/**
 * Base class for LLM Providers (LM Studio, Ollama, etc.)
 */
class BaseProvider {
    constructor() {
        this.name = 'Base';
        this.logDir = '';
    }

    /**
     * Finds the latest log file to tail
     */
    findLatestLog() {
        throw new Error('findLatestLog must be implemented by the provider');
    }

    /**
     * Parses a single line from the log file
     * Returns an object: { timestamp, modelId, stats, promptStats }
     */
    parseLine(line) {
        throw new Error('parseLine must be implemented by the provider');
    }

    /**
     * Fetches live model info (identifier, model, status, size)
     */
    getLiveModelInfo() {
        throw new Error('getLiveModelInfo must be implemented by the provider');
    }

    /**
     * Fetches system-level GPU stats (utilization, gpuMemoryInUse)
     */
    getGpuStats() {
        throw new Error('getGpuStats must be implemented by the provider');
    }

    /**
     * Checks if the server is running
     */
    getServerStatus() {
        throw new Error('getServerStatus must be implemented by the provider');
    }
}

module.exports = BaseProvider;
