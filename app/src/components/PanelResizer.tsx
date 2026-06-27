import { useHorizontalDrag } from '../hooks/useHorizontalDrag'

type Props = {
  onDrag: (deltaX: number) => void
  className?: string
}

export function PanelResizer({ onDrag, className }: Props) {
  const onMouseDown = useHorizontalDrag(onDrag)

  return (
    <div
      className={className ? `panel-resizer ${className}` : 'panel-resizer'}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Изменить ширину панели"
    />
  )
}
