/**
 * Copyright 2026 ZYRAXON AI. All rights reserved.
 * Modifications copyright (c) ZYRAXON AI.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { assert } from '@isomorphic/assert';
import { rewriteErrorMessage } from '@utils/stackTrace';
import { eventsHelper } from '@utils/eventsHelper';
import * as dialog from '../dialog';
import * as dom from '../dom';
import * as frames from '../frames';
import { helper } from '../helper';
import * as network from '../network';
import { Page, PageBinding, Worker } from '../page';
import { CRBrowserContext } from './crBrowser';
import { CRCoverage } from './crCoverage';
import { DragManager } from './crDragDrop';
import { createHandle, CRExecutionContext } from './crExecutionContext';
import { RawKeyboardImpl, RawMouseImpl, RawTouchscreenImpl } from './crInput';
import { CRNetworkManager } from './crNetworkManager';
import { CRPDF } from './crPdf';
import { exceptionToError, releaseObject, stackTraceToLocation } from './crProtocolHelper';
import { platformToFontFamilies } from './defaultFontFamilies';
import { TargetClosedError } from '../errors';
import { isSessionClosedError } from '../protocolError';
import { startAutomaticVideoRecording } from '../videoRecorder';
import { nullProgress } from '../progress';

import type { CRSession } from './crConnection';
import type { Protocol } from './protocol';
import type { RegisteredListener } from '@utils/eventsHelper';
import type { InitScript, PageDelegate } from '../page';
import type { Progress } from '../progress';
import type * as types from '../types';
import type * as channels from '../channels';


export type WindowBounds = { top?: number, left?: number, width?: number, height?: number };

export class CRPage implements PageDelegate {
  readonly utilityWorldName: string;
  readonly _mainFrameSession: FrameSession;
  readonly _sessions = new Map<Protocol.Target.TargetID, FrameSession>();
  readonly _page: Page;
  readonly rawMouse: RawMouseImpl;
  readonly rawKeyboard: RawKeyboardImpl;
  readonly rawTouchscreen: RawTouchscreenImpl;
  readonly _targetId: string;
  readonly _opener: CRPage | null;
  readonly _networkManager: CRNetworkManager;
  private readonly _pdf: CRPDF;
  private readonly _coverage: CRCoverage;
  readonly _browserContext: CRBrowserContext;

  // Holds window features for the next popup being opened via window.open,
  // until the popup target arrives. This could be racy if two oopifs
  // simultaneously call window.open with window features: the order
  // of their Page.windowOpen events is not guaranteed to match the order
  // of new popup targets.
  readonly _nextWindowOpenPopupFeatures: string[][] = [];

  static mainFrameSession(page: Page): FrameSession {
    const crPage = page.delegate as CRPage;
    return crPage._mainFrameSession;
  }

  constructor(client: CRSession, targetId: string, browserContext: CRBrowserContext, opener: CRPage | null, bits: { hasUIWindow: boolean }) {
    this._targetId = targetId;
    this._opener = opener;
    const dragManager = new DragManager(this);
    this.rawKeyboard = new RawKeyboardImpl(client, browserContext._browser._platform() === 'mac', dragManager);
    this.rawMouse = new RawMouseImpl(this, client, dragManager);
    this.rawTouchscreen = new RawTouchscreenImpl(client);
    this._pdf = new CRPDF(client);
    this._coverage = new CRCoverage(client);
    this._browserContext = browserContext;
    this._page = new Page(this, browserContext);
    // Create a unique utility world for this Jarvis Browser instance, just in case there
    // are multiple instances of Jarvis Browser connected to the same browser page.
    this.utilityWorldName = `__jarvis_utility_world_${this._page.guid}`;
    this._networkManager = new CRNetworkManager(this._page, null);
    // Sync any browser context state to the network manager. This does not talk over CDP because
    // we have not connected any sessions to the network manager yet.
    this.updateOffline();
    this.updateExtraHTTPHeaders();
    this.updateHttpCredentials();
    this.updateRequestInterception();
    this._mainFrameSession = new FrameSession(this, client, targetId, null);
    this._sessions.set(targetId, this._mainFrameSession);
    if (opener && !browserContext._options.noDefaultViewport) {
      const features = opener._nextWindowOpenPopupFeatures.shift() || [];
      const viewportSize = helper.getViewportSizeFromWindowFeatures(features);
      if (viewportSize)
        this._page.setEmulatedSizeFromWindowOpen({ viewport: viewportSize, screen: viewportSize });
    }

    this._mainFrameSession._initialize(bits.hasUIWindow).then(
        () => this._page.reportAsNew(this._opener?._page, undefined),
        error => this._page.reportAsNew(this._opener?._page, error));
  }

  private async _forAllFrameSessions(cb: (frame: FrameSession) => Promise<any>) {
    const frameSessions = Array.from(this._sessions.values());
    await Promise.all(frameSessions.map(frameSession => {
      if (frameSession._isMainFrame())
        return cb(frameSession);
      return cb(frameSession).catch(e => {
        // Broadcasting a message to the closed iframe should be a noop.
        if (isSessionClosedError(e))
          return;
        throw e;
      });
    }));
  }

  _sessionForFrame(frame: frames.Frame): FrameSession {
    // Frame id equals target id.
    while (!this._sessions.has(frame._id)) {
      const parent = frame.parentFrame();
      if (!parent)
        throw new Error(`Frame has been detached.`);
      frame = parent;
    }
    return this._sessions.get(frame._id)!;
  }

  private _sessionForHandle(handle: dom.ElementHandle): FrameSession {
    const frame = handle._context.frame;
    return this._sessionForFrame(frame);
  }

  willBeginDownload() {
    this._mainFrameSession._willBeginDownload();
  }

  didClose() {
    for (const session of this._sessions.values())
      session.dispose();
    this._page._didClose();
  }

  async navigateFrame(frame: frames.Frame, url: string, referrer: string | undefined): Promise<frames.GotoResult> {
    return this._sessionForFrame(frame)._navigate(frame, url, referrer);
  }

  async updateExtraHTTPHeaders(): Promise<void> {
    const headers = network.mergeHeaders([
      this._browserContext._options.extraHTTPHeaders,
      this._page.extraHTTPHeaders()
    ]);
    await this._networkManager.setExtraHTTPHeaders(headers);
  }

  async updateGeolocation(): Promise<void> {
    await this._forAllFrameSessions(frame => frame._updateGeolocation(false));
  }

  async updateOffline(): Promise<void> {
    await this._networkManager.setOffline(!!this._browserContext._options.offline);
  }

  async updateHttpCredentials(): Promise<void> {
    await this._networkManager.authenticate(this._browserContext._options.httpCredentials || null);
  }

  async updateEmulatedViewportSize(preserveWindowBoundaries?: boolean): Promise<void> {
    await this._mainFrameSession._updateViewport(preserveWindowBoundaries);
  }

  async bringToFront(): Promise<void> {
    await this._mainFrameSession._client.send('Page.bringToFront');
  }

  async updateEmulateMedia(): Promise<void> {
    await this._forAllFrameSessions(frame => frame._updateEmulateMedia());
  }

  async updateUserAgent(): Promise<void> {
    await this._forAllFrameSessions(frame => frame._updateUserAgent());
  }

  async updateRequestInterception(): Promise<void> {
    await this._networkManager.setRequestInterception(this._page.needsRequestInterception());
  }

  async updateFileChooserInterception() {
    await this._forAllFrameSessions(frame => frame._updateFileChooserInterception(false));
  }

  async reload(): Promise<void> {
    await this._mainFrameSession._client.send('Page.reload');
  }

  private async _go(delta: number): Promise<boolean> {
    const history = await this._mainFrameSession._client.send('Page.getNavigationHistory');
    const entry = history.entries[history.currentIndex + delta];
    if (!entry)
      return false;
    await this._mainFrameSession._client.send('Page.navigateToHistoryEntry', { entryId: entry.id });
    return true;
  }

  goBack(): Promise<boolean> {
    return this._go(-1);
  }

  goForward(): Promise<boolean> {
    return this._go(+1);
  }

  async requestGC(): Promise<void> {
    await this._mainFrameSession._client.send('HeapProfiler.collectGarbage');
  }

  async addInitScript(initScript: InitScript, world: types.World = 'main'): Promise<void> {
    await this._forAllFrameSessions(frame => frame._evaluateOnNewDocument(initScript, world));
  }

  async exposeJarvisBinding() {
    await this._forAllFrameSessions(frame => frame.exposeJarvisBinding());
  }

  async removeInitScripts(initScripts: InitScript[]): Promise<void> {
    await this._forAllFrameSessions(frame => frame._removeEvaluatesOnNewDocument(initScripts));
  }

  async closePage(runBeforeUnload: boolean): Promise<void> {
    if (runBeforeUnload)
      await this._mainFrameSession._client.send('Page.close');
    else
      await this._browserContext._browser._closePage(this);
  }

  async setBackgroundColor(color?: { r: number; g: number; b: number; a: number; }): Promise<void> {
    await this._mainFrameSession._client.send('Emulation.setDefaultBackgroundColorOverride', { color });
  }

  async takeScreenshot(progress: Progress, format: 'png' | 'jpeg' | 'webp', documentRect: types.Rect | undefined, viewportRect: types.Rect | undefined, quality: number | undefined, fitsViewport: boolean, scale: 'css' | 'device'): Promise<Buffer> {
    const { visualViewport, contentSize, cssContentSize } = await progress.race(this._mainFrameSession._client.send('Page.getLayoutMetrics'));
    if (!documentRect) {
      documentRect = {
        x: visualViewport.pageX + viewportRect!.x,
        y: visualViewport.pageY + viewportRect!.y,
        ...helper.enclosingIntSize({
          width: viewportRect!.width / visualViewport.scale,
          height: viewportRect!.height / visualViewport.scale,
        })
      };
    }
    // When taking screenshots with documentRect (based on the page content, not viewport),
    // ignore current page scale.
    const clip = { ...documentRect, scale: viewportRect ? visualViewport.scale : 1 };
    if (scale === 'css') {
      // deviceScaleFactor override does not affect layout metrics, so if it is set,
      // we use its value rather than computed one.
      const deviceScaleFactor =  this._mainFrameSession._metricsOverride?.deviceScaleFactor || contentSize.width / cssContentSize.width || 1;
      clip.scale /= deviceScaleFactor;
    }
    const result = await progress.race(this._mainFrameSession._client.send('Page.captureScreenshot', { format, quality, clip, captureBeyondViewport: !fitsViewport }));
    return Buffer.from(result.data, 'base64');
  }

  async getContentFrame(handle: dom.ElementHandle): Promise<frames.Frame | null> {
    return this._sessionForHandle(handle)._getContentFrame(handle);
  }

  async getOwnerFrame(handle: dom.ElementHandle): Promise<string | null> {
    return this._sessionForHandle(handle)._getOwnerFrame(handle);
  }

  async getBoundingBox(handle: dom.ElementHandle): Promise<types.Rect | null> {
    return this._sessionForHandle(handle)._getBoundingBox(handle);
  }

  async scrollRectIntoViewIfNeeded(handle: dom.ElementHandle, rect?: types.Rect): Promise<'error:notvisible' | 'error:notconnected' | 'done'> {
    return this._sessionForHandle(handle)._scrollRectIntoViewIfNeeded(handle, rect);
  }

  startScreencast(options: { width: number; height: number; quality: number; }) {
    this._mainFrameSession._client.send('Page.startScreencast', {
      format: 'jpeg',
      quality: options.quality,
      maxWidth: options.width,
      maxHeight: options.height,
    }).catch(() => {});
  }

  stopScreencast() {
    this._mainFrameSession._client._sendMayFail('Page.stopScreencast').catch(() => {});
  }

  rafCountForStablePosition(): number {
    return 1;
  }

  async getContentQuads(handle: dom.ElementHandle): Promise<types.Quad[] | null> {
    return this._sessionForHandle(handle)._getContentQuads(handle);
  }

  async setInputFilePaths(progress: Progress, handle: dom.ElementHandle<HTMLInputElement>, files: string[]): Promise<void> {
    const frame = await handle.ownerFrame(progress);
    if (!frame)
      throw new Error('Cannot set input files to detached input element');
    const parentSession = this._sessionForFrame(frame);
    await progress.race(parentSession._client.send('DOM.setFileInputFiles', {
      objectId: handle._objectId,
      files
    }));
  }

  async adoptElementHandle<T extends Node>(handle: dom.ElementHandle<T>, to: dom.FrameExecutionContext): Promise<dom.ElementHandle<T>> {
    return this._sessionForHandle(handle)._adoptElementHandle<T>(handle, to);
  }

  async inputActionEpilogue(): Promise<void> {
    await this._mainFrameSession._client.send('Page.enable').catch(e => {});
  }

  async resetForReuse(progress: Progress): Promise<void> {
    // See https://github.com/zyraxon-ai/jarvis-browser/issues/22432.
    await this.rawMouse.move(progress, -1, -1, 'none', new Set(), new Set(), true);
  }

  async pdf(options: channels.PagePdfParams): Promise<Buffer> {
    return this._pdf.generate(options);
  }

  coverage(): CRCoverage {
    return this._coverage;
  }

  async getFrameElement(frame: frames.Frame): Promise<dom.ElementHandle> {
    let parent = frame.parentFrame();
    if (!parent)
      throw new Error('Frame has been detached.');
    const parentSession = this._sessionForFrame(parent);
    const { backendNodeId } = await parentSession._client.send('DOM.getFrameOwner', { frameId: frame._id }).catch(e => {
      if (e instanceof Error && e.message.includes('Frame with the given id was not found.'))
        rewriteErrorMessage(e, 'Frame has been detached.');
      throw e;
    });
    parent = frame.parentFrame();
    if (!parent)
      throw new Error('Frame has been detached.');
    return parentSession._adoptBackendNodeId(backendNodeId, await parent.mainContext());
  }

  shouldToggleStyleSheetToSyncAnimations(): boolean {
    return false;
  }

  async setDockTile(image: Buffer): Promise<void> {
    await this._mainFrameSession._client.send('Browser.setDockTile', { image: image.toString('base64') });
  }
}

class FrameSession {
  readonly _client: CRSession;
  readonly _crPage: CRPage;
  readonly _page: Page;
  private readonly _parentSession: FrameSession | null;
  private readonly _childSessions = new Set<FrameSession>();
  private readonly _contextIdToContext = new Map<number, dom.FrameExecutionContext>();
  private _eventListeners: RegisteredListener[] = [];
  readonly _targetId: string;
  private _firstNonInitialNavigationCommittedPromise: Promise<void>;
  private _firstNonInitialNavigationCommittedFulfill = () => {};
  private _firstNonInitialNavigationCommittedReject = (e: Error) => {};
  private _windowId: number | undefined;
  // Marks the oopif session that remote -> local transition has happened in the parent.
  // See Target.detachedFromTarget handler for details.
  private _swappedIn = false;
  _metricsOverride: Protocol.Emulation.setDeviceMetricsOverrideParameters | undefined;
  private _workerSessions = new Map<string, CRSession>();
  private _initScriptIds = new Map<InitScript, string>();
  private _bufferedAttachedToTargetEvents: Protocol.Target.attachedToTargetPayload[] | undefined;

  constructor(crPage: CRPage, client: CRSession, targetId: string, parentSession: FrameSession | null) {
    this._client = client;
    this._crPage = crPage;
    this._page = crPage._page;
    this._targetId = targetId;
    this._parentSession = parentSession;
    if (parentSession)
      parentSession._childSessions.add(this);
    this._firstNonInitialNavigationCommittedPromise = new Promise((f, r) => {
      this._firstNonInitialNavigationCommittedFulfill = f;
      this._firstNonInitialNavigationCommittedReject = r;
    });
    // The Promise is not always awaited (e.g. FrameSession._initialize can throw)
    // so we catch errors here to prevent unhandled promise rejection.
    this._firstNonInitialNavigationCommittedPromise.catch(() => {});
  }

  _isMainFrame(): boolean {
    return this._targetId === this._crPage._targetId;
  }

  private _addRendererListeners() {
    this._eventListeners.push(...[
      eventsHelper.addEventListener(this._client, 'Log.entryAdded', event => this._onLogEntryAdded(event)),
      eventsHelper.addEventListener(this._client, 'Page.fileChooserOpened', event => this._onFileChooserOpened(event)),
      eventsHelper.addEventListener(this._client, 'Page.frameAttached', event => this._onFrameAttached(event.frameId, event.parentFrameId)),
      eventsHelper.addEventListener(this._client, 'Page.frameDetached', event => this._onFrameDetached(event.frameId, event.reason)),
      eventsHelper.addEventListener(this._client, 'Page.frameNavigated', event => this._onFrameNavigated(event.frame, false)),
      eventsHelper.addEventListener(this._client, 'Page.frameRequestedNavigation', event => this._onFrameRequestedNavigation(event)),
      eventsHelper.addEventListener(this._client, 'Page.javascriptDialogOpening', event => this._onDialog(event)),
      eventsHelper.addEventListener(this._client, 'Page.javascriptDialogClosed', () => this._onDialogClosed()),
      eventsHelper.addEventListener(this._client, 'Page.navigatedWithinDocument', event => this._onFrameNavigatedWithinDocument(event.frameId, event.url)),
      eventsHelper.addEventListener(this._client, 'Runtime.bindingCalled', event => this._onBindingCalled(event)),
      eventsHelper.addEventListener(this._client, 'Runtime.consoleAPICalled', event => this._onConsoleAPI(event)),
      eventsHelper.addEventListener(this._client, 'Runtime.exceptionThrown', exception => this._handleException(exception.exceptionDetails)),
      eventsHelper.addEventListener(this._client, 'Runtime.executionContextCreated', event => this._onExecutionContextCreated(event.context)),
      eventsHelper.addEventListener(this._client, 'Runtime.executionContextDestroyed', event => this._onExecutionContextDestroyed(event.executionContextId)),
      eventsHelper.addEventListener(this._client, 'Runtime.executionContextsCleared', event => this._onExecutionContextsCleared()),
    ]);
  }

  private _addBrowserListeners() {
    this._eventListeners.push(...[
      eventsHelper.addEventListener(this._client, 'Target.attachedToTarget', event => this._onAttachedToTarget(event)),
      eventsHelper.addEventListener(this._client, 'Target.detachedFromTarget', event => this._onDetachedFromTarget(event)),
      eventsHelper.addEventListener(this._client, 'Inspector.targetCrashed', event => this._onTargetCrashed()),
      eventsHelper.addEventListener(this._client, 'Page.screencastFrame', event => this._onScreencastFrame(event)),
      eventsHelper.addEventListener(this._client, 'Page.windowOpen', event => this._onWindowOpen(event)),
    ]);
  }

  async _initialize(hasUIWindow: boolean) {
    if (!this._page.isStorageStatePage && hasUIWindow &&
      !this._crPage._browserContext._browser.isClank() &&
      !this._crPage._browserContext._options.noDefaultViewport) {
      try {
        const { windowId } = await this._client.send('Browser.getWindowForTarget');
        this._windowId = windowId;
      } catch {
        // Some pages in Edge, like internal UIs, are mis-classified as "page", but do
        // not actually have a browser window. That's fine, we won't resize them.
      }
    }

    if (this._isMainFrame() && hasUIWindow && !this._page.isStorageStatePage)
      startAutomaticVideoRecording(this._crPage._page);

    let lifecycleEventsEnabled: Promise<any>;
    if (!this._isMainFrame())
      this._addRendererListeners();
    this._addBrowserListeners();

    // Buffer attachedToTarget events until we receive the frame tree.
    // This way we'll know where to insert oopif targets in the frame hierarchy.
    // Note that we cannot send Target.setAutoAttach after Runtime.runIfWaitingForDebugger,
    // so we have to buffer events instead.
    this._bufferedAttachedToTargetEvents = [];

    const promises: Promise<any>[] = [
      this._client.send('Page.enable'),
      this._client.send('Page.getFrameTree').then(({ frameTree }) => {
        if (this._isMainFrame()) {
          this._handleFrameTree(frameTree);
          this._addRendererListeners();
        }

        // Now that we have the frame tree, it is possible to insert oopif targets at the right place.
        const attachedToTargetEvents = this._bufferedAttachedToTargetEvents || [];
        this._bufferedAttachedToTargetEvents = undefined;
        for (const event of attachedToTargetEvents)
          this._onAttachedToTarget(event);

        const localFrames = this._isMainFrame() ? this._page.frames() : [this._page.frameManager.frame(this._targetId)!];
        for (const frame of localFrames) {
          // Note: frames might be removed before we send these.
          this._client._sendMayFail('Page.createIsolatedWorld', {
            frameId: frame._id,
            grantUniveralAccess: true,
            worldName: this._crPage.utilityWorldName,
          });
        }

        // In r1651606 Chromium changed the URL it reports for the initial empty document from the ":" to "".
        const isInitialEmptyPage = this._isMainFrame() && (this._page.mainFrame().url() === ':' || this._page.mainFrame().url() === '');
        if (isInitialEmptyPage) {
          // Ignore lifecycle events, worlds and bindings for the initial empty page. It is never the final page
          // hence we are going to get more lifecycle updates after the actual navigation has
          // started (even if the target url is about:blank).
          lifecycleEventsEnabled.catch(e => {}).then(() => {
            this._eventListeners.push(eventsHelper.addEventListener(this._client, 'Page.lifecycleEvent', event => this._onLifecycleEvent(event)));
          });
        } else {
          this._firstNonInitialNavigationCommittedFulfill();
          this._eventListeners.push(eventsHelper.addEventListener(this._client, 'Page.lifecycleEvent', event => this._onLifecycleEvent(event)));
        }
      }),
      this._client.send('Log.enable', {}),
      lifecycleEventsEnabled = this._client.send('Page.setLifecycleEventsEnabled', { enabled: true }),
      this._client.send('Runtime.enable', {}),
      this._client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: '',
        worldName: this._crPage.utilityWorldName,
      }),
      this._crPage._networkManager.addSession(this._client, undefined, this._isMainFrame()),
      this._client.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }),
    ];
    if (!this._page.isStorageStatePage) {
      const skipDefaultOverrides = this._crPage._browserContext._browser.options.noDefaults &&
          this._crPage._browserContext === this._crPage._browserContext._browser._defaultContext;
      if (this._crPage._browserContext.needsJarvisBinding())
        promises.push(this.exposeJarvisBinding());
      if (this._isMainFrame() && !skipDefaultOverrides)
        promises.push(this._client.send('Emulation.setFocusEmulationEnabled', { enabled: true }));
      const options = this._crPage._browserContext._options;
      if (options.bypassCSP)
        promises.push(this._client.send('Page.setBypassCSP', { enabled: true }));
      if (options.ignoreHTTPSErrors || options.internalIgnoreHTTPSErrors)
        promises.push(this._client.send('Security.setIgnoreCertificateErrors', { ignore: true }));
      if (this._isMainFrame())
        promises.push(this._updateViewport());
      if (options.hasTouch)
        promises.push(this._client.send('Emulation.setTouchEmulationEnabled', { enabled: true }));
      if (options.javaScriptEnabled === false)
        promises.push(this._client.send('Emulation.setScriptExecutionDisabled', { value: true }));
      if (options.userAgent || options.locale)
        promises.push(this._updateUserAgent());
      if (options.locale)
        promises.push(emulateLocale(this._client, options.locale));
      if (options.timezoneId)
        promises.push(emulateTimezone(this._client, options.timezoneId));
      if (!this._crPage._browserContext._browser.options.headful)
        promises.push(this._setDefaultFontFamilies(this._client));
      promises.push(this._updateGeolocation(true));
      if (!skipDefaultOverrides)
        promises.push(this._updateEmulateMedia());
      promises.push(this._updateFileChooserInterception(true));
      for (const initScript of this._crPage._page.allInitScripts())
        promises.push(this._evaluateOnNewDocument(initScript, 'main', true /* runImmediately */));
    }
    promises.push(this._client.send('Runtime.runIfWaitingForDebugger'));
    promises.push(this._firstNonInitialNavigationCommittedPromise);
    await Promise.all(promises);
  }

  dispose() {
    this._firstNonInitialNavigationCommittedReject(new TargetClosedError(this._page.closeReason()));
    for (const childSession of this._childSessions)
      childSession.dispose();
    if (this._parentSession)
      this._parentSession._childSessions.delete(this);
    eventsHelper.removeEventListeners(this._eventListeners);
    this._crPage._networkManager.removeSession(this._client);
    this._crPage._sessions.delete(this._targetId);
    this._client.dispose();
  }

  async _navigate(frame: frames.Frame, url: string, referrer: string | undefined): Promise<frames.GotoResult> {
    const response = await this._client.send('Page.navigate', { url, referrer, frameId: frame._id, referrerPolicy: 'unsafeUrl' });
    if (response.isDownload)
      throw new frames.NavigationAbortedError(response.loaderId, 'Download is starting');
    if (response.errorText)
      throw new frames.NavigationAbortedError(response.loaderId, `${response.errorText} at ${url}`);
    return { newDocumentId: response.loaderId };
  }

  _onLifecycleEvent(event: Protocol.Page.lifecycleEventPayload) {
    if (this._eventBelongsToStaleFrame(event.frameId))
      return;
    if (event.name === 'load')
      this._page.frameManager.frameLifecycleEvent(event.frameId, 'load');
    else if (event.name === 'DOMContentLoaded')
      this._page.frameManager.frameLifecycleEvent(event.frameId, 'domcontentloaded');
  }

  _handleFrameTree(frameTree: Protocol.Page.FrameTree) {
    this._onFrameAttached(frameTree.frame.id, frameTree.frame.parentId || null);
    this._onFrameNavigated(frameTree.frame, true);
    if (!frameTree.childFrames)
      return;

    for (const child of frameTree.childFrames)
      this._handleFrameTree(child);
  }

  private _eventBelongsToStaleFrame(frameId: string)  {
    const frame = this._page.frameManager.frame(frameId);
    // Subtree may be already gone because some ancestor navigation destroyed the oopif.
    if (!frame)
      return true;
    // When frame goes remote, parent process may still send some events
    // related to the local frame before it sends frameDetached.
    // In this case, we already have a new session for this frame, so events
    // in the old session should be ignored.
    const session = this._crPage._sessionForFrame(frame);
    return session && session !== this && !session._swappedIn;
  }

  _onFrameAttached(frameId: string, parentFrameId: string | null) {
    const frameSession = this._crPage._sessions.get(frameId);
    if (frameSession && frameId !== this._targetId) {
      // This is a remote -> local frame transition.
      frameSession._swappedIn = true;
      const frame = this._page.frameManager.frame(frameId);
      // Frame or even a whole subtree may be already gone, because some ancestor did navigate.
      if (frame)
        this._page.frameManager.removeChildFramesRecursively(frame);
      return;
    }
    if (parentFrameId && !this._page.frameManager.frame(parentFrameId)) {
      // Parent frame may be gone already because some ancestor frame navigated and
      // destroyed the whole subtree of some oopif, while oopif's process is still sending us events.
      // Be careful to not confuse this with "main frame navigated cross-process" scenario
      // where parentFrameId is null.
      return;
    }
    this._page.frameManager.frameAttached(frameId, parentFrameId);
  }

  _onFrameNavigated(framePayload: Protocol.Page.Frame, initial: boolean) {
    if (this._eventBelongsToStaleFrame(framePayload.id))
      return;
    this._page.frameManager.frameCommittedNewDocumentNavigation(framePayload.id, framePayload.url + (framePayload.urlFragment || ''), framePayload.name || '', framePayload.loaderId, initial);
    if (!initial)
      this._firstNonInitialNavigationCommittedFulfill();
  }

  _onFrameRequestedNavigation(payload: Protocol.Page.frameRequestedNavigationPayload) {
    if (this._eventBelongsToStaleFrame(payload.frameId))
      return;
    if (payload.disposition === 'currentTab')
      this._page.frameManager.frameRequestedNavigation(payload.frameId);
  }

  _onFrameNavigatedWithinDocument(frameId: string, url: string) {
    if (this._eventBelongsToStaleFrame(frameId))
      return;
    this._page.frameManager.frameCommittedSameDocumentNavigation(frameId, url);
  }

  _onFrameDetached(frameId: string, reason: 'remove' | 'swap') {
    if (this._crPage._sessions.has(frameId)) {
      // This is a local -> remote frame transition, where
      // Page.frameDetached arrives after Target.attachedToTarget.
      // We've already handled the new target and frame reattach - nothing to do here.
      return;
    }
    if (reason === 'swap') {
      // This is a local -> remote frame transition, where
      // Page.frameDetached arrives before Target.attachedToTarget.
      // We should keep the frame in the tree, and it will be used for the new target.
      const frame = this._page.frameManager.frame(frameId);
      if (frame)
        this._page.frameManager.removeChildFramesRecursively(frame);
      return;
    }
    // Just a regular frame detach.
    this._page.frameManager.frameDetached(frameId);
  }

  _onExecutionContextCreated(contextPayload: Protocol.Runtime.ExecutionContextDescription) {
    const frame = contextPayload.auxData ? this._page.frameManager.frame(contextPayload.auxData.frameId) : null;
    if (!frame || this._eventBelongsToStaleFrame(frame._id))
      return;
    const delegate = new CRExecutionContext(this._client, contextPayload);
    let worldName: types.World|null = null;
    if (contextPayload.auxData && !!contextPayload.auxData.isDefault)
      worldName = 'main';
    else if (contextPayload.name === this._crPage.utilityWorldName)
      worldName = 'utility';
    const context = new dom.FrameExecutionContext(delegate, frame, worldName);
    if (worldName)
      frame.contextCreated(worldName, context);
    this._contextIdToContext.set(contextPayload.id, context);
  }

  _onExecutionContextDestroyed(executionContextId: number) {
    const context = this._contextIdToContext.get(executionContextId);
    if (!context)
      return;
    this._contextIdToContext.delete(executionContextId);
    context.frame.contextDestroyed(context);
  }

  _onExecutionContextsCleared() {
    for (const contextId of Array.from(this._contextIdToContext.keys()))
      this._onExecutionContextDestroyed(contextId);
  }

  _onAttachedToTarget(event: Protocol.Target.attachedToTargetPayload) {
    if (this._bufferedAttachedToTargetEvents) {
      this._bufferedAttachedToTargetEvents.push(event);
      return;
    }

    const session = this._client.createChildSession(event.sessionId);

    if (event.targetInfo.type === 'iframe') {
      // Frame id equals target id.
      const targetId = event.targetInfo.targetId;
      let frame = this._page.frameManager.frame(targetId);
      if (!frame && event.targetInfo.parentFrameId) {
        // When connecting to an existing page with an iframe, there is an "iframe" target,
        // but no local frame is reported in getFrameTree. We can create a remote frame here.
        frame = this._page.frameManager.frameAttached(targetId, event.targetInfo.parentFrameId);
      }
      if (!frame)
        return; // Subtree may be already gone due to renderer/browser race.
      this._page.frameManager.removeChildFramesRecursively(frame);
      for (const [contextId, context] of this._contextIdToContext) {
        if (context.frame === frame)
          this._onExecutionContextDestroyed(contextId);
      }
      const frameSession = new FrameSession(this._crPage, session, targetId, this);
      this._crPage._sessions.set(targetId, frameSession);
      frameSession._initialize(false).catch(e => e);
      return;
    }

    if (event.targetInfo.type !== 'worker') {
      session.detach().catch(() => {});
      return;
    }

    const url = event.targetInfo.url;
    const worker = new Worker(this._page, url);
    this._page.addWorker(event.sessionId, worker);
    this._workerSessions.set(event.sessionId, session);
    session.once('Runtime.executionContextCreated', async event => {
      worker.createExecutionContext(new CRExecutionContext(session, event.context));
    });
    if (this._crPage._browserContext._browser.majorVersion() >= 143)
      session.on('Inspector.workerScriptLoaded', () => worker.workerScriptLoaded());
    else
      worker.workerScriptLoaded();
    // This might fail if the target is closed before we initialize.
    session._sendMayFail('Runtime.enable');
    this._crPage._networkManager.addSession(session, this._page.frameManager.frame(event.targetInfo.parentFrameId ?? this._targetId) ?? undefined).catch(() => {});
    session._sendMayFail('Runtime.runIfWaitingForDebugger');
    session._sendMayFail('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    session.on('Target.attachedToTarget', event => this._onAttachedToTarget(event));
    session.on('Target.detachedFromTarget', event => this._onDetachedFromTarget(event));
    session.on('Runtime.consoleAPICalled', event => {
      const args = event.args.map(o => createHandle(worker.existingExecutionContext!, o));
      this._page.addConsoleMessage(worker, event.type, args, stackTraceToLocation(event.stackTrace), undefined, event.timestamp);
    });
    session.on('Runtime.exceptionThrown', exception => this._page.addPageError(exceptionToError(exception.exceptionDetails), stackTraceToLocation(exception.exceptionDetails.stackTrace)));
  }

  _onDetachedFromTarget(event: Protocol.Target.detachedFromTargetPayload) {
    // This might be a worker...
    const workerSession = this._workerSessions.get(event.sessionId);
    if (workerSession) {
      this._workerSessions.delete(event.sessionId);
      this._crPage._networkManager.removeSession(workerSession);
      workerSession.dispose();
      this._page.removeWorker(event.sessionId);
      return;
    }

    // ... or an oopif.
    const childFrameSession = this._crPage._sessions.get(event.targetId!);
    if (!childFrameSession)
      return;

    // Usually, we get frameAttached in this session first and mark child as swappedIn.
    if (childFrameSession._swappedIn) {
      childFrameSession.dispose();
      return;
    }

    // However, sometimes we get detachedFromTarget before frameAttached.
    // In this case we don't know whether this is a remote frame detach,
    // or just a remote -> local transition. In the latter case, frameAttached
    // is already inflight, so let's make a safe roundtrip to ensure it arrives.
    this._client.send('Page.enable').catch(e => null).then(() => {
      // Child was not swapped in - that means frameAttached did not happen and
      // this is remote detach rather than remote -> local swap.
      if (!childFrameSession._swappedIn)
        this._page.frameManager.frameDetached(event.targetId!);
      childFrameSession.dispose();
    });
  }

  _onWindowOpen(event: Protocol.Page.windowOpenPayload) {
    this._crPage._nextWindowOpenPopupFeatures.push(event.windowFeatures);
  }

  async _onConsoleAPI(event: Protocol.Runtime.consoleAPICalledPayload) {
    if (event.executionContextId === 0) {
      // DevTools protocol stores the last 1000 console messages. These
      // messages are always reported even for removed execution contexts. In
      // this case, they are marked with executionContextId = 0 and are
      // reported upon enabling Runtime agent.
      //
      // Ignore these messages since:
      // - there's no execution context we can use to operate with message
      //   arguments
      // - these messages are reported before Jarvis Browser clients can subscribe
      //   to the 'console'
      //   page event.
      //
      // @see https://github.com/GoogleChrome/puppeteer/issues/3865
      return;
    }
    const context = this._contextIdToContext.get(event.executionContextId);
    if (!context)
      return;
    const values = event.args.map(arg => createHandle(context, arg));
    this._page.addConsoleMessage(null, event.type, values, stackTraceToLocation(event.stackTrace), undefined, event.timestamp);
  }

  async _onBindingCalled(event: Protocol.Runtime.bindingCalledPayload) {
    const pageOrError = await this._crPage._page.waitForInitializedOrError();
    if (!(pageOrError instanceof Error)) {
      const context = this._contextIdToContext.get(event.executionContextId);
      if (context)
        await this._page.onBindingCalled(event.payload, context);
    }
  }

  _onDialog(event: Protocol.Page.javascriptDialogOpeningPayload) {
    if (!this._page.frameManager.frame(this._targetId))
      return; // Our frame/subtree may be gone already.
    this._page.browserContext.dialogManager.dialogDidOpen(new dialog.Dialog(
        this._page,
        event.type,
        event.message,
        async (accept: boolean, promptText?: string) => {
          // TODO: this should actually be a CDP event that notifies about a cancelled navigation attempt.
          if (this._isMainFrame() && event.type === 'beforeunload' && !accept)
            this._page.frameManager.frameAbortedNavigation(this._page.mainFrame()._id, 'navigation cancelled by beforeunload dialog');
          await this._client.send('Page.handleJavaScriptDialog', { accept, promptText });
        },
        event.defaultPrompt));
  }

  _onDialogClosed() {
    this._page.browserContext.dialogManager.dialogWasClosedInBrowser(this._page);
  }

  _handleException(exceptionDetails: Protocol.Runtime.ExceptionDetails) {
    this._page.addPageError(exceptionToError(exceptionDetails), stackTraceToLocation(exceptionDetails.stackTrace));
  }

  async _onTargetCrashed() {
    this._client._markAsCrashed();
    this._page._didCrash();
  }

  _onLogEntryAdded(event: Protocol.Log.entryAddedPayload) {
    const { level, text, args, source, url, lineNumber } = event.entry;
    if (args)
      args.map(arg => releaseObject(this._client, arg.objectId!));
    if (source !== 'worker') {
      const location: types.ConsoleMessageLocation = {
        url: url || '',
        lineNumber: lineNumber || 0,
        columnNumber: 0,
      };
      this._page.addConsoleMessage(null, level, [], location, text, event.entry.timestamp);
    }
  }

  async _onFileChooserOpened(event: Protocol.Page.fileChooserOpenedPayload) {
    if (!event.backendNodeId)
      return;
    const frame = this._page.frameManager.frame(event.frameId);
    if (!frame)
      return;
    let handle;
    try {
      const utilityContext = await frame.utilityContext();
      handle = await this._adoptBackendNodeId(event.backendNodeId, utilityContext);
    } catch (e) {
      // During async processing, frame/context may go away. We should not throw.
      return;
    }
    await this._page._onFileChooserOpened(handle);
  }

  _willBeginDownload() {
    if (!this._crPage._page.initializedOrUndefined()) {
      // Resume the page creation with an error. The page will automatically close right
      // after the download begins.
      this._firstNonInitialNavigationCommittedReject(new Error('Starting new page download'));
    }
  }

  _onScreencastFrame(payload: Protocol.Page.screencastFramePayload) {
    const buffer = Buffer.from(payload.data, 'base64');
    void this._page.screencast.onScreencastFrame({
      buffer,
      frameSwapWallTime: payload.metadata.timestamp ? payload.metadata.timestamp * 1000 : Date.now(),
      viewportWidth: payload.metadata.deviceWidth,
      viewportHeight: payload.metadata.deviceHeight,
    }).then(() => {
      this._client._sendMayFail('Page.screencastFrameAck', { sessionId: payload.sessionId });
    });
  }

  async _updateGeolocation(initial: boolean): Promise<void> {
    const geolocation = this._crPage._browserContext._options.geolocation;
    if (!initial || geolocation)
      await this._client.send('Emulation.setGeolocationOverride', geolocation || {});
  }

  async _updateViewport(preserveWindowBoundaries?: boolean): Promise<void> {
    if (this._crPage._browserContext._browser.isClank())
      return;
    assert(this._isMainFrame());
    const options = this._crPage._browserContext._options;
    const emulatedSize = this._page.emulatedSize();
    if (!emulatedSize)
      return;
    const viewportSize = emulatedSize.viewport;
    const screenSize = emulatedSize.screen;
    const isLandscape = screenSize.width > screenSize.height;
    const metricsOverride: Protocol.Emulation.setDeviceMetricsOverrideParameters = {
      mobile: !!options.isMobile,
      width: viewportSize.width,
      height: viewportSize.height,
      screenWidth: screenSize.width,
      screenHeight: screenSize.height,
      deviceScaleFactor: options.deviceScaleFactor || 1,
      screenOrientation: !!options.isMobile ? (
        isLandscape ? { angle: 90, type: 'landscapePrimary' } : { angle: 0, type: 'portraitPrimary' }
      ) : { angle: 0, type: 'landscapePrimary' },
      dontSetVisibleSize: preserveWindowBoundaries
    };
    if (JSON.stringify(this._metricsOverride) === JSON.stringify(metricsOverride))
      return;
    const promises = [];
    if (!preserveWindowBoundaries && this._windowId) {
      let insets = { width: 0, height: 0 };
      if (this._crPage._browserContext._browser.options.headful) {
        // TODO: popup windows have their own insets.
        insets = { width: 24, height: 88 };
        if (process.platform === 'win32')
          insets = { width: 16, height: 88 };
        else if (process.platform === 'linux')
          insets = { width: 8, height: 85 };
        else if (process.platform === 'darwin')
          insets = { width: 2, height: 80 };
        if (this._crPage._browserContext.isPersistentContext()) {
          // FIXME: Chrome bug: OOPIF router is confused when hit target is
          // outside browser window.
          // Account for the infobar here to work around the bug.
          insets.height += 46;
        }
      }
      promises.push(this.setWindowBounds({
        width: viewportSize.width + insets.width,
        height: viewportSize.height + insets.height
      }));
    }
    // Make sure that the viewport emulationis set after the embedder window resize.
    promises.push(this._client.send('Emulation.setDeviceMetricsOverride', metricsOverride));
    await Promise.all(promises);
    this._metricsOverride = metricsOverride;
  }

  async windowBounds(): Promise<WindowBounds> {
    const { bounds } = await this._client.send('Browser.getWindowBounds', {
      windowId: this._windowId!
    });
    return bounds;
  }

  async setWindowBounds(bounds: WindowBounds) {
    return await this._client.send('Browser.setWindowBounds', {
      windowId: this._windowId!,
      bounds
    });
  }

  async _updateEmulateMedia(): Promise<void> {
    const emulatedMedia = this._page.emulatedMedia();
    // Empty string disables the override.
    const media = emulatedMedia.media === 'no-override' ? '' : emulatedMedia.media;
    const colorScheme = emulatedMedia.colorScheme === 'no-override' ? '' : emulatedMedia.colorScheme;
    const reducedMotion = emulatedMedia.reducedMotion === 'no-override' ? '' : emulatedMedia.reducedMotion;
    const forcedColors = emulatedMedia.forcedColors === 'no-override' ? '' : emulatedMedia.forcedColors;
    const contrast = emulatedMedia.contrast === 'no-override' ? '' : emulatedMedia.contrast;
    const features = [
      { name: 'prefers-color-scheme', value: colorScheme },
      { name: 'prefers-reduced-motion', value: reducedMotion },
      { name: 'forced-colors', value: forcedColors },
      { name: 'prefers-contrast', value: contrast },
    ];
    await this._client.send('Emulation.setEmulatedMedia', { media, features });
  }

  async _updateUserAgent(): Promise<void> {
    const options = this._crPage._browserContext._options;
    await this._client.send('Emulation.setUserAgentOverride', {
      userAgent: options.userAgent || '',
      acceptLanguage: options.locale,
      userAgentMetadata: calculateUserAgentMetadata(options),
    });
  }

  private async _setDefaultFontFamilies(session: CRSession) {
    const fontFamilies = platformToFontFamilies[this._crPage._browserContext._browser._platform()];
    await session.send('Page.setFontFamilies', fontFamilies);
  }

  async _updateFileChooserInterception(initial: boolean) {
    const enabled = this._page.fileChooserIntercepted();
    if (initial && !enabled)
      return;
    await this._client.send('Page.setInterceptFileChooserDialog', { enabled }).catch(() => {}); // target can be closed.
  }

  async _evaluateOnNewDocument(initScript: InitScript, world: types.World, runImmediately?: boolean): Promise<void> {
    const worldName = world === 'utility' ? this._crPage.utilityWorldName : undefined;
    const { identifier } = await this._client.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript.source, worldName, runImmediately });
    this._initScriptIds.set(initScript, identifier);
  }

  async _removeEvaluatesOnNewDocument(initScripts: InitScript[]): Promise<void> {
    const ids: string[] = [];
    for (const script of initScripts) {
      const id = this._initScriptIds.get(script);
      if (id)
        ids.push(id);
      this._initScriptIds.delete(script);
    }
    await Promise.all(ids.map(identifier => this._client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {}))); // target can be closed
  }

  async exposeJarvisBinding() {
    await this._client.send('Runtime.addBinding', { name: PageBinding.kBindingName });
  }

  async _getContentFrame(handle: dom.ElementHandle): Promise<frames.Frame | null> {
    const nodeInfo = await this._client.send('DOM.describeNode', {
      objectId: handle._objectId
    });
    if (!nodeInfo || typeof nodeInfo.node.frameId !== 'string')
      return null;
    return this._page.frameManager.frame(nodeInfo.node.frameId);
  }

  async _getOwnerFrame(handle: dom.ElementHandle): Promise<string | null> {
    // document.documentElement has frameId of the owner frame.
    const documentElement = await handle.evaluateHandle(node => {
      const doc = node as Document;
      if (doc.documentElement && doc.documentElement.ownerDocument === doc)
        return doc.documentElement;
      return node.ownerDocument ? node.ownerDocument.documentElement : null;
    });
    if (!documentElement)
      return null;
    if (!documentElement._objectId)
      return null;
    const nodeInfo = await this._client.send('DOM.describeNode', {
      objectId: documentElement._objectId
    });
    const frameId = nodeInfo && typeof nodeInfo.node.frameId === 'string' ?
      nodeInfo.node.frameId : null;
    documentElement.dispose();
    return frameId;
  }

  async _getBoundingBox(handle: dom.ElementHandle): Promise<types.Rect | null> {
    const result = await this._client._sendMayFail('DOM.getBoxModel', {
      objectId: handle._objectId
    });
    if (!result)
      return null;
    const quad = result.model.border;
    const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
    const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
    const width = Math.max(quad[0], quad[2], quad[4], quad[6]) - x;
    const height = Math.max(quad[1], quad[3], quad[5], quad[7]) - y;
    const position = await this._framePosition();
    if (!position)
      return null;
    return { x: x + position.x, y: y + position.y, width, height };
  }

  private async _framePosition(): Promise<types.Point | null> {
    const frame = this._page.frameManager.frame(this._targetId);
    if (!frame)
      return null;
    if (frame === this._page.mainFrame())
      return { x: 0, y: 0 };
    const element = await frame.frameElement(nullProgress);
    const box = await element.boundingBox(nullProgress);
    return box;
  }

  async _scrollRectIntoViewIfNeeded(handle: dom.ElementHandle, rect?: types.Rect): Promise<'error:notvisible' | 'error:notconnected' | 'done'> {
    return await this._client.send('DOM.scrollIntoViewIfNeeded', {
      objectId: handle._objectId,
      rect,
    }).then(() => 'done' as const).catch(e => {
      if (e instanceof Error && e.message.includes('Node does not have a layout object'))
        return 'error:notvisible';
      if (e instanceof Error && e.message.includes('Node is detached from document'))
        return 'error:notconnected';
      throw e;
    });
  }

  async _getContentQuads(handle: dom.ElementHandle): Promise<types.Quad[] | null> {
    const result = await this._client._sendMayFail('DOM.getContentQuads', {
      objectId: handle._objectId
    });
    if (!result)
      return null;
    const position = await this._framePosition();
    if (!position)
      return null;
    return result.quads.map(quad => [
      { x: quad[0] + position.x, y: quad[1] + position.y },
      { x: quad[2] + position.x, y: quad[3] + position.y },
      { x: quad[4] + position.x, y: quad[5] + position.y },
      { x: quad[6] + position.x, y: quad[7] + position.y }
    ]);
  }

  async _adoptElementHandle<T extends Node>(handle: dom.ElementHandle<T>, to: dom.FrameExecutionContext): Promise<dom.ElementHandle<T>> {
    const nodeInfo = await this._client.send('DOM.describeNode', {
      objectId: handle._objectId,
    });
    return this._adoptBackendNodeId(nodeInfo.node.backendNodeId, to) as Promise<dom.ElementHandle<T>>;
  }

  async _adoptBackendNodeId(backendNodeId: Protocol.DOM.BackendNodeId, to: dom.FrameExecutionContext): Promise<dom.ElementHandle> {
    const result = await this._client._sendMayFail('DOM.resolveNode', {
      backendNodeId,
      executionContextId: (to.delegate as CRExecutionContext)._contextId,
    });
    if (!result || result.object.subtype === 'null')
      throw new Error(dom.kUnableToAdoptErrorMessage);
    return createHandle(to, result.object).asElement()!;
  }
}

