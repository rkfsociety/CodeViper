/**
 * Упрощает JSON Schema инструментов для Gemini API.
 * Без этого ~70+ tools с optional-полями дают 400:
 * "constraint that has too much branching for serving".
 */
export function simplifySchemaForGemini(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} }
  }
  return simplifyObjectSchema(schema as Record<string, unknown>)
}

function simplifyObjectSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]).filter(Boolean) : []
  )

  const simplifiedProps: Record<string, unknown> = {}
  const simplifiedRequired: string[] = []

  for (const key of Object.keys(props)) {
    if (!required.has(key)) continue
    simplifiedRequired.push(key)
    simplifiedProps[key] = simplifyPropertySchema(props[key])
  }

  return {
    type: 'object',
    properties: simplifiedProps,
    ...(simplifiedRequired.length ? { required: simplifiedRequired } : {})
  }
}

function simplifyPropertySchema(prop: Record<string, unknown>): Record<string, unknown> {
  const type = prop.type as string | undefined

  if (type === 'object' || prop.properties) {
    return { type: 'string', description: 'JSON-объект' }
  }
  if (type === 'array' || prop.items) {
    return { type: 'string', description: 'JSON-массив' }
  }

  return { type: type ?? 'string' }
}
