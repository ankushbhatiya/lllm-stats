#!/usr/bin/env node
// Suppress terminal capability warnings from blessed (harmless but noisy)
const originalStderrWrite = process.stderr.write;
process.stderr.write = function(chunk, encoding, cb) {
    const str = chunk.toString();
    if (!str.includes('Error on xterm-256color') && !str.includes('%p1%{')) {
        return originalStderrWrite.call(this, chunk, encoding, cb);
    }
};

const originalStdoutWrite = process.stdout.write;
process.stdout.write = function(chunk, encoding, cb) {
    const str = chunk.toString();
    if (!str.includes('Error on xterm-256color') && !str.includes('%p1%{')) {
        return originalStdoutWrite.call(this, chunk, encoding, cb);
    }
};

const path = require('path');
const os = require('os');
const db = require('./src/db');
const LogWatcher = require('./src/watcher');
const UI = require('./src/ui');
const backfill = require('./src/backfill');
const LMStudioProvider = require('./src/providers/lmstudio');

// TODO: In future, add detection logic for Ollama, etc.
const provider = new LMStudioProvider();

// Run backfill on startup
try {
    const backfilledCount = backfill(provider);
    if (backfilledCount > 0) {
        // Only log in summary mode or to a file if needed
    }
} catch (e) {
    console.error('Backfill failed:', e.message);
}

const isSummary = process.argv.includes('--summary') || process.argv.includes('-s');
const isMenubar = process.argv.includes('--menubar');
const installMenubar = process.argv.includes('--install-menubar');

if (isMenubar) {
    const menubar = require('./src/menubar');
    menubar.render(provider);
    process.exit(0);
}

if (installMenubar) {
    const scriptPath = path.resolve(__filename);
    const pluginName = 'lllm-stats.10s.sh'; // 10s refresh
    const swiftBarPath = path.join(os.homedir(), 'Library/Application Support/SwiftBar/plugins', pluginName);
    const xbarPath = path.join(os.homedir(), 'Library/Application Support/xbar/plugins', pluginName);

    console.log('\n🚀 --- LLLM-Stats macOS Menu Bar Installation ---');
    console.log('To see live TPS in your menu bar, you can use SwiftBar or xbar.\n');
    console.log('Option 1: SwiftBar (Recommended)');
    console.log(`  mkdir -p "$(dirname "${swiftBarPath}")"`);
    console.log(`  echo '#!/bin/bash\n${scriptPath} --menubar' > "${swiftBarPath}"`);
    console.log(`  chmod +x "${swiftBarPath}"`);
    console.log('\nOption 2: xbar');
    console.log(`  mkdir -p "$(dirname "${xbarPath}")"`);
    console.log(`  echo '#!/bin/bash\n${scriptPath} --menubar' > "${xbarPath}"`);
    console.log(`  chmod +x "${xbarPath}"`);
    console.log('\nRefresh your menu bar app after running these commands!');
    process.exit(0);
}

if (isSummary) {
    const daily = db.getDailyStats();
    const weekly = db.getWeeklyStats();
    const last = db.getLastStat();
    const live = provider.getLiveModelInfo();
    const gpu = provider.getGpuStats();
    const serverStatus = provider.getServerStatus();

    const model = live ? live.identifier : (last ? last.model_id : 'Unknown');
    const isMLX = provider.isMLXBackend ? provider.isMLXBackend(model) : model.toLowerCase().includes('mlx');

    console.log(`\n📊 --- LLLM-Stats Summary (${provider.name}) ---`);
    console.log(`Server Status:       ${serverStatus.serverOn ? 'ONLINE' : 'OFFLINE'}`);
    
    if (live) {
        console.log(`Live Model:          ${live.identifier} (${live.status})`);
        console.log(`Model Size:          ${live.size}`);
    } else if (last) {
        console.log(`Last Model Seen:     ${last.model_id}`);
    }

    if (isMLX) {
        console.log('Backend:             MLX (TPS not available)');
    }

    if (gpu) {
        console.log(`GPU Utilization:     ${gpu.utilization}%`);
        console.log(`VRAM In-Use:         ${gpu.gpuMemoryInUse} GB`);
    }

    if (isMLX) {
        console.log('\n⚠️  MLX backend does not log TPS metrics.');
        console.log('TPS data is only available for llama.cpp backend.');
    } else if (last) {
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
const ui = new UI(provider);
const watcher = new LogWatcher(provider);

// Handle Log Events
watcher.on('stats', (data) => {
    db.saveStat(data);
    ui.updateTPS(data.generation_tps, data.prompt_tps || 0);
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
    console.error(`Failed to start log watcher for ${provider.name}.`);
    process.exit(1);
}

// Initial UI setup
ui.updateChart();
ui.refreshStats();

// Poll for live info every 10s in TUI mode
setInterval(() => {
    const live = provider.getLiveModelInfo();
    const gpu = provider.getGpuStats();
    const serverStatus = provider.getServerStatus();
    
    if (live) {
        ui.setLiveInfo(live);
    }
    
    ui.setSystemStats({
        ...gpu,
        serverOn: serverStatus.serverOn
    });
}, 10000);
