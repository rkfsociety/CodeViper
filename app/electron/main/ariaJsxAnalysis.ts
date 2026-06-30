import ts from 'typescript'

export type AriaIssue = {
  file: string
  line: number
  column: number
  rule: string
  message: string
}

export const DEFAULT_ARIA_SCAN_FILES = [
  'app/src/components/MessageBody.tsx',
  'app/src/App.tsx'
] as const

const VALID_ARIA_ATTRS = new Set([
  'aria-activedescendant',
  'aria-atomic',
  'aria-autocomplete',
  'aria-braillelabel',
  'aria-brailleroledescription',
  'aria-busy',
  'aria-checked',
  'aria-colcount',
  'aria-colindex',
  'aria-colindextext',
  'aria-colspan',
  'aria-controls',
  'aria-current',
  'aria-describedby',
  'aria-description',
  'aria-details',
  'aria-disabled',
  'aria-dropeffect',
  'aria-errormessage',
  'aria-expanded',
  'aria-flowto',
  'aria-grabbed',
  'aria-haspopup',
  'aria-hidden',
  'aria-invalid',
  'aria-keyshortcuts',
  'aria-label',
  'aria-labelledby',
  'aria-level',
  'aria-live',
  'aria-modal',
  'aria-multiline',
  'aria-multiselectable',
  'aria-orientation',
  'aria-owns',
  'aria-placeholder',
  'aria-posinset',
  'aria-pressed',
  'aria-readonly',
  'aria-relevant',
  'aria-required',
  'aria-roledescription',
  'aria-rowcount',
  'aria-rowindex',
  'aria-rowindextext',
  'aria-rowspan',
  'aria-selected',
  'aria-setsize',
  'aria-sort',
  'aria-valuemax',
  'aria-valuemin',
  'aria-valuenow',
  'aria-valuetext'
])

const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'textarea', 'select'])
const CLICKABLE_TAGS = new Set(['span', 'code', 'div'])

function getJsxName(node: ts.JsxOpeningLikeElement): string | null {
  const tag = node.tagName
  return ts.isIdentifier(tag) ? tag.text : null
}

function getAttribute(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (prop): prop is ts.JsxAttribute =>
      ts.isJsxAttribute(prop) && ts.isIdentifier(prop.name) && prop.name.text === name
  )
}

function hasJsxAttribute(node: ts.JsxOpeningLikeElement, name: string): boolean {
  return getAttribute(node, name) != null
}

function hasJsxSpreadAttribute(node: ts.JsxOpeningLikeElement): boolean {
  return node.attributes.properties.some((prop) => ts.isJsxSpreadAttribute(prop))
}

function hasAccessibleNameAttr(node: ts.JsxOpeningLikeElement): boolean {
  return hasJsxAttribute(node, 'aria-label') || hasJsxAttribute(node, 'aria-labelledby')
}

function getAttrText(attr?: ts.JsxAttribute): string | null {
  if (!attr || !attr.initializer) return null
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text
  if (
    ts.isJsxExpression(attr.initializer) &&
    attr.initializer.expression &&
    ts.isStringLiteral(attr.initializer.expression)
  ) {
    return attr.initializer.expression.text
  }
  return null
}

function hasTextContent(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  if (ts.isJsxSelfClosingElement(node)) return false
  return node.children.some((child) => {
    if (ts.isJsxText(child)) return child.getText().trim().length > 0
    if (ts.isJsxExpression(child) && child.expression) {
      return child.expression.getText().trim().length > 0
    }
    return false
  })
}

function hasMeaningfulTextContent(node: ts.JsxElement): boolean {
  return node.children.some((child) => {
    if (ts.isJsxText(child)) {
      const text = child.getText().trim()
      if (/[\p{L}]{2,}/u.test(text)) return true
    }
    if (ts.isJsxElement(child) && hasMeaningfulTextContent(child)) return true
    return false
  })
}

