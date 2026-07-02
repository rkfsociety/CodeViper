# S: UI, РёРЅС‚РµРіСЂР°С†РёРё Рё СѓРІРµРґРѕРјР»РµРЅРёСЏ

Пункты 1–13: интерфейс, webhooks, P2P, метрики и интеграции.

Р’СЃРµРіРѕ РїСѓРЅРєС‚РѕРІ: 13.


**1 В· S В· Tool `find_p2p_credit_issues`**
- **Р¦РµР»СЊ:** РѕС‚С‡РµС‚ Рѕ РЅРµРєРѕСЂСЂРµРєС‚РЅС‹С… P2P-РєСЂРµРґРёС‚Р°С…: РѕС‚СЂРёС†Р°С‚РµР»СЊРЅС‹Р№ Р±Р°Р»Р°РЅСЃ, NaN, Р»РёРјРёС‚С‹ РІ `server/p2p/credits.ts`
- **Р¤Р°Р№Р»С‹:** `p2pCreditAnalysis.ts`, `agentTools/core.ts`, handler P2P/terminal
- **Р”РµР№СЃС‚РІРёРµ:** СЃС‚Р°С‚РёС‡РµСЃРєРёР№ СЂР°Р·Р±РѕСЂ + runtime read credits store РїСЂРё РЅР°Р»РёС‡РёРё
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- p2pCreditAnalysis.test.ts`; `find_p2p_credit_issues()` -> РѕС‚С‡РµС‚



**2 В· S В· Tool `find_prompt_template_issues`**
- **Р¦РµР»СЊ:** РѕС‚С‡РµС‚ Рѕ Р±РёС‚С‹С… С€Р°Р±Р»РѕРЅР°С… РІ `docs/example-prompts.md` Рё BehaviorTab slash-templates: РїСѓСЃС‚РѕР№ trigger, РґСѓР±Р»РёРєР°С‚С‹
- **Р¤Р°Р№Р»С‹:** `promptTemplateAnalysis.ts`, `agentTools/core.ts`
- **Р”РµР№СЃС‚РІРёРµ:** parse markdown-СЃРµРєС†РёР№ + settings templates; validate `/trigger` uniqueness
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- promptTemplateAnalysis.test.ts`; `find_prompt_template_issues()` -> РѕС‚С‡РµС‚


**3 В· S В· Tool `find_toast_a11y_issues`**
- **Р¦РµР»СЊ:** РѕС‚С‡РµС‚ Рѕ toast Р±РµР· `role="status"` / `aria-live` РІ `Toast.tsx`, `App.tsx`, `McpHealthToastListener`
- **Р¤Р°Р№Р»С‹:** `toastA11yAnalysis.ts` (РїРµСЂРµРёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РїР°С‚С‚РµСЂРЅ `ariaJsxAnalysis.ts`), `agentTools/core.ts`
- **Р”РµР№СЃС‚РІРёРµ:** AST JSX РїРѕ СЃРїРёСЃРєСѓ С„Р°Р№Р»РѕРІ; РїСЂР°РІРёР»Р° live-region
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- toastA11yAnalysis.test.ts`; `find_toast_a11y_issues()` -> РѕС‚С‡РµС‚


**4 В· S В· Tool `find_env_issues`**
- **Р¦РµР»СЊ:** РѕС‚С‡РµС‚ Рѕ РєР»СЋС‡Р°С… `.env`, РЅРµ РѕРїРёСЃР°РЅРЅС‹С… РІ Zod/settings, Рё РЅР°РѕР±РѕСЂРѕС‚ - required Р±РµР· Р·РЅР°С‡РµРЅРёСЏ
- **Р¤Р°Р№Р»С‹:** `envIssueAnalysis.ts`, `settings.ts`, `agentTools/core.ts`
- **Р”РµР№СЃС‚РІРёРµ:** parse dotenv; diff СЃ `PersistedSettingsSchema` Рё documented keys
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- envIssueAnalysis.test.ts`; `find_env_issues()` -> РѕС‚С‡РµС‚


**5 В· S В· Tool `find_rag_model_issues`**
- **Р¦РµР»СЊ:** РѕС‚С‡РµС‚ Рѕ РЅРµРґРѕСЃС‚СѓРїРЅС‹С… embedding-РјРѕРґРµР»СЏС… (Ollama/OpenAI) РёР· settings vs `rag.ts`
- **Р¤Р°Р№Р»С‹:** `ragModelHealth.ts`, `rag.ts`, `agentTools/core.ts`
- **Р”РµР№СЃС‚РІРёРµ:** read settings embedding model id; ping provider / list models; mismatch dimension
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- ragModelHealth.test.ts`; `find_rag_model_issues()` -> РѕС‚С‡РµС‚


**6 В· S В· Tool `find_index_param_issues`**
- **Р¦РµР»СЊ:** РѕС‚С‡РµС‚ Рѕ РЅРµРєРѕСЂСЂРµРєС‚РЅС‹С… РїР°СЂР°РјРµС‚СЂР°С… РёРЅРґРµРєСЃР°С†РёРё (chunk size, overlap, batch) РІ settings Рё `rag.ts`
- **Р¤Р°Р№Р»С‹:** `indexParamAnalysis.ts`, `rag.ts`, `agentTools/core.ts`
- **Р”РµР№СЃС‚РІРёРµ:** validate ranges (chunk 256-8192, overlap < chunk); Zod bounds
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- indexParamAnalysis.test.ts`; `find_index_param_issues()` -> РѕС‚С‡РµС‚


