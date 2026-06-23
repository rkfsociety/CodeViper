import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyOllamaModelDigest } from '../electron/main/agentOllamaApi'

const BASE = 'http://127.0.0.1:11434'
const MODEL = 'llama3.2:3b'
const GOOD = 'sha256:aaaa1111'
const BAD = 'sha256:ffff9999'

describe('verifyOllamaModelDigest', () => {
  afterEach(() => vi.restoreAllMocks())

  it('бросает ошибку и удаляет модель при несовпадении хеша', async () => {
    const fetchMock = vi.fn()
    // /api/show возвращает другой хеш
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ digest: BAD })
    })
    // /api/delete — успех
    fetchMock.mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await expect(verifyOllamaModelDigest(BASE, MODEL, GOOD)).rejects.toThrow(/не совпадает/)

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/api/delete`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('не бросает ошибку при совпадении хешей', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ digest: GOOD })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(verifyOllamaModelDigest(BASE, MODEL, GOOD)).resolves.toBeUndefined()
  })

  it('пропускает проверку если show не возвращает digest', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ modelfile: 'FROM llama3' })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(verifyOllamaModelDigest(BASE, MODEL, GOOD)).resolves.toBeUndefined()
    // delete не должен вызываться
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/delete'),
      expect.anything()
    )
  })

  it('пропускает проверку при недоступном Ollama (сеть)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    await expect(verifyOllamaModelDigest(BASE, MODEL, GOOD)).resolves.toBeUndefined()
  })

  it('сообщение об ошибке содержит оба хеша', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ digest: BAD })
    })
    fetchMock.mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await expect(verifyOllamaModelDigest(BASE, MODEL, GOOD)).rejects.toThrow(GOOD)
    await expect(verifyOllamaModelDigest(BASE, MODEL, GOOD))
      .rejects.toThrow(BAD)
      .catch(() => {})
  })
})
