const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./db');

function backfill(logDir) {
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

            // Process file from lastOffset
            const content = fs.readFileSync(filePath, 'utf8').slice(lastOffset);
            const lines = content.split('\n');
            
            let currentModel = 'Unknown';
            let currentTimestamp = new Date();

            for (const line of lines) {
                // Try to extract timestamp from log line
                const tsMatch = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
                if (tsMatch) {
                    currentTimestamp = new Date(tsMatch[1]);
                }

                // Model Detection
                const modelMatch = line.match(/\[.*?\]\[INFO\]\[(.*?)\] Running chat completion/);
                if (modelMatch) {
                    currentModel = modelMatch[1];
                }

                // Generation TPS
                const genMatch = line.match(/eval time =.*?(\d+) tokens \(\s*.*?\s*ms per token,\s*(.*?)\s*tokens per second\)/);
                if (genMatch && !line.includes('prompt eval time')) {
                    db.saveStat({
                        model_id: currentModel,
                        generation_tps: parseFloat(genMatch[2]),
                        total_tokens: parseInt(genMatch[1]),
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
