/**
 * PRO BUILDER - GITHUB MANAGER
 *
 * Handles GitHub OAuth authentication, repo creation, file pushing,
 * and GitHub Pages deployment. All operations go through GitHub API.
 *
 * Flow:
 * 1. User authorizes via GitHub OAuth (one-time)
 * 2. Token stored locally at ~/.zyraxon/github.json
 * 3. Site publish = create repo + push files + enable Pages
 * 4. Custom domain = add CNAME file + push
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { Octokit } from "@octokit/rest"
import { createOAuthDeviceAuth } from "@octokit/auth-oauth-device"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GitHubConfig {
  token: string
  username: string
  email: string
  authenticatedAt: string
}

export interface RepoResult {
  name: string
  fullName: string
  url: string
  pagesUrl: string
  customDomain?: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ZYRAXON_HOME = path.join(os.homedir(), ".zyraxon")
const GITHUB_CONFIG_PATH = path.join(ZYRAXON_HOME, "github.json")
const GITHUB_REPOS_DIR = path.join(ZYRAXON_HOME, "github-repos")

// GitHub OAuth App (ZYRAXON's own)
// Users authorize through GitHub's device flow
const GITHUB_CLIENT_ID = "Ov23li_" // placeholder — will be set during setup
const GITHUB_SCOPE = "repo,user"

// ─── GitHub Manager ─────────────────────────────────────────────────────────

export class GitHubManager {
  private octokit: Octokit | null = null
  private config: GitHubConfig | null = null

  /**
   * Initialize — load saved token if exists
   */
  async initialize(): Promise<boolean> {
    await fs.mkdir(ZYRAXON_HOME, { recursive: true })

    try {
      const data = await fs.readFile(GITHUB_CONFIG_PATH, "utf-8")
      this.config = JSON.parse(data)
      this.octokit = new Octokit({ auth: this.config.token })
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if GitHub is connected
   */
  isConnected(): boolean {
    return this.octokit !== null && this.config !== null
  }

  /**
   * Get the current user info
   */
  async getUser(): Promise<{ username: string; email: string } | null> {
    if (!this.octokit) return null
    try {
      const { data } = await this.octokit.users.getAuthenticated()
      return { username: data.login, email: data.email || "" }
    } catch {
      return null
    }
  }

  /**
   * Connect via Personal Access Token (PAT)
   * User creates a token at https://github.com/settings/tokens
   * Scopes needed: repo, user
   */
  async connectWithToken(token: string): Promise<{ success: boolean; username?: string; error?: string }> {
    try {
      const octokit = new Octokit({ auth: token })
      const { data } = await octokit.users.getAuthenticated()

      this.config = {
        token,
        username: data.login,
        email: data.email || "",
        authenticatedAt: new Date().toISOString(),
      }
      this.octokit = octokit

      await fs.writeFile(GITHUB_CONFIG_PATH, JSON.stringify(this.config, null, 2))
      await fs.mkdir(GITHUB_REPOS_DIR, { recursive: true })

      return { success: true, username: data.login }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Connect via GitHub OAuth Device Flow
   * Opens browser for user authorization, polls for token
   */
  async connectWithOAuth(): Promise<{
    success: boolean
    username?: string
    error?: string
    userCode?: string
    verificationUrl?: string
  }> {
    try {
      const auth = createOAuthDeviceAuth({
        clientType: "oauth-app",
        clientId: GITHUB_CLIENT_ID,
        scopes: [GITHUB_SCOPE],
        onVerification: (verification) => {
          console.log(`[GitHub] Authorize at: ${verification.verification_uri}`)
          console.log(`[GitHub] User code: ${verification.user_code}`)
        },
      })

      const { token } = await auth({ type: "oauth" })
      return await this.connectWithToken(token)
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Disconnect GitHub
   */
  async disconnect(): Promise<void> {
    this.octokit = null
    this.config = null
    try {
      await fs.unlink(GITHUB_CONFIG_PATH)
    } catch {}
  }

  /**
   * Create a new repository for a site
   */
  async createRepo(siteName: string, description?: string): Promise<RepoResult> {
    if (!this.octokit || !this.config) {
      throw new Error("GitHub not connected. Run 'connect' first.")
    }

    const repoName = `zyraxon-${siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`

    // Check if repo already exists
    try {
      const existing = await this.octokit.repos.get({
        owner: this.config.username,
        repo: repoName,
      })
      // Repo exists — return its info
      return {
        name: repoName,
        fullName: existing.data.full_name,
        url: existing.data.html_url,
        pagesUrl: `https://${this.config.username}.github.io/${repoName}`,
      }
    } catch {
      // Repo doesn't exist — create it
    }

    const { data } = await this.octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: description || `ZYRAXON Pro Builder site: ${siteName}`,
      auto_init: false,
      private: false,
    })

    return {
      name: repoName,
      fullName: data.full_name,
      url: data.html_url,
      pagesUrl: `https://${this.config.username}.github.io/${repoName}`,
    }
  }

  /**
   * Push all files from a local directory to a GitHub repo
   */
  async pushFiles(
    repoName: string,
    localDir: string,
    commitMessage?: string,
  ): Promise<{ success: boolean; commitSha?: string; error?: string }> {
    if (!this.octokit || !this.config) {
      return { success: false, error: "GitHub not connected" }
    }

    try {
      // Get all files in the local directory
      const files = await this.getAllFiles(localDir)

      // Get the current ref of main branch
      let baseTreeSha: string | null = null
      let currentSha: string | null = null

      try {
        const ref = await this.octokit.git.getRef({
          owner: this.config.username,
          repo: repoName,
          ref: "heads/main",
        })
        currentSha = ref.data.object.sha

        const commit = await this.octokit.git.getCommit({
          owner: this.config.username,
          repo: repoName,
          commit_sha: currentSha,
        })
        baseTreeSha = commit.data.tree.sha
      } catch {
        // Branch doesn't exist yet — we'll create it
      }

      // Create blobs for all files
      const treeItems: Array<{
        path: string
        mode: "100644" | "100755" | "040000"
        type: "blob" | "tree"
        content?: string
        sha?: string
      }> = []

      for (const file of files) {
        const relativePath = path.relative(localDir, file).replace(/\\/g, "/")
        const content = await fs.readFile(file, "utf-8")

        // Create blob
        const { data: blob } = await this.octokit.git.createBlob({
          owner: this.config.username,
          repo: repoName,
          content,
          encoding: "utf-8",
        })

        treeItems.push({
          path: relativePath,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        })
      }

      // Create tree
      const { data: newTree } = await this.octokit.git.createTree({
        owner: this.config.username,
        repo: repoName,
        base_tree: baseTreeSha || undefined,
        tree: treeItems,
      })

      // Create commit
      const { data: newCommit } = await this.octokit.git.createCommit({
        owner: this.config.username,
        repo: repoName,
        message: commitMessage || `Update site via ZYRAXON Pro Builder`,
        tree: newTree.sha,
        parents: currentSha ? [currentSha] : [],
      })

      // Update ref
      if (currentSha) {
        await this.octokit.git.updateRef({
          owner: this.config.username,
          repo: repoName,
          ref: "heads/main",
          sha: newCommit.sha,
          force: true,
        })
      } else {
        await this.octokit.git.createRef({
          owner: this.config.username,
          repo: repoName,
          ref: "refs/heads/main",
          sha: newCommit.sha,
        })
      }

      return { success: true, commitSha: newCommit.sha }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Enable GitHub Pages for a repo
   */
  async enablePages(repoName: string): Promise<{ success: boolean; url?: string; error?: string }> {
    if (!this.octokit || !this.config) {
      return { success: false, error: "GitHub not connected" }
    }

    try {
      // Enable Pages via the API
      await this.octokit.repos.createPagesSite({
        owner: this.config.username,
        repo: repoName,
        build_type: "legacy",
        source: {
          branch: "main",
          path: "/",
        },
      })

      return {
        success: true,
        url: `https://${this.config.username}.github.io/${repoName}`,
      }
    } catch (error: any) {
      // Pages might already be enabled
      if (error.status === 409 || error.message?.includes("already")) {
        return {
          success: true,
          url: `https://${this.config.username}.github.io/${repoName}`,
        }
      }
      return { success: false, error: error.message }
    }
  }

  /**
   * Add a custom domain to GitHub Pages (creates CNAME file)
   */
  async setCustomDomain(
    repoName: string,
    domain: string,
  ): Promise<{ success: boolean; domain?: string; error?: string }> {
    if (!this.octokit || !this.config) {
      return { success: false, error: "GitHub not connected" }
    }

    try {
      // Create CNAME file
      const { data: blob } = await this.octokit.git.createBlob({
        owner: this.config.username,
        repo: repoName,
        content: domain,
        encoding: "utf-8",
      })

      // Get current tree
      const ref = await this.octokit.git.getRef({
        owner: this.config.username,
        repo: repoName,
        ref: "heads/main",
      })
      const commit = await this.octokit.git.getCommit({
        owner: this.config.username,
        repo: repoName,
        commit_sha: ref.data.object.sha,
      })

      // Create new tree with CNAME
      const { data: newTree } = await this.octokit.git.createTree({
        owner: this.config.username,
        repo: repoName,
        base_tree: commit.data.tree.sha,
        tree: [
          {
            path: "CNAME",
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          },
        ],
      })

      // Commit
      const { data: newCommit } = await this.octokit.git.createCommit({
        owner: this.config.username,
        repo: repoName,
        message: `Set custom domain: ${domain}`,
        tree: newTree.sha,
        parents: [ref.data.object.sha],
      })

      await this.octokit.git.updateRef({
        owner: this.config.username,
        repo: repoName,
        ref: "heads/main",
        sha: newCommit.sha,
      })

      return { success: true, domain }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Remove custom domain (delete CNAME file)
   */
  async removeCustomDomain(repoName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.octokit || !this.config) {
      return { success: false, error: "GitHub not connected" }
    }

    try {
      // Get current tree and find CNAME
      const ref = await this.octokit.git.getRef({
        owner: this.config.username,
        repo: repoName,
        ref: "heads/main",
      })
      const commit = await this.octokit.git.getCommit({
        owner: this.config.username,
        repo: repoName,
        commit_sha: ref.data.object.sha,
      })

      // Create tree without CNAME
      const treeData = await this.octokit.git.getTree({
        owner: this.config.username,
        repo: repoName,
        tree_sha: commit.data.tree.sha,
      })

      const filteredTree = treeData.data.tree.filter((item) => item.path !== "CNAME")

      const { data: newTree } = await this.octokit.git.createTree({
        owner: this.config.username,
        repo: repoName,
        tree: filteredTree.map((item) => ({
          path: item.path!,
          mode: item.mode as "100644" | "100755" | "040000",
          type: item.type as "blob" | "tree",
          sha: item.sha!,
        })),
      })

      const { data: newCommit } = await this.octokit.git.createCommit({
        owner: this.config.username,
        repo: repoName,
        message: "Remove custom domain",
        tree: newTree.sha,
        parents: [ref.data.object.sha],
      })

      await this.octokit.git.updateRef({
        owner: this.config.username,
        repo: repoName,
        ref: "heads/main",
        sha: newCommit.sha,
      })

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Delete a repo
   */
  async deleteRepo(repoName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.octokit || !this.config) {
      return { success: false, error: "GitHub not connected" }
    }

    try {
      await this.octokit.repos.delete({
        owner: this.config.username,
        repo: repoName,
      })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * List all ZYRAXON repos for this user
   */
  async listRepos(): Promise<Array<{ name: string; url: string; pagesUrl: string }>> {
    if (!this.octokit || !this.config) return []

    try {
      const { data } = await this.octokit.repos.listForAuthenticatedUser({
        per_page: 100,
        sort: "updated",
      })

      return data
        .filter((repo) => repo.name.startsWith("zyraxon-"))
        .map((repo) => ({
          name: repo.name,
          url: repo.html_url,
          pagesUrl: `https://${this.config!.username}.github.io/${repo.name}`,
        }))
    } catch {
      return []
    }
  }

  /**
   * Recursively get all files in a directory
   */
  private async getAllFiles(dir: string, files: string[] = []): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      // Skip hidden files and node_modules
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue

      if (entry.isDirectory()) {
        await this.getAllFiles(fullPath, files)
      } else {
        files.push(fullPath)
      }
    }

    return files
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: GitHubManager | null = null

export async function getGitHubManager(): Promise<GitHubManager> {
  if (!instance) {
    instance = new GitHubManager()
    await instance.initialize()
  }
  return instance
}

export function getGitHubManagerSync(): GitHubManager | null {
  return instance
}
