const db = require('./db');
const dayjs = require('dayjs');

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

    const tps = live && live.status === 'GENERATING' ? (last ? last.generation_tps.toFixed(1) : '...') : (last ? last.generation_tps.toFixed(1) : '0.0');
    const model = live ? live.identifier : (last ? last.model_id : 'Unknown');
    const timestamp = last ? dayjs(last.timestamp) : dayjs();
    const isRecent = last ? dayjs().diff(timestamp, 'minute') < 5 : false;
    
    // Main display
    const color = '#F5F5F5'; // User-specified high-contrast color
    const icon = (live && live.status === 'GENERATING') ? '🚀 ' : '💤 ';
    console.log(`${icon}${tps} TPS | color=${color} size=14 font=Arial-Bold`);
    
    // Dropdown items
    console.log('---');
    console.log(`Model: ${model}`);
    if (live) {
        console.log(`Status: ${live.status}`);
        console.log(`Size: ${live.size}`);
    }
    if (last) {
        console.log(`Last Update: ${timestamp.format('HH:mm:ss')}${isRecent ? '' : ' (stale)'}`);
    }
    console.log('---');
    console.log(`Today's Avg: ${daily.avg_tps ? daily.avg_tps.toFixed(2) : '0.00'} TPS`);
    console.log(`Today's Peak: ${daily.max_tps ? daily.max_tps.toFixed(2) : '0.00'} TPS`);
    console.log(`Today's Tokens: ${daily.total_tokens || 0}`);
    console.log('---');
    console.log('Open Dashboard | bash="lllm-stats" terminal=true');
    console.log('Refresh | refresh=true');
}

module.exports = { render };
