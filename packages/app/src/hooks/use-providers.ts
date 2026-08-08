import { useServerSync } from "@/context/server-sync"
import { decode64 } from "@/utils/base64"
import { useParams } from "@solidjs/router"
import { Iterable, pipe } from "effect"
import { createSignal, createEffect, onCleanup, type Accessor } from "solid-js"
import { selectProviderCatalog } from "./provider-catalog"

export const popularProviders = [
  "opencode",
  "opencode-go",
  "anthropic",
  "github-copilot",
  "openai",
  "google",
  "openrouter",
  "vercel",
]
const popularProviderSet = new Set(popularProviders)

interface ExtensionRegisteredModel {
  providerID: string
  modelID: string
  name: string
  description?: string
  contextLength?: number
  cost?: { input: number; output: number }
}

export function useProviders(directory?: Accessor<string | undefined>) {
  const serverSync = useServerSync()
  const params = useParams()
  const dir = () => (directory ? directory() : decode64(params.dir))

  const [extensionModels, setExtensionModels] = createSignal<ExtensionRegisteredModel[]>([])

  const api = () => (window as any).api

  const fetchExtensionModels = async () => {
    try {
      const models = await api()?.extensionHost?.getRegisteredModels()
      if (Array.isArray(models)) {
        const allModels: ExtensionRegisteredModel[] = []
        for (const provider of models) {
          if (Array.isArray(provider.models)) {
            for (const model of provider.models) {
              allModels.push({ ...model, providerID: provider.providerID })
            }
          }
        }
        setExtensionModels(allModels)
      }
    } catch {}
  }

  createEffect(() => {
    fetchExtensionModels()
  })

  createEffect(() => {
    const apiObj = (window as any).api
    if (apiObj?.onExtensionInstalled) {
      const cleanup = apiObj.onExtensionInstalled(() => {
        fetchExtensionModels()
      })
      onCleanup(cleanup)
    }
  })

  const providers = () => {
    const value = dir()
    const projectStore = value ? serverSync().child(value)[0] : undefined
    const base = directory
      ? selectProviderCatalog({
          explicit: true,
          directory: value,
          catalog: projectStore && { ready: projectStore.provider_ready, providers: projectStore.provider },
        })
      : selectProviderCatalog({
          explicit: false,
          directory: value,
          catalog: projectStore && { ready: projectStore.provider_ready, providers: projectStore.provider },
          global: serverSync().data.provider,
        })

    const extModels = extensionModels()
    if (extModels.length === 0) return base

    const mergedAll = new Map(base.all)
    const mergedConnected = [...base.connected]

    for (const model of extModels) {
      let provider = mergedAll.get(model.providerID)
      if (!provider) {
        provider = {
          id: model.providerID,
          name: model.providerID.charAt(0).toUpperCase() + model.providerID.slice(1),
          source: "api",
          env: [],
          options: {},
          models: {},
        }
        mergedAll.set(model.providerID, provider)
        mergedConnected.push(model.providerID)
      }
      provider.models[model.modelID] = {
        id: model.modelID,
        name: model.name,
        description: model.description || "",
        context_length: model.contextLength || 128000,
        cost: model.cost || { input: 0, output: 0 },
      } as any
    }

    return {
      all: mergedAll,
      connected: mergedConnected,
      default: base.default,
    }
  }

  return {
    all: () => providers().all,
    default: () => providers().default,
    popular: () =>
      pipe(
        providers().all,
        Iterable.map(([, p]) => p),
        Iterable.filter((p) => popularProviderSet.has(p.id)),
        (v) => Array.from(v),
      ),
    connected: () => {
      const connected = new Set(providers().connected)
      return pipe(
        providers().all,
        Iterable.map(([, p]) => p),
        Iterable.filter((p) => connected.has(p.id)),
        (v) => Array.from(v),
      )
    },
    paid: () => {
      const connected = new Set(providers().connected)
      return [
        ...Iterable.filter(
          providers().all,
          ([id]) =>
            connected.has(id) &&
            (id !== "zyraxon" || Object.values(providers().all.get(id)?.models ?? {}).some((m) => m.cost?.input)),
        ),
      ]
    },
    extensionModels,
    refreshExtensionModels: fetchExtensionModels,
  }
}
