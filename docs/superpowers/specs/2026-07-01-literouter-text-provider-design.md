# LiteRouter Text Provider Design

## Goal

Add LiteRouter to CodeViper as a first-class cloud text provider with its own settings, defaults, runtime routing, tests, and docs, without conflating it with `openai` or `custom`.

## Scope

- Add provider type `literouter` to shared/frontend/backend settings flow.
- Reuse existing OpenAI-compatible chat runtime for text generation.
- Add LiteRouter-specific defaults:
  - base URL: `https://api.literouter.com/v1`
  - default model: `deepseek:free`
- Add dedicated API key/base URL fields instead of reusing `openaiApiKey` or `customApiKey`.
- Update user-facing provider selection and related documentation.

Out of scope for this pass:

- LiteRouter image generation endpoint
- Provider-specific model catalog filtering beyond current generic OpenAI-compatible behavior
- Pricing integration for LiteRouter models

## Architecture

LiteRouter will be represented as a new provider type `literouter`. Internally it will reuse the existing OpenAI-compatible provider path in `OpenAIProvider`/`createOpenAiCompatibleProvider`, so transport logic remains centralized and low-risk.

The implementation will thread `literouter` through the same places that already branch on provider type today:

- frontend types and settings UI
- persisted settings normalization/encryption
- runtime provider config construction
- model runtime provider factory
- subagent/runtime helper config builders

## Data Model

New settings fields:

- `literouterApiKey?: string`
- `literouterBaseUrl?: string`

Updated unions:

- `modelProvider` adds `literouter`
- persisted settings schema adds `literouterApiKey` and `literouterBaseUrl`

Default values:

- `literouterBaseUrl = https://api.literouter.com/v1`
- `model = deepseek:free` when switching to LiteRouter and the current model is not already suitable

## UI Behavior

In the model settings tab:

- Add `LiteRouter` to provider dropdown.
- Show a short hint that LiteRouter is an OpenAI-compatible proxy.
- Show inputs for:
  - base URL
  - API key
  - ping button
- Reuse `CloudModelSelector` for model entry/listing behavior as with other cloud providers.

## Runtime Behavior

`ModelRuntime.createProvider()` will route `literouter` to the same OpenAI-compatible implementation as `custom`, but with LiteRouter defaults.

Provider config builders in:

- `agentContext.ts`
- `agentContextManager.ts`
- `subagentRunner.ts`

will resolve:

- type = `literouter`
- base URL from `literouterBaseUrl` or default constant
- API key from `literouterApiKey` or deprecated `providerApiKey`
- default model `deepseek:free` when needed

## Error Handling

LiteRouter should inherit existing OpenAI-compatible ping, streaming, list-models, and preflight behavior. No provider-specific retry logic is needed in this pass.

## Testing

Add or update tests to cover:

- settings save/load for `literouterApiKey` and `literouterBaseUrl`
- provider config resolution for `literouter`
- `ModelRuntime` routing `literouter` through the OpenAI-compatible provider path
- default model/base URL behavior where provider switching logic depends on them

## Documentation

Update:

- `README.md` provider list
- `docs/integrations.md` or equivalent integration docs with LiteRouter text setup

## Risks

- Missing one of the provider-branch callsites can produce partial support, especially for subagents or summarize/runtime helpers.
- Reusing `ollamaUrl` accidentally for LiteRouter would create confusing UI/runtime bugs; dedicated fielding avoids this.
