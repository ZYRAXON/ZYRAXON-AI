/**
 * PRO BUILDER TEMPLATES
 * 
 * Pre-built HTML/CSS/JS templates for different website types.
 * Each template is a complete, responsive, production-ready website.
 * 
 * All templates use:
 * - SVG icons (NO emoji)
 * - CSS gradients/shapes (NO decorative images)
 * - Mobile-first responsive design
 * - Dark/Light theme support
 * - Google Fonts
 * - Smooth animations
 */

import type { SiteConfig, ThemeConfig } from "./engine"

// ─── Template Types ─────────────────────────────────────────────────────────

export interface Template {
  name: string
  description: string
  generate: (config: SiteConfig) => TemplateOutput
}

export interface TemplateOutput {
  html: string
  css: string
  js: string
}

// ─── SVG Icon Library ───────────────────────────────────────────────────────

export const SVG_ICONS = {
  // Navigation
  menu: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  arrowUpRight: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`,

  // Social
  github: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`,
  twitter: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  linkedin: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
  email: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  discord: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,

  // Features
  code: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  design: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`,
  rocket: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  zap: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  globe: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  layers: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  database: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  lock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  cpu: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  mail: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  phone: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  mapPin: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  sun: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
} as const

// ─── CSS Utilities ──────────────────────────────────────────────────────────

function generateCSSVars(theme: ThemeConfig): string {
  return `
    :root {
      --primary: ${theme.primaryColor};
      --secondary: ${theme.secondaryColor};
      --bg: ${theme.backgroundColor};
      --surface: ${theme.surfaceColor};
      --text: ${theme.textColor};
      --muted: ${theme.mutedTextColor};
      --border: ${theme.borderColor};
      --font: ${theme.fontFamily};
      --heading-font: ${theme.headingFont};
      --radius: ${theme.borderRadius};
    }
  `
}

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  
  html {
    scroll-behavior: smooth;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    overflow-x: hidden;
  }
  
  img, video { max-width: 100%; height: auto; }
  
  a { color: inherit; text-decoration: none; }
  
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
  }
  
  .section {
    padding: 80px 0;
  }
  
  .section-title {
    font-family: var(--heading-font);
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 700;
    margin-bottom: 16px;
  }
  
  .section-subtitle {
    color: var(--muted);
    font-size: 1.125rem;
    max-width: 600px;
  }
  
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: var(--radius);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    font-family: var(--font);
  }
  
  .btn-primary {
    background: var(--primary);
    color: white;
  }
  
  .btn-primary:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
  
  .btn-outline {
    background: transparent;
    border: 2px solid var(--border);
    color: var(--text);
  }
  
  .btn-outline:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
  
  .btn svg {
    width: 20px;
    height: 20px;
  }
  
  .gradient-text {
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  .glass {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius);
  }
  
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  .animate-fade-in { animation: fadeInUp 0.6s ease forwards; }
  .animate-float { animation: float 3s ease-in-out infinite; }
  
  @media (max-width: 768px) {
    .section { padding: 48px 0; }
    .container { padding: 0 16px; }
  }
`

// ─── Portfolio Template ─────────────────────────────────────────────────────

const portfolioTemplate: Template = {
  name: "portfolio",
  description: "Professional portfolio website",
  generate: (config: SiteConfig) => ({
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${config.metadata.description || config.name + ' - Portfolio'}">
  <title>${config.metadata.title || config.name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- Navigation -->
  <nav class="nav">
    <div class="container nav-inner">
      <a href="#" class="nav-logo">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="var(--primary)"/>
          <path d="M10 22L16 10L22 22" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>${config.metadata.name || "Portfolio"}</span>
      </a>
      <div class="nav-links">
        <a href="#about">About</a>
        <a href="#projects">Projects</a>
        <a href="#skills">Skills</a>
        <a href="#contact">Contact</a>
      </div>
      <button class="nav-toggle" aria-label="Menu">
        ${SVG_ICONS.menu}
      </button>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="container">
      <div class="hero-content">
        <div class="hero-badge">Available for work</div>
        <h1 class="hero-title">
          Hi, I'm <span class="gradient-text">${config.metadata.name || "Developer"}</span>
        </h1>
        <p class="hero-subtitle">${config.metadata.subtitle || "Building digital experiences with clean code and creative design."}</p>
        <div class="hero-actions">
          <a href="#projects" class="btn btn-primary">
            View Projects
            ${SVG_ICONS.arrowRight}
          </a>
          <a href="#contact" class="btn btn-outline">
            Contact Me
            ${SVG_ICONS.email}
          </a>
        </div>
      </div>
      <div class="hero-visual">
        <div class="hero-shape"></div>
        <div class="hero-code">
          <pre><code><span class="code-keyword">const</span> <span class="code-var">developer</span> = {
  <span class="code-key">name</span>: <span class="code-string">"${config.metadata.name || "Developer"}"</span>,
  <span class="code-key">skills</span>: [<span class="code-string">"Web"</span>, <span class="code-string">"Design"</span>, <span class="code-string">"Code"</span>],
  <span class="code-key">passion</span>: <span class="code-string">"Building things"</span>
};</code></pre>
        </div>
      </div>
    </div>
  </section>

  <!-- About -->
  <section id="about" class="section">
    <div class="container">
      <h2 class="section-title">About <span class="gradient-text">Me</span></h2>
      <p class="section-subtitle">${config.metadata.about || "Passionate about creating elegant solutions to complex problems."}</p>
      <div class="about-grid">
        <div class="about-card glass">
          <div class="about-icon">${SVG_ICONS.code}</div>
          <h3>Clean Code</h3>
          <p>Writing maintainable, scalable code that stands the test of time.</p>
        </div>
        <div class="about-card glass">
          <div class="about-icon">${SVG_ICONS.design}</div>
          <h3>UI/UX Design</h3>
          <p>Creating intuitive interfaces that users love to interact with.</p>
        </div>
        <div class="about-card glass">
          <div class="about-icon">${SVG_ICONS.rocket}</div>
          <h3>Performance</h3>
          <p>Optimizing for speed and efficiency in every project.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Projects -->
  <section id="projects" class="section">
    <div class="container">
      <h2 class="section-title">Featured <span class="gradient-text">Projects</span></h2>
      <p class="section-subtitle">A selection of my recent work.</p>
      <div class="projects-grid">
        <div class="project-card glass">
          <div class="project-image">
            <div class="project-placeholder">
              ${SVG_ICONS.layers}
            </div>
          </div>
          <div class="project-info">
            <h3>Project One</h3>
            <p>A full-stack web application built with modern technologies.</p>
            <div class="project-tags">
              <span>React</span><span>Node.js</span><span>MongoDB</span>
            </div>
            <a href="#" class="project-link">
              View Project ${SVG_ICONS.arrowUpRight}
            </a>
          </div>
        </div>
        <div class="project-card glass">
          <div class="project-image">
            <div class="project-placeholder">
              ${SVG_ICONS.globe}
            </div>
          </div>
          <div class="project-info">
            <h3>Project Two</h3>
            <p>An e-commerce platform with real-time inventory management.</p>
            <div class="project-tags">
              <span>Next.js</span><span>Stripe</span><span>PostgreSQL</span>
            </div>
            <a href="#" class="project-link">
              View Project ${SVG_ICONS.arrowUpRight}
            </a>
          </div>
        </div>
        <div class="project-card glass">
          <div class="project-image">
            <div class="project-placeholder">
              ${SVG_ICONS.zap}
            </div>
          </div>
          <div class="project-info">
            <h3>Project Three</h3>
            <p>A mobile-first PWA with offline capabilities.</p>
            <div class="project-tags">
              <span>Vue.js</span><span>Firebase</span><span>PWA</span>
            </div>
            <a href="#" class="project-link">
              View Project ${SVG_ICONS.arrowUpRight}
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Skills -->
  <section id="skills" class="section">
    <div class="container">
      <h2 class="section-title">My <span class="gradient-text">Skills</span></h2>
      <p class="section-subtitle">Technologies I work with.</p>
      <div class="skills-grid">
        <div class="skill-item glass">
          <div class="skill-icon">${SVG_ICONS.code}</div>
          <span>JavaScript</span>
        </div>
        <div class="skill-item glass">
          <div class="skill-icon">${SVG_ICONS.code}</div>
          <span>TypeScript</span>
        </div>
        <div class="skill-item glass">
          <div class="skill-icon">${SVG_ICONS.layers}</div>
          <span>React</span>
        </div>
        <div class="skill-item glass">
          <div class="skill-icon">${SVG_ICONS.globe}</div>
          <span>Node.js</span>
        </div>
        <div class="skill-item glass">
          <div class="skill-icon">${SVG_ICONS.database}</div>
          <span>PostgreSQL</span>
        </div>
        <div class="skill-item glass">
          <div class="skill-icon">${SVG_ICONS.design}</div>
          <span>Figma</span>
        </div>
        <div class="skill-item glass">
          <div class="skill-icon">${SVG_ICONS.shield}</div>
          <span>Git</span>
        </div>
        <div class="skill-item glass">
          <div class="skill-icon">${SVG_ICONS.rocket}</div>
          <span>Docker</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Contact -->
  <section id="contact" class="section">
    <div class="container">
      <h2 class="section-title">Get In <span class="gradient-text">Touch</span></h2>
      <p class="section-subtitle">Have a project in mind? Let's talk.</p>
      <div class="contact-grid">
        <div class="contact-info">
          <div class="contact-item glass">
            <div class="contact-icon">${SVG_ICONS.email}</div>
            <div>
              <h4>Email</h4>
              <p>${config.metadata.email || "hello@example.com"}</p>
            </div>
          </div>
          <div class="contact-item glass">
            <div class="contact-icon">${SVG_ICONS.mapPin}</div>
            <div>
              <h4>Location</h4>
              <p>${config.metadata.location || "Remote"}</p>
            </div>
          </div>
          <div class="social-links">
            <a href="${config.metadata.github || "#"}" class="social-link glass" aria-label="GitHub">
              ${SVG_ICONS.github}
            </a>
            <a href="${config.metadata.linkedin || "#"}" class="social-link glass" aria-label="LinkedIn">
              ${SVG_ICONS.linkedin}
            </a>
            <a href="${config.metadata.twitter || "#"}" class="social-link glass" aria-label="Twitter">
              ${SVG_ICONS.twitter}
            </a>
          </div>
        </div>
        <form class="contact-form glass" id="contactForm">
          <div class="form-group">
            <label for="name">Name</label>
            <input type="text" id="name" name="name" required>
          </div>
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required>
          </div>
          <div class="form-group">
            <label for="message">Message</label>
            <textarea id="message" name="message" rows="5" required></textarea>
          </div>
          <button type="submit" class="btn btn-primary">
            Send Message
            ${SVG_ICONS.arrowRight}
          </button>
        </form>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="container footer-inner">
      <p>&copy; ${new Date().getFullYear()} ${config.metadata.name || "Portfolio"}. All rights reserved.</p>
      <p>Built with ${SVG_ICONS.heart} by ${config.metadata.name || "Developer"}</p>
    </div>
  </footer>

  <script src="script.js"></script>
</body>
</html>`,
    css: `${generateCSSVars(config.theme)}
${BASE_CSS}

/* Navigation */
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 16px 0;
  background: rgba(10, 10, 10, 0.8);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border);
}

.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 700;
  font-size: 1.25rem;
  font-family: var(--heading-font);
}

.nav-links {
  display: flex;
  gap: 32px;
}

.nav-links a {
  color: var(--muted);
  transition: color 0.2s;
  font-weight: 500;
}

.nav-links a:hover {
  color: var(--text);
}

.nav-toggle {
  display: none;
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  padding: 8px;
}

/* Hero */
.hero {
  min-height: 100vh;
  display: flex;
  align-items: center;
  padding-top: 80px;
}

.hero .container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 60px;
  align-items: center;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 100px;
  font-size: 0.875rem;
  color: var(--primary);
  margin-bottom: 24px;
}

.hero-badge::before {
  content: "";
  width: 8px;
  height: 8px;
  background: var(--primary);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.hero-title {
  font-family: var(--heading-font);
  font-size: clamp(2.5rem, 6vw, 4rem);
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 24px;
}

.hero-subtitle {
  font-size: 1.25rem;
  color: var(--muted);
  margin-bottom: 32px;
  max-width: 500px;
}

.hero-actions {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.hero-visual {
  position: relative;
  display: flex;
  justify-content: center;
}

.hero-shape {
  position: absolute;
  width: 300px;
  height: 300px;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
  opacity: 0.2;
  filter: blur(40px);
  animation: float 6s ease-in-out infinite;
}

.hero-code {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.875rem;
  line-height: 1.8;
  max-width: 400px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.3);
}

.code-keyword { color: #c792ea; }
.code-var { color: #82aaff; }
.code-key { color: #f78c6c; }
.code-string { color: #c3e88d; }

/* About */
.about-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-top: 48px;
}

.about-card {
  padding: 32px;
  text-align: center;
}

.about-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  border-radius: 16px;
  color: white;
}

.about-card h3 {
  font-family: var(--heading-font);
  font-size: 1.25rem;
  margin-bottom: 12px;
}

.about-card p {
  color: var(--muted);
  font-size: 0.95rem;
}

/* Projects */
.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 24px;
  margin-top: 48px;
}

.project-card {
  overflow: hidden;
  transition: transform 0.3s ease;
}

.project-card:hover {
  transform: translateY(-4px);
}

.project-image {
  aspect-ratio: 16/9;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  display: flex;
  align-items: center;
  justify-content: center;
}

.project-placeholder {
  color: rgba(255,255,255,0.3);
}

.project-placeholder svg {
  width: 64px;
  height: 64px;
}

.project-info {
  padding: 24px;
}

.project-info h3 {
  font-family: var(--heading-font);
  font-size: 1.25rem;
  margin-bottom: 8px;
}

.project-info p {
  color: var(--muted);
  font-size: 0.95rem;
  margin-bottom: 16px;
}

.project-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.project-tags span {
  padding: 4px 12px;
  background: rgba(99, 102, 241, 0.1);
  border-radius: 100px;
  font-size: 0.8rem;
  color: var(--primary);
}

.project-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--primary);
  font-weight: 600;
  font-size: 0.95rem;
}

.project-link svg {
  width: 18px;
  height: 18px;
}

/* Skills */
.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  margin-top: 48px;
}

