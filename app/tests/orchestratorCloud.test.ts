import { describe, it, expect } from 'vitest'
import {
  buildOrchestratorCloudProviderConfig,
  filterOrchestratorCloudModels,
  isCloudOrchestratorConfigured,
  isOrchestratorCloudModelAllowed,
  resolveOrchestratorCloudModel
} from '../shared/orchestratorCloud'
import { isOrchestratorConfigured } from '../shared/orchestrator'

describe('orchestratorCloud', () => {
  const literouterModels = [
    { name: 'deepseek:free' },
    { name: 'mistral:free' },
    { name: 'openai/gpt-4o-mini' }
  ]

  it('filterOrchestratorCloudModels для LiteRouter free', () => {
    const filtered = filterOrchestratorCloudModels(
      { modelProvider: 'literouter', literouterTier: 'free' },
      literouterModels
    )
    expect(filtered.map((m) => m.name)).toEqual(['deepseek:free', 'mistral:free'])
  })

  it('isOrchestratorCloudModelAllowed отклоняет paid-модель в free tier', () => {
    expect(
      isOrchestratorCloudModelAllowed(
        { modelProvider: 'literouter', literouterTier: 'free' },
        'openai/gpt-4o-mini',
        literouterModels
      )
    ).toBe(false)
    expect(
      isOrchestratorCloudModelAllowed(
        { modelProvider: 'literouter', literouterTier: 'free' },
        'deepseek:free',
        literouterModels
      )
    ).toBe(true)
  })

  it('resolveOrchestratorCloudModel подбирает первую допустимую', () => {
    expect(
      resolveOrchestratorCloudModel(
        {
          modelProvider: 'literouter',
          literouterTier: 'free',
          orchestratorCloudModel: 'openai/gpt-4o-mini'
        },
        literouterModels
      )
    ).toBe('deepseek:free')
  })

  it('isCloudOrchestratorConfigured требует ключ и модель', () => {
    expect(
      isCloudOrchestratorConfigured({
        modelProvider: 'literouter',
        literouterTier: 'free',
        literouterApiKey: 'sk-test',
        orchestratorCloudModel: 'deepseek:free',
        orchestratorBackend: 'cloud'
      })
    ).toBe(true)
    expect(
      isCloudOrchestratorConfigured({
        modelProvider: 'literouter',
        literouterTier: 'free',
        orchestratorCloudModel: 'deepseek:free',
        orchestratorBackend: 'cloud'
      })
    ).toBe(false)
  })

  it('buildOrchestratorCloudProviderConfig для LiteRouter', () => {
    const cfg = buildOrchestratorCloudProviderConfig(
      {
        modelProvider: 'literouter',
        literouterTier: 'free',
        literouterApiKey: 'lr-key',
        orchestratorCloudModel: 'deepseek:free'
      },
      literouterModels
    )
    expect(cfg.type).toBe('literouter')
    expect(cfg.model).toBe('deepseek:free')
    expect(cfg.apiKey).toBe('lr-key')
  })

  it('isOrchestratorConfigured для cloud backend', () => {
    expect(
      isOrchestratorConfigured({
        orchestratorBackend: 'cloud',
        modelProvider: 'literouter',
        literouterTier: 'free',
        literouterApiKey: 'k',
        orchestratorCloudModel: 'deepseek:free'
      })
    ).toBe(true)
  })
})
