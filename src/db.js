const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DATA_DIR = path.join(os.homedir(), '.lllm-stats');
const DB_PATH = path.join(DATA_DIR, 'stats.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
    CREATE TABLE IF NOT EXISTS model_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        model_id TEXT,
        generation_tps REAL,
        prompt_tps REAL,
        total_tokens INTEGER
    );

    CREATE TABLE IF NOT EXISTS processed_logs (
        file_path TEXT PRIMARY KEY,
        last_offset INTEGER
    );
`);

function saveStat(data) {
    const stmt = db.prepare(`
        INSERT INTO model_stats (model_id, generation_tps, prompt_tps, total_tokens, timestamp)
        VALUES (?, ?, ?, ?, ?)
    `);
    const ts = data.timestamp instanceof Date ? data.timestamp.toISOString() : data.timestamp;
    return stmt.run(data.model_id, data.generation_tps, data.prompt_tps, data.total_tokens, ts);
}

function getDailyStats() {
    return db.prepare(`
        SELECT 
            AVG(generation_tps) as avg_tps,
            MAX(generation_tps) as max_tps,
            SUM(total_tokens) as total_tokens
        FROM model_stats 
        WHERE timestamp >= date('now', 'start of day')
    `).get();
}

function getWeeklyStats() {
    return db.prepare(`
        SELECT 
            date(timestamp) as date,
            AVG(generation_tps) as avg_tps,
            SUM(total_tokens) as total_tokens
        FROM model_stats 
        WHERE timestamp >= date('now', '-7 days')
        GROUP BY date(timestamp)
    `).all();
}

function getRecentTPS(limit = 20) {
    return db.prepare(`
        SELECT generation_tps, timestamp 
        FROM model_stats 
        ORDER BY timestamp DESC 
        LIMIT ?
    `).all(limit).reverse();
}

function getLastStat() {
    return db.prepare(`
        SELECT model_id, generation_tps, prompt_tps, timestamp 
        FROM model_stats 
        ORDER BY timestamp DESC 
        LIMIT 1
    `).get();
}

function getProcessedOffset(filePath) {
    const row = db.prepare('SELECT last_offset FROM processed_logs WHERE file_path = ?').get(filePath);
    return row ? row.last_offset : 0;
}

function updateProcessedOffset(filePath, offset) {
    return db.prepare('INSERT OR REPLACE INTO processed_logs (file_path, last_offset) VALUES (?, ?)').run(filePath, offset);
}

function getAggregatedStats(view = 'today') {
    let interval, range;
    if (view === 'today') {
        // 15-minute buckets for today
        interval = "strftime('%Y-%m-%d %H:', timestamp) || printf('%02d', (strftime('%M', timestamp) / 15) * 15)";
        range = "date('now', 'start of day')";
    } else if (view === 'weekly') {
        // 1-hour buckets for last 7 days
        interval = "strftime('%Y-%m-%d %H:00', timestamp)";
        range = "date('now', '-7 days')";
    } else {
        // 1-day buckets for last 30 days
        interval = "date(timestamp)";
        range = "date('now', '-30 days')";
    }

    return db.prepare(`
        SELECT 
            ${interval} as bucket,
            AVG(generation_tps) as avg_tps,
            COUNT(*) as count
        FROM model_stats 
        WHERE timestamp >= ${range}
        GROUP BY bucket
        ORDER BY bucket ASC
    `).all();
}

module.exports = {
    saveStat,
    getDailyStats,
    getWeeklyStats,
    getRecentTPS,
    getLastStat,
    getProcessedOffset,
    updateProcessedOffset,
    getAggregatedStats
};