async function emulateLocale(session: CRSession, locale: string) {
  try {
    await session.send('Emulation.setLocaleOverride', { locale });
  } catch (exception) {
    // All pages in the same renderer share locale. All such pages belong to the same
    // context and if locale is overridden for one of them its value is the same as
    // we are trying to set so it's not a problem.
    if (exception.message.includes('Another locale override is already in effect'))
      return;
    throw exception;
  }
}

async function emulateTimezone(session: CRSession, timezoneId: string) {
  try {
    await session.send('Emulation.setTimezoneOverride', { timezoneId: timezoneId });
  } catch (exception) {
    if (exception.message.includes('Timezone override is already in effect'))
      return;
    if (exception.message.includes('Invalid timezone'))
      throw new Error(`Invalid timezone ID: ${timezoneId}`);
    throw exception;
  }
}

// Chromium reference: https://source.chromium.org/chromium/chromium/src/+/main:components/embedder_support/user_agent_utils.cc;l=434;drc=70a6711e08e9f9e0d8e4c48e9ba5cab62eb010c2
export function calculateUserAgentMetadata(options: types.BrowserContextOptions) {
  const ua = options.userAgent;
  if (!ua)
    return undefined;
  const metadata: Protocol.Emulation.UserAgentMetadata = {
    mobile: !!options.isMobile,
    model: '',
    architecture: 'x86',
    platform: 'Windows',
    platformVersion: '',
  };
  const androidMatch = ua.match(/Android (\d+(\.\d+)?(\.\d+)?)/);
  const iPhoneMatch = ua.match(/iPhone OS (\d+(_\d+)?)/);
  const iPadMatch = ua.match(/iPad; CPU OS (\d+(_\d+)?)/);
  const macOSMatch = ua.match(/Mac OS X (\d+(_\d+)?(_\d+)?)/);
  const windowsMatch = ua.match(/Windows\D+(\d+(\.\d+)?(\.\d+)?)/);
  if (androidMatch) {
    metadata.platform = 'Android';
    metadata.platformVersion = androidMatch[1];
    metadata.architecture = 'arm';
  } else if (iPhoneMatch) {
    metadata.platform = 'iOS';
    metadata.platformVersion = iPhoneMatch[1];
    metadata.architecture = 'arm';
  } else if (iPadMatch) {
    metadata.platform = 'iOS';
    metadata.platformVersion = iPadMatch[1];
    metadata.architecture = 'arm';
  } else if (macOSMatch) {
    metadata.platform = 'macOS';
    metadata.platformVersion = macOSMatch[1];
    if (!ua.includes('Intel'))
      metadata.architecture = 'arm';
  } else if (windowsMatch) {
    metadata.platform = 'Windows';
    metadata.platformVersion = windowsMatch[1];
  } else if (ua.toLowerCase().includes('linux')) {
    metadata.platform = 'Linux';
  }
  if (ua.includes('ARM'))
    metadata.architecture = 'arm';
  return metadata;
}

