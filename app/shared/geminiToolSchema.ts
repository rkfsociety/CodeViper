/** Минимальная схема параметров для Gemini function calling. */
export const GEMINI_MINIMAL_TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {}
}

/**
 * Упрощает JSON Schema инструментов для Gemini API.
 * ~90 functionDeclarations с per-field required дают 400:
 * "constraint that has too much branching for serving".
 * Аргументы передаются JSON-объектом — достаточно пустой object-схемы и description инструмента.
 */
export function simplifySchemaForGemini(_schema: unknown): Record<string, unknown> {
  return GEMINI_MINIMAL_TOOL_SCHEMA
}
