import { describe, expect, it } from 'vitest'
import { DEFAULT_SELF_IMPROVE_BRANCH, resolveSelfImproveBranch } from '../shared/selfImprovement'

describe('resolveSelfImproveBranch', () => {
  it('возвращает дефолт при пустой строке', () => {
    expect(resolveSelfImproveBranch()).toBe(DEFAULT_SELF_IMPROVE_BRANCH)
    expect(resolveSelfImproveBranch('')).toBe(DEFAULT_SELF_IMPROVE_BRANCH)
    expect(resolveSelfImproveBranch('   ')).toBe(DEFAULT_SELF_IMPROVE_BRANCH)
  })

  it('принимает валидные agent/* имена', () => {
    expect(resolveSelfImproveBranch('agent/custom')).toBe('agent/custom')
    expect(resolveSelfImproveBranch('AGENT/My-Branch')).toBe('agent/my-branch')
  })

  it('отклоняет master и произвольные имена', () => {
    expect(resolveSelfImproveBranch('master')).toBe(DEFAULT_SELF_IMPROVE_BRANCH)
    expect(resolveSelfImproveBranch('feature/foo')).toBe(DEFAULT_SELF_IMPROVE_BRANCH)
    expect(resolveSelfImproveBranch('agent/')).toBe(DEFAULT_SELF_IMPROVE_BRANCH)
  })
})
