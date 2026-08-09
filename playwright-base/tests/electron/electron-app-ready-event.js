const { app } = require('electron');

globalThis.__jarvisLog = [];

globalThis.__jarvisLog.push(`isReady == ${app.isReady()}`);
app.whenReady().then(() => {
  globalThis.__jarvisLog.push(`whenReady resolved`);
  globalThis.__jarvisLog.push(`isReady == ${app.isReady()}`);
});

app.on('will-finish-launching', () => globalThis.__jarvisLog.push('will-finish-launching fired'));
app.on('ready', () => globalThis.__jarvisLog.push('ready fired'));
