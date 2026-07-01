import { useEffect, useRef, useState } from 'react'
import styles from './MermaidDiagram.module.css'

interface Props {
  chart: string
  className?: string
  /** Без ограничения ширины — для pan/zoom в больших графах */
  interactive?: boolean
}

export function MermaidDiagram({ chart, className, interactive = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container || !chart.trim()) return

    setError(null)
    container.innerHTML = ''

    void import('mermaid').then(async (mermaidModule) => {
      if (cancelled || !containerRef.current) return
      const mermaid = mermaidModule.default
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: 'var(--font-mono, ui-monospace, monospace)'
      })

      const renderId = `mmd-${Math.random().toString(36).slice(2)}`
      try {
        const { svg } = await mermaid.render(renderId, chart)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, [chart])

  if (error) {
    return (
      <pre className={`${styles.error} ${className ?? ''}`}>
        Не удалось отрисовать диаграмму: {error}
      </pre>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`${styles.diagram} ${interactive ? styles.diagramInteractive : ''} ${className ?? ''}`}
    />
  )
}
