type ShutdownHook = () => void | Promise<void>

const hooks: ShutdownHook[] = []

export function registerShutdownHook(hook: ShutdownHook): void {
  hooks.push(hook)
}

export async function runShutdownHooks(): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook()
    } catch {
      /* best-effort */
    }
  }
}
