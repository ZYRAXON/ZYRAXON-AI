/**
 * GITHUB CONNECT TOOL
 *
 * Manages GitHub account connection for Pro Builder.
 * Supports Personal Access Token (PAT) authentication.
 */

import { Effect, Schema } from "effect"
import { Tool } from "../tool/tool"
import { getGitHubManager } from "../pro-builder/github-manager"

const DESCRIPTION = `Connect and manage GitHub account for website publishing.

Actions:
- connect: Connect GitHub account using a Personal Access Token
- disconnect: Disconnect GitHub account
- status: Check if GitHub is connected and show user info
- list_repos: List all ZYRAXON-created repositories

To connect:
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: repo (full control), user (read)
4. Copy the token
5. Use this tool with action=connect and the token

The token is stored securely at ~/.zyraxon/github.json`

const Parameters = Schema.Struct({
  action: Schema.String.annotate({
    description: "Action: connect, disconnect, status, list_repos",
  }),
  token: Schema.optional(Schema.String).annotate({
    description: "GitHub Personal Access Token (required for connect action)",
  }),
})

export const GithubConnectTool = Tool.define<typeof Parameters>(
  "github_connect",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(async () => {
            const gh = await getGitHubManager()

            switch (params.action) {
              case "connect": {
                if (!params.token) {
                  return {
                    success: false,
                    output: "",
                    error: "Token is required. Get one at https://github.com/settings/tokens (scopes: repo, user)",
                  }
                }

                const connectResult = await gh.connectWithToken(params.token)
                if (!connectResult.success) {
                  return {
                    success: false,
                    output: "",
                    error: `Failed to connect: ${connectResult.error}`,
                  }
                }

                return {
                  success: true,
                  output: JSON.stringify({
                    message: `GitHub connected successfully!`,
                    username: connectResult.username,
                    nextSteps: [
                      "You can now publish websites to GitHub Pages",
                      "Use site_publish tool to publish a site",
                      "Use site_domain tool to add custom domains",
                    ],
                  }, null, 2),
                }
              }

              case "disconnect": {
                await gh.disconnect()
                return {
                  success: true,
                  output: JSON.stringify({
                    message: "GitHub disconnected.",
                  }, null, 2),
                }
              }

              case "status": {
                const connected = gh.isConnected()
                if (!connected) {
                  return {
                    success: true,
                    output: JSON.stringify({
                      connected: false,
                      message: "GitHub not connected. Use action=connect with a Personal Access Token.",
                      tokenUrl: "https://github.com/settings/tokens",
                      requiredScopes: ["repo", "user"],
                    }, null, 2),
                  }
                }

                const user = await gh.getUser()
                const repos = await gh.listRepos()

                return {
                  success: true,
                  output: JSON.stringify({
                    connected: true,
                    username: user?.username,
                    email: user?.email,
                    zyraxonRepos: repos.length,
                    repos: repos.slice(0, 10),
                  }, null, 2),
                }
              }

              case "list_repos": {
                if (!gh.isConnected()) {
                  return { success: false, output: "", error: "GitHub not connected." }
                }

                const repos = await gh.listRepos()
                return {
                  success: true,
                  output: JSON.stringify({
                    message: `Found ${repos.length} ZYRAXON repo(s)`,
                    repos,
                  }, null, 2),
                }
              }

              default:
                return { success: false, output: "", error: `Unknown action: ${params.action}` }
            }
          })

          return {
            title: `GitHub ${params.action}`,
            metadata: {},
            output: result.output || (result.success ? "Done" : result.error || "Unknown error"),
          }
        }),
    }
  }),
)
