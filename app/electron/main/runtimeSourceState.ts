let runtimeFromClone = false

export function isBundledRuntimeFromClone(): boolean {
  return runtimeFromClone
}

export function setBundledRuntimeFromClone(value: boolean): void {
  runtimeFromClone = value
}
