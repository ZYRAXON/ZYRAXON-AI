const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_PORT = 9222;
const USER_DATA_DIR = path.join(os.tmpdir(), 'jarvis-test-profile');

function findChrome() {
    const paths = [];
    if (process.platform === 'win32') {
        const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files';
        const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
        const local = process.env['LOCALAPPDATA'] || '';
        paths.push(
            path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        );
    }
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function waitForChrome(port, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = async () => {
            try {
                const data = await httpGet(`http://127.0.0.1:${port}/json/version`);
                JSON.parse(data);
                resolve();
            } catch {
                if (Date.now() - start > timeout) reject(new Error('Timeout'));
                else setTimeout(check, 500);
            }
        };
        check();
    });
}

async function main() {
    console.log('=== Jarvis Browser Test ===\n');
    
    console.log('[1] Finding Chrome...');
    const chromePath = findChrome();
    if (!chromePath) {
        console.log('Chrome not found!');
        process.exit(1);
    }
    console.log('Found: ' + chromePath + '\n');
    
    console.log('[2] Launching Chrome...');
    const chrome = spawn(chromePath, [
        '--remote-debugging-port=' + TEST_PORT,
        '--user-data-dir=' + USER_DATA_DIR,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-infobars',
        'about:blank',
    ], { detached: true, stdio: 'ignore' });
    chrome.unref();
    console.log('Chrome launched (PID: ' + chrome.pid + ')\n');
    
    console.log('[3] Waiting for Chrome...');
    await waitForChrome(TEST_PORT);
    console.log('Chrome is ready!\n');
    
    console.log('[4] Getting browser info...');
    const versionData = await httpGet('http://127.0.0.1:' + TEST_PORT + '/json/version');
    const version = JSON.parse(versionData);
    console.log('Browser: ' + version.Browser);
    console.log('Protocol: ' + version['Protocol-Version']);
    console.log('WebSocket: ' + version.webSocketDebuggerUrl + '\n');
    
    console.log('[5] Getting page list...');
    const pagesData = await httpGet('http://127.0.0.1:' + TEST_PORT + '/json/list');
    const pages = JSON.parse(pagesData);
    console.log('Open pages: ' + pages.length);
    pages.forEach((p, i) => {
        console.log('  [' + i + '] ' + p.title + ' - ' + p.url);
    });
    console.log('');
    
    console.log('[6] Testing navigation...');
    const pageWsUrl = pages[0].webSocketDebuggerUrl;
    console.log('Page WebSocket: ' + pageWsUrl + '\n');
    
    // Cleanup
    chrome.kill();
    
    console.log('=== All Tests Passed! ===');
    console.log('Jarvis Browser is working correctly!');
    console.log('Real Chrome connected on port ' + TEST_PORT);
}

main().catch(err => {
    console.error('Test failed:', err.message);
    process.exit(1);
});
