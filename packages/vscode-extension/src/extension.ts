import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, exec } from 'child_process';

let outputChannel: vscode.OutputChannel;
let zyraxonProcess: any;
let chatViewProvider: ZyraxonChatViewProvider;
let marketplaceViewProvider: ZyraxonMarketplaceViewProvider;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('ZYRAXON AI');
    outputChannel.appendLine('ZYRAXON AI activating...');

    // Register Chat View Provider
    chatViewProvider = new ZyraxonChatViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('zyraxon.chatView', chatViewProvider)
    );

    // Register Marketplace View Provider
    marketplaceViewProvider = new ZyraxonMarketplaceViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('zyraxon.marketplaceView', marketplaceViewProvider)
    );

    // Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('zyraxon.chat', () => {
            chatViewProvider.show();
            vscode.commands.executeCommand('zyraxon.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zyraxon.ask', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('Select code first');
                return;
            }
            const question = await vscode.window.showInputBox({
                prompt: 'Ask ZYRAXON about this code',
                placeHolder: 'What do you want to know?'
            });
            if (question) {
                chatViewProvider.sendMessage(`About this code:\n\`\`\`\n${selection}\n\`\`\`\n\n${question}`);
                vscode.commands.executeCommand('zyraxon.chatView.focus');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zyraxon.explain', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('Select code first');
                return;
            }
            chatViewProvider.sendMessage(`Explain this code:\n\`\`\`\n${selection}\n\`\`\``);
            vscode.commands.executeCommand('zyraxon.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zyraxon.fix', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('Select code first');
                return;
            }
            chatViewProvider.sendMessage(`Fix bugs in this code:\n\`\`\`\n${selection}\n\`\`\``);
            vscode.commands.executeCommand('zyraxon.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zyraxon.refactor', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('Select code first');
                return;
            }
            chatViewProvider.sendMessage(`Refactor this code for better performance and readability:\n\`\`\`\n${selection}\n\`\`\``);
            vscode.commands.executeCommand('zyraxon.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zyraxon.test', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const selection = editor.document.getText(editor.selection);
            const fileName = editor.document.fileName;
            if (!selection) {
                vscode.window.showWarningMessage('Select code first');
                return;
            }
            chatViewProvider.sendMessage(`Generate comprehensive tests for this code from ${fileName}:\n\`\`\`\n${selection}\n\`\`\``);
            vscode.commands.executeCommand('zyraxon.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zyraxon.doc', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('Select code first');
                return;
            }
            chatViewProvider.sendMessage(`Generate documentation for this code:\n\`\`\`\n${selection}\n\`\`\``);
            vscode.commands.executeCommand('zyraxon.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zyraxon.terminal', () => {
            const terminal = vscode.window.createTerminal('ZYRAXON AI');
            terminal.show();
            terminal.sendText('zyraxon');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zyraxon.marketplace', () => {
            marketplaceViewProvider.show();
            vscode.commands.executeCommand('zyraxon.marketplaceView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zyraxon.settings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'zyraxon');
        })
    );

    // Auto-start ZYRAXON server if available
    startZyraxonServer(context);

    outputChannel.appendLine('ZYRAXON AI activated successfully!');
}

function startZyraxonServer(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('zyraxon');
    const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');

    // Try to find ZYRAXON binary
    const possiblePaths = [
        path.join(context.extensionPath, 'bin', 'zyraxon'),
        path.join(context.extensionPath, 'bin', 'zyraxon.exe'),
        'zyraxon',
    ];

    for (const binPath of possiblePaths) {
        try {
            zyraxonProcess = spawn(binPath, ['serve', '--port', '3000'], {
                stdio: 'pipe',
                detached: false,
            });

            zyraxonProcess.stdout?.on('data', (data: Buffer) => {
                outputChannel.appendLine(`[Server] ${data.toString()}`);
            });

            zyraxonProcess.stderr?.on('data', (data: Buffer) => {
                outputChannel.appendLine(`[Server Error] ${data.toString()}`);
            });

            zyraxonProcess.on('error', () => {
                outputChannel.appendLine('ZYRAXON server not found locally. Using remote server.');
            });

            outputChannel.appendLine(`ZYRAXON server started on ${serverUrl}`);
            break;
        } catch {
            continue;
        }
    }
}

