export async function* readNdjsonLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) yield JSON.parse(line) as Record<string, unknown>
        newlineIndex = buffer.indexOf('\n')
      }
    }

    const tail = buffer.trim()
    if (tail) yield JSON.parse(tail) as Record<string, unknown>
  } finally {
    reader.releaseLock()
  }
}
