import { describe, expect, it } from 'vitest'
import { readFileBlobInRenderer } from '../src/lib/attachmentHelpers'
import { ATTACHMENT_SIZE_LIMIT_BYTES } from '../shared/constants'

describe('readFileBlobInRenderer', () => {
  it('отклоняет слишком большой файл', async () => {
    const big = 'x'.repeat(ATTACHMENT_SIZE_LIMIT_BYTES + 1)
    const file = new File([big], 'big.txt', { type: 'text/plain' })
    const result = await readFileBlobInRenderer(file)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/слишком большой/)
  })
})
