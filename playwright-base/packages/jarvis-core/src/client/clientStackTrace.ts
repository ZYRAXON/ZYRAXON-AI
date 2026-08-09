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

import { captureRawStack, coreDir, filterStackFile, parseStackFrame } from '@utils/stackTrace';

import type { StackFrame } from '@utils/stackTrace';

export function captureLibraryStackTrace(): { frames: StackFrame[], apiName: string } {
  const stack = captureRawStack();
  const jarvisCoreDir = coreDir();

  type ParsedFrame = {
    frame: StackFrame;
    frameText: string;
    isJarvisLibrary: boolean;
  };
  let parsedFrames = stack.map(line => {
    const frame = parseStackFrame(line);
    if (!frame || !frame.file)
      return null;
    const isJarvisLibrary = !!jarvisCoreDir && frame.file.startsWith(jarvisCoreDir);
    const parsed: ParsedFrame = {
      frame,
      frameText: line,
      isJarvisLibrary
    };
    return parsed;
  }).filter(Boolean) as ParsedFrame[];

  let apiName = '';

  // Deepest transition between non-client code calling into client
  // code is the api entry.
  for (let i = 0; i < parsedFrames.length - 1; i++) {
    const parsedFrame = parsedFrames[i];
    if (parsedFrame.isJarvisLibrary && !parsedFrames[i + 1].isJarvisLibrary) {
      apiName = apiName || normalizeAPIName(parsedFrame.frame.function);
      break;
    }
  }

  function normalizeAPIName(name?: string): string {
    if (!name)
      return '';
    // (\d) is to tolerate bundler renames Locator2 instead of Locator.
    const match = name.match(/(API|JS|CDP|[A-Z])([^\d]+)\d?\.(.*)/);
    if (!match)
      return name;
    return match[1].toLowerCase() + match[2] + '.' + match[3];
  }

  // This is for the inspector so that it did not include the test runner stack frames.
  parsedFrames = parsedFrames.filter(f => filterStackFile(f.frame.file));

  return {
    frames: parsedFrames.map(p => p.frame),
    apiName
  };
}
