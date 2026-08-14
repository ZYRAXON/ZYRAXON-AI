const { spawn } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, 'packages/desktop/resources/jarvis-browser/node_modules/@playwright/mcp/cli.js');
const nodeModules = path.join(__dirname, 'packages/desktop/resources/jarvis-browser/node_modules');

const child = spawn(process.execPath, [cliPath, '--cdp-endpoint', 'http://127.0.0.1:9222'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_PATH: nodeModules }
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (d) => { stdout += d.toString(); });
child.stderr.on('data', (d) => { stderr += d.toString(); });

// Send initialize
const init = JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'test',version:'1.0'}}});
child.stdin.write(init + '\n');

// Wait, then send initialized notification + tool call
setTimeout(() => {
  const notif = JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'});
  child.stdin.write(notif + '\n');
  
  setTimeout(() => {
    const toolCall = JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'browser_snapshot',arguments:{}}});
    child.stdin.write(toolCall + '\n');
  }, 500);
}, 500);

setTimeout(() => {
  console.log('STDOUT:', stdout);
  console.log('STDERR:', stderr);
  child.kill();
  process.exit(0);
}, 8000);
