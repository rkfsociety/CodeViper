import { z } from 'zod'

export const UpdateInfoSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('git'),
    commits: z.number()
  }),
  z.object({
    source: z.literal('release'),
    version: z.string(),
    ready: z.boolean(),
    percent: z.number().min(0).max(100).optional(),
    transferred: z.number().nonnegative().optional(),
    total: z.number().nonnegative().optional(),
    bytesPerSecond: z.number().nonnegative().optional()
  })
])

export type UpdateInfo = z.infer<typeof UpdateInfoSchema>
