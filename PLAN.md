# LMS-Stats: Implementation Plan

`lms-stats` is a Terminal User Interface (TUI) tool designed to monitor LM Studio performance metrics by tailing local logs and persisting data for long-term analytics.

## 1. Technical Stack
- **Runtime:** Node.js
- **TUI Framework:** `blessed` + `blessed-contrib` (for charts/gauges)
- **Log Monitoring:** `chokidar` (to watch for new log files) + `tail-stream` (to read updates)
- **Database:** `better-sqlite3` (Zero-config, high-performance SQLite)
- **Date Handling:** `dayjs`

---

## 2. Core Architecture

### Phase A: Log Discovery & Tailing
LM Studio stores logs in `~/.lmstudio/server-logs/{YYYY-MM}/{YYYY-MM-DD}.[n].log`.
1. **Latest Log Discovery:** On startup, the tool must find the most recent `.log` file in the current month's folder.
2. **File Watching:** Use `chokidar` to detect when LM Studio creates a new log file (e.g., when it rotates logs or the day changes) and switch the "tail" to the new file.

### Phase B: Log Parsing (Regex)
The tool must extract three critical pieces of data from the log stream:
1. **Model Name:** 
   - Pattern: `\[.*?\]\[INFO\]\[(.*?)\] Running chat completion`
2. **Generation Speed (TPS):**
   - Pattern: `eval time =.*?tokens \(\s*.*?\s*ms per token,\s*(.*?)\s*tokens per second\)`
3. **Prompt Processing Speed:**
   - Pattern: `prompt eval time =.*?tokens \(\s*.*?\s*ms per token,\s*(.*?)\s*tokens per second\)`

### Phase C: Data Persistence (`~/.lms-stats/stats.db`)
Create a SQLite table to store every completed generation event. All application data MUST be stored in the `~/.lms-stats` directory.
1. **Directory Setup:** On startup, the tool must ensure `~/.lms-stats` exists using `fs.mkdirSync(path, { recursive: true })`.
2. **Database Path:** The SQLite database should be initialized at `path.join(os.homedir(), '.lms-stats', 'stats.db')`.

```sql
CREATE TABLE IF NOT EXISTS model_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    model_id TEXT,
    generation_tps REAL,
    prompt_tps REAL,
    total_tokens INTEGER
);
```

---

## 3. Implementation Steps (Junior Developer Guide)

### Step 1: Project Initialization
1. `npm init -y`
2. `npm install blessed blessed-contrib chokidar better-sqlite3 dayjs`

### Step 2: The Watcher (`src/watcher.js`)
- Write a function that resolves the path to the latest log file in `~/.lmstudio/server-logs/`.
- Use `fs.watchFile` or a stream to read new lines appended to the log.
- **Tip:** Only process lines containing `eval time` to keep it efficient.

### Step 3: Database Helper (`src/db.js`)
- Ensure the `~/.lms-stats` directory exists.
- Initialize the SQLite connection at `~/.lms-stats/stats.db`.
- Export `saveStat(data)` to insert new rows.
- Export `getAggregates()` to run queries for:
    - **Daily Max/Avg TPS**
    - **Weekly Utilization** (Sum of total tokens)
    - **Peak Performance** per model

### Step 4: Building the TUI (`src/ui.js`)
Use `blessed-contrib` to create a grid layout:
- **Gauge:** Show the current `generation_tps` relative to a target (e.g., 50 TPS).
- **Line Chart:** Plot the last 20 generation events.
- **Table:** List historical averages for the week.
- **Log Box:** Show a raw stream of the latest detected stats for debugging.

---

## 4. Key Performance Indicators (KPIs) to Display
- **Real-time Throughput:** Tokens/sec of the active generation.
- **Snappiness (TTFT):** How fast the model responds to the prompt (derived from prompt eval time).
- **Efficiency:** Compare TPS across different models to see which is best for your hardware.
- **Utilization Trend:** Daily token volume to track usage intensity.

## 5. Security & Safety
- **Read Only:** Ensure the tool never writes to LM Studio's log files.
- **Home Paths:** Use `os.homedir()` to resolve paths reliably for both `~/.lmstudio` (logs) and `~/.lms-stats` (data).
