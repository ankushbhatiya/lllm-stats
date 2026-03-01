const db = require('./src/db');
const LogWatcher = require('./src/watcher');
const UI = require('./src/ui');
const system = require('./src/system');
const backfill = require('./src/backfill');

const logDir = require('path').join(require('os').homedir(), '.lmstudio/server-logs');

// Run backfill on startup
try {
    const backfilledCount = backfill(logDir);
    if (backfilledCount > 0) {
        console.log(`Backfilled ${backfilledCount} stats from logs.`);
    }
} catch (e) {
    console.error('Backfill failed:', e.message);
}

const isSummary = process.argv.includes('--summary') || process.argv.includes('-s');

const { execSync } = require('child_process');

function getLiveModelInfo() {
    try {
        const output = execSync('lms ps').toString().split('\n');
        if (output.length > 2) {
            // Find the first line after the header
            const lines = output.filter(l => l.trim() !== '' && !l.includes('IDENTIFIER'));
            if (lines.length > 0) {
                // Split by multiple spaces
                const parts = lines[0].split(/\s{2,}/);
                return {
                    identifier: parts[0],
                    model: parts[1],
                    status: parts[2],
                    size: parts[3]
                };
            }
        }
    } catch (e) {
        // lms command might not be in path or failing
    }
    return null;
}

if (isSummary) {
    const daily = db.getDailyStats();
    const weekly = db.getWeeklyStats();
    const last = db.getLastStat();
    const live = getLiveModelInfo();
    const gpu = system.getGpuStats();
    const lmsStatus = system.getLmsStatus();

    console.log('\n📊 --- LMS-Stats Summary ---');
    console.log(`Server Status:       ${lmsStatus.serverOn ? 'ONLINE' : 'OFFLINE'}`);
    
    if (live) {
        console.log(`Live Model:          ${live.identifier} (${live.status})`);
        console.log(`Model Size:          ${live.size}`);
    } else if (last) {
        console.log(`Last Model Seen:     ${last.model_id}`);
    }

    if (gpu) {
        console.log(`GPU Utilization:     ${gpu.utilization}%`);
        console.log(`VRAM In-Use:         ${gpu.gpuMemoryInUse} GB`);
    }

    if (last) {
        console.log(`Last Generation TPS: ${last.generation_tps.toFixed(2)}`);
    } else {
        console.log('No recent stats found.');
    }

    console.log(`\nToday's Average TPS: ${daily.avg_tps ? daily.avg_tps.toFixed(2) : '0.00'}`);
    console.log(`Today's Peak TPS:    ${daily.max_tps ? daily.max_tps.toFixed(2) : '0.00'}`);
    console.log(`Total Tokens Today:  ${daily.total_tokens || 0}`);

    if (weekly.length > 0) {
        console.log('\nLast 7 Days:');
        weekly.forEach(w => {
            console.log(`  ${w.date}: ${w.avg_tps.toFixed(2)} TPS (${w.total_tokens} tokens)`);
        });
    }
    console.log('---------------------------\n');
    process.exit(0);
}

// Default: Start TUI
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

// Poll for live info every 10s in TUI mode
setInterval(() => {
    const live = getLiveModelInfo();
    const gpu = system.getGpuStats();
    const lmsStatus = system.getLmsStatus();
    
    if (live) {
        ui.setLiveInfo(live);
    }
    
    ui.setSystemStats({
        ...gpu,
        serverOn: lmsStatus.serverOn
    });
}, 10000);
