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
const { createProvider } = require('./src/providers/factory');
const CONFIG = require('./src/config');

// Parse CLI arguments
function parseArgs() {
    const args = process.argv.slice(2);
    return {
        summary: args.includes('--summary') || args.includes('-s'),
        menubar: args.includes('--menubar'),
        installMenubar: args.includes('--install-menubar'),
        provider: extractArgValue(args, '--provider') || extractArgValue(args, '-p') || CONFIG.DEFAULT_PROVIDER,
        cleanup: args.includes('--cleanup'),
        help: args.includes('--help') || args.includes('-h'),
        version: args.includes('--version') || args.includes('-v')
    };
}

function extractArgValue(args, flag) {
    const index = args.indexOf(flag);
    return (index !== -1 && index + 1 < args.length) ? args[index + 1] : null;
}

const opts = parseArgs();

// Handle help
if (opts.help) {
    console.log(`
LLLM-Stats - Local LLM Performance Monitor

Usage: lllm-stats [options]

Options:
  -s, --summary          Show summary and exit
  --menubar              Output for macOS menu bar (SwiftBar/xbar)
  --install-menubar      Show menubar installation instructions
  -p, --provider <name>  Select provider: ${CONFIG.AVAILABLE_PROVIDERS.join(', ')} (default: ${CONFIG.DEFAULT_PROVIDER})
  --cleanup              Prune old data and exit
  -h, --help             Show this help
  -v, --version          Show version

Environment Variables:
  DEBUG=1                Enable debug logging

Examples:
  lllm-stats                          Start TUI with default provider
  lllm-stats -s                       Show quick summary
  lllm-stats -p lmstudio              Use LM Studio provider
  lllm-stats --cleanup                Prune data older than ${CONFIG.MAX_DB_AGE_DAYS} days
`);
    process.exit(0);
}

// Handle version
if (opts.version) {
    const pkg = require('./package.json');
    console.log(pkg.version);
    process.exit(0);
}

// Create provider
let provider;
try {
    provider = createProvider(opts.provider);
} catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
}

// Handle cleanup mode
if (opts.cleanup) {
    const pruned = db.pruneOldData();
    console.log(`Pruned ${pruned} old records (older than ${CONFIG.MAX_DB_AGE_DAYS} days)`);
    db.close();
    process.exit(0);
}

// Run backfill on startup
try {
    const backfilledCount = backfill(provider);
    if (backfilledCount > 0 && CONFIG.DEBUG) {
        console.log(`Backfilled ${backfilledCount} stats`);
    }
} catch (e) {
    console.error('Backfill failed:', e.message);
}

// Handle menubar installation
if (opts.installMenubar) {
    const scriptPath = path.resolve(__filename);
    const pluginName = 'lllm-stats.10s.sh'; // 10s refresh
    const swiftBarPath = path.join(os.homedir(), 'Library/Application Support/SwiftBar/plugins', pluginName);
    const xbarPath = path.join(os.homedir(), 'Library/Application Support/xbar/plugins', pluginName);

    console.log('\n🚀 --- LLLM-Stats macOS Menu Bar Installation ---');
    console.log('To see live TPS in your menu bar, you can use SwiftBar or xbar.\n');
    console.log('Option 1: SwiftBar (Recommended)');
    console.log(`  mkdir -p "$(dirname "${swiftBarPath}")"`);
    console.log(`  echo '#!/bin/bash\\n${scriptPath} --menubar' > "${swiftBarPath}"`);
    console.log(`  chmod +x "${swiftBarPath}"`);
    console.log('\nOption 2: xbar');
    console.log(`  mkdir -p "$(dirname "${xbarPath}")"`);
    console.log(`  echo '#!/bin/bash\\n${scriptPath} --menubar' > "${xbarPath}"`);
    console.log(`  chmod +x "${xbarPath}"`);
    console.log('\nRefresh your menu bar app after running these commands!');
    db.close();
    process.exit(0);
}

// Handle menubar mode
if (opts.menubar) {
    const menubar = require('./src/menubar');
    menubar.render(provider);
    db.close();
    process.exit(0);
}

// Handle summary mode
if (opts.summary) {
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
        if (gpu.gpuMemoryTotal) {
            console.log(`VRAM In-Use:         ${gpu.gpuMemoryInUse} / ${gpu.gpuMemoryTotal} GB`);
        } else {
            console.log(`VRAM In-Use:         ${gpu.gpuMemoryInUse} GB`);
        }
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
    db.close();
    process.exit(0);
}

// Default: Start TUI
const ui = new UI(provider);
const watcher = new LogWatcher(provider);

let isShuttingDown = false;

function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    if (CONFIG.DEBUG) console.log(`\nReceived ${signal}, shutting down gracefully...`);
    
    try {
        watcher.stop();
        db.close();
    } catch (e) {
        if (CONFIG.DEBUG) console.error('Error during shutdown:', e);
    }
    
    process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', () => {
    if (!isShuttingDown) shutdown('exit');
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
});

// Handle Log Events
watcher.on('stats', (data) => {
    db.saveStat(data);
    ui.updateTPS(data.generation_tps, data.prompt_tps || 0);
});

watcher.on('modelChange', (modelId) => {
    ui.setModel(modelId);
});

watcher.on('error', (err) => {
    if (CONFIG.DEBUG) console.error('Watcher Error:', err);
});

// Start watching
try {
    watcher.start();
} catch (err) {
    console.error(`Failed to start log watcher for ${provider.name}.`);
    db.close();
    process.exit(1);
}

// Initial UI setup
ui.updateChart();
ui.refreshStats();

// Poll for live info in TUI mode
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
}, CONFIG.POLL_INTERVAL_MS);
