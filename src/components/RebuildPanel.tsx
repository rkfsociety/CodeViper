import { useEffect, useRef, useState } from 'react'
import type { RebuildStatus } from '../types'

export function RebuildPanel() {
  const [status, setStatus] = useState<RebuildStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState('')
  const [resultOk, setResultOk] = useState<boolean | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  async function refreshStatus() {
    setStatus(await window.codeviper.getRebuildStatus())
  }

  useEffect(() => {
    void refreshStatus()
  }, [])

  useEffect(() => {
    const unsubscribe = window.codeviper.onRebuildProgress((event) => {
      if (event.type === 'start') {
        setLog([`Сборка: ${event.root ?? ''}`])
        setResult('')
      }

      if (event.type === 'log' && event.line) {
        setLog((prev) => [...prev.slice(-200), event.line!])
      }

      if (event.type === 'done') {
        setBusy(false)
        setResult(event.message ?? (event.ok ? 'Готово' : 'Ошибка'))
        setResultOk(event.ok ?? false)
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [log])

  async function pickSourceFolder() {
    const next = await window.codeviper.selectRebuildSourceFolder()
    setStatus(next)
  }

  async function rebuild() {
    if (busy || !status?.available) return

    setBusy(true)
    setLog([])
    setResult('')
    setResultOk(null)

    const rebuildResult = await window.codeviper.rebuildApp()
    setBusy(false)
    setResult(rebuildResult.message)
    setResultOk(rebuildResult.ok)
    await refreshStatus()
  }

  return (
    <div className="rebuild-panel">
      <div className="rebuild-head">
        <div>
          <div className="model-section-title">Пересборка exe</div>
          {status?.root && <div className="rebuild-root">{status.root}</div>}
          {!status?.available && (
            <div className="rebuild-hint">{status?.reason ?? 'Проверка…'}</div>
          )}
          {status?.packaged && !status.available && (
            <div className="rebuild-hint">
              Один раз укажите папку с git-клоном CodeViper (где вы делали npm install).
            </div>
          )}
        </div>
        <div className="rebuild-actions">
          {!status?.available && (
            <button className="btn" onClick={pickSourceFolder} disabled={busy}>
              Папка исходников
            </button>
          )}
          <button className="btn primary" onClick={rebuild} disabled={busy || !status?.available}>
            {busy ? 'Сборка…' : 'Пересобрать exe'}
          </button>
        </div>
      </div>

      {(busy || log.length > 0) && (
        <div className="rebuild-log" ref={logRef}>
          {log.map((line, index) => (
            <div key={`${index}-${line}`}>{line}</div>
          ))}
        </div>
      )}

      {result && (
        <div className={`rebuild-result ${resultOk ? 'ok' : 'err'}`}>{result}</div>
      )}
    </div>
  )
}
