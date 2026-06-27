import { useCallback, useRef } from 'react'

export function useHorizontalDrag(onDrag: (deltaX: number) => void) {
  const onDragRef = useRef(onDrag)
  onDragRef.current = onDrag

  return useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    let lastX = event.clientX

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - lastX
      lastX = ev.clientX
      if (dx !== 0) onDragRef.current(dx)
    }

    const onMouseUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])
}