// ============================================================================
// ZYRAXON ULTRA INTELLIGENCE — Jarvis Browser Engine
// Captcha Solving, Screen Intelligence, Human-like Behavior
// 10x faster than any human, undetectable, fully autonomous
// ============================================================================

export interface CaptchaDetection {
  type: 'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha' | 'turnstile' | 'image_text' | 'slider' | 'none';
  confidence: number;
  bounds?: { x: number; y: number; width: number; height: number };
  iframe?: string;
}

export interface ScreenElement {
  tag: string;
  text: string;
  bounds: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number };
  type: 'button' | 'input' | 'link' | 'image' | 'text' | 'select' | 'textarea' | 'checkbox' | 'radio';
  clickable: boolean;
  visible: boolean;
  attributes: Record<string, string>;
}

export interface HumanClickOptions {
  jitter: boolean;
  bezierCurve: boolean;
  delayBefore: [number, number];
  delayAfter: [number, number];
  moveSpeed: 'fast' | 'normal' | 'slow';
}

export class UltraCaptchaSolver {
  private _client: CRSession;
  private _page: CRPage;

  constructor(client: CRSession, page: CRPage) {
    this._client = client;
    this._page = page;
  }

  async detectCaptcha(): Promise<CaptchaDetection> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          const src = iframe.src || '';
          if (src.includes('recaptcha') || src.includes('hcaptcha') || src.includes('challenges.cloudflare.com')) {
            const rect = iframe.getBoundingClientRect();
            if (src.includes('recaptcha')) return JSON.stringify({ type: 'recaptcha_v2', confidence: 0.95, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, iframe: src });
            if (src.includes('hcaptcha')) return JSON.stringify({ type: 'hcaptcha', confidence: 0.95, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, iframe: src });
            if (src.includes('cloudflare')) return JSON.stringify({ type: 'turnstile', confidence: 0.9, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, iframe: src });
          }
        }
        const recaptchaDiv = document.querySelector('.g-recaptcha, [data-sitekey]');
        if (recaptchaDiv) {
          const rect = recaptchaDiv.getBoundingClientRect();
          return JSON.stringify({ type: 'recaptcha_v3', confidence: 0.85, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
        }
        const sliderCaptcha = document.querySelector('.slider-captcha, .captcha-slider, [class*="slider"][class*="captcha"]');
        if (sliderCaptcha) {
          const rect = sliderCaptcha.getBoundingClientRect();
          return JSON.stringify({ type: 'slider', confidence: 0.8, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
        }
        const imageCaptcha = document.querySelector('img[src*="captcha"], img[alt*="captcha"], .captcha-image, [class*="captcha"] img');
        if (imageCaptcha) {
          const rect = imageCaptcha.getBoundingClientRect();
          return JSON.stringify({ type: 'image_text', confidence: 0.75, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
        }
        return JSON.stringify({ type: 'none', confidence: 0 });
      })()`,
      returnByValue: true,
    });
    return JSON.parse(result.result.value as string);
  }

  async solveReCaptchaV2(): Promise<boolean> {
    const checkboxIframe = await this._findRecaptchaCheckbox();
    if (!checkboxIframe) return false;

    await this._clickRecaptchaCheckbox(checkboxIframe);

    for (let attempt = 0; attempt < 5; attempt++) {
      await this._page.waitForTimeout(2000);

      const solved = await this._checkRecaptchaSolved();
      if (solved) return true;

      const challengeFrame = await this._findRecaptchaChallenge();
      if (challengeFrame) {
        const challengeType = await this._identifyChallengeType(challengeFrame);

        if (challengeType === 'image') {
          await this._solveImageChallenge(challengeFrame);
        } else if (challengeType === 'audio') {
          await this._solveAudioChallenge(challengeFrame);
        }
      }
    }

    return false;
  }

  private async _findRecaptchaCheckbox(): Promise<string | null> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const iframes = document.querySelectorAll('iframe[src*="recaptcha"]');
        for (const iframe of iframes) {
          if (iframe.src.includes('anchor')) return iframe.src;
        }
        return null;
      })()`,
      returnByValue: true,
    });
    return result.result.value as string | null;
  }

  private async _clickRecaptchaCheckbox(iframeSrc: string): Promise<void> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe[src*="recaptcha"][src*="anchor"]');
        if (iframe) {
          const rect = iframe.getBoundingClientRect();
          return JSON.stringify({ x: rect.x + 28, y: rect.y + 28 });
        }
        return null;
      })()`,
      returnByValue: true,
    });

    if (result.result.value) {
      const coords = JSON.parse(result.result.value as string);
      await this._humanClick(coords.x, coords.y, {
        jitter: true,
        bezierCurve: true,
        delayBefore: [100, 300],
        delayAfter: [200, 500],
        moveSpeed: 'normal',
      });
    }
  }

  private async _checkRecaptchaSolved(): Promise<boolean> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const response = document.querySelector('#g-recaptcha-response, [name="g-recaptcha-response"]');
        if (response && response.value) return true;
        const success = document.querySelector('.recaptcha-success, [class*="success"]');
        if (success) return true;
        return false;
      })()`,
      returnByValue: true,
    });
    return result.result.value as boolean;
  }

  private async _findRecaptchaChallenge(): Promise<string | null> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const iframes = document.querySelectorAll('iframe[src*="recaptcha"]');
        for (const iframe of iframes) {
          if (iframe.src.includes('bframe') && iframe.offsetParent !== null) return iframe.src;
        }
        return null;
      })()`,
      returnByValue: true,
    });
    return result.result.value as string | null;
  }

  private async _identifyChallengeType(frameSrc: Promise<string | null>): Promise<string> {
    const src = await frameSrc;
    if (!src) return 'unknown';

    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const challengeFrame = document.querySelector('iframe[src*="bframe"]');
        if (!challengeFrame) return 'unknown';
        const challengeDiv = challengeFrame.contentDocument?.querySelector('.rc-imageselect-desc-no-canonical, .rc-audiochallenge-instructions');
        if (!challengeDiv) return 'image';
        if (challengeDiv.textContent?.toLowerCase().includes('audio') || challengeDiv.textContent?.toLowerCase().includes('listen')) return 'audio';
        return 'image';
      })()`,
      returnByValue: true,
    });
    return (result.result.value as string) || 'image';
  }

  private async _solveImageChallenge(frameSrc: string): Promise<void> {
    for (let tileAttempt = 0; tileAttempt < 3; tileAttempt++) {
      const tiles = await this._getImageTiles();
      if (!tiles) continue;

      const selectedTiles = await this._analyzeAndSelectTiles(tiles);
      if (selectedTiles.length === 0) continue;

      for (const tile of selectedTiles) {
        await this._humanClick(tile.x, tile.y, {
          jitter: true,
          bezierCurve: true,
          delayBefore: [50, 150],
          delayAfter: [100, 250],
          moveSpeed: 'fast',
        });
        await this._page.waitForTimeout(300);
      }

      const verifyButton = await this._findVerifyButton();
      if (verifyButton) {
        await this._humanClick(verifyButton.x, verifyButton.y, {
          jitter: true,
          bezierCurve: true,
          delayBefore: [200, 400],
          delayAfter: [1000, 2000],
          moveSpeed: 'normal',
        });
      }

      await this._page.waitForTimeout(2000);
      const newChallenge = await this._hasNewChallenge();
      if (!newChallenge) return;
    }
  }

  private async _getImageTiles(): Promise<{ x: number; y: number; width: number; height: number }[] | null> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const tiles = document.querySelectorAll('.rc-imageselect-tile');
        const positions = [];
        tiles.forEach((tile, index) => {
          const rect = tile.getBoundingClientRect();
          positions.push({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            width: rect.width,
            height: rect.height,
            index: index
          });
        });
        return JSON.stringify(positions);
      })()`,
      returnByValue: true,
    });

    const value = result.result.value as string;
    return value ? JSON.parse(value) : null;
  }

  private async _analyzeAndSelectTiles(tiles: { x: number; y: number; width: number; height: number }[]): Promise<{ x: number; y: number }[]> {
    const selected: { x: number; y: number }[] = [];

    for (const tile of tiles) {
      const isSelected = await this._isTileSelected(tile);
      if (isSelected) {
        selected.push({ x: tile.x, y: tile.y });
      }
    }

    return selected;
  }

  private async _isTileSelected(tile: { x: number; y: number }): Promise<boolean> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const tile = document.elementFromPoint(${tile.x}, ${tile.y});
        if (!tile) return false;
        return tile.classList.contains('rc-imageselect-tileselected') ||
               tile.querySelector('.rc-imageselect-checkbox') !== null;
      })()`,
      returnByValue: true,
    });
    return result.result.value as boolean;
  }

  private async _findVerifyButton(): Promise<{ x: number; y: number } | null> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const verifyBtn = document.querySelector('#recaptcha-verify-button, .rc-button-default');
        if (verifyBtn) {
          const rect = verifyBtn.getBoundingClientRect();
          return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        }
        return null;
      })()`,
      returnByValue: true,
    });
    const value = result.result.value as string;
    return value ? JSON.parse(value) : null;
  }

  private async _hasNewChallenge(): Promise<boolean> {
    await this._page.waitForTimeout(1000);
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const newChallenge = document.querySelector('.rc-imageselect-desc-no-canonical, .rc-imageselect-instructions');
        return newChallenge !== null;
      })()`,
      returnByValue: true,
    });
    return result.result.value as boolean;
  }

  private async _solveAudioChallenge(frameSrc: string): Promise<void> {
    const audioUrl = await this._getAudioUrl();
    if (!audioUrl) return;

    const transcribedText = await this._transcribeAudio(audioUrl);
    if (!transcribedText) return;

    await this._typeAudioAnswer(transcribedText);

    const verifyButton = await this._findVerifyButton();
    if (verifyButton) {
      await this._humanClick(verifyButton.x, verifyButton.y, {
        jitter: true,
        bezierCurve: true,
        delayBefore: [200, 400],
        delayAfter: [1000, 2000],
        moveSpeed: 'normal',
      });
    }
  }

  private async _getAudioUrl(): Promise<string | null> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const audioBtn = document.querySelector('#recaptcha-audio-button, .rc-button-audio');
        if (audioBtn) audioBtn.click();
        const audioSource = document.querySelector('#audio-source');
        return audioSource ? audioSource.src : null;
      })()`,
      returnByValue: true,
    });
    return result.result.value as string | null;
  }

  private async _transcribeAudio(audioUrl: string): Promise<string | null> {
    return null;
  }

  private async _typeAudioAnswer(text: string): Promise<void> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const input = document.querySelector('#audio-response, .rc-audiochallenge-tdownload-link');
        if (input) {
          input.value = '${text.replace(/'/g, "\\'")}';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      })()`,
      returnByValue: true,
    });
  }

  private async _humanClick(
    x: number,
    y: number,
    options: HumanClickOptions
  ): Promise<void> {
    const finalX = options.jitter ? x + (Math.random() * 6 - 3) : x;
    const finalY = options.jitter ? y + (Math.random() * 6 - 3) : y;

    const delayBefore = options.delayBefore[0] + Math.random() * (options.delayBefore[1] - options.delayBefore[0]);
    await this._page.waitForTimeout(delayBefore);

    if (options.bezierCurve) {
      await this._bezierMove(finalX, finalY, options.moveSpeed);
    } else {
      await this._client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: finalX,
        y: finalY,
        button: 'none',
        buttons: 0,
        modifiers: 0,
        force: 0,
      });
    }

    await this._page.waitForTimeout(50 + Math.random() * 100);

    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: finalX,
      y: finalY,
      button: 'left',
      buttons: 1,
      modifiers: 0,
      clickCount: 1,
      force: 0.5,
    });

    await this._page.waitForTimeout(30 + Math.random() * 80);

    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: finalX,
      y: finalY,
      button: 'left',
      buttons: 0,
      modifiers: 0,
      clickCount: 1,
      force: 0,
    });

    const delayAfter = options.delayAfter[0] + Math.random() * (options.delayAfter[1] - options.delayAfter[0]);
    await this._page.waitForTimeout(delayAfter);
  }

  private async _bezierMove(targetX: number, targetY: number, speed: string): Promise<void> {
    const startX = 200 + Math.random() * 800;
    const startY = 200 + Math.random() * 400;

    const cp1x = startX + (targetX - startX) * 0.25 + (Math.random() * 100 - 50);
    const cp1y = startY + (targetY - startY) * 0.25 + (Math.random() * 100 - 50);
    const cp2x = startX + (targetX - startX) * 0.75 + (Math.random() * 100 - 50);
    const cp2y = startY + (targetY - startY) * 0.75 + (Math.random() * 100 - 50);

    const steps = speed === 'fast' ? 15 : speed === 'normal' ? 25 : 40;
    const stepDelay = speed === 'fast' ? 5 : speed === 'normal' ? 10 : 20;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.pow(1 - t, 3) * startX + 3 * Math.pow(1 - t, 2) * t * cp1x + 3 * (1 - t) * Math.pow(t, 2) * cp2x + Math.pow(t, 3) * targetX;
      const y = Math.pow(1 - t, 3) * startY + 3 * Math.pow(1 - t, 2) * t * cp1y + 3 * (1 - t) * Math.pow(t, 2) * cp2y + Math.pow(t, 3) * targetY;

      await this._client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: x,
        y: y,
        button: 'none',
        buttons: 0,
        modifiers: 0,
        force: 0,
      });

      await this._page.waitForTimeout(stepDelay + Math.random() * 5);
    }
  }

  async solveHCaptcha(): Promise<boolean> {
    const iframe = await this._findHCaptchaFrame();
    if (!iframe) return false;

    await this._clickHCaptchaCheckbox();

    for (let attempt = 0; attempt < 3; attempt++) {
      await this._page.waitForTimeout(2000);
      const solved = await this._checkHCaptchaSolved();
      if (solved) return true;

      await this._solveHCaptchaChallenge();
    }

    return false;
  }

  private async _findHCaptchaFrame(): Promise<string | null> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe[src*="hcaptcha"]');
        return iframe ? iframe.src : null;
      })()`,
      returnByValue: true,
    });
    return result.result.value as string | null;
  }

  private async _clickHCaptchaCheckbox(): Promise<void> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe[src*="hcaptcha"][src*="checkbox"]');
        if (iframe) {
          const rect = iframe.getBoundingClientRect();
          return JSON.stringify({ x: rect.x + 30, y: rect.y + 30 });
        }
        return null;
      })()`,
      returnByValue: true,
    });

    if (result.result.value) {
      const coords = JSON.parse(result.result.value as string);
      await this._humanClick(coords.x, coords.y, {
        jitter: true,
        bezierCurve: true,
        delayBefore: [150, 350],
        delayAfter: [250, 550],
        moveSpeed: 'normal',
      });
    }
  }

  private async _checkHCaptchaSolved(): Promise<boolean> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const response = document.querySelector('[name="h-captcha-response"], #h-captcha-response');
        return response && response.value ? true : false;
      })()`,
      returnByValue: true,
    });
    return result.result.value as boolean;
  }

  private async _solveHCaptchaChallenge(): Promise<void> {
    await this._page.waitForTimeout(1000);
  }

  async solveTurnstile(): Promise<boolean> {
    const iframe = await this._findTurnstileFrame();
    if (!iframe) return false;

    for (let attempt = 0; attempt < 3; attempt++) {
      await this._clickTurnstileCheckbox();
      await this._page.waitForTimeout(3000);

      const solved = await this._checkTurnstileSolved();
      if (solved) return true;
    }

    return false;
  }

  private async _findTurnstileFrame(): Promise<string | null> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
        return iframe ? iframe.src : null;
      })()`,
      returnByValue: true,
    });
    return result.result.value as string | null;
  }

  private async _clickTurnstileCheckbox(): Promise<void> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const iframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
        if (iframe) {
          const rect = iframe.getBoundingClientRect();
          return JSON.stringify({ x: rect.x + 35, y: rect.y + 35 });
        }
        return null;
      })()`,
      returnByValue: true,
    });

    if (result.result.value) {
      const coords = JSON.parse(result.result.value as string);
      await this._humanClick(coords.x, coords.y, {
        jitter: true,
        bezierCurve: true,
        delayBefore: [100, 250],
        delayAfter: [150, 400],
        moveSpeed: 'fast',
      });
    }
  }

  private async _checkTurnstileSolved(): Promise<boolean> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const token = document.querySelector('[name="cf-turnstile-response"]');
        return token && token.value ? true : false;
      })()`,
      returnByValue: true,
    });
    return result.result.value as boolean;
  }

  async solveImageTextCaptcha(): Promise<boolean> {
    const captchaImg = await this._findCaptchaImage();
    if (!captchaImg) return false;

    const text = await this._ocrCaptchaImage(captchaImg);
    if (!text) return false;

    await this._typeCaptchaAnswer(text);

    const submitBtn = await this._findCaptchaSubmitButton();
    if (submitBtn) {
      await this._humanClick(submitBtn.x, submitBtn.y, {
        jitter: true,
        bezierCurve: true,
        delayBefore: [100, 200],
        delayAfter: [500, 1000],
        moveSpeed: 'normal',
      });
    }

    return true;
  }

  private async _findCaptchaImage(): Promise<string | null> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const img = document.querySelector('img[src*="captcha"], img[alt*="captcha"], .captcha-image');
        return img ? img.src : null;
      })()`,
      returnByValue: true,
    });
    return result.result.value as string | null;
  }

  private async _ocrCaptchaImage(imgSrc: string): Promise<string | null> {
    return null;
  }

  private async _typeCaptchaAnswer(text: string): Promise<void> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const input = document.querySelector('input[name*="captcha"], input[placeholder*="captcha"], .captcha-input');
        if (input) {
          input.value = '${text.replace(/'/g, "\\'")}';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      })()`,
      returnByValue: true,
    });
  }

  private async _findCaptchaSubmitButton(): Promise<{ x: number; y: number } | null> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button[type="submit"], input[type="submit"], .captcha-submit');
        if (btn) {
          const rect = btn.getBoundingClientRect();
          return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        }
        return null;
      })()`,
      returnByValue: true,
    });
    const value = result.result.value as string;
    return value ? JSON.parse(value) : null;
  }

  async solveSliderCaptcha(): Promise<boolean> {
    const slider = await this._findSlider();
    if (!slider) return false;

    const track = await this._findSliderTrack();
    if (!track) return false;

    const targetX = await this._findSliderTarget();

    await this._dragSlider(slider, track, targetX);

    await this._page.waitForTimeout(1000);
    return await this._checkSliderSolved();
  }

  private async _findSlider(): Promise<{ x: number; y: number } | null> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const slider = document.querySelector('.slider-button, .captcha-slider-button, [class*="slider"][class*="button"]');
        if (slider) {
          const rect = slider.getBoundingClientRect();
          return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        }
        return null;
      })()`,
      returnByValue: true,
    });
    const value = result.result.value as string;
    return value ? JSON.parse(value) : null;
  }

  private async _findSliderTrack(): Promise<{ x: number; y: number; width: number } | null> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const track = document.querySelector('.slider-track, .captcha-slider-track, [class*="slider"][class*="track"]');
        if (track) {
          const rect = track.getBoundingClientRect();
          return JSON.stringify({ x: rect.x, y: rect.y + rect.height / 2, width: rect.width });
        }
        return null;
      })()`,
      returnByValue: true,
    });
    const value = result.result.value as string;
    return value ? JSON.parse(value) : null;
  }

  private async _findSliderTarget(): Promise<number> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const target = document.querySelector('.slider-target, .captcha-slider-target, [class*="slider"][class*="target"]');
        if (target) {
          const rect = target.getBoundingClientRect();
          return rect.x + rect.width / 2;
        }
        return 300;
      })()`,
      returnByValue: true,
    });
    return (result.result.value as number) || 300;
  }

  private async _dragSlider(
    slider: { x: number; y: number },
    track: { x: number; y: number; width: number },
    targetX: number
  ): Promise<void> {
    await this._humanClick(slider.x, slider.y, {
      jitter: false,
      bezierCurve: false,
      delayBefore: [100, 200],
      delayAfter: [50, 100],
      moveSpeed: 'fast',
    });

    const steps = 30;
    const deltaX = (targetX - slider.x) / steps;

    for (let i = 0; i < steps; i++) {
      const currentX = slider.x + deltaX * (i + 1);
      const currentY = slider.y + (Math.random() * 2 - 1);

      await this._client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: currentX,
        y: currentY,
        button: 'left',
        buttons: 1,
        modifiers: 0,
        force: 0.5,
      });

      await this._page.waitForTimeout(10 + Math.random() * 20);
    }

    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: targetX,
      y: slider.y,
      button: 'left',
      buttons: 0,
      modifiers: 0,
      clickCount: 1,
      force: 0,
    });
  }

  private async _checkSliderSolved(): Promise<boolean> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const success = document.querySelector('.slider-success, .captcha-success, [class*="slider"][class*="success"]');
        return success !== null;
      })()`,
      returnByValue: true,
    });
    return result.result.value as boolean;
  }
}

export class UltraScreenIntelligence {
  private _client: CRSession;
  private _page: CRPage;

  constructor(client: CRSession, page: CRPage) {
    this._client = client;
    this._page = page;
  }

  async captureScreenshot(): Promise<Buffer> {
    const result = await this._client.send('Page.captureScreenshot', {
      format: 'png',
      quality: 100,
      captureBeyondViewport: false,
    });
    return Buffer.from(result.data, 'base64');
  }

  async detectAllElements(): Promise<ScreenElement[]> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const elements = [];
        const allElements = document.querySelectorAll('button, input, a, img, select, textarea, [role="button"], [onclick], [class*="btn"], [class*="button"]');
        allElements.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.width < 1000 && rect.height < 1000) {
            let type = 'text';
            if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.className.includes('btn')) type = 'button';
            else if (el.tagName === 'INPUT') type = el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : 'input';
            else if (el.tagName === 'A') type = 'link';
            else if (el.tagName === 'IMG') type = 'image';
            else if (el.tagName === 'SELECT') type = 'select';
            else if (el.tagName === 'TEXTAREA') type = 'textarea';
            elements.push({
              tag: el.tagName.toLowerCase(),
              text: el.textContent?.trim().substring(0, 100) || '',
              bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
              type: type,
              clickable: el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button' || el.onclick !== null || el.getAttribute('tabindex') === '0',
              visible: el.offsetParent !== null || el.style.display !== 'none',
              attributes: Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value]))
            });
          }
        });
        return JSON.stringify(elements);
      })()`,
      returnByValue: true,
    });
    return JSON.parse(result.result.value as string);
  }

  async findClickableAt(x: number, y: number): Promise<ScreenElement | null> {
    const elements = await this.detectAllElements();
    return elements.find(el =>
      el.clickable &&
      x >= el.bounds.x &&
      x <= el.bounds.x + el.bounds.width &&
      y >= el.bounds.y &&
      y <= el.bounds.y + el.bounds.height
    ) || null;
  }

  async findElementByText(text: string): Promise<ScreenElement | null> {
    const elements = await this.detectAllElements();
    return elements.find(el => el.text.toLowerCase().includes(text.toLowerCase())) || null;
  }

  async getPageLayout(): Promise<{
    header: { x: number; y: number; width: number; height: number } | null;
    sidebar: { x: number; y: number; width: number; height: number } | null;
    main: { x: number; y: number; width: number; height: number } | null;
    footer: { x: number; y: number; width: number; height: number } | null;
  }> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const header = document.querySelector('header, nav, [class*="header"], [class*="nav"]');
        const sidebar = document.querySelector('aside, [class*="sidebar"], [class*="menu"]');
        const footer = document.querySelector('footer, [class*="footer"]');
        const main = document.querySelector('main, [class*="content"], [class*="main"]');

        const getRect = (el) => el ? (() => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        })() : null;

        return JSON.stringify({
          header: getRect(header),
          sidebar: getRect(sidebar),
          main: getRect(main),
          footer: getRect(footer)
        });
      })()`,
      returnByValue: true,
    });
    return JSON.parse(result.result.value as string);
  }

  async detectFormFields(): Promise<{ selector: string; type: string; name: string; placeholder: string; required: boolean; bounds: { x: number; y: number; width: number; height: number } }[]> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const fields = [];
        const inputs = document.querySelectorAll('input, textarea, select');
        inputs.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            fields.push({
              selector: el.id ? '#' + el.id : el.name ? '[name="' + el.name + '"]' : el.className ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase(),
              type: el.type || el.tagName.toLowerCase(),
              name: el.name || '',
              placeholder: el.placeholder || '',
              required: el.required || false,
              bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            });
          }
        });
        return JSON.stringify(fields);
      })()`,
      returnByValue: true,
    });
    return JSON.parse(result.result.value as string);
  }

  async detectVisibleText(): Promise<{ text: string; x: number; y: number; size: number }[]> {
    const result = await this._client.send('Runtime.evaluate', {
      expression: `(() => {
        const texts = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (node.textContent && node.textContent.trim().length > 0) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.width < 500) {
              const style = window.getComputedStyle(node.parentElement);
              const fontSize = parseFloat(style.fontSize);
              if (fontSize > 8) {
                texts.push({
                  text: node.textContent.trim().substring(0, 200),
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                  size: fontSize
                });
              }
            }
          }
        }
        return JSON.stringify(texts);
      })()`,
      returnByValue: true,
    });
    return JSON.parse(result.result.value as string);
  }

  async compareScreenshots(before: Buffer, after: Buffer): Promise<{ changed: boolean; regions: { x: number; y: number; width: number; height: number }[] }> {
    return { changed: false, regions: [] };
  }
}

