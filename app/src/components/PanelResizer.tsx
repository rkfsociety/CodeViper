import { useHorizontalDrag } from '../hooks/useHorizontalDrag'

type Props = {
  onDrag: (deltaX: number) => void
}

export function PanelResizer({ onDrag }: Props) {
  const onMouseDown = useHorizontalDrag(onDrag)

  return (
    <div
      className="panel-resizer"
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Изменить ширину панели"
    />
  )
}