export function deactivate() {
    if (zyraxonProcess) {
        zyraxonProcess.kill();
    }
    outputChannel?.dispose();
}

class ZyraxonChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'zyraxon.chatView';
    private _view?: vscode.WebviewView;
    private _messages: Array<{role: string, content: string}> = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'sendMessage') {
                this._messages.push({ role: 'user', content: message.text });
                await this._processMessage(message.text);
            }
        });
    }

    public show() {
        if (this._view) {
            this._view.show(true);
        }
    }

    public sendMessage(text: string) {
        this._messages.push({ role: 'user', content: text });
        if (this._view) {
            this._view.webview.postMessage({ type: 'addMessage', role: 'user', content: text });
        }
        this._processMessage(text);
    }

    private async _processMessage(text: string) {
        try {
            const config = vscode.workspace.getConfiguration('zyraxon');
            const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');

            // Add context from active editor
            const editor = vscode.window.activeTextEditor;
            let context = '';
            if (editor) {
                const doc = editor.document;
                context = `\nFile: ${doc.fileName}\nLanguage: ${doc.languageId}\n`;
            }

            const response = await fetch(`${serverUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: this._messages,
                    context: context
                })
            });

            if (response.ok) {
                const data = await response.json() as any;
                const reply = data.content || data.message || 'No response';
                this._messages.push({ role: 'assistant', content: reply });
                this._view?.webview.postMessage({ type: 'addMessage', role: 'assistant', content: reply });
            } else {
                // Fallback: use local analysis
                const reply = await this._localAnalyze(text);
                this._messages.push({ role: 'assistant', content: reply });
                this._view?.webview.postMessage({ type: 'addMessage', role: 'assistant', content: reply });
            }
        } catch (error) {
            const reply = await this._localAnalyze(text);
            this._messages.push({ role: 'assistant', content: reply });
            this._view?.webview.postMessage({ type: 'addMessage', role: 'assistant', content: reply });
        }
    }

    private async _localAnalyze(text: string): Promise<string> {
        // Local code analysis when server is not available
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return `ZYRAXON AI: I received your message. To use full AI capabilities, please ensure ZYRAXON server is running.\n\nYour message: ${text}`;
        }

        const doc = editor.document;
        const selection = editor.document.getText(editor.selection);
        const fullText = editor.document.getText();

        // Basic analysis
        let analysis = `## ZYRAXON AI Analysis\n\n`;
        analysis += `**File:** ${doc.fileName}\n`;
        analysis += `**Language:** ${doc.languageId}\n`;
        analysis += `**Lines:** ${doc.lineCount}\n\n`;

        if (selection) {
            analysis += `### Selected Code\n\`\`\`${doc.languageId}\n${selection}\n\`\`\`\n\n`;
        }

        analysis += `### Quick Stats\n`;
        analysis += `- Characters: ${fullText.length}\n`;
        analysis += `- Words: ${fullText.split(/\s+/).length}\n`;
        analysis += `- Functions: ${(fullText.match(/function\s+\w+/g) || []).length}\n`;
        analysis += `- Classes: ${(fullText.match(/class\s+\w+/g) || []).length}\n`;
        analysis += `- Imports: ${(fullText.match(/import\s+/g) || []).length}\n\n`;

        analysis += `*For full AI analysis, start the ZYRAXON server: \`zyraxon serve\`*`;

        return analysis;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZYRAXON AI Chat</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; }
        .header { padding: 12px 16px; background: linear-gradient(135deg, #0f3460, #533483); border-bottom: 1px solid #333; }
        .header h1 { font-size: 16px; color: #fff; }
        .header p { font-size: 11px; color: #aaa; margin-top: 2px; }
        .messages { flex: 1; overflow-y: auto; padding: 16px; }
        .message { margin-bottom: 12px; padding: 10px 14px; border-radius: 8px; max-width: 90%; }
        .message.user { background: #0f3460; margin-left: auto; border-bottom-right-radius: 2px; }
        .message.assistant { background: #16213e; border: 1px solid #333; border-bottom-left-radius: 2px; }
        .message .role { font-size: 10px; color: #888; margin-bottom: 4px; text-transform: uppercase; }
        .message .content { font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
        .input-area { padding: 12px 16px; background: #16213e; border-top: 1px solid #333; display: flex; gap: 8px; }
        .input-area textarea { flex: 1; background: #1a1a2e; border: 1px solid #444; border-radius: 6px; padding: 8px 12px; color: #fff; font-size: 13px; resize: none; min-height: 40px; max-height: 120px; font-family: inherit; }
        .input-area textarea:focus { outline: none; border-color: #533483; }
        .input-area button { background: linear-gradient(135deg, #0f3460, #533483); border: none; border-radius: 6px; padding: 8px 16px; color: #fff; cursor: pointer; font-size: 13px; font-weight: 600; }
        .input-area button:hover { opacity: 0.9; }
        .welcome { text-align: center; padding: 40px 20px; color: #666; }
        .welcome h2 { color: #533483; margin-bottom: 8px; }
        code { background: #0d1117; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ZYRAXON AI</h1>
        <p>136+ tools • AI Chat • Code Analysis</p>
    </div>
    <div class="messages" id="messages">
        <div class="welcome">
            <h2>Welcome to ZYRAXON AI</h2>
            <p>Select code and right-click for options, or type below.</p>
            <p style="margin-top:12px"><code>Ctrl+Shift+Z</code> to open chat</p>
        </div>
    </div>
    <div class="input-area">
        <textarea id="input" placeholder="Ask ZYRAXON anything..." rows="1"></textarea>
        <button onclick="send()">Send</button>
    </div>
    <script>
        const messages = document.getElementById('messages');
        const input = document.getElementById('input');
        let hasWelcomed = false;

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });

        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });

        function send() {
            const text = input.value.trim();
            if (!text) return;
            if (!hasWelcomed) {
                messages.innerHTML = '';
                hasWelcomed = true;
            }
            addMessage('user', text);
            input.value = '';
            input.style.height = 'auto';
            addMessage('assistant', 'Thinking...');
            window.parent.postMessage({ type: 'sendMessage', text }, '*');
        }

        function addMessage(role, content) {
            const div = document.createElement('div');
            div.className = 'message ' + role;
            div.innerHTML = '<div class="role">' + role + '</div><div class="content">' + content.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
            messages.appendChild(div);
            messages.scrollTop = messages.scrollHeight;
        }

        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg.type === 'addMessage') {
                const lastMsg = messages.querySelector('.message.assistant:last-child');
                if (lastMsg && lastMsg.querySelector('.content').textContent === 'Thinking...') {
                    lastMsg.querySelector('.content').innerHTML = msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                } else {
                    addMessage(msg.role, msg.content);
                }
            }
        });
    </script>
</body>
</html>`;
    }
}

class ZyraxonMarketplaceViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'zyraxon.marketplaceView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }

    public show() {
        this._view?.show(true);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZYRAXON Marketplace</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 16px; }
        h1 { font-size: 16px; color: #533483; margin-bottom: 12px; }
        .item { background: #16213e; border: 1px solid #333; border-radius: 8px; padding: 12px; margin-bottom: 8px; cursor: pointer; }
        .item:hover { border-color: #533483; }
        .item h3 { font-size: 13px; color: #fff; margin-bottom: 4px; }
        .item p { font-size: 11px; color: #888; }
        .item .tags { margin-top: 6px; }
        .item .tag { display: inline-block; background: #0f3460; padding: 2px 8px; border-radius: 4px; font-size: 10px; color: #aaa; margin-right: 4px; }
        .loading { text-align: center; color: #666; padding: 40px; }
    </style>
</head>
<body>
    <h1>ZYRAXON Marketplace</h1>
    <div id="items"><div class="loading">Loading marketplace...</div></div>
    <script>
        async function loadItems() {
            try {
                const resp = await fetch('https://raw.githubusercontent.com/onelpawarai/ZYRAXON-DATA/main/marketplace/published/index.json');
                const items = await resp.json();
                const container = document.getElementById('items');
                container.innerHTML = '';
                (items.items || []).forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'item';
                    div.innerHTML = '<h3>' + item.name + '</h3><p>' + (item.description || '') + '</p><div class="tags">' + (item.tags || []).map(t => '<span class="tag">' + t + '</span>').join('') + '</div>';
                    div.onclick = () => { window.open('https://zyraxonai.lovable.app/ecosystem'); };
                    container.appendChild(div);
                });
            } catch (e) {
                document.getElementById('items').innerHTML = '<div class="loading">Could not load marketplace</div>';
            }
        }
        loadItems();
    </script>
</body>
</html>`;
    }
}
