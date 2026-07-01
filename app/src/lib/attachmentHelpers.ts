import { ATTACHMENT_IMAGE_EXTENSIONS, ATTACHMENT_SIZE_LIMIT_BYTES } from '../../shared/constants'

export interface AttachmentReadResult {
  ok: boolean
  isImage?: boolean
  content?: string
  dataUrl?: string
  mime?: string
  error?: string
}

function attachmentTooLargeError(size: number): string {
  return `Файл слишком большой (${(size / 1024).toFixed(0)} КБ, лимит ${(ATTACHMENT_SIZE_LIMIT_BYTES / 1024).toFixed(0)} КБ)`
}

/** Чтение File/Blob в renderer, когда webUtils.getPathForFile вернул пустую строку. */
export function readFileBlobInRenderer(file: File): Promise<AttachmentReadResult> {
  if (file.size > ATTACHMENT_SIZE_LIMIT_BYTES) {
    return Promise.resolve({ ok: false, error: attachmentTooLargeError(file.size) })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const isImage = ATTACHMENT_IMAGE_EXTENSIONS.has(ext)

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve({ ok: false, error: 'Не удалось прочитать файл' })
    reader.onload = () => {
      if (isImage) {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        if (!dataUrl) {
          resolve({ ok: false, error: 'Не удалось прочитать изображение' })
          return
        }
        resolve({ ok: true, isImage: true, dataUrl, mime: file.type || undefined })
        return
      }
      const content = typeof reader.result === 'string' ? reader.result : ''
      resolve({ ok: true, isImage: false, content })
    }
    if (isImage) reader.readAsDataURL(file)
    else reader.readAsText(file)
  })
}
