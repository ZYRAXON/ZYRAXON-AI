/**
 * Copyright 2026 ZYRAXON AI. All rights reserved.
 * Modifications copyright (c) ZYRAXON AI.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { isString } from '@isomorphic/stringUtils';
import * as input from '../input';
import { macEditingCommands } from '../macEditingCommands';
import { toButtonsMask, toModifiersMask } from './crProtocolHelper';

import type * as types from '../types';
import type { CRSession } from './crConnection';
import type { DragManager } from './crDragDrop';
import type { CRPage } from './crPage';
import type { Progress } from '../progress';


export class RawKeyboardImpl implements input.RawKeyboard {
  constructor(
    private _client: CRSession,
    private _isMac: boolean,
    private _dragManger: DragManager,
  ) { }

  _commandsForCode(code: string, modifiers: Set<types.KeyboardModifier>) {
    if (!this._isMac)
      return [];
    const parts = [];
    for (const modifier of (['Shift', 'Control', 'Alt', 'Meta']) as types.KeyboardModifier[]) {
      if (modifiers.has(modifier))
        parts.push(modifier);
    }
    parts.push(code);
    const shortcut = parts.join('+');
    let commands = macEditingCommands[shortcut] || [];
    if (isString(commands))
      commands = [commands];
    // Commands that insert text are not supported
    commands = commands.filter(x => !x.startsWith('insert'));
    // remove the trailing : to match the Chromium command names.
    return commands.map(c => c.substring(0, c.length - 1));
  }

  async keydown(progress: Progress, modifiers: Set<types.KeyboardModifier>, keyName: string, description: input.KeyDescription, autoRepeat: boolean): Promise<void> {
    const { code, key, location, text } = description;
    if (code === 'Escape' && await progress.race(this._dragManger.cancelDrag()))
      return;
    const commands = this._commandsForCode(code, modifiers);
    await progress.race(this._client.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      modifiers: toModifiersMask(modifiers),
      windowsVirtualKeyCode: description.keyCodeWithoutLocation,
      code,
      commands,
      key,
      text,
      unmodifiedText: text,
      autoRepeat,
      location,
      isKeypad: location === input.keypadLocation
    }));
  }

  async keyup(progress: Progress, modifiers: Set<types.KeyboardModifier>, keyName: string, description: input.KeyDescription): Promise<void> {
    const { code, key, location } = description;
    await progress.race(this._client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: toModifiersMask(modifiers),
      key,
      windowsVirtualKeyCode: description.keyCodeWithoutLocation,
      code,
      location
    }));
  }

  async sendText(progress: Progress, text: string): Promise<void> {
    await progress.race(this._client.send('Input.insertText', { text }));
  }
}

export class RawMouseImpl implements input.RawMouse {
  private _client: CRSession;
  private _page: CRPage;
  private _dragManager: DragManager;

  constructor(page: CRPage, client: CRSession, dragManager: DragManager) {
    this._page = page;
    this._client = client;
    this._dragManager = dragManager;
  }

  async move(progress: Progress, x: number, y: number, button: types.MouseButton | 'none', buttons: Set<types.MouseButton>, modifiers: Set<types.KeyboardModifier>, forClick: boolean): Promise<void> {
    const actualMove = async (progress: Progress) => {
      await progress.race(this._client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        button,
        buttons: toButtonsMask(buttons),
        x,
        y,
        modifiers: toModifiersMask(modifiers),
        force: buttons.size > 0 ? 0.5 : 0,
      }));
    };
    if (forClick) {
      // Avoid extra protocol calls related to drag and drop, because click relies on
      // move-down-up protocol commands being sent synchronously.
      await actualMove(progress);
      return;
    }
    await this._dragManager.interceptDragCausedByMove(progress, x, y, button, buttons, modifiers, actualMove);
  }

  async down(progress: Progress, x: number, y: number, button: types.MouseButton, buttons: Set<types.MouseButton>, modifiers: Set<types.KeyboardModifier>, clickCount: number): Promise<void> {
    if (this._dragManager.isDragging())
      return;
    await progress.race(this._client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button,
      buttons: toButtonsMask(buttons),
      x,
      y,
      modifiers: toModifiersMask(modifiers),
      clickCount,
      force: buttons.size > 0 ? 0.5 : 0,
    }));
  }

  async up(progress: Progress, x: number, y: number, button: types.MouseButton, buttons: Set<types.MouseButton>, modifiers: Set<types.KeyboardModifier>, clickCount: number): Promise<void> {
    if (this._dragManager.isDragging()) {
      await this._dragManager.drop(progress, x, y, modifiers);
      return;
    }
    await progress.race(this._client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button,
      buttons: toButtonsMask(buttons),
      x,
      y,
      modifiers: toModifiersMask(modifiers),
      clickCount
    }));
  }

  async wheel(progress: Progress, x: number, y: number, buttons: Set<types.MouseButton>, modifiers: Set<types.KeyboardModifier>, deltaX: number, deltaY: number): Promise<void> {
    await progress.race(this._client.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      modifiers: toModifiersMask(modifiers),
      deltaX,
      deltaY,
    }));
  }
}

export class RawTouchscreenImpl implements input.RawTouchscreen {
  private _client: CRSession;

  constructor(client: CRSession) {
    this._client = client;
  }
  async tap(progress: Progress, x: number, y: number, modifiers: Set<types.KeyboardModifier>) {
    await progress.race(Promise.all([
      this._client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        modifiers: toModifiersMask(modifiers),
        touchPoints: [{
          x, y
        }]
      }),
      this._client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        modifiers: toModifiersMask(modifiers),
        touchPoints: []
      }),
    ]));
  }
}

// ============================================================================
// ZYRAXON ULTRA INPUT — 10x Faster Than Any Human
// Jarvis Browser Engine
// ============================================================================

export interface HumanInputOptions {
  typingSpeed: 'normal' | 'fast' | 'turbo' | 'instant';
  errorRate: number;
  clickDelay: [number, number];
  mouseJitter: boolean;
  bezierMovement: boolean;
}

export class UltraHumanInput {
  private _client: CRSession;
  private _options: HumanInputOptions;

  constructor(client: CRSession, options: HumanInputOptions = {
    typingSpeed: 'turbo',
    errorRate: 0.01,
    clickDelay: [5, 15],
    mouseJitter: false,
    bezierMovement: true,
  }) {
    this._client = client;
    this._options = options;
  }

  async ultraType(text: string): Promise<void> {
    const speeds: Record<string, [number, number]> = {
      normal: [20, 40],
      fast: [5, 15],
      turbo: [1, 5],
      instant: [0, 1],
    };

    const [minDelay, maxDelay] = speeds[this._options.typingSpeed];
    const batch = 5;
    let i = 0;

    while (i < text.length) {
      const chunk = text.slice(i, i + batch);
      for (const char of chunk) {
        if (Math.random() < this._options.errorRate && char !== ' ') {
          await this._typeCharacter(this._getAdjacentKey(char));
          await this._delay(2, 5);
          await this._typeCharacter('\b');
        }
        await this._typeCharacter(char);
        const delay = minDelay + Math.random() * (maxDelay - minDelay);
        if (delay > 0) await this._delay(delay, delay);
      }
      i += batch;
    }
  }

  private async _typeCharacter(char: string): Promise<void> {
    await this._client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
      key: char,
      code: 'Key' + char.toUpperCase(),
      windowsVirtualKeyCode: char.charCodeAt(0),
      nativeVirtualKeyCode: char.charCodeAt(0),
    });
    await this._client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: char,
      code: 'Key' + char.toUpperCase(),
      windowsVirtualKeyCode: char.charCodeAt(0),
      nativeVirtualKeyCode: char.charCodeAt(0),
    });
  }

  private _getAdjacentKey(char: string): string {
    const adjacentKeys: Record<string, string[]> = {
      'a': ['s', 'q', 'w', 'z'],
      'b': ['v', 'g', 'h', 'n'],
      'c': ['x', 'd', 'f', 'v'],
      'd': ['s', 'e', 'r', 'f'],
      'e': ['w', '3', '4', 'r'],
      'f': ['d', 'r', 't', 'g'],
      'g': ['f', 't', 'y', 'h'],
      'h': ['g', 'y', 'u', 'j'],
      'i': ['u', '8', '9', 'o'],
      'j': ['h', 'u', 'i', 'k'],
      'k': ['j', 'i', 'o', 'l'],
      'l': ['k', 'o', 'p', ';'],
      'm': ['n', 'j', 'k', ','],
      'n': ['b', 'h', 'j', 'm'],
      'o': ['i', '9', '0', 'p'],
      'p': ['o', '0', '-', '['],
      'q': ['1', '2', 'w', 'a'],
      'r': ['e', '4', '5', 't'],
      's': ['a', 'w', 'e', 'd'],
      't': ['r', '5', '6', 'y'],
      'u': ['y', '7', '8', 'i'],
      'v': ['c', 'f', 'g', 'b'],
      'w': ['q', '2', '3', 'e'],
      'x': ['z', 's', 'd', 'c'],
      'y': ['t', '6', '7', 'u'],
      'z': ['a', 's', 'x', '0'],
    };

    const nearby = adjacentKeys[char.toLowerCase()];
    if (nearby && nearby.length > 0) {
      return nearby[Math.floor(Math.random() * nearby.length)];
    }
    return char;
  }

  async ultraClick(x: number, y: number): Promise<void> {
    if (this._options.bezierMovement) {
      await this._bezierMoveTo(x, y);
    } else {
      await this._client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x, y, button: 'none', buttons: 0, modifiers: 0, force: 0,
      });
    }

    const [minDelay, maxDelay] = this._options.clickDelay;
    if (minDelay > 0) await this._delay(minDelay, maxDelay);

    const fx = this._options.mouseJitter ? x + (Math.random() * 4 - 2) : x;
    const fy = this._options.mouseJitter ? y + (Math.random() * 4 - 2) : y;

    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: fx, y: fy, button: 'left', buttons: 1, modifiers: 0, clickCount: 1, force: 0.5,
    });
    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: fx, y: fy, button: 'left', buttons: 0, modifiers: 0, clickCount: 1, force: 0,
    });
  }

  async ultraDoubleClick(x: number, y: number): Promise<void> {
    await this.ultraClick(x, y);
    await this._delay(5, 15);
    await this.ultraClick(x, y);
  }

  async ultraRightClick(x: number, y: number): Promise<void> {
    if (this._options.bezierMovement) await this._bezierMoveTo(x, y);
    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'right', buttons: 2, modifiers: 0, clickCount: 1, force: 0.5,
    });
    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'right', buttons: 0, modifiers: 0, clickCount: 1,
      force: 0,
    });
  }

  async ultraHover(x: number, y: number): Promise<void> {
    if (this._options.bezierMovement) {
      await this._bezierMoveTo(x, y);
    } else {
      await this._client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x, y,
        button: 'none',
        buttons: 0,
        modifiers: 0,
        force: 0,
      });
    }
  }

  private async _bezierMoveTo(targetX: number, targetY: number): Promise<void> {
    const startX = 200 + Math.random() * 800;
    const startY = 200 + Math.random() * 400;

    const cp1x = startX + (targetX - startX) * 0.25 + (Math.random() * 80 - 40);
    const cp1y = startY + (targetY - startY) * 0.25 + (Math.random() * 80 - 40);
    const cp2x = startX + (targetX - startX) * 0.75 + (Math.random() * 80 - 40);
    const cp2y = startY + (targetY - startY) * 0.75 + (Math.random() * 80 - 40);

    const steps = 15 + Math.floor(Math.random() * 10);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.pow(1 - t, 3) * startX + 3 * Math.pow(1 - t, 2) * t * cp1x + 3 * (1 - t) * Math.pow(t, 2) * cp2x + Math.pow(t, 3) * targetX;
      const y = Math.pow(1 - t, 3) * startY + 3 * Math.pow(1 - t, 2) * t * cp1y + 3 * (1 - t) * Math.pow(t, 2) * cp2y + Math.pow(t, 3) * targetY;

      await this._client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x, y,
        button: 'none',
        buttons: 0,
        modifiers: 0,
        force: 0,
      });

      await this._delay(5, 15);
    }
  }

  async ultraScroll(direction: 'up' | 'down', amount?: number): Promise<void> {
    const scrollAmount = amount || (100 + Math.floor(Math.random() * 400));
    const steps = 5 + Math.floor(Math.random() * 10);
    const stepAmount = scrollAmount / steps;

    for (let i = 0; i < steps; i++) {
      await this._client.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: 400 + Math.random() * 200,
        y: 300 + Math.random() * 200,
        deltaX: 0,
        deltaY: direction === 'down' ? stepAmount : -stepAmount,
        modifiers: 0,
      });
      await this._delay(20, 40);
    }
  }

  private async _delay(min: number, max: number): Promise<void> {
    const delay = min + Math.random() * (max - min);
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}
