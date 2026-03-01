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
            label: 'Current TPS',
            stroke: 'green',
            fill: 'white'
        });

        // 2. Line Chart: TPS History (Top Center/Right)
        this.tpsChart = this.grid.set(0, 4, 6, 8, contrib.line, {
            label: 'TPS History (Generation)',
            style: { line: "yellow", text: "green", baseline: "black" },
            xLabelPadding: 3,
            xPadding: 5,
            showLegend: true,
            wholeNumbersOnly: false
        });

        // 3. Stats Table: Weekly Analytics (Bottom Right)
        this.statsTable = this.grid.set(6, 4, 6, 8, contrib.table, {
            keys: true,
            fg: 'white',
            selectedFg: 'white',
            selectedBg: 'blue',
            interactive: false,
            label: 'Weekly History (Avg TPS | Total Tokens)',
            width: '100%',
            height: '100%',
            border: { type: "line", fg: "cyan" },
            columnSpacing: 10,
            columnWidth: [15, 12, 12]
        });

        // 4. Data Box: Model & Current Info (Bottom Left)
        this.infoBox = this.grid.set(3, 0, 9, 4, blessed.box, {
            label: 'Model Info & Daily Peak',
            content: 'Waiting for logs...',
            border: { type: 'line' },
            style: { fg: 'white', border: { fg: 'green' } }
        });

        this.screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
        this.refreshStats();
    }

    updateTPS(tps) {
        this.tpsGauge.setData(Math.min(Math.round(tps * 2), 100)); // Scale to 50 TPS as 100%
        this.updateChart();
        this.refreshStats();
    }

    updateChart() {
        const history = db.getRecentTPS();
        this.tpsChart.setData([{
            title: 'TPS',
            x: history.map((_, i) => i.toString()),
            y: history
        }]);
    }

    refreshStats() {
        // Daily stats
        const daily = db.getDailyStats();
        const modelInfo = this.currentModel || 'Unknown';
        
        let infoStr = `{bold}Active Model:{/bold}
${modelInfo}

`;
        infoStr += `{bold}Today's Stats:{/bold}
`;
        infoStr += `Avg TPS: ${daily.avg_tps ? daily.avg_tps.toFixed(2) : '0.00'}
`;
        infoStr += `Max TPS: ${daily.max_tps ? daily.max_tps.toFixed(2) : '0.00'}
`;
        infoStr += `Total Tokens: ${daily.total_tokens || 0}
`;
        
        this.infoBox.setContent(infoStr);

        // Weekly table
        const weekly = db.getWeeklyStats();
        this.statsTable.setData({
            headers: ['Date', 'Avg TPS', 'Total Tokens'],
            data: weekly.map(w => [w.date, w.avg_tps.toFixed(2), w.total_tokens.toString()])
        });

        this.screen.render();
    }

    setModel(modelId) {
        this.currentModel = modelId;
        this.refreshStats();
    }
}

module.exports = UI;
