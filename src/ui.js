const blessed = require('blessed');
const contrib = require('blessed-contrib');
const db = require('./db');

class UI {
    constructor() {
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'LMS-Stats - Local LLM Performance Monitor'
        });

        this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });
        
        // --- UI Elements ---
        
        // 1. Gauge: Current TPS (Top Left)
        this.tpsGauge = this.grid.set(0, 0, 3, 4, contrib.gauge, {
            label: ' >> LIVE THROUGHPUT ',
            stroke: 'cyan',
            fill: 'white',
            border: { type: 'line', fg: 'cyan' }
        });

        // 2. Line Chart: TPS History (Top Center/Right)
        this.tpsChart = this.grid.set(0, 4, 6, 8, contrib.line, {
            label: ' ~~ PERFORMANCE TRENDS ',
            style: { 
                line: "cyan", 
                text: "white", 
                baseline: "black" 
            },
            xLabelPadding: 3,
            xPadding: 10,
            showLegend: true,
            wholeNumbersOnly: false,
            border: { type: 'line', fg: 'black' }
        });

        // 3. Stats Table: History (Bottom Right)
        this.statsTable = this.grid.set(6, 4, 5, 8, contrib.table, {
            keys: true,
            fg: 'white',
            selectedFg: 'white',
            selectedBg: 'cyan',
            interactive: false,
            label: ' ++ HISTORICAL SNAPSHOT ',
            width: '100%',
            height: '100%',
            border: { type: "line", fg: "black" },
            columnSpacing: 8,
            columnWidth: [15, 12, 12],
            style: {
                header: { fg: 'cyan', bold: true },
                cell: { fg: 'white' }
            }
        });

        // 4. Data Box: Model & Current Info (Bottom Left)
        this.infoBox = this.grid.set(3, 0, 8, 4, blessed.box, {
            label: ' ## MODEL & SYSTEM HEALTH ',
            content: 'Waiting for telemetry...',
            tags: true,
            padding: { left: 1, right: 1 },
            border: { type: 'line', fg: 'black' },
            style: { fg: 'white' }
        });

        // 5. Help Bar (Footer)
        this.helpBar = this.grid.set(11, 0, 1, 12, blessed.box, {
            tags: true,
            style: { fg: 'white', bg: 'black' }
        });

        this.currentView = 'today'; // Default view
        this.screen.key(['v'], () => {
            const views = ['today', 'weekly', 'monthly'];
            this.currentView = views[(views.indexOf(this.currentView) + 1) % views.length];
            this.updateChart();
            this.refreshStats();
        });

        this.screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
        this.refreshStats();
    }

    updateTPS(tps) {
        this.tpsGauge.setPercent(Math.min(Math.round(tps * 2), 100)); // Visual fill still scales to 50 TPS
        this.tpsGauge.setLabel(` >> LIVE: ${tps.toFixed(2)} TPS `);
        this.updateChart();
        this.refreshStats();
    }

    updateChart() {
        const history = db.getAggregatedStats(this.currentView);
        
        const labels = history.map((entry, i) => {
            if (i % 4 === 0 || i === history.length - 1) {
                const date = new Date(entry.bucket);
                if (this.currentView === 'today') return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                if (this.currentView === 'weekly') return `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}h`;
                return `${date.getDate()}/${date.getMonth() + 1}`;
            }
            return ' ';
        });

        const viewLabels = { today: 'DAILY (15m)', weekly: 'WEEKLY (1h)', monthly: 'MONTHLY (1d)' };
        this.tpsChart.options.label = ` ~~ TRENDS: ${viewLabels[this.currentView]} `;

        this.tpsChart.setData([{
            title: 'Avg TPS',
            x: labels,
            y: history.map(h => h.avg_tps),
            style: { line: 'cyan' }
        }]);
    }

    updateHelpBar() {
        const views = { today: 'DAILY (15m)', weekly: 'WEEKLY (1h)', monthly: 'MONTHLY (1d)' };
        let content = ' {bold}[Q]{/bold} Exit | {bold}[V]{/bold} Toggle View: ';
        
        Object.keys(views).forEach(v => {
            if (v === this.currentView) {
                content += `{white-bg}{black-fg} ${views[v]} {/black-fg}{/white-bg} `;
            } else {
                content += ` {white-fg}${views[v]}{/white-fg} `;
            }
        });

        this.helpBar.setContent(content);
        this.screen.render();
    }

    refreshStats() {
        this.updateHelpBar();
        const daily = db.getDailyStats();
        const modelInfo = this.currentModel || 'Unknown';
        
        let infoStr = `\n{bold}{cyan-fg}ACTIVE MODEL:{/cyan-fg}{/bold}\n${modelInfo}\n\n`;
        
        if (this.liveInfo) {
            const statusColor = this.liveInfo.status === 'GENERATING' ? 'yellow-fg' : 'green-fg';
            infoStr += `{bold}Status:{/bold} {${statusColor}}${this.liveInfo.status}{/${statusColor}}\n`;
            infoStr += `{bold}Size:{/bold}   {white-fg}${this.liveInfo.size}{/white-fg}\n\n`;
        }
        
        if (this.systemStats) {
            const serverStatus = this.systemStats.serverOn ? '{green-fg}ONLINE{/green-fg}' : '{red-fg}OFFLINE{/red-fg}';
            infoStr += `{bold}Server:{/bold} ${serverStatus}\n`;
            infoStr += `{bold}GPU Use:{/bold} {cyan-fg}${this.systemStats.utilization}%{/cyan-fg}\n`;
            infoStr += `{bold}VRAM:{/bold}    {cyan-fg}${this.systemStats.gpuMemoryInUse} GB{/cyan-fg}\n\n`;
        }

        infoStr += `{bold}{yellow-fg}TODAY'S PEAK:{/yellow-fg}{/bold}\n`;
        infoStr += `{bold}Avg TPS:{/bold} {white-fg}${daily.avg_tps ? daily.avg_tps.toFixed(2) : '0.00'}{/white-fg}\n`;
        infoStr += `{bold}Max TPS:{/bold} {green-fg}${daily.max_tps ? daily.max_tps.toFixed(2) : '0.00'}{/green-fg}\n`;
        infoStr += `{bold}Tokens:{/bold}  {yellow-fg}${daily.total_tokens || 0}{/yellow-fg}\n`;
        
        this.infoBox.setContent(infoStr);

        const viewLabels = { today: 'Daily (15m)', weekly: 'Weekly (1h)', monthly: 'Monthly (1d)' };
        this.statsTable.options.label = ` ++ HISTORY: ${viewLabels[this.currentView]} `;

        const history = db.getAggregatedStats(this.currentView);
        this.statsTable.setData({
            headers: ['Time/Date', 'Avg TPS', 'Requests'],
            data: history.slice(-20).map(h => [h.bucket.split(' ').pop(), h.avg_tps.toFixed(2), h.count.toString()])
        });

        this.screen.render();
    }

    setSystemStats(stats) {
        this.systemStats = stats;
        this.refreshStats();
    }

    setLiveInfo(info) {
        this.liveInfo = info;
        this.refreshStats();
    }

    setModel(modelId) {
        this.currentModel = modelId;
        this.refreshStats();
    }
}

module.exports = UI;
