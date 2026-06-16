export interface DangerWarning {
  level: 'warning' | 'danger'
  title: string
  description: string
}

interface DangerPattern {
  pattern: RegExp
  level: 'warning' | 'danger'
  title: string
  description: string
}

const PATTERNS: DangerPattern[] = [
  {
    pattern:
      /\b(удали|удалить|удаляй|снеси|снести|сотри|стереть|очисти|очистить|remove|delete|wipe|erase|drop)\b.{0,60}\b(вс[её]|все|all|каждый|каждую|каждое|everything|any)\b/i,
    level: 'danger',
    title: 'Массовое удаление',
    description: 'Задача похожа на массовое удаление файлов или данных.'
  },
  {
    pattern:
      /\b(удали|удалить|удаляй|снеси|снести|сотри|стереть|очисти|очистить|remove|delete|wipe|erase|drop)\b.{0,80}\b(папк|директори|каталог|проект|folder|director|project)\b/i,
    level: 'danger',
    title: 'Удаление папки или проекта',
    description: 'Задача может привести к удалению папки или всего проекта.'
  },
  {
    pattern:
      /\bgit\s+(reset\s+--hard|clean\s+-[fdxX]*f|push\s+--force|rebase\s+--abort|checkout\s+--)\b/i,
    level: 'danger',
    title: 'Опасная git-операция',
    description:
      'Команда может безвозвратно уничтожить незакоммиченные изменения или переписать историю.'
  },
  {
    pattern: /\brm\s+(-rf?|-fr?|--recursive)\b/i,
    level: 'danger',
    title: 'Рекурсивное удаление (rm -rf)',
    description: 'Команда `rm -rf` безвозвратно удаляет файлы и папки.'
  },
  {
    pattern:
      /\b(форматир|format)\b.{0,60}\b(диск|раздел|drive|disk|partition|volume)\b/i,
    level: 'danger',
    title: 'Форматирование диска',
    description: 'Задача похожа на форматирование диска или раздела.'
  },
  {
    pattern:
      /\b(перезапис|перезаписать|перезаписать|overwrite|rewrite)\b.{0,80}\b(вс[её]|все|all|каждый|каждую|каждое|everything)\b/i,
    level: 'warning',
    title: 'Массовая перезапись файлов',
    description: 'Задача может перезаписать большое количество файлов.'
  },
  {
    pattern:
      /\b(замени|заменить|replace)\b.{0,60}\b(во всех|everywhere|all files?|every file)\b/i,
    level: 'warning',
    title: 'Замена во всех файлах',
    description: 'Задача затрагивает изменения во всех файлах проекта.'
  },
  {
    pattern: /\bdrop\s+(table|database|schema)\b/i,
    level: 'danger',
    title: 'Удаление таблицы или базы данных',
    description: 'SQL-команда `DROP TABLE/DATABASE` безвозвратно удаляет данные.'
  },
  {
    pattern:
      /\b(очисти|очистить|truncate|сбрось|сбросить|reset)\b.{0,60}\b(базу|бд|database|db|таблиц)\b/i,
    level: 'danger',
    title: 'Очистка базы данных',
    description: 'Задача может привести к полной очистке базы данных.'
  },
  {
    pattern:
      /\b(удали|удалить|remove|delete)\b.{0,60}\.env\b/i,
    level: 'warning',
    title: 'Удаление .env файла',
    description: 'Задача может удалить файл конфигурации с секретными ключами.'
  }
]

export function detectDanger(text: string): DangerWarning | null {
  for (const rule of PATTERNS) {
    if (rule.pattern.test(text)) {
      return {
        level: rule.level,
        title: rule.title,
        description: rule.description
      }
    }
  }
  return null
}
