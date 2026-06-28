import type { UpdateInfo } from './updateInfo'

export type ReleaseUpdateInfo = Extract<UpdateInfo, { source: 'release' }>
export type RuntimeUpdateInfo = Extract<UpdateInfo, { source: 'runtime' }>
export type GitUpdateInfo = Extract<UpdateInfo, { source: 'git' }>

export interface PendingUpdates {
  release: ReleaseUpdateInfo | null
  runtime: RuntimeUpdateInfo | null
  git: GitUpdateInfo | null
}

export interface UpdateBannerView {
  visible: boolean
  title: string
  releasePercent: number | null
  releaseProgress: string | null
  canInstall: boolean
  installLabel: string
  hasRuntime: boolean
  hasRelease: boolean
  hasGit: boolean
}

export function mergePendingUpdate(current: PendingUpdates, incoming: UpdateInfo): PendingUpdates {
  switch (incoming.source) {
    case 'release':
      return { ...current, release: incoming }
    case 'runtime':
      return { ...current, runtime: incoming }
    case 'git':
      return { ...current, git: incoming }
    default:
      return current
  }
}

function runtimeHeadLine(runtime: RuntimeUpdateInfo | null): string | null {
  if (!runtime) return null
  const head = runtime.localHead?.slice(0, 7)
  return head ? `agent runtime (${head})` : 'agent runtime'
}

export function buildUpdateBannerView(updates: PendingUpdates): UpdateBannerView {
  const { release, runtime, git } = updates
  const hasRelease = release != null
  const hasRuntime = runtime != null
  const hasGit = git != null
  const visible = hasRelease || hasRuntime || hasGit

  if (!visible) {
    return {
      visible: false,
      title: '',
      releasePercent: null,
      releaseProgress: null,
      canInstall: false,
      installLabel: 'Перезапустить',
      hasRuntime: false,
      hasRelease: false,
      hasGit: false
    }
  }

  const releaseReady = release?.ready === true
  const releaseDownloading = hasRelease && !releaseReady
  const runtimeLine = runtimeHeadLine(runtime)

  let title = ''
  if (hasRelease && hasRuntime) {
    if (releaseReady) {
      title = `Доступен установщик v${release!.version} (скачано) и готов ${runtimeLine}. Одного перезапуска достаточно.`
    } else {
      title = `Загружается установщик v${release!.version}… Готов ${runtimeLine} — применится после перезапуска.`
    }
  } else if (hasRelease) {
    title = releaseReady
      ? `Доступна новая версия ${release!.version}. Скачано — перезапустите для установки.`
      : `Загружается версия ${release!.version} с GitHub Releases…`
  } else if (hasRuntime) {
    title = `Обновление ${runtimeLine} готово. Перезапустите для применения.`
  } else if (hasGit) {
    title =
      git!.commits === 1
        ? 'Доступно обновление исходников: 1 коммит на GitHub. Перезапустите для пересборки.'
        : `Доступно обновление исходников: ${git!.commits} коммит(ов) на GitHub. Перезапустите для пересборки.`
  }

  let canInstall = false
  let installLabel = 'Перезапустить'

  if (hasRelease && hasRuntime) {
    canInstall = releaseReady
    installLabel = releaseReady ? 'Перезапустить и обновить' : 'Ожидание установщика…'
  } else if (hasRelease) {
    canInstall = releaseReady
    installLabel = releaseReady ? 'Перезапустить и обновить' : 'Ожидание установщика…'
  } else if (hasRuntime) {
    canInstall = true
    installLabel = 'Перезапустить для применения'
  } else if (hasGit) {
    canInstall = true
    installLabel = 'Перезапустить'
  }

  const releasePercent =
    releaseDownloading && release?.percent != null
      ? Math.min(100, Math.max(0, release.percent))
      : null

  return {
    visible,
    title,
    releasePercent,
    releaseProgress: null,
    canInstall,
    installLabel,
    hasRuntime,
    hasRelease,
    hasGit
  }
}