.skill-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 16px;
  text-align: center;
  transition: transform 0.2s, border-color 0.2s;
}

.skill-item:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
}

.skill-icon {
  color: var(--primary);
}

.skill-icon svg {
  width: 32px;
  height: 32px;
}

/* Contact */
.contact-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  margin-top: 48px;
}

.contact-item {
  display: flex;
  gap: 16px;
  padding: 20px;
  margin-bottom: 16px;
}

.contact-icon {
  color: var(--primary);
  flex-shrink: 0;
}

.contact-icon svg {
  width: 24px;
  height: 24px;
}

.contact-item h4 {
  font-size: 1rem;
  margin-bottom: 4px;
}

.contact-item p {
  color: var(--muted);
  font-size: 0.95rem;
}

.social-links {
  display: flex;
  gap: 12px;
}

.social-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  transition: transform 0.2s, border-color 0.2s;
}

.social-link:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
}

.social-link svg {
  width: 20px;
  height: 20px;
}

.contact-form {
  padding: 32px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font);
  font-size: 1rem;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--primary);
}

.form-group textarea {
  resize: vertical;
  min-height: 120px;
}

/* Footer */
.footer {
  padding: 32px 0;
  border-top: 1px solid var(--border);
}

.footer-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--muted);
  font-size: 0.9rem;
}

