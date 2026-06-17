import { describe, it, expect, vi, afterEach } from 'vitest'
import { deleteOllamaModel } from '../electron/main/agent'

describe('deleteOllamaModel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('вызывает Ollama DELETE /api/delete', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await deleteOllamaModel('http://127.0.0.1:11434', 'qwen2.5-coder:7b')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/delete',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ name: 'qwen2.5-coder:7b' })
      })
    )
  })

  it('бросает ошибку при пустом имени', async () => {
    await expect(deleteOllamaModel('http://127.0.0.1:11434', '  ')).rejects.toThrow(/имя модели/)
  })
})
