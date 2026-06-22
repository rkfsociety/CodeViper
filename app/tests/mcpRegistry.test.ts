import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentSettings } from '../src/types'

vi.mock('../electron/main/settings', () => ({
  saveSettings: vi.fn(async (settings: AgentSettings) => settings)
}))

import { saveSettings } from '../electron/main/settings'
import {
  addMcpServer,
  buildMcpManifestUrl,
  fetchMcpManifest,
  normalizeMcpServerUrl,
  removeMcpServer
} from '../electron/main/mcpRegistry'

const baseSettings: AgentSettings = {
  ollamaUrl: 'http://127.0.0.1:11434',
  model: 'test'
}

describe('mcpRegistry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(saveSettings).mockClear()
  })

  it('normalizeMcpServerUrl убирает хвостовой слэш и добавляет https', () => {
    expect(normalizeMcpServerUrl('example.com/mcp/')).toBe('https://example.com/mcp')
  })

  it('buildMcpManifestUrl строит путь .well-known/mcp', () => {
    expect(buildMcpManifestUrl('https://api.example.com')).toBe(
      'https://api.example.com/.well-known/mcp'
    )
  })

  it('fetchMcpManifest парсит tools из JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: [
            {
              name: 'search',
              description: 'Search docs',
              parameters: { type: 'object', properties: {} }
            }
          ]
        })
      })
    )

    const manifest = await fetchMcpManifest('https://mcp.example.com')

    expect(manifest).toEqual({
      url: 'https://mcp.example.com',
      tools: [
        {
          name: 'search',
          description: 'Search docs',
          parameters: { type: 'object', properties: {} }
        }
      ]
    })
  })

  it('fetchMcpManifest бросает ошибку при невалидном манифесте', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tools: [] })
      })
    )

    await expect(fetchMcpManifest('https://mcp.example.com')).rejects.toThrow(
      /не содержит инструментов/
    )
  })

  it('addMcpServer сохраняет сервер в настройках', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: [{ name: 'ping', description: 'Ping', parameters: {} }]
        })
      })
    )

    const result = await addMcpServer(baseSettings, 'https://mcp.example.com')

    expect(saveSettings).toHaveBeenCalledOnce()
    expect(result.mcpServers).toEqual([
      {
        url: 'https://mcp.example.com',
        tools: [{ name: 'ping', description: 'Ping', parameters: {} }]
      }
    ])
  })

  it('addMcpServer не дублирует уже добавленный URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tools: [{ name: 'ping', description: 'Ping', parameters: {} }]
        })
      })
    )

    const settings: AgentSettings = {
      ...baseSettings,
      mcpServers: [
        {
          url: 'https://mcp.example.com',
          tools: [{ name: 'old', description: 'Old', parameters: {} }]
        }
      ]
    }

    await expect(addMcpServer(settings, 'https://mcp.example.com/')).rejects.toThrow(/уже добавлен/)
  })

  it('removeMcpServer удаляет сервер из настроек', async () => {
    const settings: AgentSettings = {
      ...baseSettings,
      mcpServers: [
        {
          url: 'https://mcp.example.com',
          tools: [{ name: 'ping', description: 'Ping', parameters: {} }]
        }
      ]
    }

    const result = await removeMcpServer(settings, 'https://mcp.example.com/')

    expect(saveSettings).toHaveBeenCalledOnce()
    expect(result.mcpServers).toEqual([])
  })
})
