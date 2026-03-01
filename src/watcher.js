const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');
const chokidar = require('chokidar');
const db = require('./db');

class LogWatcher extends EventEmitter {
    constructor() {
        super();
        this.logDir = path.join(os.homedir(), '.lmstudio/server-logs');
        this.currentFile = null;
        this.currentModelId = 'Unknown';
        this.buffer = '';
    }

    findLatestLog() {
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

    start() {
        const latest = this.findLatestLog();
        if (latest) {
            this.watchFile(latest);
        }

        // Watch for new log files (log rotation or new day)
        chokidar.watch(this.logDir, { ignoreInitial: true, depth: 2 }).on('add', (filePath) => {
            if (filePath.endsWith('.log')) {
                console.log(`New log file detected: ${filePath}`);
                this.watchFile(filePath);
            }
        });
    }

    watchFile(filePath) {
        if (this.currentFile) {
            fs.unwatchFile(this.currentFile);
        }
        
        this.currentFile = filePath;
        let fileSize = fs.statSync(filePath).size;

        fs.watchFile(filePath, { interval: 1000 }, (curr) => {
            if (curr.size < fileSize) {
                fileSize = 0; // File truncated
            }
            
            const stream = fs.createReadStream(filePath, {
                start: fileSize,
                end: curr.size
            });

            stream.on('data', (chunk) => {
                this.parseChunk(chunk.toString());
                db.updateProcessedOffset(filePath, curr.size);
            });

            fileSize = curr.size;
        });
    }

    parseChunk(data) {
        this.buffer += data;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop(); // Keep partial line

        for (const line of lines) {
            // Model Detection
            const modelMatch = line.match(/\[.*?\]\[INFO\]\[(.*?)\] Running chat completion/);
            if (modelMatch) {
                this.currentModelId = modelMatch[1];
                this.emit('modelChange', this.currentModelId);
            }

            // Generation TPS
            const genMatch = line.match(/eval time =.*?(\d+) tokens \(\s*.*?\s*ms per token,\s*(.*?)\s*tokens per second\)/);
            if (genMatch && !line.includes('prompt eval time')) {
                const tokens = parseInt(genMatch[1]);
                const tps = parseFloat(genMatch[2]);
                this.emit('stats', {
                    model_id: this.currentModelId,
                    generation_tps: tps,
                    total_tokens: tokens,
                    timestamp: new Date()
                });
            }

            // Prompt TPS (simplified capture)
            const promptMatch = line.match(/prompt eval time =.*?tokens \(\s*.*?\s*ms per token,\s*(.*?)\s*tokens per second\)/);
            if (promptMatch) {
                this.emit('promptStats', {
                    prompt_tps: parseFloat(promptMatch[1])
                });
            }
        }
    }
}

module.exports = LogWatcher;
