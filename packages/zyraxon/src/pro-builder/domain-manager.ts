/**
 * PRO BUILDER - DOMAIN MANAGER
 * 
 * Manages custom domain names for published websites.
 * Integrates with Cloudflare for domain routing and DNS.
 * Supports Google Search Console verification.
 * 
 * Flow:
 * 1. User owns a domain (e.g., zyraxonai.com)
 * 2. Domain is configured in Cloudflare (nameservers pointed)
 * 3. Pro Builder creates a DNS record pointing to the Cloudflare Tunnel
 * 4. Website becomes accessible at the custom domain
 * 5. Google Search Console can verify ownership via DNS TXT record
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DomainConfig {
  domain: string               // e.g., "zyraxonai.com"
  subdomain?: string           // e.g., "www", "app", "portfolio"
  siteId: string               // Which site this domain points to
  fullUrl: string              // e.g., "https://zyraxonai.com" or "https://portfolio.zyraxonai.com"
  cloudflareZoneId?: string    // Cloudflare zone ID
  cloudflareTunnelId?: string  // Cloudflare tunnel ID
  dnsRecordId?: string         // DNS record ID in Cloudflare
  verified: boolean            // Google Search Console verified
  created: string
  lastChecked: string
}

export interface DomainManifest {
  version: string
  domains: DomainConfig[]
  lastUpdated: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ZYRAXON_HOME = path.join(os.homedir(), ".zyraxon")
const DOMAINS_DIR = path.join(ZYRAXON_HOME, "domains")
const DOMAINS_MANIFEST = path.join(DOMAINS_DIR, "domains.json")
const CLOUDFLARE_CONFIG = path.join(ZYRAXON_HOME, "cloudflare.json")

// ─── Domain Manager ─────────────────────────────────────────────────────────

export class DomainManager {
  private domains: Map<string, DomainConfig> = new Map()
  private manifest: DomainManifest | null = null

  /**
   * Initialize the domain manager
   */
  async initialize(): Promise<void> {
    await fs.mkdir(DOMAINS_DIR, { recursive: true })

    try {
      const data = await fs.readFile(DOMAINS_MANIFEST, "utf-8")
      this.manifest = JSON.parse(data)
      for (const domain of this.manifest!.domains) {
        this.domains.set(domain.domain, domain)
      }
    } catch {
      this.manifest = {
        version: "1.0.0",
        domains: [],
        lastUpdated: new Date().toISOString(),
      }
      await this.saveManifest()
    }
  }

  /**
   * Add a custom domain for a site
   */
  async addDomain(options: {
    domain: string
    subdomain?: string
    siteId: string
    sitePort: number
  }): Promise<DomainConfig> {
    const fullUrl = options.subdomain
      ? `https://${options.subdomain}.${options.domain}`
      : `https://${options.domain}`

    const domainConfig: DomainConfig = {
      domain: options.domain,
      subdomain: options.subdomain,
      siteId: options.siteId,
      fullUrl,
      verified: false,
      created: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
    }

    this.domains.set(options.domain, domainConfig)
    await this.saveManifest()

    return domainConfig
  }

  /**
   * Remove a custom domain
   */
  async removeDomain(domain: string): Promise<void> {
    this.domains.delete(domain)
    await this.saveManifest()
  }

  /**
   * Get domain config for a site
   */
  getDomainForSite(siteId: string): DomainConfig | undefined {
    for (const domain of this.domains.values()) {
      if (domain.siteId === siteId) return domain
    }
    return undefined
  }

  /**
   * List all domains
   */
  listDomains(): DomainConfig[] {
    return Array.from(this.domains.values())
  }

  /**
   * Get the Cloudflare Tunnel URL for a site
   * This is the temporary URL before custom domain setup
   */
  getTunnelUrl(siteId: string, tunnelId: string): string {
    return `https://${tunnelId}.trycloudflare.com`
  }

  /**
   * Setup custom domain via Cloudflare API
   * Requires Cloudflare API token
   */
  async setupCloudflareDomain(options: {
    domain: string
    subdomain?: string
    tunnelId: string
    tunnelName: string
    sitePort: number
  }): Promise<{ success: boolean; message: string; dnsRecord?: string }> {
    // Check if cloudflared is configured
    const cfConfig = await this.loadCloudflareConfig()
    if (!cfConfig?.apiToken) {
      return {
        success: false,
        message: "Cloudflare API token not configured. Run 'zyraxon cloudflare setup' to configure.",
      }
    }

    try {
      // Create DNS CNAME record pointing to the tunnel
      const hostname = options.subdomain
        ? `${options.subdomain}.${options.domain}`
        : options.domain

      const recordName = hostname
      const recordContent = `${options.tunnelId}.cfargotunnel.com`

      // Use Cloudflare API to create DNS record
      const result = await this.cloudflareApi(cfConfig.apiToken, "POST", `/zones/${cfConfig.zoneId}/dns_records`, {
        type: "CNAME",
        name: recordName,
        content: recordContent,
        proxied: true,
        ttl: 1, // Auto TTL
      })

      if (result.success) {
        const domainConfig = this.domains.get(options.domain)
        if (domainConfig) {
          domainConfig.cloudflareZoneId = cfConfig.zoneId
          domainConfig.cloudflareTunnelId = options.tunnelId
          domainConfig.dnsRecordId = result.recordId
          await this.saveManifest()
        }

        return {
          success: true,
          message: `Domain ${hostname} configured! It may take a few minutes to propagate.`,
          dnsRecord: recordName,
        }
      }

      return { success: false, message: `Failed to create DNS record: ${result.error}` }
    } catch (error: any) {
      return { success: false, message: `Cloudflare API error: ${error.message}` }
    }
  }

  /**
   * Setup Google Search Console verification
   * Adds a DNS TXT record for domain verification
   */
  async setupGoogleVerification(domain: string): Promise<{
    success: boolean
    message: string
    verificationRecord?: string
  }> {
    const cfConfig = await this.loadCloudflareConfig()
    if (!cfConfig?.apiToken) {
      return {
        success: false,
        message: "Cloudflare API token not configured.",
      }
    }

    // Google verification code (user gets this from Google Search Console)
    // For now, we'll create a placeholder that the user can update
    const verificationCode = `google-site-verification=XXXXXXXXXXXXXXXXXXXXXXXX`

    try {
      const result = await this.cloudflareApi(cfConfig.apiToken, "POST", `/zones/${cfConfig.zoneId}/dns_records`, {
        type: "TXT",
        name: domain,
        content: verificationCode,
        ttl: 3600,
      })

      if (result.success) {
        const domainConfig = this.domains.get(domain)
        if (domainConfig) {
          domainConfig.verified = false // Will be set to true after Google verification
          domainConfig.lastChecked = new Date().toISOString()
          await this.saveManifest()
        }

        return {
          success: true,
          message: `Google verification TXT record created for ${domain}. Update the verification code in Cloudflare with the one from Google Search Console.`,
          verificationRecord: verificationCode,
        }
      }

      return { success: false, message: `Failed to create verification record: ${result.error}` }
    } catch (error: any) {
      return { success: false, message: `Error: ${error.message}` }
    }
  }

  /**
   * Generate sitemap.xml for a site
   */
  generateSitemap(siteDir: string, domain: string, pages: string[]): string {
    const urls = pages.map(page => `
  <url>
    <loc>${domain}/${page}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join("")

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${domain}/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${urls}
</urlset>`
  }

  /**
   * Generate robots.txt for a site
   */
  generateRobotsTxt(domain: string): string {
    return `User-agent: *
Allow: /

Sitemap: ${domain}/sitemap.xml

# ZYRAXON Pro Builder - Auto-generated robots.txt
# Generated: ${new Date().toISOString()}
`
  }

  /**
   * Generate meta tags for SEO
   */
  generateSeoMeta(options: {
    title: string
    description: string
    url: string
    image?: string
    type?: string
  }): string {
    return `
    <!-- SEO Meta Tags -->
    <meta name="description" content="${options.description}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${options.url}">
    
    <!-- Open Graph -->
    <meta property="og:type" content="${options.type || "website"}">
    <meta property="og:title" content="${options.title}">
    <meta property="og:description" content="${options.description}">
    <meta property="og:url" content="${options.url}">
    ${options.image ? `<meta property="og:image" content="${options.image}">` : ""}
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${options.title}">
    <meta name="twitter:description" content="${options.description}">
    ${options.image ? `<meta name="twitter:image" content="${options.image}">` : ""}
    
    <!-- Structured Data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "${options.title}",
      "description": "${options.description}",
      "url": "${options.url}"
    }
    </script>
    `
  }

  /**
   * Load Cloudflare configuration
   */
  private async loadCloudflareConfig(): Promise<{
    apiToken: string
    zoneId: string
    accountId: string
  } | null> {
    try {
      const data = await fs.readFile(CLOUDFLARE_CONFIG, "utf-8")
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  /**
   * Save Cloudflare configuration
   */
  async saveCloudflareConfig(config: {
    apiToken: string
    zoneId: string
    accountId: string
  }): Promise<void> {
    await fs.writeFile(CLOUDFLARE_CONFIG, JSON.stringify(config, null, 2))
  }

  /**
   * Make a Cloudflare API request
   */
  private async cloudflareApi(
    token: string,
    method: string,
    endpoint: string,
    body?: any
  ): Promise<{ success: boolean; recordId?: string; error?: string }> {
    try {
      const url = `https://api.cloudflare.com/client/v4${endpoint}`
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      const data = await response.json() as any

      if (data.success) {
        return {
          success: true,
          recordId: data.result?.id,
        }
      }

      return {
        success: false,
        error: data.errors?.map((e: any) => e.message).join(", ") || "Unknown error",
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Save manifest to disk
   */
  private async saveManifest(): Promise<void> {
    this.manifest!.domains = Array.from(this.domains.values())
    this.manifest!.lastUpdated = new Date().toISOString()
    await fs.writeFile(DOMAINS_MANIFEST, JSON.stringify(this.manifest, null, 2))
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: DomainManager | null = null

export async function getDomainManager(): Promise<DomainManager> {
  if (!instance) {
    instance = new DomainManager()
    await instance.initialize()
  }
  return instance
}
