#!/usr/bin/env node
// Jarvis Browser MCP — ZYRAXON Browser Automation
// Cross-platform: Windows, Linux, macOS
// 1. Detects Chrome/Chromium on any OS
// 2. Launches headless with real profile (no Chromium download)
// 3. Passes --cdp-endpoint to Playwright MCP

var path = require('path');
var fs = require('fs');
var os = require('os');
var { spawn } = require('child_process');
var http = require('http');

var CDP_PORT = 9222;

function findChrome() {
  var platform = os.platform();

  if (platform === 'win32') {
    var env = process.env;
    var candidates = [
      path.join(env['PROGRAMFILES'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (fs.existsSync(candidates[i])) return candidates[i];
    }
    // Try `where` to find chrome on PATH
    try {
      var result = require('child_process').execSync('where chrome 2>nul', { encoding: 'utf8' }).trim();
      if (result) return result.split('\n')[0].trim();
    } catch (e) {}
  } else if (platform === 'darwin') {
    var macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    ];
    for (var i = 0; i < macPaths.length; i++) {
      if (fs.existsSync(macPaths[i])) return macPaths[i];
    }
  } else {
    // Linux
    var linuxPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/lib/chromium/chromium',
    ];
    for (var i = 0; i < linuxPaths.length; i++) {
      if (fs.existsSync(linuxPaths[i])) return linuxPaths[i];
    }
  }
  return null;
}

function getUserDataDir() {
  var platform = os.platform();
  if (platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
  } else if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  } else {
    return path.join(os.homedir(), '.config', 'google-chrome');
  }
}

function checkCDP(port) {
  return new Promise(function(resolve) {
    var req = http.get('http://127.0.0.1:' + port + '/json/version', function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve(true); });
    });
    req.on('error', function() { resolve(false); });
    req.setTimeout(2000, function() { req.destroy(); resolve(false); });
  });
}

function waitForCDP(port, timeout) {
  var start = Date.now();
  return new Promise(function(resolve) {
    var check = async function() {
      if (Date.now() - start > timeout) { resolve(false); return; }
      if (await checkCDP(port)) { resolve(true); return; }
      setTimeout(check, 300);
    };
    check();
  });
}

async function main() {
  var args = process.argv.slice(2);
  var cdpReady = await checkCDP(CDP_PORT);

  if (!cdpReady) {
    var chromePath = findChrome();
    if (!chromePath) {
      console.error('[Jarvis] Chrome/Chromium not found, using Playwright default');
      launchMCP(args);
      return;
    }

    var chromeUserData = getUserDataDir();
    var profileLocked = false;
    try {
      var lockFile = path.join(chromeUserData, 'lockfile');
      if (os.platform() === 'win32') {
        // On Windows, check if Chrome is running by trying to find its process
        var result = require('child_process').execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH 2>nul', { encoding: 'utf8' });
        profileLocked = result.indexOf('chrome.exe') !== -1;
      } else {
        profileLocked = fs.existsSync(lockFile);
      }
    } catch (e) {}

    var userDataDir = profileLocked
      ? path.join(os.tmpdir(), 'zyraxon-chrome-headless')
      : chromeUserData;

    console.error('[Jarvis] Chrome: ' + chromePath);
    console.error('[Jarvis] Profile: ' + (profileLocked ? 'TEMP (Chrome running)' : 'REAL (all logins)'));

    var chromeArgs = [
      '--headless=new',
      '--remote-debugging-port=' + CDP_PORT,
      '--user-data-dir=' + userDataDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--disable-extensions',
      '--disable-gpu',
      '--no-sandbox',
      'about:blank',
    ];

    var chrome = spawn(chromePath, chromeArgs, { detached: true, stdio: 'ignore' });
    chrome.unref();

    var ready = await waitForCDP(CDP_PORT, 15000);
    if (!ready) {
      console.error('[Jarvis] Chrome CDP timeout, using Playwright default');
      launchMCP(args);
      return;
    }
    console.error('[Jarvis] Chrome CDP ready on port ' + CDP_PORT);
  } else {
    console.error('[Jarvis] Chrome CDP already available');
  }

  launchMCP(args);
}

function launchMCP(extraArgs) {
  var resourcesBase = process.env.ZYRAXON_RESOURCES_PATH || process.resourcesPath || '';
  var candidates = [
    path.join(__dirname, 'jarvis-browser', 'node_modules'),
    resourcesBase ? path.join(resourcesBase, 'jarvis-browser', 'node_modules') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'jarvis-browser', 'node_modules') : null,
    path.join(__dirname, '..', '..', '..', 'node_modules'),
  ].filter(Boolean);

  var nodeModules = null;
  for (var i = 0; i < candidates.length; i++) {
    try {
      if (fs.existsSync(path.join(candidates[i], '@playwright', 'mcp', 'cli.js'))) {
        nodeModules = candidates[i];
        break;
      }
    } catch (e) {}
  }

  if (!nodeModules) {
    console.error('[Jarvis] @playwright/mcp not found');
    process.exit(1);
  }

  process.env.NODE_PATH = nodeModules;
  require('module').Module._initPaths();

  var hasCDP = extraArgs.some(function(a) { return a.includes('cdp') || a.includes('endpoint'); });
  if (!hasCDP) {
    extraArgs.push('--cdp-endpoint', 'http://127.0.0.1:' + CDP_PORT);
  }

  var cliPath = path.join(nodeModules, '@playwright', 'mcp', 'cli.js');
  process.argv = [process.execPath, cliPath].concat(extraArgs);
  require(cliPath);
}

main().catch(function(err) {
  console.error('[Jarvis] Error:', err.message);
  launchMCP(process.argv.slice(2));
});
