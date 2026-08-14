/**
 * Application-wide constants and configuration
 */
export const config = {
  // Base URL
  baseUrl: "https://zyraxonai.lovable.app",

  // GitHub
  github: {
    repoUrl: "https://github.com/onelpawarai/ZYRAXON-AI",
    starsFormatted: {
      compact: "160K",
      full: "160,000",
    },
  },

  // Social links
  social: {
    twitter: "",
    discord: "https://discord.gg/GP8yX33NA",
  },

  // Static stats (used on landing page)
  stats: {
    contributors: "900",
    commits: "13,000",
    monthlyUsers: "7.5M",
  },
} as const
