import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/**
 * Доступность модального окна:
 *  - при открытии переводит фокус внутрь модалки (на первый интерактивный элемент);
 *  - удерживает фокус внутри (Tab/Shift+Tab зациклены);
 *  - при закрытии возвращает фокус на элемент, который был активен до открытия.
 *
 * Возвращает ref, который нужно навесить на корневой контейнер модалки.
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(open: boolean) {
  const containerRef = useRef<T>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    // Запоминаем, что было в фокусе до открытия.
    previousFocusRef.current = document.activeElement as HTMLElement | null

    const container = containerRef.current
    if (container) {
      const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      const first = focusables[0]
      ;(first ?? container).focus()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const node = containerRef.current
      if (!node) return

      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Возвращаем фокус на исходный элемент.
      previousFocusRef.current?.focus?.()
    }
  }, [open])

  return containerRef
}
