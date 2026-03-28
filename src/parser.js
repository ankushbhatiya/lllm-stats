/**
 * Shared log parser for watcher and backfill
 * DRYs the parsing logic that was duplicated in both modules
 */
class LogParser {
    constructor(provider) {
        this.provider = provider;
        this.currentModel = 'Unknown';
        this.currentTimestamp = new Date();
        this.lastPromptTps = 0;
        this.buffer = '';
    }

    /**
     * Parse a chunk of log data, handling line buffering
     * @param {string} chunk - Raw log chunk
     * @returns {Array} Array of parsed stat objects
     */
    parseChunk(chunk) {
        this.buffer += chunk;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop(); // Keep incomplete line in buffer

        const results = [];
        for (const line of lines) {
            const parsed = this.parseLine(line);
            if (parsed) {
                results.push(parsed);
            }
        }
        return results;
    }

    /**
     * Parse a single line and extract stats
     * @param {string} line - Single log line
     * @returns {Object|null} Parsed stat object or null
     */
    parseLine(line) {
        const parsed = this.provider.parseLine(line);
        
        if (parsed.timestamp) {
            this.currentTimestamp = parsed.timestamp;
        }

        if (parsed.modelId) {
            this.currentModel = parsed.modelId;
        }

        if (parsed.promptStats) {
            this.lastPromptTps = parsed.promptStats.prompt_tps || 0;
        }

        if (parsed.stats) {
            return {
                model_id: this.currentModel,
                generation_tps: parsed.stats.generation_tps,
                prompt_tps: this.lastPromptTps,
                total_tokens: parsed.stats.total_tokens,
                timestamp: this.currentTimestamp,
                hasModelChange: !!parsed.modelId
            };
        }

        return null;
    }

    /**
     * Reset parser state
     */
    reset() {
        this.currentModel = 'Unknown';
        this.currentTimestamp = new Date();
        this.lastPromptTps = 0;
        this.buffer = '';
    }

    /**
     * Get current parser state
     */
    getState() {
        return {
            currentModel: this.currentModel,
            currentTimestamp: this.currentTimestamp,
            lastPromptTps: this.lastPromptTps
        };
    }

    /**
     * Restore parser state (useful for backfill continuing from watcher)
     */
    setState(state) {
        if (state.currentModel) this.currentModel = state.currentModel;
        if (state.currentTimestamp) this.currentTimestamp = state.currentTimestamp;
        if (state.lastPromptTps !== undefined) this.lastPromptTps = state.lastPromptTps;
    }
}

module.exports = LogParser;
