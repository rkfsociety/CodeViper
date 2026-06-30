import { createRequire } from 'module'
import { extname, resolve } from 'path'
import * as Ts from 'typescript'

const nodeRequire = createRequire(import.meta.url)
let typescriptModule: typeof import('typescript') | undefined

function getTs(): typeof import('typescript') {
  if (!typescriptModule) {
    typescriptModule = nodeRequire('typescript') as typeof import('typescript')
  }
  return typescriptModule
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const MAX_TYPE_MISMATCH_ISSUES = 80

export type TypeMismatchSeverity = 'high' | 'medium' | 'low'

export interface TypeMismatchIssue {
  path: string
  line: number
  column: number
  severity: TypeMismatchSeverity
  kind: string
  message: string
}

export interface TypeMismatchSearchResult {
  issues: TypeMismatchIssue[]
  truncated: boolean
  filesScanned: number
}

function isAnalyzableFile(filePath: string): boolean {
  return TS_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function positionOf(sourceFile: Ts.SourceFile, node: Ts.Node): { line: number; column: number } {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile, false))
  return { line: pos.line + 1, column: pos.character + 1 }
}

function buildTypeMismatchProgram(projectRoot: string): Ts.Program | undefined {
  const ts = getTs()
  const tsconfigPath = ts.findConfigFile(projectRoot, Ts.sys.fileExists, 'tsconfig.json')
  if (!tsconfigPath) return undefined
  const parsed = ts.getParsedCommandLineOfConfigFile(tsconfigPath, undefined, {
    ...Ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => undefined
  })
  if (!parsed?.fileNames.length) return undefined
  return ts.createProgram({
    rootNames: parsed.fileNames.filter(isAnalyzableFile),
    options: parsed.options,
    projectReferences: parsed.projectReferences
  })
}

function formatDiagMessage(
  ts: typeof import('typescript'),
  diag: Ts.Diagnostic,
  sourceFile?: Ts.SourceFile
) {
  const text = ts.flattenDiagnosticMessageText(diag.messageText, ' ')
  if (!sourceFile || diag.start == null) return text
  const pos = sourceFile.getLineAndCharacterOfPosition(diag.start)
  return `${text} (${pos.line + 1}:${pos.character + 1})`
}

function findReturnOwner(node: Ts.Node): Ts.SignatureDeclaration | undefined {
  let current: Ts.Node | undefined = node.parent
  while (current) {
    if (
      Ts.isFunctionDeclaration(current) ||
      Ts.isMethodDeclaration(current) ||
      Ts.isFunctionExpression(current) ||
      Ts.isArrowFunction(current) ||
      Ts.isConstructorDeclaration(current)
    ) {
      return current
    }
    current = current.parent
  }
  return undefined
}

function severityFromDiagCode(code: number): TypeMismatchSeverity {
  if (code === 2322 || code === 2345 || code === 2416 || code === 2430 || code === 2739)
    return 'high'
  if (code === 2326 || code === 2352 || code === 2367) return 'medium'
  return 'low'
}

function kindFromDiag(code: number): string {
  switch (code) {
    case 2322:
      return 'assignment'
    case 2345:
      return 'call_argument'
    case 2416:
      return 'method_override'
    case 2326:
      return 'property'
    case 2352:
      return 'cast'
    case 2367:
      return 'comparison'
    default:
      return `ts${code}`
  }
}

