const db = require('./db');
const dayjs = require('dayjs');
const CONFIG = require('./config');

function render(provider) {
    const last = db.getLastStat();
    const daily = db.getDailyStats();
    const live = provider.getLiveModelInfo();

    if (!last && !live) {
        console.log('--- TPS | color=gray');
        console.log('---');
        console.log('No stats found');
        return;
    }

    const model = live ? live.identifier : (last ? last.model_id : 'Unknown');
    const isMLX = provider.isMLXBackend ? provider.isMLXBackend(model) : model.toLowerCase().includes('mlx');

    let tps, trs;
    if (isMLX) {
        // MLX backend doesn't log TPS metrics
        tps = 'N/A';
        trs = 'N/A';
    } else {
        // Show last recorded TPS regardless of status (IDLE or GENERATING)
        tps = last ? last.generation_tps.toFixed(1) : '0.0';
        trs = last && last.prompt_tps ? last.prompt_tps.toFixed(1) : '0.0';
    }

    // Get VRAM usage
    let vram = null;
    try {
        const gpuStats = provider.getGpuStats();
        if (gpuStats && gpuStats.gpuMemoryInUse) {
            if (gpuStats.gpuMemoryTotal) {
                vram = `${gpuStats.gpuMemoryInUse} / ${gpuStats.gpuMemoryTotal} GB`;
            } else {
                vram = `${gpuStats.gpuMemoryInUse} GB`;
            }
        }
    } catch (e) {
        if (CONFIG.DEBUG) console.error('GPU stats error in menubar:', e.message);
    }
    
    const timestamp = last ? dayjs(last.timestamp) : dayjs();
    const isRecent = last ? dayjs().diff(timestamp, 'minute') < 5 : false;

    // Main display
    const color = '#F5F5F5'; // User-specified high-contrast color
    const icon = (live && live.status === 'GENERATING') ? '🚀 ' : '💤 ';
    console.log(`${icon}${tps} TPS • ${trs} TRS | color=${color} size=14 font=Arial-Bold`);

    // Dropdown items
    console.log('---');
    console.log(`Model: ${model}`);
    if (isMLX) {
        console.log('Backend: MLX (TPS not available)');
    }
    if (live) {
        console.log(`Status: ${live.status}`);
    }
    if (vram) {
        console.log(`VRAM: ${vram}`);
    }
    if (last) {
        console.log(`Last Update: ${timestamp.format('HH:mm:ss')}${isRecent ? '' : ' (stale)'}`);
    }
    console.log('---');
    if (isMLX) {
        console.log('Note: MLX backend does not log TPS');
    } else {
        console.log(`Today's Avg: ${daily.avg_tps ? daily.avg_tps.toFixed(2) : '0.00'} TPS`);
        console.log(`Today's Peak: ${daily.max_tps ? daily.max_tps.toFixed(2) : '0.00'} TPS`);
    }
    console.log(`Today's Tokens: ${daily.total_tokens || 0}`);
    console.log('---');
    console.log('Open Dashboard | bash="lllm-stats" terminal=true');
    console.log('Refresh | refresh=true');
}

module.exports = { render };
