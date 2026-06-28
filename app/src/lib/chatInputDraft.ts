const DRAFT_KEY_PREFIX = 'cv-chat-input-draft:'

export const CHAT_INPUT_DRAFT_DEBOUNCE_MS = 500

function draftKey(chatId: string): string {
  return `${DRAFT_KEY_PREFIX}${chatId}`
}

export function loadChatInputDraft(chatId: string): string {
  try {
    return localStorage.getItem(draftKey(chatId)) ?? ''
  } catch {
    return ''
  }
}

export function saveChatInputDraft(chatId: string, text: string): void {
  try {
    const key = draftKey(chatId)
    if (!text) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, text)
    }
  } catch {
    // quota / private mode
  }
}

export function clearChatInputDraft(chatId: string): void {
  saveChatInputDraft(chatId, '')
}
