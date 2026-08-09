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

import { Semaphore } from '@isomorphic/semaphore';
import { DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT } from '@isomorphic/time';
import { WSServer } from '@utils/wsServer';
import { wrapInASCIIBox } from '@utils/ascii';
import { SocksProxy } from '@utils/socksProxy';
import { debugLogger } from '@utils/debugLogger';
import { isUnderTest } from '@utils/debug';
import { getJarvisVersion } from '../server/userAgent';
import { JarvisConnection, JarvisInitializeResult } from './jarvisConnection';
import { WebSocketServerTransport } from './serverTransport';
import { createJarvis } from '../server/jarvis';
import { Browser } from '../server/browser';
import { nullProgress, ProgressController } from '../server/progress';

import type { AndroidDevice } from '../server/android/android';
import type { Jarvis } from '../server/jarvis';
import type { LaunchOptions as LaunchOptionsWithoutTimeout } from '../server/types';

type LaunchOptionsWithTimeout = LaunchOptionsWithoutTimeout & { timeout: number };

type ServerOptions = {
  path: string;
  maxConnections: number;
  mode: 'default' | 'launchServer' | 'launchServerShared' | 'extension';
  preLaunchedBrowser?: Browser;
  preLaunchedAndroidDevice?: AndroidDevice;
  preLaunchedSocksProxy?: SocksProxy;
  artifactsDir?: string;
  unsafe?: boolean;
};

export class JarvisServer {
  private _jarvis: Jarvis;
  private _options: ServerOptions;
  private _wsServer: WSServer;

  private _dontReuseBrowsers = new Set<Browser>();

