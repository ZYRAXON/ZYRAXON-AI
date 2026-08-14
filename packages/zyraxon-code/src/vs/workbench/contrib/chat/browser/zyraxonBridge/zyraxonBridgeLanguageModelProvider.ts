/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zyraxon Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelChatProvider, IChatMessage, ILanguageModelChatResponse, IChatResponseTextPart, IChatResponseThinkingPart } from '../../common/languageModels.js';

/**
 * Base URL of the local ZYRAXON instance server bridge. Defaults to the
 * bridge's preferred port (4096) on loopback. Overridable via the
 * `chat.zyraxon.bridgeUrl` setting.
 */
export const ZYRAXON_BRIDGE_URL_SETTING = 'chat.zyraxon.bridgeUrl';
export const DEFAULT_ZYRAXON_BRIDGE_URL = 'http://127.0.0.1:4096';

/**
 * Model ids advertised by the bridge carry a `providerID/modelID` shape
 * (e.g. `google/gemini-3-flash`). We split on the first `/` and reject ids
 * with no provider so the editor never resolves a bare model id against the
 * session lookup.
 */
function splitModelId(modelId: string): { provider: string; id: string } | undefined {
	const slash = modelId.indexOf('/');
	if (slash <= 0 || slash === modelId.length - 1) {
		return undefined;
	}
	return { provider: modelId.slice(0, slash), id: modelId.slice(slash + 1) };
}

interface BridgeModel {
	readonly id: string;
}

/**
 * Exposes models served by the local ZYRAXON bridge (`GET /v1/models`) as
 * selectable language models in the editor's chat model picker. Chat requests
 * are routed to the bridge's OpenAI-compatible `POST /v1/chat/completions`
 * streaming endpoint. The bridge shares the same catalog as the ZYRAXON
 * agent, so provider credentials configured in the agent's settings show up
 * here live â€” no duplicate credential management in the editor.
 */
export class ZyraxonBridgeLanguageModelProvider extends Disposable implements ILanguageModelChatProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _models: BridgeModel[] = [];
	private _bridgeUrl: string;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this._bridgeUrl = this._readBridgeUrl();

		this._register(this._configurationService.onDidChangeConfiguration((e: IConfigurationChangeEvent) => {
			if (e.affectsConfiguration(ZYRAXON_BRIDGE_URL_SETTING)) {
				this._bridgeUrl = this._readBridgeUrl();
				this._refresh();
			}
		}));
	}

	private _readBridgeUrl(): string {
		const value = this._configurationService.getValue<string>(ZYRAXON_BRIDGE_URL_SETTING);
		if (typeof value === 'string' && value.length > 0) {
			return value;
		}
		return DEFAULT_ZYRAXON_BRIDGE_URL;
	}

	/**
	 * Re-fetches the model list from the bridge and fires {@link onDidChange}
	 * so the model picker refreshes. Called when the bridge URL changes and
	 * from the contributing workbench contribution on a configurable poll.
	 */
	async _refresh(): Promise<void> {
		const url = `${this._bridgeUrl.replace(/\/$/, '')}/v1/models`;
		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: { 'Accept': 'application/json' },
				cache: 'no-store',
			});
			if (!response.ok) {
				this._logService.warn(`[zyraxon-bridge] models request failed: ${response.status}`);
				return;
			}
			const payload = await response.json();
			const data = Array.isArray(payload?.data) ? payload.data as BridgeModel[] : [];
			const previous = this._models.length;
			this._models = data.filter((m) => splitModelId(m.id) !== undefined);
			if (this._models.length !== previous) {
				this._onDidChange.fire();
			}
		} catch (err) {
			this._logService.warn('[zyraxon-bridge] models request errored', err);
		}
	}

	async provideLanguageModelChatInfo(_options: unknown, _token: CancellationToken): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		return this._models.map((m) => {
			const split = splitModelId(m.id)!;
			return {
				identifier: `zyraxon:${m.id}`,
				metadata: {
					extension: nullExtensionDescription.identifier,
					name: split.id,
					id: m.id,
					vendor: 'zyraxon',
					version: '1.0',
					family: split.provider,
					maxInputTokens: 128000,
					maxOutputTokens: 8192,
					isDefaultForLocation: {},
					isUserSelectable: true,
					capabilities: {
						vision: false,
						toolCalling: false,
						agentMode: false,
					},
				},
			};
		});
	}

	async sendChatRequest(modelId: string, messages: IChatMessage[], _from: unknown, _options: unknown, _token: CancellationToken): Promise<ILanguageModelChatResponse> {
		const url = `${this._bridgeUrl.replace(/\/$/, '')}/v1/chat/completions`;
		const bridgeModelId = modelId.includes(':') ? modelId.slice(modelId.indexOf(':') + 1) : modelId;
		const body = {
			model: bridgeModelId,
			stream: true,
			messages: messages.map((m) => ({
				role: m.role,
				content: m.content.filter((p) => p.type === 'text').map((p) => p.value).join(' '),
			})),
		};

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Accept': 'text/event-stream',
		};
		const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length > 0) {
			headers['x-zyraxon-directory'] = workspaceFolders[0].uri.fsPath;
		}

		const controller = new AbortController();
		if (_token) {
			_token.onCancellationRequested(() => controller.abort());
		}

		let stream: AsyncIterable<IChatResponseTextPart | IChatResponseThinkingPart | (IChatResponseTextPart | IChatResponseThinkingPart)[]> = (async function* () { })();
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				cache: 'no-store',
				signal: controller.signal,
			});
			if (!response.ok) {
				const detail = await response.text().catch(() => '');
				return {
					stream: (async function* () {
						yield { type: 'text' as const, value: `[zyraxon-bridge] chat request failed (${response.status}) ${detail}`.trim() };
					})(),
					result: Promise.resolve(),
				};
			}

			if (!response.body) {
				return { stream: (async function* () { })(), result: Promise.resolve() };
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();

			const parseStream = async function* () {
				let pending = '';
				for (;;) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}
					pending += decoder.decode(value, { stream: true });
					const events = pending.split('\n\n');
					pending = events.pop() ?? '';
					for (const event of events) {
						const line = event.split('\n').find((l) => l.startsWith('data:'));
						if (!line) {
							continue;
						}
						const data = line.slice(5).trim();
						if (data === '[DONE]') {
							return;
						}
						try {
							const parsed = JSON.parse(data);
							const delta = parsed?.choices?.[0]?.delta;
							const content = typeof delta?.content === 'string' ? delta.content : '';
							if (content) {
								yield { type: 'text' as const, value: content };
							}
						} catch {
							// Ignore malformed SSE frames.
						}
					}
				}
			};

			stream = parseStream();
		} catch (err) {
			this._logService.warn('[zyraxon-bridge] chat request errored', err);
			stream = (async function* () {
				yield { type: 'text' as const, value: `[zyraxon-bridge] chat request errored` };
			})();
		}

		return {
			stream,
			result: Promise.resolve(),
		};
	}

	async provideTokenCount(_modelId: string, _message: string | IChatMessage, _token: CancellationToken): Promise<number> {
		return 0;
	}
}
