const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DATA_DIR = path.join(os.homedir(), '.lms-stats');
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
`);

function saveStat(data) {
    const stmt = db.prepare(`
        INSERT INTO model_stats (model_id, generation_tps, prompt_tps, total_tokens)
        VALUES (?, ?, ?, ?)
    `);
    return stmt.run(data.model_id, data.generation_tps, data.prompt_tps, data.total_tokens);
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
        SELECT generation_tps 
        FROM model_stats 
        ORDER BY timestamp DESC 
        LIMIT ?
    `).all(limit).map(r => r.generation_tps).reverse();
}

module.exports = {
    saveStat,
    getDailyStats,
    getWeeklyStats,
    getRecentTPS
};
