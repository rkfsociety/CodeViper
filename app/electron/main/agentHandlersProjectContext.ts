export interface ProjectToolOptions {
  readonlyMode?: boolean
  ollamaUrl?: string
  qdrantUrl?: string
  qdrantApiKey?: string
  commandBlocklist?: string[]
  commandAllowlist?: string[]
  sandboxEnabled?: boolean
}

export interface ProjectHandlerContext {
  projectPath: string
  commandTimeoutMs?: number
  options?: ProjectToolOptions
  editSnapshots: Map<string, string>
  assertInsideProject: (
    rawPath: string | undefined,
    label?: string,
    opts?: { allowEmpty?: boolean }
  ) => void
  guardWrite: <T extends object>(
    handler: (args: T) => Promise<string>
  ) => (args: T) => Promise<string>
}
