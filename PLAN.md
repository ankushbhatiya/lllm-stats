# LLLM-Stats: Implementation Plan

`lllm-stats` is a Terminal User Interface (TUI) tool designed to monitor Local LLM performance metrics by tailing logs and persisting data for long-term analytics.

## 1. Technical Stack
- **Runtime:** Node.js
- **TUI Framework:** `blessed` + `blessed-contrib`
- **Architecture:** Provider-based (Extensible for LM Studio, Ollama, etc.)
- **Database:** `better-sqlite3` (Stored in `~/.lllm-stats/`)

---

## 2. Core Architecture

### Phase A: Provider System
All server-specific logic is isolated in `src/providers/`:
1. **Log Discovery:** Finding the correct log files.
2. **Parsing:** Regex patterns for TPS and Model detection.
3. **CLI Integration:** Wrapping tools like `lms ps` or `ollama ps`.

### Phase B: Data Persistence (`~/.lllm-stats/stats.db`)
Create a SQLite table to store every completed generation event.
1. **Directory Setup:** Ensure `~/.lllm-stats` exists.
2. **Intelligent Backfill:** Use a `processed_logs` table to track offsets and avoid double-parsing.

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
- Ensure the `~/.lllm-stats` directory exists.
- Initialize the SQLite connection at `~/.lllm-stats/stats.db`.
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
- **Home Paths:** Use `os.homedir()` to resolve paths reliably for both `~/.lmstudio` (logs) and `~/.lllm-stats` (data).