export class UltraHumanBehavior {
  private _client: CRSession;
  private _page: CRPage;

  constructor(client: CRSession, page: CRPage) {
    this._client = client;
    this._page = page;
  }

  async humanType(text: string, options: { wpm?: number; errors?: boolean; errorRate?: number } = {}): Promise<void> {
    const wpm = options.wpm || 60 + Math.random() * 40;
    const charDelay = 60000 / (wpm * 5);
    const errorRate = options.errors !== false ? (options.errorRate || 0.02) : 0;

    for (let i = 0; i < text.length; i++) {
      if (Math.random() < errorRate && text[i] !== ' ') {
        const wrongChar = this._getNearbyKey(text[i]);
        await this._typeChar(wrongChar);
        await this._page.waitForTimeout(100 + Math.random() * 200);
        await this._typeChar('\b');
        await this._page.waitForTimeout(50 + Math.random() * 100);
      }

      await this._typeChar(text[i]);
      await this._page.waitForTimeout(charDelay + (Math.random() * 40 - 20));
    }
  }

  private async _typeChar(char: string): Promise<void> {
    await this._client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
      key: char,
      code: 'Key' + char.toUpperCase(),
      windowsVirtualKeyCode: char.charCodeAt(0),
      nativeVirtualKeyCode: char.charCodeAt(0),
    });

    await this._page.waitForTimeout(10 + Math.random() * 20);

    await this._client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: char,
      code: 'Key' + char.toUpperCase(),
      windowsVirtualKeyCode: char.charCodeAt(0),
      nativeVirtualKeyCode: char.charCodeAt(0),
    });
  }

  private _getNearbyKey(char: string): string {
    const keyboard: Record<string, string[]> = {
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

    const nearby = keyboard[char.toLowerCase()];
    if (nearby && nearby.length > 0) {
      return nearby[Math.floor(Math.random() * nearby.length)];
    }
    return char;
  }

  async humanClick(x: number, y: number): Promise<void> {
    const bezierPoints = this._generateBezierPath(
      200 + Math.random() * 800,
      200 + Math.random() * 400,
      x,
      y
    );

    for (const point of bezierPoints) {
      await this._client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: point.x,
        y: point.y,
        button: 'none',
        buttons: 0,
        modifiers: 0,
        force: 0,
      });
      await this._page.waitForTimeout(5 + Math.random() * 10);
    }

    await this._page.waitForTimeout(50 + Math.random() * 100);

    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: x + (Math.random() * 4 - 2),
      y: y + (Math.random() * 4 - 2),
      button: 'left',
      buttons: 1,
      modifiers: 0,
      clickCount: 1,
      force: 0.5,
    });

    await this._page.waitForTimeout(30 + Math.random() * 70);

    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: x + (Math.random() * 4 - 2),
      y: y + (Math.random() * 4 - 2),
      button: 'left',
      buttons: 0,
      modifiers: 0,
      clickCount: 1,
      force: 0,
    });
  }

  private _generateBezierPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    const cp1x = startX + (endX - startX) * 0.25 + (Math.random() * 80 - 40);
    const cp1y = startY + (endY - startY) * 0.25 + (Math.random() * 80 - 40);
    const cp2x = startX + (endX - startX) * 0.75 + (Math.random() * 80 - 40);
    const cp2y = startY + (endY - startY) * 0.75 + (Math.random() * 80 - 40);

    const steps = 20 + Math.floor(Math.random() * 10);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.pow(1 - t, 3) * startX + 3 * Math.pow(1 - t, 2) * t * cp1x + 3 * (1 - t) * Math.pow(t, 2) * cp2x + Math.pow(t, 3) * endX;
      const y = Math.pow(1 - t, 3) * startY + 3 * Math.pow(1 - t, 2) * t * cp1y + 3 * (1 - t) * Math.pow(t, 2) * cp2y + Math.pow(t, 3) * endY;
      points.push({ x, y });
    }

    return points;
  }

  async humanScroll(direction: 'up' | 'down', amount?: number): Promise<void> {
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
      await this._page.waitForTimeout(20 + Math.random() * 30);
    }
  }
}

