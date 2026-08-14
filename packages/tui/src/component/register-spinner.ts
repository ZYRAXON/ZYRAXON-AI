import { getComponentCatalogue } from "@opentui/solid/components"
import { registerSpinner } from "opentui-spinner/solid"

export function registerZyraxonSpinner() {
  if (!getComponentCatalogue().spinner) registerSpinner()
}
