const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');
const chokidar = require('chokidar');
const db = require('./db');

class LogWatcher extends EventEmitter {
    constructor(provider) {
        super();
        this.provider = provider;
        this.logDir = provider.logDir;
        this.currentFile = null;
        this.currentModelId = 'Unknown';
        this.currentTimestamp = new Date();
        this.buffer = '';
        this.lastPromptTps = 0;
    }

    start() {
        const latest = this.provider.findLatestLog();
        if (latest) {
            this.watchFile(latest);
        }

        // Watch for new log files
        chokidar.watch(this.logDir, { ignoreInitial: true, depth: 2 }).on('add', (filePath) => {
            if (filePath.endsWith('.log')) {
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
                fileSize = 0; 
            }
            
            const stream = fs.createReadStream(filePath, {
                start: fileSize,
                end: curr.size
            });

            stream.on('data', (chunk) => {
                this.parseChunk(chunk.toString(), filePath, curr.size);
            });

            fileSize = curr.size;
        });
    }

    parseChunk(data, filePath, size) {
        this.buffer += data;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop();

        for (const line of lines) {
            const parsed = this.provider.parseLine(line);
            
            if (parsed.timestamp) {
                this.currentTimestamp = parsed.timestamp;
            }

            if (parsed.modelId) {
                this.currentModelId = parsed.modelId;
                this.emit('modelChange', this.currentModelId);
            }

            if (parsed.stats) {
                this.emit('stats', {
                    model_id: this.currentModelId,
                    generation_tps: parsed.stats.generation_tps,
                    prompt_tps: this.lastPromptTps,
                    total_tokens: parsed.stats.total_tokens,
                    timestamp: this.currentTimestamp
                });
            }

            if (parsed.promptStats) {
                this.lastPromptTps = parsed.promptStats.prompt_tps || 0;
                this.emit('promptStats', parsed.promptStats);
            }
        }
        db.updateProcessedOffset(filePath, size);
    }
}

module.exports = LogWatcher;