.footer-inner p:last-child {
  display: flex;
  align-items: center;
  gap: 6px;
}

.footer-inner svg {
  width: 16px;
  height: 16px;
  color: #ef4444;
  fill: #ef4444;
}

/* Mobile */
@media (max-width: 768px) {
  .nav-links { display: none; }
  .nav-toggle { display: block; }
  .nav-links.active {
    display: flex;
    flex-direction: column;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--surface);
    padding: 24px;
    border-bottom: 1px solid var(--border);
  }
  .hero .container { grid-template-columns: 1fr; text-align: center; }
  .hero-subtitle { margin-left: auto; margin-right: auto; }
  .hero-actions { justify-content: center; }
  .hero-visual { display: none; }
  .contact-grid { grid-template-columns: 1fr; }
  .footer-inner { flex-direction: column; gap: 12px; text-align: center; }
}`,
    js: `// Mobile nav toggle
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

navToggle?.addEventListener('click', () => {
  navLinks.classList.toggle('active');
  navToggle.innerHTML = navLinks.classList.contains('active')
    ? '${SVG_ICONS.close.replace(/'/g, "\\'")}'
    : '${SVG_ICONS.menu.replace(/'/g, "\\'")}';
});

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      navLinks?.classList.remove('active');
    }
  });
});

