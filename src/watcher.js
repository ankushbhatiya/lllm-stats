const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const chokidar = require('chokidar');
const db = require('./db');
const LogParser = require('./parser');
const CONFIG = require('./config');

class LogWatcher extends EventEmitter {
    constructor(provider) {
        super();
        this.provider = provider;
        this.logDir = provider.logDir;
        this.currentFile = null;
        this.parser = new LogParser(provider);
        this.watcher = null;
        this.fileWatcher = null;
    }

    start() {
        const latest = this.provider.findLatestLog();
        if (latest && fs.existsSync(latest)) {
            this.watchFile(latest);
        }

        // Watch for new log files
        this.watcher = chokidar.watch(this.logDir, { 
            ignoreInitial: true, 
            depth: CONFIG.WATCH_DEPTH 
        });
        
        this.watcher.on('add', (filePath) => {
            if (filePath.endsWith('.log') && fs.existsSync(filePath)) {
                this.watchFile(filePath);
            }
        });

        this.watcher.on('error', (err) => {
            if (CONFIG.DEBUG) console.error('Chokidar error:', err);
            this.emit('error', err);
        });
    }

    watchFile(filePath) {
        if (!fs.existsSync(filePath)) return;

        if (this.currentFile) {
            fs.unwatchFile(this.currentFile);
        }

        this.currentFile = filePath;
        let fileSize = fs.statSync(filePath).size;

        this.fileWatcher = fs.watchFile(filePath, { interval: CONFIG.WATCH_INTERVAL_MS }, (curr) => {
            if (curr.size < fileSize) {
                // File was truncated or rotated
                fileSize = 0;
            }

            const stream = fs.createReadStream(filePath, {
                start: fileSize,
                end: curr.size
            });

            stream.on('data', (chunk) => {
                this.parseChunk(chunk.toString(), filePath, curr.size);
            });

            stream.on('error', (err) => {
                if (CONFIG.DEBUG) console.error('Stream error:', err);
            });

            fileSize = curr.size;
        });
    }

    parseChunk(data, filePath, size) {
        const results = this.parser.parseChunk(data);
        
        for (const result of results) {
            if (result.hasModelChange) {
                this.emit('modelChange', result.model_id);
            }
            
            this.emit('stats', {
                model_id: result.model_id,
                generation_tps: result.generation_tps,
                prompt_tps: result.prompt_tps,
                total_tokens: result.total_tokens,
                timestamp: result.timestamp
            });
        }
        
        db.updateProcessedOffset(filePath, size);
    }

    /**
     * Stop watching and cleanup resources
     */
    stop() {
        if (this.currentFile) {
            fs.unwatchFile(this.currentFile);
            this.currentFile = null;
        }
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        this.fileWatcher = null;
    }
}

module.exports = LogWatcher;
