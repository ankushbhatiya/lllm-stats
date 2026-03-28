const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const BaseProvider = require('./base');
const { getGpuStats } = require('../platform');
const CONFIG = require('../config');

class LMStudioProvider extends BaseProvider {
    constructor() {
        super();
        this.name = 'LM Studio';
        this.logDir = path.join(os.homedir(), '.lmstudio/server-logs');
    }

    findLatestLog() {
        if (!fs.existsSync(this.logDir)) return null;
        
        try {
            const months = fs.readdirSync(this.logDir).sort().reverse();
            if (months.length === 0) return null;

            let latestFile = null;
            let latestTime = 0;

            for (const month of months) {
                const monthDir = path.join(this.logDir, month);
                if (!fs.statSync(monthDir).isDirectory()) continue;

                const files = fs.readdirSync(monthDir)
                    .filter(f => f.endsWith('.log'))
                    .map(f => ({ name: f, fullPath: path.join(monthDir, f) }));

                for (const file of files) {
                    try {
                        const stat = fs.statSync(file.fullPath);
                        // Sort by mtime first, then by filename as tiebreaker
                        if (stat.mtimeMs > latestTime || 
                            (stat.mtimeMs === latestTime && file.name > (latestFile?.name || ''))) {
                            latestTime = stat.mtimeMs;
                            latestFile = file;
                        }
                    } catch (e) {
                        if (CONFIG.DEBUG) console.error(`Error stating file ${file.fullPath}:`, e.message);
                    }
                }
            }

            return latestFile ? latestFile.fullPath : null;
        } catch (e) {
            if (CONFIG.DEBUG) console.error('Error finding latest log:', e.message);
            return null;
        }
    }

    parseLine(line) {
        let result = {};

        // Timestamp Detection
        const tsMatch = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
        if (tsMatch) {
            result.timestamp = new Date(tsMatch[1]);
        }

        // Model Detection
        const modelMatch = line.match(/\[.*?\]\[INFO\]\[(.*?)\] Running chat completion/);
        const modelLoadMatch = line.match(/\[.*?\]\[INFO\] Loading model: (.*)/);
        if (modelMatch) {
            result.modelId = modelMatch[1];
        } else if (modelLoadMatch) {
            result.modelId = modelLoadMatch[1].trim();
        }

        // Generation TPS (llama.cpp backend)
        const genMatch = line.match(/eval time =.*?(\d+) tokens \(\s*.*?\s*ms per token,\s*(.*?)\s*tokens per second\)/);
        if (genMatch && !line.includes('prompt eval time')) {
            result.stats = {
                generation_tps: parseFloat(genMatch[2]),
                total_tokens: parseInt(genMatch[1])
            };
        }

        // Prompt TPS (llama.cpp backend)
        const promptMatch = line.match(/prompt eval time =.*?tokens \(\s*.*?\s*ms per token,\s*(.*?)\s*tokens per second\)/);
        if (promptMatch) {
            result.promptStats = {
                prompt_tps: parseFloat(promptMatch[1])
            };
        }

        // MLX Backend: Detect activity but no TPS metrics available
        const mlxPromptMatch = line.match(/Prompt processing progress:\s*(\d+\.?\d*)%/);
        if (mlxPromptMatch) {
            result.promptProgress = parseFloat(mlxPromptMatch[1]);
        }

        const mlxStreamStart = line.includes('Streaming response') && !line.includes('Finished');
        const mlxStreamEnd = line.includes('Finished streaming response');
        if (mlxStreamStart || mlxStreamEnd) {
            result.mlxActivity = {
                type: mlxStreamStart ? 'stream_start' : 'stream_end',
                timestamp: result.timestamp
            };
        }

        return result;
    }

    getLiveModelInfo() {
        try {
            const lmsPath = path.join(os.homedir(), '.lmstudio/bin/lms');
            if (!fs.existsSync(lmsPath)) {
                if (CONFIG.DEBUG) console.log('LM Studio CLI not found at:', lmsPath);
                return null;
            }
            
            const output = execSync(`"${lmsPath}" ps`).toString().split('\n');
            if (output.length > 2) {
                const lines = output.filter(l => l.trim() !== '' && !l.includes('IDENTIFIER'));
                if (lines.length > 0) {
                    const parts = lines[0].split(/\s{2,}/);
                    return {
                        identifier: parts[0],
                        model: parts[1],
                        status: parts[2],
                        size: parts[3]
                    };
                }
            }
        } catch (e) {
            if (CONFIG.DEBUG) console.error('getLiveModelInfo error:', e.message);
        }
        return null;
    }

    getGpuStats() {
        // Use platform abstraction
        return getGpuStats();
    }

    getServerStatus() {
        try {
            const lmsPath = path.join(os.homedir(), '.lmstudio/bin/lms');
            if (!fs.existsSync(lmsPath)) {
                return { serverOn: false };
            }
            
            const output = execSync(`"${lmsPath}" status`).toString();
            return { serverOn: output.includes('Server: ON') };
        } catch (e) {
            if (CONFIG.DEBUG) console.error('getServerStatus error:', e.message);
            return { serverOn: false };
        }
    }

    isMLXBackend(modelId) {
        // Check for MLX-specific patterns in model ID (case-sensitive check)
        if (modelId && (modelId.includes('MLX') || modelId.includes('mlxamphibian'))) {
            return true;
        }
        
        // Check log for MLX-specific patterns - look for actual MLX logs
        try {
            const latestLog = this.findLatestLog();
            if (latestLog && fs.existsSync(latestLog)) {
                // Read only first 100KB to avoid blocking on large files
                const stats = fs.statSync(latestLog);
                const sizeToRead = Math.min(stats.size, 100 * 1024);
                const fd = fs.openSync(latestLog, 'r');
                const buffer = Buffer.alloc(sizeToRead);
                fs.readSync(fd, buffer, 0, sizeToRead, 0);
                fs.closeSync(fd);
                
                const content = buffer.toString();
                // MLX backend has distinct patterns
                if (content.includes('MLXAmphibianEngine') || content.includes('TruncateMiddle policy')) {
                    return true;
                }
            }
        } catch (e) {
            if (CONFIG.DEBUG) console.error('isMLXBackend error:', e.message);
        }
        return false;
    }
}

module.exports = LMStudioProvider;
