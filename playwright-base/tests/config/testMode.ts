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

import { oop, client } from '../../packages/jarvis-browser-core/lib/coreBundle';

export type TestModeName = 'default' | 'driver';

const { start } = oop;

interface TestMode {
  setup(): Promise<client.Jarvis>;
  teardown(): Promise<void>;
}

export class DriverTestMode implements TestMode {
  private _impl: { jarvis: client.Jarvis; stop: () => Promise<void>; };

  async setup() {
    this._impl = await start({
      NODE_OPTIONS: undefined,  // Hide driver process while debugging.
    });
    return this._impl.jarvis;
  }

  async teardown() {
    await this._impl.stop();
  }
}

export class DefaultTestMode implements TestMode {
  async setup() {
    return require('jarvis-browser-core');
  }

  async teardown() {
  }
}