function pushIssue(
  issues: AriaIssue[],
  sourceFile: ts.SourceFile,
  node: ts.Node,
  rule: string,
  message: string
) {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  issues.push({
    file: sourceFile.fileName,
    line: pos.line + 1,
    column: pos.character + 1,
    rule,
    message
  })
}

export function collectAriaIssuesForSource(filePath: string, sourceText: string): AriaIssue[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const issues: AriaIssue[] = []

  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const tag = getJsxName(opening)
      if (tag) {
        for (const prop of opening.attributes.properties) {
          if (!ts.isJsxAttribute(prop)) continue
          if (!ts.isIdentifier(prop.name)) continue
          const name = prop.name.text
          if (name.startsWith('aria-') && !VALID_ARIA_ATTRS.has(name)) {
            pushIssue(
              issues,
              sourceFile,
              prop.name,
              'aria-invalid-attribute',
              `Неизвестный aria-атрибут "${name}".`
            )
          }
        }

        const role = getAttrText(getAttribute(opening, 'role'))?.toLowerCase() ?? ''
        const ariaLabel = getAttrText(getAttribute(opening, 'aria-label'))?.trim() ?? ''
        const ariaLabelledBy = getAttrText(getAttribute(opening, 'aria-labelledby'))?.trim() ?? ''
        const hasAccName = Boolean(
          ariaLabel || ariaLabelledBy || hasAccessibleNameAttr(opening) || hasTextContent(node)
        )

        if (tag === 'img') {
          const alt = getAttrText(getAttribute(opening, 'alt'))
          if (alt == null) {
            pushIssue(
              issues,
              sourceFile,
              opening.tagName,
              'img-missing-alt',
              'У <img> отсутствует alt.'
            )
          }
        }

        if (INTERACTIVE_TAGS.has(tag) || role === 'button' || role === 'link') {
          if (!hasAccName) {
            pushIssue(
              issues,
              sourceFile,
              opening.tagName,
              'interactive-missing-name',
              `Интерактивный элемент <${tag}> без доступного имени.`
            )
          }
        }

        if (
          tag === 'button' &&
          !hasAccessibleNameAttr(opening) &&
          ts.isJsxElement(node) &&
          hasTextContent(node) &&
          !hasMeaningfulTextContent(node)
        ) {
          pushIssue(
            issues,
            sourceFile,
            opening.tagName,
            'button-weak-name',
            'Кнопка без aria-label с неявным именем (emoji или один символ).'
          )
        }

        if (
          CLICKABLE_TAGS.has(tag) &&
          hasJsxAttribute(opening, 'onClick') &&
          role !== 'button' &&
          role !== 'link' &&
          !hasJsxSpreadAttribute(opening)
        ) {
          const hasKeyboard =
            hasJsxAttribute(opening, 'tabIndex') || hasJsxAttribute(opening, 'onKeyDown')
          if (!hasKeyboard || !ariaLabel) {
            pushIssue(
              issues,
              sourceFile,
              opening.tagName,
              'clickable-without-a11y',
              `Кликабельный <${tag}> onClick без role="button", aria-label или клавиатурной активации.`
            )
          }
        }

        if ((ariaLabel || ariaLabelledBy) && tag === 'div' && !role) {
          pushIssue(
            issues,
            sourceFile,
            opening.tagName,
            'aria-label-without-role',
            'aria-label/aria-labelledby на <div> без role.'
          )
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return issues
}

export function formatAriaIssuesOutput(issues: AriaIssue[]): string {
  if (!issues.length) return 'Нарушений доступности не найдено.'
  const byFile = new Map<string, AriaIssue[]>()
  for (const issue of issues) {
    const list = byFile.get(issue.file) ?? []
    list.push(issue)
    byFile.set(issue.file, list)
  }
  const parts: string[] = [`Найдено ${issues.length} проблем доступности:`]
  let index = 1
  for (const [file, fileIssues] of byFile) {
    parts.push(`\n${file}`)
    for (const issue of fileIssues) {
      parts.push(
        `[${index++}] L${issue.line}:C${issue.column}  ${issue.rule}\n    ${issue.message}`
      )
    }
  }
  return parts.join('\n')
}
