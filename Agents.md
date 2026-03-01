# Agent Development Guide: LMS-Stats

This document defines the engineering standards and development philosophy for `lms-stats`. Any AI agent contributing to this repository MUST adhere to these mandates.

## 1. Development Philosophy: "Trust but Verify"
We operate on a **Verification-First** model. A feature is not "implemented" until it has been empirically verified against real or mocked LM Studio telemetry.

- **Empirical Reproduction:** Before fixing a bug, you must write a script or test case that reproduces the failure.
- **Mocking Strategy:** Since LM Studio logs are non-deterministic, use the `test-*.js` pattern to simulate log streams and verify regex/parsing logic in isolation.
- **Zero-Assumption Policy:** Never assume a specific log format. Always check the latest `~/.lmstudio/server-logs/` structure if a parsing error occurs.

## 2. Test-Driven Development (TDD)
We prioritize TDD to ensure the TUI remains stable despite high-frequency log updates.
1. **Red:** Write a test that defines a new metric or fixes a parsing bug.
2. **Green:** Implement the minimal code in `watcher.js` or `db.js` to pass.
3. **Refactor:** Clean up the logic and ensure the TUI (`ui.js`) reflects the change without flickering or crashing.

## 3. Core Mandates
- **Surgical Updates:** Use targeted `replace` calls. Do not overwrite large files unless refactoring the entire module.
- **Resource Efficiency:** We poll system health (GPU/RAM) at **10s intervals**. Do not decrease this without a performance justification.
- **Portability:** Use `os.homedir()` for all paths. Never hardcode `/Users/name/`.
- **ANSI Safety:** Use only standard ANSI colors (`cyan`, `magenta`, `green`, `yellow`, `white`, `black`). Avoid `grey` or RGB arrays which cause rendering artifacts in some terminals.

## 4. Architectural Boundaries
- **`watcher.js`**: Pure event emitter. It only reads and parses. It does NOT touch the UI.
- **`db.js`**: Synchronous SQLite operations using `better-sqlite3`. Ensure all timestamps are stored in ISO-8601.
- **`system.js`**: External CLI wrappers (`lms ps`, `ioreg`). Must handle errors gracefully if the commands are missing.
- **`ui.js`**: The visual layer. Use `blessed-contrib` grids. Keep it colorful but readable.

## 5. Verification Checklist for New Agents
- [ ] Does the change break the TUI's `tags: true` rendering?
- [ ] Have you verified the regex against the latest LM Studio log format?
- [ ] Does `node index.js -s` (Summary Mode) still work?
- [ ] Is the `~/.lms-stats/` directory handled safely?
