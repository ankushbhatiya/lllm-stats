const fs = require('fs');
const path = require('path');
const db = require('./db');

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
            const lines = content.split('\n');
            
            let currentModel = 'Unknown';
            let currentTimestamp = new Date();

            for (const line of lines) {
                const parsed = provider.parseLine(line);
                
                if (parsed.timestamp) {
                    currentTimestamp = parsed.timestamp;
                }

                if (parsed.modelId) {
                    currentModel = parsed.modelId;
                }

                if (parsed.stats) {
                    db.saveStat({
                        model_id: currentModel,
                        generation_tps: parsed.stats.generation_tps,
                        total_tokens: parsed.stats.total_tokens,
                        timestamp: currentTimestamp
                    });
                    statsFound++;
                }
            }

            db.updateProcessedOffset(filePath, currentSize);
        }
    }
    return statsFound;
}

module.exports = backfill;
