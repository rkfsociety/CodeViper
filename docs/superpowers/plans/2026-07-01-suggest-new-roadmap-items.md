# suggest_new_roadmap_items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `suggest_new_roadmap_items` agent tool that reads recent error traces and appends generated S/M roadmap tasks to the end of the selected level.

**Architecture:** `agentLogger.ts` exposes a small error-trace summary API. `agentTools/mcp.ts` registers the tool schema. `agentHandlersProject.ts` implements the file mutation against `ROADMAP/13-s-generation-and-docs.md` or `ROADMAP/29-m-guides-and-architecture-docs.md`, using deterministic heuristics so the tool works without an LLM call.

**Tech Stack:** Electron main process TypeScript, Vitest, existing CodeViper trace storage and ROADMAP markdown format.

---

### Task 1: Trace Error Summaries

**Files:**
- Modify: `app/electron/main/agentLogger.ts`
- Test: `app/tests/suggestNewRoadmapItems.test.ts`

- [ ] Add an exported `AgentTraceErrorSummary` interface.
- [ ] Add `readRecentErrorSummaries(days, limit)` to `AgentLogger`.
- [ ] Include failed `tool_result`, error `llm_response`, and error/aborted `run_end` events.
- [ ] Sort newest first and redact/truncate text.

### Task 2: Tool Registration and Handler

**Files:**
- Modify: `app/electron/main/agentTools/mcp.ts`
- Modify: `app/electron/main/agentTools/index.ts`
- Modify: `app/electron/main/agentHandlersProject.ts`
- Modify: `app/shared/toolCalls.ts`
- Test: `app/tests/suggestNewRoadmapItems.test.ts`

- [ ] Register `suggest_new_roadmap_items` with `level`, `limit`, and `days`.
- [ ] Add `ToolArgs` entry.
- [ ] Implement handler that appends tasks to the selected final S/M subfile.
- [ ] Return the generated item numbers and target file.

### Task 3: Docs, Roadmap, Verification

**Files:**
- Modify: `docs/tools-api.md`
- Modify: `ROADMAP_DONE.md`

- [ ] Document the new tool in `docs/tools-api.md`.
- [ ] Add a concise done entry to `ROADMAP_DONE.md`.
- [ ] Run targeted Vitest, `npm run typecheck`, and `npm run build`.
- [ ] Commit all task changes.
