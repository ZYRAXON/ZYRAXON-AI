import { AgentV2 } from "@zyraxon-ai/core/agent"
import { AISDK } from "@zyraxon-ai/core/aisdk"
import { Catalog } from "@zyraxon-ai/core/catalog"
import { CommandV2 } from "@zyraxon-ai/core/command"
import { Credential } from "@zyraxon-ai/core/credential"
import { AppNodeBuilder } from "@zyraxon-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@zyraxon-ai/core/effect/app-node-platform"
import { LayerNode } from "@zyraxon-ai/core/effect/layer-node"
import { EventV2 } from "@zyraxon-ai/core/event"
import { FileSystem } from "@zyraxon-ai/core/filesystem"
import { FSUtil } from "@zyraxon-ai/core/fs-util"
import { Integration } from "@zyraxon-ai/core/integration"
import { Location } from "@zyraxon-ai/core/location"
import { Npm } from "@zyraxon-ai/core/npm"
import { PluginV2 } from "@zyraxon-ai/core/plugin"
import { Reference } from "@zyraxon-ai/core/reference"
import { SkillV2 } from "@zyraxon-ai/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