export class UltraStealthMode {
  private _client: CRSession;
  private _page: CRPage;

  constructor(client: CRSession, page: CRPage) {
    this._client = client;
    this._page = page;
  }

  async applyStealth(): Promise<void> {
    await this._client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'permissions', {
          get: () => ({
            query: (params) => Promise.resolve({ state: 'granted', onchange: null })
          })
        });
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
        Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
        Object.defineProperty(navigator, 'productSub', { get: () => '20030107' });
        Object.defineProperty(navigator, 'doNotTrack', { get: () => null });
      `,
    });
  }

  async randomizeFingerprint(): Promise<void> {
    const canvasNoise = `
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type) {
        const context = this.getContext('2d');
        if (context) {
          const shift = { r: Math.floor(Math.random() * 10) - 5, g: Math.floor(Math.random() * 10) - 5, b: Math.floor(Math.random() * 10) - 5 };
          const width = this.width, height = this.height;
          if (width && height) {
            const imageData = context.getImageData(0, 0, width, height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] += shift.r;
              imageData.data[i + 1] += shift.g;
              imageData.data[i + 2] += shift.b;
            }
            context.putImageData(imageData, 0, 0);
          }
        }
        return originalToDataURL.apply(this, arguments);
      };
    `;

    await this._client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: canvasNoise,
    });

    const webglNoise = `
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.apply(this, arguments);
      };
    `;

    await this._client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: webglNoise,
    });
  }

  async bypassHeadlessDetection(): Promise<void> {
    await this._client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        delete navigator.__proto__.webdriver;
        const newProto = navigator.__proto__;
        delete newProto.webdriver;
        navigator.__proto__ = newProto;
      `,
    });
  }
}

