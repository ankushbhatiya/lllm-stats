# LMS-Stats 🚀

A real-time Terminal User Interface (TUI) for monitoring LM Studio performance metrics. It tracks throughput (Tokens Per Second), memory usage, and historical trends.

## Features
- 📊 **Real-time TPS Gauge:** Watch your model's generation speed as it happens.
- 📈 **Performance History:** Line charts showing TPS trends over recent requests.
- 💾 **Persistent Analytics:** Automatically saves all stats to a local SQLite database (`~/.lms-stats/stats.db`).
- 📅 **Historical Reporting:** Daily averages, peak performance, and weekly token utilization.
- 🔍 **Auto-Discovery:** Automatically finds and tails the latest LM Studio log files.

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/lms-stats.git
cd lms-stats

# Install dependencies
npm install
```

## Usage

### TUI Mode (Real-time)
Launch the interactive dashboard:
```bash
npm start
# OR
node index.js
```

### Summary Mode (Quick Stats)
Get a text-based summary and exit:
```bash
node index.js --summary
# OR
node index.js -s
```

## Technical Details
- **Log Source:** `~/.lmstudio/server-logs/`
- **Data Storage:** `~/.lms-stats/stats.db`
- **Stack:** Node.js, Blessed, SQLite3, Chokidar.

## License
MIT
