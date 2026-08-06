/**
 * VS Code API Shim for ZYRAXON
 * 
 * This file provides the `vscode` module that extensions import.
 * It bridges VS Code's API with ZYRAXON's implementation.
 * 
 * When an extension does: import * as vscode from 'vscode'
 * They get this module.
 */

// ─── VS Code API Implementation ──────────────────────────────────────────────

const vscode = {
  // ─── Window API ────────────────────────────────────────────────────────
  window: {
    showInformationMessage: async (message: string, ...items: string[]) => {
      console.log(`[ZYRAXON] Info: ${message}`)
      return items[0]
    },
    showWarningMessage: async (message: string, ...items: string[]) => {
      console.log(`[ZYRAXON] Warning: ${message}`)
      return items[0]
    },
    showErrorMessage: async (message: string, ...items: string[]) => {
      console.error(`[ZYRAXON] Error: ${message}`)
      return items[0]
    },
    showInputBox: async (options?: any) => undefined,
    showQuickPick: async (items: any[], options?: any) => undefined,
    createStatusBarItem: (alignment?: number, priority?: number) => ({
      text: "",
      tooltip: "",
      show: () => {},
      hide: () => {},
      dispose: () => {},
    }),
    createOutputChannel: (name: string) => ({
      appendLine: (line: string) => console.log(`[${name}] ${line}`),
      append: (text: string) => process.stdout.write(text),
      show: () => {},
      hide: () => {},
      dispose: () => {},
      clear: () => {},
      name,
    }),
    createTerminal: (options?: any) => ({
      sendText: (text: string) => console.log(`[Terminal] ${text}`),
      show: () => {},
      hide: () => {},
      dispose: () => {},
      name: options?.name || "Terminal",
    }),
    withProgress: async (options: any, task: any) => task({ report: () => {} }),
    registerTreeDataProvider: () => ({ dispose: () => {} }),
    createWebviewPanel: () => ({
      webview: { html: "", postMessage: async () => {}, onDidReceiveMessage: () => ({ dispose: () => {} }) },
      reveal: () => {},
      dispose: () => {},
    }),
    createStatusBar: () => ({
      text: "",
      show: () => {},
      hide: () => {},
      dispose: () => {},
    }),
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    onDidChangeVisibleTextEditors: () => ({ dispose: () => {} }),
    onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
    onDidChangeTextEditorVisibleRanges: () => ({ dispose: () => {} }),
    onDidChangeTextEditorOptions: () => ({ dispose: () => {} }),
    onDidChangeTextEditorLanguage: () => ({ dispose: () => {} }),
    onDidChangeTerminalState: () => ({ dispose: () => {} }),
    onDidChangeWindowState: () => ({ dispose: () => {} }),
    activeTextEditor: undefined,
    visibleTextEditors: [],
    terminals: [],
    state: { focused: true, active: true },
  },

  // ─── Workspace API ─────────────────────────────────────────────────────
  workspace: {
    getConfiguration: (section?: string) => ({
      get: (key: string) => undefined,
      has: (key: string) => false,
      inspect: () => undefined,
      update: async () => {},
    }),
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    workspaceFolders: [],
    name: undefined,
    asRelativePath: (pathOrUri: any, includeWorkspaceFolder?: boolean) =>
      typeof pathOrUri === "string" ? pathOrUri : pathOrUri?.fsPath || "",
    findFiles: async () => [],
    openTextDocument: async () => ({
      getText: () => "",
      lineAt: (line: number) => ({ text: "", range: {}, rangeIncludingLineBreak: {} }),
      lineCount: 0,
      uri: { fsPath: "", scheme: "file" },
      fileName: "",
      isDirty: false,
      isUntitled: false,
      isClosed: false,
      save: async () => true,
      eol: 1,
      version: 1,
    }),
    registerTextDocumentContentProvider: () => ({ dispose: () => {} }),
    onDidSaveTextDocument: () => ({ dispose: () => {} }),
    onDidCreateFiles: () => ({ dispose: () => {} }),
    onDidDeleteFiles: () => ({ dispose: () => {} }),
    onDidRenameFiles: () => ({ dispose: () => {} }),
    applyEdit: async () => true,
    fs: {
      readFile: async () => new Uint8Array(0),
      writeFile: async () => {},
      stat: async () => ({ type: 0, ctime: 0, mtime: 0, size: 0 }),
      readDirectory: async () => [],
      createDirectory: async () => {},
      delete: async () => {},
      rename: async () => {},
      copy: async () => {},
    },
  },

  // ─── Commands API ──────────────────────────────────────────────────────
  commands: {
    registerCommand: (command: string, callback: (...args: any[]) => any) => {
      console.log(`[ZYRAXON] Command registered: ${command}`)
      return { dispose: () => {} }
    },
    registerTextEditorCommand: (command: string, callback: (textEditor: any, edit: any, ...args: any[]) => any) => {
      return { dispose: () => {} }
    },
    executeCommand: async (command: string, ...args: any[]) => {
      console.log(`[ZYRAXON] Command executed: ${command}`)
      return undefined
    },
    getCommands: async () => [],
  },

  // ─── Languages API ─────────────────────────────────────────────────────
  languages: {
    registerCompletionItemProvider: () => ({ dispose: () => {} }),
    registerHoverProvider: () => ({ dispose: () => {} }),
    registerDefinitionProvider: () => ({ dispose: () => {} }),
    registerReferenceProvider: () => ({ dispose: () => {} }),
    registerDocumentFormattingEditProvider: () => ({ dispose: () => {} }),
    registerDocumentRangeFormattingEditProvider: () => ({ dispose: () => {} }),
    registerSignatureHelpProvider: () => ({ dispose: () => {} }),
    registerCodeActionsProvider: () => ({ dispose: () => {} }),
    registerCodeLensProvider: () => ({ dispose: () => {} }),
    registerDocumentLinkProvider: () => ({ dispose: () => {} }),
    registerColorProvider: () => ({ dispose: () => {} }),
    registerDeclarationProvider: () => ({ dispose: () => {} }),
    registerImplementationProvider: () => ({ dispose: () => {} }),
    registerTypeDefinitionProvider: () => ({ dispose: () => {} }),
    registerCallHierarchyProvider: () => ({ dispose: () => {} }),
    registerSelectionRangeProvider: () => ({ dispose: () => {} }),
    registerInlineCompletionItemProvider: () => ({ dispose: () => {} }),
    registerDocumentSemanticTokensProvider: () => ({ dispose: () => {} }),
    registerLinkedEditingRangeProvider: () => ({ dispose: () => {} }),
    registerFoldingRangeProvider: () => ({ dispose: () => {} }),
    registerDocumentSymbolProvider: () => ({ dispose: () => {} }),
    registerWorkspaceSymbolProvider: () => ({ dispose: () => {} }),
    getDiagnostics: () => [],
    onDidChangeDiagnostics: () => ({ dispose: () => {} }),
    createDiagnosticCollection: () => ({ set: () => {}, delete: () => {}, clear: () => {}, dispose: () => {} }),
    registerRenameProvider: () => ({ dispose: () => {} }),
    registerDocumentDropEditProvider: () => ({ dispose: () => {} }),
    languages: [],
  },

  // ─── Extensions API ────────────────────────────────────────────────────
  extensions: {
    getExtension: (extensionId: string) => undefined,
    all: [],
  },

  // ─── Environment API ───────────────────────────────────────────────────
  env: {
    appName: "ZYRAXON",
    appRoot: process.cwd(),
    language: process.env.LANG || "en",
    machineId: "zyraxon-machine",
    sessionId: `zyraxon-${Date.now()}`,
    uriScheme: "zyraxon",
    remoteName: undefined,
    openExternal: async () => true,
    asExternalUri: async (uri: any) => uri,
  },

  // ─── Debug API ─────────────────────────────────────────────────────────
  debug: {
    registerDebugAdapterDescriptorFactory: () => ({ dispose: () => {} }),
    registerDebugAdapterTrackerFactory: () => ({ dispose: () => {} }),
    registerDebugConfigurationProvider: () => ({ dispose: () => {} }),
    startDebugging: async () => true,
    stopDebugging: async () => {},
    activeDebugSession: undefined,
    activeDebugConsole: { appendLine: () => {}, append: () => {}, clear: () => {}, hide: () => {}, show: () => {}, dispose: () => {} },
    breakpoints: [],
    onDidStartDebugSession: () => ({ dispose: () => {} }),
    onDidTerminateDebugSession: () => ({ dispose: () => {} }),
    onDidChangeActiveDebugSession: () => ({ dispose: () => {} }),
    onDidChangeDebugSessionActive: () => ({ dispose: () => {} }),
    onDidReceiveDebugSessionCustomEvent: () => ({ dispose: () => {} }),
    onDidChangeBreakpoints: () => ({ dispose: () => {} }),
    addBreakpoints: () => {},
    removeBreakpoints: () => {},
  },

  // ─── SCM API ───────────────────────────────────────────────────────────
  scm: {
    createSourceControl: () => ({
      createResourceGroup: () => ({ resourceStates: [], dispose: () => {} }),
      dispose: () => {},
    }),
  },

  // ─── Notebook API ──────────────────────────────────────────────────────
  notebook: {
    registerNotebookCellStatusBarItemProvider: () => ({ dispose: () => {} }),
    registerNotebookContentProvider: () => ({ dispose: () => {} }),
    registerNotebookController: () => ({ dispose: () => {} }),
    registerNotebookRenderer: () => ({ dispose: () => {} }),
    registerNotebookSerializer: () => ({ dispose: () => {} }),
  },

  // ─── Tasks API ─────────────────────────────────────────────────────────
  tasks: {
    fetchTasks: async () => [],
    executeTask: async () => undefined,
    registerTaskProvider: () => ({ dispose: () => {} }),
    onDidStartTask: () => ({ dispose: () => {} }),
    onDidEndTask: () => ({ dispose: () => {} }),
    onDidStartTaskProcess: () => ({ dispose: () => {} }),
    onDidEndTaskProcess: () => ({ dispose: () => {} }),
  },

  // ─── Timeline API ──────────────────────────────────────────────────────
  timeline: {
    registerTimelineProvider: () => ({ dispose: () => {} }),
  },

  // ─── Window State ──────────────────────────────────────────────────────
  ThemeColor: class ThemeColor {
    constructor(public id: string) {}
  },
  ThemeIcon: class ThemeIcon {
    constructor(public id: string, public color?: any) {}
  },
  ProgressLocation: {
    Notification: 15,
    Window: 10,
    SourceControl: 1,
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  TextEditorRevealType: {
    Default: 0,
    InCenter: 1,
    InCenterIfOutsideViewport: 2,
    AtTop: 3,
  },
  TextEditorChangeKind: {
    Insert: 1,
    Delete: 2,
    Replace: 3,
  },
  TextDocumentSaveReason: {
    Manual: 1,
    AfterDelay: 2,
    FocusOut: 3,
  },
  OverviewRulerLane: {
    Left: 1,
    Center: 2,
    Right: 3,
    Full: 7,
  },
  EndOfLine: {
    LF: 1,
    CRLF: 2,
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
  DiagnosticTag: {
    Unnecessary: 1,
    Deprecated: 2,
  },
  CompletionItemKind: {
    Text: 1,
    Method: 2,
    Function: 3,
    Constructor: 4,
    Field: 5,
    Variable: 6,
    Class: 7,
    Interface: 8,
    Module: 9,
    Property: 10,
    Unit: 11,
    Value: 12,
    Enum: 13,
    Keyword: 14,
    Snippet: 15,
    Color: 16,
    File: 17,
    Reference: 18,
  },
  CompletionItemTag: {
    Deprecated: 1,
  },
  InsertTextFormat: {
    PlainText: 1,
    Snippet: 2,
  },
  SymbolKind: {
    File: 1,
    Module: 2,
    Namespace: 3,
    Package: 4,
    Class: 5,
    Method: 6,
    Property: 7,
    Field: 8,
    Constructor: 9,
    Enum: 10,
    Interface: 11,
    Function: 12,
    Variable: 13,
    Constant: 14,
    String: 15,
    Number: 16,
    Boolean: 17,
    Array: 18,
    Object: 19,
    Key: 20,
    Null: 21,
    EnumMember: 22,
    Struct: 23,
    Event: 24,
    Operator: 25,
    TypeParameter: 26,
  },
  SymbolTag: {
    Deprecated: 1,
  },
  CodeActionKind: {
    QuickFix: "quickfix",
    Refactor: "refactor",
    RefactorExtract: "refactor.extract",
    RefactorInline: "refactor.inline",
    RefactorRewrite: "refactor.rewrite",
    Source: "source",
    SourceOrganizeImports: "source.organizeImports",
    SourceFixAll: "source.fixAll",
  },
  CompletionTriggerKind: {
    Invoke: 0,
    TriggerCharacter: 1,
    TriggerForIncompleteCompletions: 2,
  },
  SignatureHelpTriggerKind: {
    Invoke: 1,
    TriggerCharacter: 2,
    ContentChange: 3,
  },
  TextEdit: class TextEdit {
    static replace(range: any, newText: string) { return { range, newText, newEol: undefined } }
    static insert(position: any, newText: string) { return { range: { start: position, end: position }, newText, newEol: undefined } }
    static delete(range: any) { return { range, newText: "", newEol: undefined } }
    static setEndOfLine(eol: any) { return { range: undefined, newText: "", newEol: eol } }
    constructor(public range: any, public newText: string, public newEol?: any) {}
  },
  Position: class Position {
    constructor(public line: number, public character: number) {}
    with(line?: number, character?: number) { return new Position(line ?? this.line, character ?? this.character) }
    translate(lineDelta?: number, characterDelta?: number) { return new Position(this.line + (lineDelta || 0), this.character + (characterDelta || 0)) }
    compareTo(other: Position) {
      if (this.line < other.line) return -1
      if (this.line > other.line) return 1
      if (this.character < other.character) return -1
      if (this.character > other.character) return 1
      return 0
    }
  },
  Range: class Range {
    constructor(public start: any, public end: any) {}
    static fromEdges(startLine: number, startChar: number, endLine: number, endChar: number) {
      return new Range(new vscode.Position(startLine, startChar), new vscode.Position(endLine, endChar))
    }
    contains(positionOrRange: any) { return false }
    intersect(other: any) { return undefined }
    union(other: any) { return this }
    with(start?: any, end?: any) { return new Range(start ?? this.start, end ?? this.end) }
    get isEmpty() { return this.start.compareTo(this.end) === 0 }
    get isSingleLine() { return this.start.line === this.end.line }
  },
  Selection: class Selection extends (vscode.Range as any) {
    constructor(anchor: any, active: any) {
      super(anchor, active)
      this.anchor = anchor
      this.active = active
    }
    get isReversed() { return this.active.compareTo(this.anchor) < 0 }
  },
  Location: class Location {
    constructor(public uri: any, public range: any) {}
  },
  Diagnostic: class Diagnostic {
    constructor(public range: any, public message: string, public severity?: any) {}
    source?: string
    code?: any
    relatedInformation?: any[]
    tags?: any[]
    codeActions?: any[]
  },
  MarkdownString: class MarkdownString {
    constructor(public value: string = "", public isTrusted: boolean | { readonly enabledCommands: readonly string[] } = false) {}
    appendCodeblock(value: string, language?: string) { this.value += `\`\`\`${language || ""}\n${value}\n\`\`\``; return this }
    appendMarkdown(value: string) { this.value += value; return this }
    appendText(value: string) { this.value += value; return this }
  },
  SnippetString: class SnippetString {
    constructor(public value: string = "") {}
    appendTabstop(number?: number) { this.value += `$${number || ""}`; return this }
    appendPlaceholder(value: string, number?: number) { this.value += `\${${number || ""}:${value}}`; return this }
    appendChoice(values: string[], number?: number) { this.value += `\${${number || ""}|${values.join(",")}|}`; return this }
    appendVariable(name: string, defaultValue?: string) { this.value += defaultValue ? `\${${name}:${defaultValue}}` : `\${${name}}`; return this }
  },
  WorkspaceEdit: class WorkspaceEdit {
    private edits = new Map()
    get size() { return this.edits.size }
    has(uri: any) { return this.edits.has(uri.toString()) }
    get(uri: any) { return this.edits.get(uri.toString()) }
    set(uri: any, edits: any[]) { this.edits.set(uri.toString(), edits) }
    delete(uri: any) { this.edits.delete(uri.toString()) }
    clear() { this.edits.clear() }
    createFile(uri: any, options?: any) {}
    deleteFile(uri: any, options?: any) {}
    renameFile(oldUri: any, newUri: any, options?: any) {}
    entries() { return Array.from(this.edits.entries()) }
    *[Symbol.iterator]() { yield* this.entries() }
  },
  Uri: class Uri {
    static file(path: string) { return { fsPath: path, scheme: "file", path, authority: "", query: "", fragment: "" } }
    static parse(value: string) { return { fsPath: value, scheme: "file", path: value, authority: "", query: "", fragment: "" } }
    static join(base: any, ...paths: string[]) { return base }
    static from(components: any) { return components }
    static revive(data: any) { return data }
    constructor(public scheme: string, public authority: string, public path: string, public query: string, public fragment: string) {}
    get fsPath() { return this.path }
    with(change: any) { return this }
    toString() { return `${this.scheme}://${this.authority}${this.path}?${this.query}#${this.fragment}` }
  },
  CancellationSource: class CancellationSource {
    private _token: any
    get token() { return this._token }
    cancel() {}
    dispose() {}
  },
  CancellationTokenSource: class CancellationTokenSource {
    private _token: any
    get token() { return this._token || { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } }
    cancel() {}
    dispose() {}
  },
  EventEmitter: class EventEmitter {
    private listeners = []
    get event() { return (listener: any) => { this.listeners.push(listener); return { dispose: () => {} } } }
    fire(event: any) { this.listeners.forEach(l => l(event)) }
    dispose() { this.listeners = [] }
  },
  Disposable: class Disposable {
    static from(...disposables: any[]) { return { dispose: () => disposables.forEach(d => d.dispose()) } }
    constructor(private callOnDispose?: () => void) {}
    dispose() { this.callOnDispose?.() }
  },
}

// Export as default and as named exports
export default vscode
export const window = vscode.window
export const workspace = vscode.workspace
export const commands = vscode.commands
export const languages = vscode.languages
export const extensions = vscode.extensions
export const env = vscode.env
export const debug = vscode.debug
export const scm = vscode.scm
export const notebook = vscode.notebook
export const tasks = vscode.tasks
export const timeline = vscode.timeline

// Export classes
export const ThemeColor = vscode.ThemeColor
export const ThemeIcon = vscode.ThemeIcon
export const Position = vscode.Position
export const Range = vscode.Range
export const Selection = vscode.Selection
export const Location = vscode.Location
export const Diagnostic = vscode.Diagnostic
export const MarkdownString = vscode.MarkdownString
export const SnippetString = vscode.SnippetString
export const WorkspaceEdit = vscode.WorkspaceEdit
export const Uri = vscode.Uri
export const CancellationSource = vscode.CancellationSource
export const CancellationTokenSource = vscode.CancellationTokenSource
export const EventEmitter = vscode.EventEmitter
export const Disposable = vscode.Disposable
export const TextEdit = vscode.TextEdit

// Export enums
export const DiagnosticSeverity = vscode.DiagnosticSeverity
export const DiagnosticTag = vscode.DiagnosticTag
export const CompletionItemKind = vscode.CompletionItemKind
export const CompletionItemTag = vscode.CompletionItemTag
export const InsertTextFormat = vscode.InsertTextFormat
export const SymbolKind = vscode.SymbolKind
export const SymbolTag = vscode.SymbolTag
export const CodeActionKind = vscode.CodeActionKind
export const CompletionTriggerKind = vscode.CompletionTriggerKind
export const SignatureHelpTriggerKind = vscode.SignatureHelpTriggerKind
export const EndOfLine = vscode.EndOfLine
export const TextDocumentSaveReason = vscode.TextDocumentSaveReason
export const TextEditorRevealType = vscode.TextEditorRevealType
