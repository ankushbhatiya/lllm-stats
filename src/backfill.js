const fs = require('fs');
const path = require('path');
const db = require('./db');
const LogParser = require('./parser');
const CONFIG = require('./config');

function backfill(provider) {
    const logDir = provider.logDir;
    if (!fs.existsSync(logDir)) return 0;

    const months = fs.readdirSync(logDir).sort();
    let statsFound = 0;

    for (const month of months) {
        const monthPath = path.join(logDir, month);
        if (!fs.statSync(monthPath).isDirectory()) continue;

        const files = fs.readdirSync(monthPath)
            .filter(f => f.endsWith('.log'))
            .sort();

        for (const file of files) {
            const filePath = path.join(monthPath, file);
            const currentSize = fs.statSync(filePath).size;
            const lastOffset = db.getProcessedOffset(filePath);

            if (currentSize <= lastOffset) continue;

            const content = fs.readFileSync(filePath, 'utf8').slice(lastOffset);
            
            // Create parser for this file
            const parser = new LogParser(provider);
            const results = parser.parseChunk(content);
            
            for (const result of results) {
                db.saveStat({
                    model_id: result.model_id,
                    generation_tps: result.generation_tps,
                    prompt_tps: result.prompt_tps,
                    total_tokens: result.total_tokens,
                    timestamp: result.timestamp
                });
                statsFound++;
            }

            db.updateProcessedOffset(filePath, currentSize);
        }
    }
    
    // Prune old data after backfill
    const pruned = db.pruneOldData();
    if (CONFIG.DEBUG && pruned > 0) {
        console.log(`Pruned ${pruned} old records`);
    }
    
    return statsFound;
}

module.exports = backfill;
