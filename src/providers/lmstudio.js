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
        
        const monthDir = path.join(this.logDir, months[0]);
        const files = fs.readdirSync(monthDir)
            .filter(f => f.endsWith('.log'))
            .sort((a, b) => {
                const statA = fs.statSync(path.join(monthDir, a));
                const statB = fs.statSync(path.join(monthDir, b));
                return statB.mtimeMs - statA.mtimeMs;
            });

        return files.length > 0 ? path.join(monthDir, files[0]) : null;
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

        // Generation TPS
        const genMatch = line.match(/eval time =.*?(\d+) tokens \(\s*.*?\s*ms per token,\s*(.*?)\s*tokens per second\)/);
        if (genMatch && !line.includes('prompt eval time')) {
            result.stats = {
                generation_tps: parseFloat(genMatch[2]),
                total_tokens: parseInt(genMatch[1])
            };
        }

        // Prompt TPS
        const promptMatch = line.match(/prompt eval time =.*?tokens \(\s*.*?\s*ms per token,\s*(.*?)\s*tokens per second\)/);
        if (promptMatch) {
            result.promptStats = {
                prompt_tps: parseFloat(promptMatch[1])
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
}

module.exports = LMStudioProvider;
