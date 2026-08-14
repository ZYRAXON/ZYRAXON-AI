/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Zyraxon Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import * as nls from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { ZyraxonBridgeLanguageModelProvider, DEFAULT_ZYRAXON_BRIDGE_URL, ZYRAXON_BRIDGE_URL_SETTING } from './zyraxonBridgeLanguageModelProvider.js';

export const ZYRAXON_BRIDGE_VENDOR = 'zyraxon';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'zyraxon',
	order: 25,
	title: nls.localize('zyraxon.configuration.title', 'Zyraxon'),
	type: 'object',
	properties: {
		[ZYRAXON_BRIDGE_URL_SETTING]: {
			type: 'string',
			default: DEFAULT_ZYRAXON_BRIDGE_URL,
			markdownDescription: nls.localize('zyraxon.bridgeUrl', 'Base URL of the local Zyraxon instance server bridge used to serve agent models and chat requests. The bridge shares the same model catalog as the Zyraxon agent, so provider credentials configured in the agent\'s settings apply here too.'),
		},
	},
});

/**
 * Registers the {@link ZyraxonBridgeLanguageModelProvider} with the editor's
 * language models service so ZYRAXON bridge models appear in the chat model
 * picker alongside the editor's own providers. The provider fetches the live
 * model list from the bridge (`GET /v1/models`), so agent-side provider
 * credentials surface here without editor-side configuration.
 */
class ZyraxonBridgeContribution extends Disposable {
	static readonly ID = 'workbench.contrib.chat.zyraxonBridge';

	constructor(
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const provider = this._register(instantiationService.createInstance(ZyraxonBridgeLanguageModelProvider));
		this._register(languageModelsService.registerLanguageModelProvider(ZYRAXON_BRIDGE_VENDOR, provider));

		// Prime the model list shortly after startup and keep refreshing on a
		// modest interval so agent-side credential changes propagate live.
		void provider._refresh();
		const refreshHandle = setInterval(() => {
			void provider._refresh();
		}, 30_000);
		this._register({ dispose: () => clearInterval(refreshHandle) });
	}
}

registerWorkbenchContribution2(ZyraxonBridgeContribution.ID, ZyraxonBridgeContribution, WorkbenchPhase.BlockRestore);