  constructor(options: ServerOptions) {
    this._options = options;
    if (options.preLaunchedBrowser) {
      this._jarvis = options.preLaunchedBrowser.attribution.jarvisBrowser;
      this._dontReuse(options.preLaunchedBrowser);
    }
    if (options.preLaunchedAndroidDevice)
      this._jarvis = options.preLaunchedAndroidDevice._android.attribution.jarvisBrowser;
    this._jarvis ??= createJarvis({ sdkLanguage: 'javascript', isServer: true });

    const browserSemaphore = new Semaphore(this._options.maxConnections);
    const controllerSemaphore = new Semaphore(1);
    const reuseBrowserSemaphore = new Semaphore(1);

    this._wsServer = new WSServer({
      onRequest: (request, response) => {
        if (request.method === 'GET' && request.url === '/json') {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({
            wsEndpointPath: this._options.path,
          }));
          return;
        }
        response.end('Running');
      },

      onUpgrade: (request, socket) => {
        const uaError = userAgentVersionMatchesErrorMessage(request.headers['user-agent'] || '');
        if (uaError)
          return { error: `HTTP/${request.httpVersion} 428 Precondition Required\r\n\r\n${uaError}` };
      },

      isAllowedPathname: pathname => pathname === this._options.path,

      onHeaders: headers => {
        if (process.env.PWTEST_SERVER_WS_HEADERS)
          headers.push(process.env.PWTEST_SERVER_WS_HEADERS!);
      },

      onConnection: (request, url, ws, id) => {
        const browserHeader = request.headers['x-jarvis-browser'];
        const browserName = url.searchParams.get('browser') || (Array.isArray(browserHeader) ? browserHeader[0] : browserHeader) || null;
        const proxyHeader = request.headers['x-jarvis-proxy'];
        const proxyValue = url.searchParams.get('proxy') || (Array.isArray(proxyHeader) ? proxyHeader[0] : proxyHeader);

        const launchOptionsHeader = request.headers['x-jarvis-launch-options'] || '';
        const launchOptionsHeaderValue = Array.isArray(launchOptionsHeader) ? launchOptionsHeader[0] : launchOptionsHeader;
        const launchOptionsParam = url.searchParams.get('launch-options');
        let launchOptions: LaunchOptionsWithTimeout = { timeout: DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT };
        try {
          launchOptions = JSON.parse(launchOptionsParam || launchOptionsHeaderValue);
          if (!launchOptions.timeout)
            launchOptions.timeout = DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT;
        } catch (e) {
        }

        const isExtension = this._options.mode === 'extension';
        launchOptions = filterLaunchOptions(launchOptions, isExtension || !!this._options.unsafe);

        // Always override artifacts dir with the one from server options.
        if (this._options.artifactsDir)
          launchOptions.artifactsDir = this._options.artifactsDir;

        if (isExtension) {
          const connectFilter = url.searchParams.get('connect');
          if (connectFilter) {
            if (connectFilter !== 'first')
              throw new Error(`Unknown connect filter: ${connectFilter}`);
            return new JarvisConnection(
                browserSemaphore,
                new WebSocketServerTransport(ws),
                false,
                this._jarvis,
                () => this._initConnectMode(id, connectFilter, browserName, launchOptions),
                id,
            );
          }

          if (url.searchParams.has('debug-controller')) {
            return new JarvisConnection(
                controllerSemaphore,
                new WebSocketServerTransport(ws),
                true,
                this._jarvis,
                async () => { throw new Error('shouldnt be used'); },
                id,
            );
          }
          return new JarvisConnection(
              reuseBrowserSemaphore,
              new WebSocketServerTransport(ws),
              false,
              this._jarvis,
              () => this._initReuseBrowsersMode(browserName, launchOptions, id),
              id,
          );
        }

        if (this._options.mode === 'launchServer' || this._options.mode === 'launchServerShared') {
          if (this._options.preLaunchedBrowser) {
            return new JarvisConnection(
                browserSemaphore,
                new WebSocketServerTransport(ws),
                false,
                this._jarvis,
                () => this._initPreLaunchedBrowserMode(id),
                id,
            );
          }

          return new JarvisConnection(
              browserSemaphore,
              new WebSocketServerTransport(ws),
              false,
              this._jarvis,
              () => this._initPreLaunchedAndroidMode(id),
              id,
          );
        }

        return new JarvisConnection(
            browserSemaphore,
            new WebSocketServerTransport(ws),
            false,
            this._jarvis,
            () => this._initLaunchBrowserMode(browserName, proxyValue, launchOptions, id),
            id,
        );
      },
    });
  }

  private async _initReuseBrowsersMode(browserName: string | null, launchOptions: LaunchOptionsWithTimeout, id: string): Promise<JarvisInitializeResult> {
    // Note: reuse browser mode does not support socks proxy, because
    // clients come and go, while the browser stays the same.

    debugLogger.log('server', `[${id}] engaged reuse browsers mode for ${browserName}`);

    const requestedOptions = launchOptionsHash(launchOptions);
    let browser = this._jarvis.allBrowsers().find(b => {
      if (b.options.name !== browserName)
        return false;
      if (this._dontReuseBrowsers.has(b))
        return false;
      const existingOptions = launchOptionsHash({ ...b.options.originalLaunchOptions, timeout: DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT });
      return existingOptions === requestedOptions;
    });

    // Close remaining browsers of this type+channel. Keep different browser types for the speed.
    for (const b of this._jarvis.allBrowsers()) {
      if (b === browser)
        continue;
      if (this._dontReuseBrowsers.has(b))
        continue;
      if (b.options.name === browserName && b.options.channel === launchOptions.channel)
        await b.close(nullProgress, { reason: 'Connection terminated' });
    }

    if (!browser) {
      const browserType = this._jarvis[(browserName || 'chromium') as 'chromium'];
      const controller = new ProgressController();
      browser = await controller.run(progress => browserType.launch(progress, {
        ...launchOptions,
        headless: !!process.env.PW_DEBUG_CONTROLLER_HEADLESS,
      }), launchOptions.timeout);
    }

    return {
      preLaunchedBrowser: browser,
      denyLaunch: true,
      dispose: async () => {
        // Don't close the pages so that user could debug them,
        // but close all the empty contexts to clean up.
        // keep around browser so it can be reused by the next connection.
        for (const context of browser.contexts()) {
          if (!context.pages().length)
            await context.close(nullProgress, { reason: 'Connection terminated' });
        }
      }
    };
  }

  private async _initConnectMode(id: string, filter: 'first', browserName: string | null, launchOptions: LaunchOptionsWithTimeout): Promise<JarvisInitializeResult> {
    browserName ??= 'chromium';

    debugLogger.log('server', `[${id}] engaged connect mode`);

    let browser = this._jarvis.allBrowsers().find(b => b.options.name === browserName);
    if (!browser) {
      const browserType = this._jarvis[browserName as 'chromium'];
      const controller = new ProgressController();
      browser = await controller.run(progress => browserType.launch(progress, launchOptions), launchOptions.timeout);
      this._dontReuse(browser);
    }

    return {
      preLaunchedBrowser: browser,
      denyLaunch: true,
      sharedBrowser: true,
    };
  }

  private async _initPreLaunchedBrowserMode(id: string): Promise<JarvisInitializeResult> {
    debugLogger.log('server', `[${id}] engaged pre-launched (browser) mode`);

    const browser = this._options.preLaunchedBrowser!;

    // In pre-launched mode, keep only the pre-launched browser.
    for (const b of this._jarvis.allBrowsers()) {
      if (b !== browser)
        await b.close(nullProgress, { reason: 'Connection terminated' });
    }

    return {
      preLaunchedBrowser: browser,
      socksProxy: this._options.preLaunchedSocksProxy,
      sharedBrowser: this._options.mode === 'launchServerShared',
      denyLaunch: true,
    };
  }

  private async _initPreLaunchedAndroidMode(id: string): Promise<JarvisInitializeResult> {
    debugLogger.log('server', `[${id}] engaged pre-launched (Android) mode`);
    const androidDevice = this._options.preLaunchedAndroidDevice!;
    return {
      preLaunchedAndroidDevice: androidDevice,
      denyLaunch: true,
    };
  }

  private async _initLaunchBrowserMode(browserName: string | null, proxyValue: string | undefined, launchOptions: LaunchOptionsWithTimeout, id: string): Promise<JarvisInitializeResult> {
    debugLogger.log('server', `[${id}] engaged launch mode for "${browserName}"`);
    let socksProxy: SocksProxy | undefined;
    if (proxyValue) {
      socksProxy = new SocksProxy();
      socksProxy.setPattern(proxyValue);
      launchOptions.socksProxyPort = await socksProxy.listen(0);
      debugLogger.log('server', `[${id}] started socks proxy on port ${launchOptions.socksProxyPort}`);
    } else {
      launchOptions.socksProxyPort = undefined;
    }
    const browserType = this._jarvis[browserName as 'chromium'];
    const controller = new ProgressController();
    const browser = await controller.run(progress => browserType.launch(progress, launchOptions), launchOptions.timeout);
    this._dontReuseBrowsers.add(browser);
    return {
      preLaunchedBrowser: browser,
      socksProxy,
      denyLaunch: true,
      dispose: async () => {
        await browser.close(nullProgress, { reason: 'Connection terminated' });
        socksProxy?.close();
      },
    };
  }

  private _dontReuse(browser: Browser) {
    this._dontReuseBrowsers.add(browser);
    browser.on(Browser.Events.Disconnected, () => {
      this._dontReuseBrowsers.delete(browser);
    });
  }

  async listen(port: number = 0, hostname?: string): Promise<string> {
    return this._wsServer.listen(port, hostname, this._options.path);
  }

  async close() {
    await this._wsServer.close();
    // Close all browsers that were launched by this server (e.g. in reuse mode)
    // to avoid leaking browser processes that may hold connections to test servers.
    for (const browser of this._jarvis.allBrowsers())
      await browser.close(nullProgress, { reason: 'Server closed' });
  }
}