**7 В· S В· Tool `find_orchestrator_issues`**
- **Р¦РµР»СЊ:** РѕС‚С‡РµС‚ Рѕ РЅРµСЃРѕРІРјРµСЃС‚РёРјРѕР№ orchestrator-РјРѕРґРµР»Рё: РЅРµ РІ listModels, СЃР»РёС€РєРѕРј РјР°Р»Р° РґР»СЏ planner
- **Р¤Р°Р№Р»С‹:** `orchestratorHealth.ts`, `orchestratorModel.ts`, `ModelTab.tsx`, `agentTools/core.ts`
- **Р”РµР№СЃС‚РІРёРµ:** read `orchestratorModel` setting; verify against provider list + min context
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- orchestratorHealth.test.ts`; `find_orchestrator_issues()` -> РѕС‚С‡РµС‚


**8 В· S В· Tool `find_vision_model_issues`**
- **Р¦РµР»СЊ:** РѕС‚С‡РµС‚ Рѕ vision-РјРѕРґРµР»Рё РІ settings Р±РµР· РїРѕРґРґРµСЂР¶РєРё image input
- **Р¤Р°Р№Р»С‹:** `visionModelHealth.ts`, `settings.ts`, `MessageBody.tsx`, `agentTools/core.ts`
- **Р”РµР№СЃС‚РІРёРµ:** cross-check model id СЃ known vision-capable list / provider metadata
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- visionModelHealth.test.ts`; `find_vision_model_issues()` -> РѕС‚С‡РµС‚


**9 В· S В· Tool `find_explorer_subagent_issues`**
- **Р¦РµР»СЊ:** РѕС‚С‡РµС‚ Рѕ РЅРµРєРѕСЂСЂРµРєС‚РЅС‹С… РЅР°СЃС‚СЂРѕР№РєР°С… Explorer-СЃСѓР±Р°РіРµРЅС‚Р° (model, tools, timeout) РІ `subagentRunner.ts`
- **Р¤Р°Р№Р»С‹:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Р”РµР№СЃС‚РІРёРµ:** validate role `explorer` block: model set, enabled tools non-empty, timeout > 0
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- subagentConfigAnalysis.test.ts`; `find_explorer_subagent_issues()` -> РѕС‚С‡РµС‚


**10 В· S В· Tool `find_reviewer_subagent_issues`**
- **Р¦РµР»СЊ:** С‚Рѕ Р¶Рµ РґР»СЏ Reviewer-СЃСѓР±Р°РіРµРЅС‚Р°
- **Р¤Р°Р№Р»С‹:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Р”РµР№СЃС‚РІРёРµ:** validate role `reviewer` block РІ settings/subagentRunner
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- subagentConfigAnalysis.test.ts`; `find_reviewer_subagent_issues()` -> РѕС‚С‡РµС‚


**11 В· S В· Tool `find_architect_subagent_issues`**
- **Р¦РµР»СЊ:** С‚Рѕ Р¶Рµ РґР»СЏ Architect-СЃСѓР±Р°РіРµРЅС‚Р°
- **Р¤Р°Р№Р»С‹:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Р”РµР№СЃС‚РІРёРµ:** validate role `architect` block
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- subagentConfigAnalysis.test.ts`; `find_architect_subagent_issues()` -> РѕС‚С‡РµС‚


**12 В· S В· Tool `find_performance_subagent_issues`**
- **Р¦РµР»СЊ:** С‚Рѕ Р¶Рµ РґР»СЏ Performance-СЃСѓР±Р°РіРµРЅС‚Р°
- **Р¤Р°Р№Р»С‹:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Р”РµР№СЃС‚РІРёРµ:** validate role `performance` block
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- subagentConfigAnalysis.test.ts`; `find_performance_subagent_issues()` -> РѕС‚С‡РµС‚


**13 В· S В· Tool `find_settings_path_issues`**
- **Р¦РµР»СЊ:** РѕС‚С‡РµС‚ Рѕ Р±РёС‚С‹С… РїСѓС‚СЏС… РІ `settings.json` (`sourceRootOverride`, `gitRepoRoot`, `orchestratorModelPath`, `recentProjects`)
- **Р¤Р°Р№Р»С‹:** `settingsPathAnalysis.ts`, `settings.ts`, `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`
- **Р”РµР№СЃС‚РІРёРµ:** `loadSettings()` + РїСЂРѕРІРµСЂРєР° РїРѕР»РµР№-РїСѓС‚РµР№ С‡РµСЂРµР· `access()`; СЃРїРёСЃРѕРє Р±РёС‚С‹С… РїСѓС‚РµР№
- **РџСЂРѕРІРµСЂРєР°:** `npm test -- settingsPathAnalysis.test.ts`; `find_settings_path_issues()` -> РѕС‚С‡РµС‚

