import styles from './Skeleton.module.css'

interface Props {
  /** inline — компактный вариант для встраивания в текст (по умолчанию true) */
  inline?: boolean
  /** Ширина в пикселях (по умолчанию 1em) */
  width?: number
  /** Высота в пикселях (по умолчанию 1em) */
  height?: number
}

/**
 * Skeleton — анимированная заглушка загрузки с эффектом shimmer.
 * Используется вместо текстовых индикаторов "…" при загрузке данных.
 */
export function Skeleton({ inline = true, width, height }: Props) {
  const className = inline ? styles.skeletonInline : styles.skeleton
  const style: React.CSSProperties = {}
  if (width !== undefined) style.width = width
  if (height !== undefined) style.height = height

  return <span className={className} style={style} aria-hidden="true" />
}