function userAgentVersionMatchesErrorMessage(userAgent: string) {
  const match = userAgent.match(/^Jarvis\/(\d+\.\d+\.\d+)/);
  if (!match) {
    // Cannot parse user agent - be lax.
    return;
  }
  const received = match[1].split('.').slice(0, 2).join('.');
  const expected = getJarvisVersion(true);
  if (received !== expected) {
    return wrapInASCIIBox([
      `Jarvis version mismatch:`,
      `  - server version: v${expected}`,
      `  - client version: v${received}`,
      ``,
      `If you are using VSCode extension, restart VSCode.`,
      ``,
      `If you are connecting to a remote service,`,
      `keep your local Jarvis version in sync`,
      `with the remote service version.`,
      ``,
      `<3 Jarvis Team`
    ].join('\n'), 1);
  }
}

function launchOptionsHash(options: LaunchOptionsWithTimeout) {
  const copy = { ...options };
  for (const k of Object.keys(copy)) {
    const key = k as keyof LaunchOptionsWithTimeout;
    if (copy[key] === defaultLaunchOptions[key])
      delete copy[key];
  }
  for (const key of optionsThatAllowBrowserReuse)
    delete copy[key];
  return JSON.stringify(copy);
}

function filterLaunchOptions(options: LaunchOptionsWithTimeout, allowUnsafe: boolean): LaunchOptionsWithTimeout {
  return {
    channel: options.channel,
    args: allowUnsafe ? options.args : undefined,
    ignoreAllDefaultArgs: allowUnsafe ? options.ignoreAllDefaultArgs : undefined,
    ignoreDefaultArgs: allowUnsafe ? options.ignoreDefaultArgs : undefined,
    timeout: options.timeout,
    headless: options.headless,
    proxy: options.proxy,
    chromiumSandbox: allowUnsafe ? options.chromiumSandbox : undefined,
    firefoxUserPrefs: (isUnderTest() || allowUnsafe) ? options.firefoxUserPrefs : undefined,
    slowMo: options.slowMo,
    executablePath: (isUnderTest() || allowUnsafe) ? options.executablePath : undefined,
    downloadsPath: allowUnsafe ? options.downloadsPath : undefined,
    artifactsDir: (isUnderTest() || allowUnsafe) ? options.artifactsDir : undefined,
  };
}

const defaultLaunchOptions: Partial<LaunchOptionsWithTimeout> = {
  ignoreAllDefaultArgs: false,
  handleSIGINT: false,
  handleSIGTERM: false,
  handleSIGHUP: false,
  headless: true,
};

const optionsThatAllowBrowserReuse: (keyof LaunchOptionsWithTimeout)[] = [
  'headless',
  'timeout',
  'tracesDir',
  'artifactsDir',
];
