# LiteRouter Text Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LiteRouter as a first-class cloud text provider in CodeViper with dedicated settings, runtime wiring, tests, and docs.

**Architecture:** Introduce a new provider type `literouter` and thread it through settings, provider-config builders, and UI. Reuse the existing OpenAI-compatible runtime instead of creating a second HTTP client.

**Tech Stack:** TypeScript, React, Electron, Vitest, existing OpenAI-compatible provider runtime.

---

### Task 1: Add failing tests for settings and runtime routing

**Files:**
- Modify: `app/tests/settings.test.ts`
- Modify: `app/tests/providers.integration.test.ts`

- [ ] **Step 1: Write failing settings tests**

Add assertions that `saveSettings()` persists `literouterApiKey` and `literouterBaseUrl`, and that `resolveFirstRunCompleted()` treats `modelProvider: 'literouter'` as configured cloud usage.

- [ ] **Step 2: Write failing runtime test**

Add a `ModelRuntime` test that constructs `new ModelRuntime({ type: 'literouter', baseUrl: 'https://api.literouter.com/v1', apiKey: 'lr-key', model: 'deepseek:free' })`, stubs `fetch`, runs `chat()`, and verifies the Authorization header and LiteRouter URL are used.

- [ ] **Step 3: Run targeted tests and confirm failure**

Run:
```powershell
npm test -- settings.test.ts providers.integration.test.ts
```

Expected: FAIL because `literouter` fields/types do not exist yet.

### Task 2: Add shared types, constants, and settings persistence

**Files:**
- Modify: `app/src/types.ts`
- Modify: `app/shared/constants.ts`
- Modify: `app/electron/main/settings.ts`

- [ ] **Step 1: Add provider/type definitions**

Introduce `literouter` to provider unions plus:

```ts
export const LITEROUTER_API_BASE_URL = 'https://api.literouter.com/v1'
export const LITEROUTER_MODEL_DEFAULT = 'deepseek:free'
```

- [ ] **Step 2: Add persisted settings fields**

Add `literouterApiKey` and `literouterBaseUrl` to schema/defaults/load/save/normalize paths.

- [ ] **Step 3: Run targeted tests**

Run:
```powershell
npm test -- settings.test.ts
```

Expected: settings tests move to green or fail only in remaining runtime/UI gaps.

### Task 3: Wire provider configs and runtime factory

**Files:**
- Modify: `app/electron/main/modelRuntime.ts`
- Modify: `app/electron/main/agentContext.ts`
- Modify: `app/electron/main/agentContextManager.ts`
- Modify: `app/electron/main/subagentRunner.ts`

- [ ] **Step 1: Route provider config builders**

Make all config builders resolve LiteRouter base URL, API key, and default model.

- [ ] **Step 2: Route ModelRuntime**

Handle `config.type === 'literouter'` by reusing the OpenAI-compatible provider path.

- [ ] **Step 3: Run targeted tests**

Run:
```powershell
npm test -- providers.integration.test.ts
```

Expected: LiteRouter runtime test passes.

### Task 4: Add LiteRouter to settings UI

**Files:**
- Modify: `app/src/components/SettingsModal/ModelTab.tsx`

- [ ] **Step 1: Add provider option and switch defaults**

Add `LiteRouter` to the dropdown and set default model/base URL when selected.

- [ ] **Step 2: Add LiteRouter settings block**

Render dedicated inputs for base URL, API key, and ping, matching existing cloud-provider UX.

- [ ] **Step 3: Run relevant tests/build**

Run:
```powershell
npm run typecheck
```

Expected: PASS.

### Task 5: Update docs and verify full app build

**Files:**
- Modify: `README.md`
- Modify: `docs/integrations.md`

- [ ] **Step 1: Document LiteRouter text provider**

Add LiteRouter to provider lists and brief setup guidance.

- [ ] **Step 2: Run required verification**

Run:
```powershell
npm run typecheck
npm run build
```

from `app/`.

Expected: PASS.

- [ ] **Step 3: Review git diff and prepare commit**

Check that changes are limited to LiteRouter text provider support plus required docs/spec/plan updates.
