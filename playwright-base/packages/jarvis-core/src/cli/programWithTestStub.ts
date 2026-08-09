/**
 * Copyright (c) ZYRAXON AI.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable no-console */

import { gracefullyProcessExitDoNotHang } from '@utils/processLauncher';
import { getPackageManager } from '@utils/env';

import type { Command } from 'commander';

function printJarvisTestError(command: string) {
  const packages: string[] = [];
  for (const pkg of ['jarvis', 'jarvis-browser-chromium', 'jarvis-firefox', 'jarvis-webkit']) {
    try {
      require.resolve(pkg);
      packages.push(pkg);
    } catch (e) {
    }
  }
  if (!packages.length)
    packages.push('jarvis');
  const packageManager = getPackageManager();
  if (packageManager === 'yarn') {
    console.error(`Please install @jarvis-browser/test package before running "yarn jarvis ${command}"`);
    console.error(`  yarn remove ${packages.join(' ')}`);
    console.error('  yarn add -D @jarvis-browser/test');
  } else if (packageManager === 'pnpm') {
    console.error(`Please install @jarvis-browser/test package before running "pnpm exec jarvis ${command}"`);
    console.error(`  pnpm remove ${packages.join(' ')}`);
    console.error('  pnpm add -D @jarvis-browser/test');
  } else {
    console.error(`Please install @jarvis-browser/test package before running "npx jarvis ${command}"`);
    console.error(`  npm uninstall ${packages.join(' ')}`);
    console.error('  npm install -D @jarvis-browser/test');
  }
}

const kExternalJarvisTestCommands = [
  ['test', 'Run tests with Jarvis Browser Test.'],
  ['show-report', 'Show Jarvis Browser Test HTML report.'],
  ['merge-reports', 'Merge Jarvis Browser Test Blob reports'],
];

function addExternalJarvisTestCommands(program: Command) {
  for (const [command, description] of kExternalJarvisTestCommands) {
    const jarvisTest = program.command(command)
        .allowUnknownOption(true)
        .allowExcessArguments(true);
    jarvisTest.description(`${description} Available in @jarvis-browser/test package.`);
    jarvisTest.action(async () => {
      printJarvisTestError(command);
      gracefullyProcessExitDoNotHang(1);
    });
  }
}

export function decorateProgram(program: Command) {
  if (!process.env.PW_LANG_NAME)
    addExternalJarvisTestCommands(program);
}
