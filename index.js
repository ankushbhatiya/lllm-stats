const db = require('./src/db');
const LogWatcher = require('./src/watcher');
const UI = require('./src/ui');

// Initialize modules
const ui = new UI();
const watcher = new LogWatcher();

// Handle Log Events
watcher.on('stats', (data) => {
    // Save to DB
    db.saveStat(data);
    
    // Update UI
    ui.updateTPS(data.generation_tps);
});

watcher.on('modelChange', (modelId) => {
    ui.setModel(modelId);
});

watcher.on('error', (err) => {
    console.error('Watcher Error:', err);
});

// Start watching
try {
    watcher.start();
} catch (err) {
    console.error('Failed to start log watcher. Ensure LM Studio is installed and has generated logs.');
    process.exit(1);
}

// Initial UI setup
ui.updateChart();
ui.refreshStats();
