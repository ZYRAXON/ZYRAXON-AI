/**
 * PRO BUILDER - INDEX
 * 
 * Main export point for the Pro Builder module.
 * Re-exports all public APIs.
 */

export { SiteManager, getSiteManager, getSiteManagerSync } from "./engine"
export type { SiteConfig, SiteType, ThemeConfig, MediaConfig, MediaItem, SiteManifest } from "./engine"
export { DEFAULT_THEME } from "./engine"

export { TEMPLATES, getTemplate, getTemplateNames, SVG_ICONS } from "./templates"
export type { Template, TemplateOutput } from "./templates"

export { MediaManager, SVG_ICONS_LIBRARY } from "./media-manager"
export type { MediaSearchResult, MediaDownloadResult } from "./media-manager"

export { DomainManager, getDomainManager } from "./domain-manager"
export type { DomainConfig, DomainManifest } from "./domain-manager"
