import { createSignal, createEffect, onCleanup } from "solid-js"

interface RegisteredModel {
  providerID: string
  modelID: string
  name: string
  description?: string
  contextLength?: number
  cost?: { input: number; output: number }
}

interface ExtensionProviderModels {
  providerID: string
  models: RegisteredModel[]
}

export function useExtensionModels() {
  const [extensionProviders, setExtensionProviders] = createSignal<ExtensionProviderModels[]>([])
  const [loading, setLoading] = createSignal(false)

  const api = () => (window as any).api

  const fetchModels = async () => {
    try {
      setLoading(true)
      const models = await api()?.extensionHost?.getRegisteredModels()
      if (Array.isArray(models)) {
        setExtensionProviders(models)
      }
    } catch (error) {
      console.debug("[useExtensionModels] Failed to fetch extension models:", error)
    } finally {
      setLoading(false)
    }
  }

  createEffect(() => {
    fetchModels()
  })

  createEffect(() => {
    const apiObj = (window as any).api
    if (apiObj?.onExtensionInstalled) {
      const cleanup = apiObj.onExtensionInstalled(() => {
        fetchModels()
      })
      onCleanup(cleanup)
    }
  })

  const getExtensionModelsForProvider = (providerID: string): RegisteredModel[] => {
    return extensionProviders()
      .filter((p) => p.providerID === providerID)
      .flatMap((p) => p.models)
  }

  const getAllExtensionModels = (): Map<string, RegisteredModel[]> => {
    const map = new Map<string, RegisteredModel[]>()
    for (const provider of extensionProviders()) {
      map.set(provider.providerID, provider.models)
    }
    return map
  }

  return {
    extensionProviders,
    loading,
    getExtensionModelsForProvider,
    getAllExtensionModels,
    refresh: fetchModels,
  }
}