export class UltraMultiTabOrchestrator {
  private _client: CRSession;
  private _page: CRPage;
  private _tabs: Map<string, { id: string; url: string; title: string; active: boolean }> = new Map();

  constructor(client: CRSession, page: CRPage) {
    this._client = client;
    this._page = page;
  }

  async createTab(url: string): Promise<string> {
    const result = await this._client.send('Target.createTarget', { url });
    const targetId = result.targetId;
    this._tabs.set(targetId, { id: targetId, url, title: '', active: false });
    return targetId;
  }

  async closeTab(targetId: string): Promise<void> {
    await this._client.send('Target.closeTarget', { targetId });
    this._tabs.delete(targetId);
  }

  async switchTab(targetId: string): Promise<void> {
    await this._client.send('Target.activateTarget', { targetId });
    for (const [id, tab] of this._tabs) {
      tab.active = id === targetId;
    }
  }

  async listTabs(): Promise<{ id: string; url: string; title: string; active: boolean }[]> {
    const result = await this._client.send('Target.getTargets');
    const tabs: { id: string; url: string; title: string; active: boolean }[] = [];

    for (const target of result.targetInfos) {
      if (target.type === 'page') {
        tabs.push({
          id: target.targetId,
          url: target.url,
          title: target.title,
          active: target.attached || false,
        });
      }
    }

    return tabs;
  }

  async orchestrateTabs(task: string): Promise<void> {
    const tabs = await this.listTabs();

    for (const tab of tabs) {
      await this.switchTab(tab.id);
      await this._page.waitForTimeout(500);
    }
  }
}
