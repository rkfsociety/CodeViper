import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './PanZoomViewport.module.css'

const MIN_SCALE = 0.15
const MAX_SCALE = 4
const ZOOM_STEP = 1.12

interface Transform {
  x: number
  y: number
  scale: number
}

interface Props {
  children: ReactNode
  className?: string
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

interface ViewportRect {
  left: number
  top: number
}

function zoomAtPoint(
  transform: Transform,
  clientX: number,
  clientY: number,
  rect: ViewportRect,
  factor: number
): Transform {
  const pointerX = clientX - rect.left
  const pointerY = clientY - rect.top
  const nextScale = clampScale(transform.scale * factor)
  const ratio = nextScale / transform.scale

  return {
    scale: nextScale,
    x: pointerX - (pointerX - transform.x) * ratio,
    y: pointerY - (pointerY - transform.y) * ratio
  }
}

export function PanZoomViewport({ children, className }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const [dragging, setDragging] = useState(false)

  const applyZoom = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current
    if (!viewport) return

    const rect = viewport.getBoundingClientRect()
    const centerX = clientX ?? rect.left + rect.width / 2
    const centerY = clientY ?? rect.top + rect.height / 2
    setTransform((current) => zoomAtPoint(current, centerX, centerY, rect, factor))
  }, [])

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 })
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const onWheel = (event: {
      preventDefault: () => void
      deltaY: number
      clientX: number
      clientY: number
    }) => {
      event.preventDefault()
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      setTransform((current) =>
        zoomAtPoint(current, event.clientX, event.clientY, viewport.getBoundingClientRect(), factor)
      )
    }

    viewport.addEventListener('wheel', onWheel as (event: never) => void, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    setTransform((current) => ({
      ...current,
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY)
    }))
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragging(false)
  }

  return (
    <div
      ref={viewportRef}
      className={`${styles.viewport} ${dragging ? styles.viewportDragging : ''} ${className ?? ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className={styles.controls} onPointerDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={() => applyZoom(ZOOM_STEP)}
          aria-label="Увеличить"
        >
          +
        </button>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={() => applyZoom(1 / ZOOM_STEP)}
          aria-label="Уменьшить"
        >
          −
        </button>
        <button type="button" className={styles.controlBtn} onClick={resetView}>
          Сброс
        </button>
      </div>
      <div className={styles.hint}>Колесо — масштаб · перетаскивание — перемещение</div>
      <div
        className={styles.content}
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
        }}
      >
        {children}
      </div>
    </div>
  )
}
