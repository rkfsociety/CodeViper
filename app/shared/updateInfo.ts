import { z } from 'zod'

export const UpdateInfoSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('git'),
    commits: z.number()
  }),
  z.object({
    source: z.literal('release'),
    version: z.string(),
    ready: z.boolean()
  })
])

export type UpdateInfo = z.infer<typeof UpdateInfoSchema>
