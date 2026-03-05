const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const BaseProvider = require('./base');

class LMStudioProvider extends BaseProvider {
    constructor() {
        super();
        this.name = 'LM Studio';
        this.logDir = path.join(os.homedir(), '.lmstudio/server-logs');
    }

findLatestLog() {
        if (!fs.existsSync(this.logDir)) return null;
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
                        (stat.mtimeMs === latestTime && file.name > latestFile.name)) {
                        latestTime = stat.mtimeMs;
                        latestFile = file;
                    }
                } catch (e) {
                    // Skip files that become unavailable
                }
            }
        }

        return latestFile ? latestFile.fullPath : null;
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
        // MLX logs "Streaming response" and "Finished streaming response" but no timing
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
        } catch (e) {}
        return null;
    }

    getGpuStats() {
        try {
            const output = execSync('ioreg -c AGXAccelerator -r -d 1').toString();
            const statsMatch = output.match(/"PerformanceStatistics"\s*=\s*\{([^}]+)\}/);
            if (!statsMatch) return null;

            const statsString = statsMatch[1];
            const stats = {};
            statsString.split(',').forEach(line => {
                const parts = line.split('=');
                if (parts.length === 2) {
                    const key = parts[0].trim().replace(/"/g, '');
                    const value = parseInt(parts[1].trim());
                    if (key && !isNaN(value)) stats[key] = value;
                }
            });

            const inUseGB = (stats["In use system memory"] / 1024 / 1024 / 1024).toFixed(2);
            return {
                utilization: stats["Device Utilization %"] || 0,
                gpuMemoryInUse: inUseGB
            };
        } catch (e) {
            return null;
        }
    }

    getServerStatus() {
        try {
            const lmsPath = path.join(os.homedir(), '.lmstudio/bin/lms');
            const output = execSync(`"${lmsPath}" status`).toString();
            return { serverOn: output.includes('Server: ON') };
        } catch (e) {
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
                const content = fs.readFileSync(latestLog, 'utf8');
                // MLX backend has distinct patterns - check for actual MLX-related content
                // Not just "Streaming response" which is generic
                if (content.includes('MLXAmphibianEngine') || content.includes('TruncateMiddle policy')) {
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }
}

module.exports = LMStudioProvider;