export async function findTypeMismatches(
  projectRoot: string,
  options?: { subpath?: string }
): Promise<TypeMismatchSearchResult> {
  const ts = getTs()
  const program = buildTypeMismatchProgram(projectRoot)
  if (!program) {
    return { issues: [], truncated: false, filesScanned: 0 }
  }

  const checker = program.getTypeChecker()
  const issues: TypeMismatchIssue[] = []
  const seen = new Set<string>()
  const allowedPrefix = options?.subpath ? resolve(projectRoot, options.subpath) : null
  let filesScanned = 0

  const report = (
    sourceFile: Ts.SourceFile,
    node: Ts.Node,
    severity: TypeMismatchSeverity,
    kind: string,
    message: string
  ) => {
    const pos = positionOf(sourceFile, node)
    const key = `${sourceFile.fileName}:${pos.line}:${pos.column}:${kind}:${message}`
    if (seen.has(key)) return
    seen.add(key)
    issues.push({
      path: sourceFile.fileName,
      line: pos.line,
      column: pos.column,
      severity,
      kind,
      message
    })
  }

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || !isAnalyzableFile(sourceFile.fileName)) continue
    if (allowedPrefix && !resolve(sourceFile.fileName).startsWith(allowedPrefix)) continue
    filesScanned += 1

    const visit = (node: Ts.Node): void => {
      if (issues.length >= MAX_TYPE_MISMATCH_ISSUES) return

      if (ts.isVariableDeclaration(node) && node.type && node.initializer) {
        const target = checker.getTypeFromTypeNode(node.type)
        const actual = checker.getTypeAtLocation(node.initializer)
        if (!checker.isTypeAssignableTo(actual, target)) {
          report(
            sourceFile,
            node,
            'high',
            'variable_assignment',
            `Инициализатор несовместим с аннотацией типа: ${checker.typeToString(actual)} → ${checker.typeToString(target)}`
          )
        }
      }

      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const leftType = checker.getTypeAtLocation(node.left)
        const rightType = checker.getTypeAtLocation(node.right)
        if (!checker.isTypeAssignableTo(rightType, leftType)) {
          report(
            sourceFile,
            node,
            'high',
            'assignment',
            `Присваивание несовместимо: ${checker.typeToString(rightType)} → ${checker.typeToString(leftType)}`
          )
        }
      }

      if (ts.isReturnStatement(node) && node.expression) {
        const owner = findReturnOwner(node)
        const signature = owner ? checker.getSignatureFromDeclaration(owner) : undefined
        const expected = signature ? checker.getReturnTypeOfSignature(signature) : undefined
        if (expected) {
          const actual = checker.getTypeAtLocation(node.expression)
          if (!checker.isTypeAssignableTo(actual, expected)) {
            report(
              sourceFile,
              node,
              'high',
              'return',
              `Возвращаемое значение несовместимо с return type: ${checker.typeToString(actual)} → ${checker.typeToString(expected)}`
            )
          }
        }
      }

      if (ts.isCallExpression(node)) {
        const sig = checker.getResolvedSignature(node)
        if (sig) {
          const params = sig.getParameters()
          node.arguments.forEach((arg, index) => {
            const param = params[index]
            if (!param) return
            const expected = checker.getTypeOfSymbolAtLocation(param, node)
            const actual = checker.getTypeAtLocation(arg)
            if (!checker.isTypeAssignableTo(actual, expected)) {
              report(
                sourceFile,
                arg,
                'medium',
                'call_argument',
                `Аргумент ${index + 1} несовместим с параметром ${param.getName()}: ${checker.typeToString(actual)} → ${checker.typeToString(expected)}`
              )
            }
          })
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((diag) => [2322, 2345, 2326, 2352, 2367, 2416, 2739].includes(diag.code))
  for (const diag of diagnostics) {
    const sf = diag.file
    if (!sf || (allowedPrefix && !resolve(sf.fileName).startsWith(allowedPrefix))) continue
    const start = diag.start ?? 0
    const node = sf.getChildAt(start) ?? sf
    const message = formatDiagMessage(ts, diag, sf)
    const severity = severityFromDiagCode(diag.code)
    const kind = kindFromDiag(diag.code)
    report(sf, node, severity, kind, message)
  }

  issues.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column)
  return {
    issues: issues.slice(0, MAX_TYPE_MISMATCH_ISSUES),
    truncated: issues.length > MAX_TYPE_MISMATCH_ISSUES,
    filesScanned
  }
}

export function formatTypeMismatchReport(
  projectRoot: string,
  result: TypeMismatchSearchResult
): string {
  if (!result.issues.length) {
    return `Отчёт find_type_mismatches (TS): 0 находок по ${result.filesScanned} файлам.`
  }

  const lines = [
    `Отчёт find_type_mismatches (TS): ${result.issues.length}${result.truncated ? '+' : ''} находок по ${result.filesScanned} файлам.`,
    ''
  ]
  for (const issue of result.issues) {
    const rel = resolve(issue.path).startsWith(resolve(projectRoot))
      ? issue.path.slice(resolve(projectRoot).length + 1)
      : issue.path
    lines.push(
      `- ${rel}:${issue.line}:${issue.column} [${issue.severity}] ${issue.kind} — ${issue.message}`
    )
  }
  if (result.truncated) lines.push('', 'Показаны первые 80 находок.')
  return lines.join('\n')
}
