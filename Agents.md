# Agent Development Guide: LLLM-Stats

This document defines the engineering standards and development philosophy for `lllm-stats`. Any AI agent contributing to this repository MUST adhere to these mandates.

## 1. Development Philosophy: "Trust but Verify"
We operate on a **Verification-First** model. A feature is not "implemented" until it has been empirically verified against real or mocked provider telemetry.

- **Empirical Reproduction:** Before fixing a bug, you must write a script or test case that reproduces the failure.
- **Provider Isolation:** All new local LLM backends (e.g., Ollama) must be implemented by extending `src/providers/base.js`.
- **Zero-Assumption Policy:** Never assume a specific log format. Always check the latest provider-specific log structure if a parsing error occurs.

## 2. Test-Driven Development (TDD)
We prioritize TDD to ensure the TUI remains stable despite high-frequency log updates.
1. **Red:** Write a test that defines a new metric or fixes a parsing bug.
2. **Green:** Implement the minimal code in the provider or `db.js` to pass.
3. **Refactor:** Clean up the logic and ensure the TUI reflects the change without flickering or crashing.

## 3. Core Mandates
- **Surgical Updates:** Use targeted `replace` calls. Do not overwrite large files unless refactoring the entire module.
- **Resource Efficiency:** We poll system health (GPU/RAM) at **10s intervals**. Do not decrease this without a performance justification.
- **Portability:** Use `os.homedir()` for all paths. Never hardcode local paths.
- **ANSI Safety:** Use only standard ANSI colors. Avoid `grey` or complex RGB arrays.

## 4. Architectural Boundaries
- **`src/providers/`**: Server-specific logic (LM Studio, Ollama, etc.).
- **`watcher.js`**: Tailer that delegates parsing to the active provider.
- **`db.js`**: Synchronous SQLite operations. Data stored in `~/.lllm-stats/`.
- **`ui.js`**: The visual layer. Use `blessed-contrib` grids.

## 5. Verification Checklist for New Agents
- [ ] Does the change break the TUI's `tags: true` rendering?
- [ ] Have you verified the regex against the specific provider's log format?
- [ ] Does `node index.js -s` (Summary Mode) still work?
- [ ] Is the `~/.lllm-stats/` directory handled safely?
