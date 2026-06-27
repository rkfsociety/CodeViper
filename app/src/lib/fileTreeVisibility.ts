import { tronStorage } from './tron'

export const FILE_TREE_VISIBLE_KEY = 'cv-file-tree-visible'

export function loadFileTreeVisible(): boolean {
  const saved = tronStorage.getItem(FILE_TREE_VISIBLE_KEY)
  return saved !== false
}

export function saveFileTreeVisible(visible: boolean): void {
  tronStorage.setItem(FILE_TREE_VISIBLE_KEY, visible)
}