// Intersection Observer for animations
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-fade-in');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.section-title, .section-subtitle, .about-card, .project-card, .skill-item').forEach(el => {
  el.style.opacity = '0';
  observer.observe(el);
});

// Contact form
document.getElementById('contactForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  alert('Thank you for your message! (This is a demo)');
  e.target.reset();
});

// Nav background on scroll
window.addEventListener('scroll', () => {
  const nav = document.querySelector('.nav');
  if (window.scrollY > 50) {
    nav.style.background = 'rgba(10, 10, 10, 0.95)';
  } else {
    nav.style.background = 'rgba(10, 10, 10, 0.8)';
  }
});`,
  }),
}

// ─── Landing Page Template ──────────────────────────────────────────────────

const landingTemplate: Template = {
  name: "landing",
  description: "Modern landing page",
  generate: (config: SiteConfig) => ({
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${config.metadata.description || config.name}">
  <title>${config.metadata.title || config.name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- Navigation -->
  <nav class="nav">
    <div class="container nav-inner">
      <a href="#" class="nav-logo">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="var(--primary)"/>
          <path d="M10 16h12M16 10v12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <span>${config.metadata.name || config.name}</span>
      </a>
      <div class="nav-links">
        <a href="#features">Features</a>
        <a href="#how-it-works">How it Works</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
      </div>
      <a href="#cta" class="btn btn-primary nav-cta">Get Started</a>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-bg"></div>
    <div class="container hero-content">
      <div class="hero-badge">New Release</div>
      <h1 class="hero-title">
        ${config.metadata.headline || 'Build Something <span class="gradient-text">Amazing</span> Today'}
      </h1>
      <p class="hero-subtitle">${config.metadata.subheadline || 'The all-in-one platform that helps you ship faster, scale easier, and build better products.'}</p>
      <div class="hero-actions">
        <a href="#cta" class="btn btn-primary">
          Start Free Trial
          ${SVG_ICONS.arrowRight}
        </a>
        <a href="#how-it-works" class="btn btn-outline">
          ${SVG_ICONS.rocket}
          See How it Works
        </a>
      </div>
      <div class="hero-proof">
        <div class="hero-users">
          <div class="avatar-stack">
            <div class="avatar" style="background: #6366f1;">A</div>
            <div class="avatar" style="background: #8b5cf6;">B</div>
            <div class="avatar" style="background: #ec4899;">C</div>
            <div class="avatar" style="background: #f59e0b;">D</div>
          </div>
          <p>Trusted by 10,000+ developers</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section id="features" class="section">
    <div class="container">
      <div class="section-header">
        <div class="section-badge">Features</div>
        <h2 class="section-title">Everything you need to <span class="gradient-text">succeed</span></h2>
        <p class="section-subtitle">Powerful features designed to help you build, launch, and grow your projects.</p>
      </div>
      <div class="features-grid">
        <div class="feature-card glass">
          <div class="feature-icon">${SVG_ICONS.zap}</div>
          <h3>Lightning Fast</h3>
          <p>Optimized performance that loads in milliseconds. Your users will love it.</p>
        </div>
        <div class="feature-card glass">
          <div class="feature-icon">${SVG_ICONS.shield}</div>
          <h3>Secure by Default</h3>
          <p>Enterprise-grade security built into every layer. Sleep peacefully.</p>
        </div>
        <div class="feature-card glass">
          <div class="feature-icon">${SVG_ICONS.layers}</div>
          <h3>Scalable Architecture</h3>
          <p>From prototype to production, scales with your growth seamlessly.</p>
        </div>
        <div class="feature-card glass">
          <div class="feature-icon">${SVG_ICONS.database}</div>
          <h3>Smart Analytics</h3>
          <p>Data-driven insights to help you make better decisions, faster.</p>
        </div>
        <div class="feature-card glass">
          <div class="feature-icon">${SVG_ICONS.globe}</div>
          <h3>Global CDN</h3>
          <p>Deploy worldwide with edge locations in 50+ regions.</p>
        </div>
        <div class="feature-card glass">
          <div class="feature-icon">${SVG_ICONS.users}</div>
          <h3>Team Collaboration</h3>
          <p>Work together in real-time with built-in collaboration tools.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section id="cta" class="section cta-section">
    <div class="container">
      <div class="cta-card glass">
        <h2>Ready to get started?</h2>
        <p>Join thousands of developers who are already building the future.</p>
        <a href="#" class="btn btn-primary">
          Start Building for Free
          ${SVG_ICONS.arrowRight}
        </a>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="container footer-inner">
      <p>&copy; ${new Date().getFullYear()} ${config.metadata.name || config.name}. All rights reserved.</p>
      <div class="footer-links">
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
        <a href="#">Contact</a>
      </div>
    </div>
  </footer>

  <script src="script.js"></script>
</body>
</html>`,
    css: `${generateCSSVars(config.theme)}
${BASE_CSS}

.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  padding: 16px 0;
  background: rgba(10,10,10,0.8); backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border);
}
.nav-inner { display: flex; align-items: center; justify-content: space-between; }
.nav-logo { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 1.25rem; font-family: var(--heading-font); }
.nav-links { display: flex; gap: 32px; }
.nav-links a { color: var(--muted); transition: color 0.2s; font-weight: 500; }
.nav-links a:hover { color: var(--text); }
.nav-cta { padding: 10px 20px; font-size: 0.9rem; }

.hero {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  text-align: center; padding-top: 80px; position: relative; overflow: hidden;
}
.hero-bg {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, rgba(99,102,241,0.15) 0%, transparent 70%);
}
.hero-content { position: relative; max-width: 800px; }
.hero-badge {
  display: inline-flex; padding: 8px 16px; margin-bottom: 24px;
  background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.3);
  border-radius: 100px; font-size: 0.875rem; color: var(--primary);
}
.hero-title { font-family: var(--heading-font); font-size: clamp(2.5rem,6vw,4.5rem); font-weight: 700; line-height: 1.1; margin-bottom: 24px; }
.hero-subtitle { font-size: 1.25rem; color: var(--muted); margin-bottom: 40px; max-width: 600px; margin-left: auto; margin-right: auto; }
.hero-actions { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin-bottom: 48px; }
.hero-proof { display: flex; justify-content: center; }
.hero-users { display: flex; align-items: center; gap: 16px; }
.avatar-stack { display: flex; }
.avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; color: white; margin-left: -12px; border: 2px solid var(--bg); }
.avatar:first-child { margin-left: 0; }
.hero-users p { color: var(--muted); font-size: 0.9rem; }

.section-header { text-align: center; margin-bottom: 48px; }
.section-badge {
  display: inline-flex; padding: 6px 14px; margin-bottom: 16px;
  background: rgba(99,102,241,0.1); border-radius: 100px;
  font-size: 0.8rem; color: var(--primary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
}
.section-header .section-subtitle { margin-left: auto; margin-right: auto; }

.features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
.feature-card { padding: 32px; transition: transform 0.3s; }
.feature-card:hover { transform: translateY(-4px); }
.feature-icon { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--primary), var(--secondary)); border-radius: 12px; color: white; margin-bottom: 20px; }
.feature-card h3 { font-family: var(--heading-font); font-size: 1.25rem; margin-bottom: 12px; }
.feature-card p { color: var(--muted); font-size: 0.95rem; }

.cta-section { padding: 48px 0 80px; }
.cta-card { padding: 64px 48px; text-align: center; background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1)); border: 1px solid rgba(99,102,241,0.2); }
.cta-card h2 { font-family: var(--heading-font); font-size: clamp(1.75rem,4vw,2.5rem); margin-bottom: 16px; }
.cta-card p { color: var(--muted); font-size: 1.125rem; margin-bottom: 32px; }

.footer { padding: 32px 0; border-top: 1px solid var(--border); }
.footer-inner { display: flex; justify-content: space-between; align-items: center; color: var(--muted); font-size: 0.9rem; }
.footer-links { display: flex; gap: 24px; }
.footer-links a { color: var(--muted); transition: color 0.2s; }
.footer-links a:hover { color: var(--text); }

@media (max-width: 768px) {
  .nav-links { display: none; }
  .features-grid { grid-template-columns: 1fr; }
  .cta-card { padding: 40px 24px; }
  .footer-inner { flex-direction: column; gap: 16px; text-align: center; }
}`,
    js: `// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});

// Intersection Observer
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-fade-in');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feature-card, .section-title, .section-subtitle').forEach(el => {
  el.style.opacity = '0';
  observer.observe(el);
});`,
  }),
}

// ─── Template Registry ──────────────────────────────────────────────────────

export const TEMPLATES: Record<string, Template> = {
  portfolio: portfolioTemplate,
  landing: landingTemplate,
  blog: portfolioTemplate, // Placeholder - AI will customize
  ecommerce: portfolioTemplate,
  business: portfolioTemplate,
  restaurant: portfolioTemplate,
  saas: landingTemplate,
  dashboard: portfolioTemplate,
  gallery: portfolioTemplate,
  custom: portfolioTemplate,
}

export function getTemplate(name: string): Template {
  return TEMPLATES[name] || TEMPLATES.custom
}

export function getTemplateNames(): string[] {
  return Object.keys(TEMPLATES)
}
