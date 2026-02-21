# AGENTS.md - Workers SDK CI Analyzer

## Project Overview

Dashboard for analyzing CI health and test flakiness in the cloudflare/workers-sdk GitHub repository. Built as a Cloudflare Worker with React Router frontend, it fetches CI data, stores it in D1, and presents analytics via Chart.js.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: React Router v7 (SSR on Workers)
- **Database**: Cloudflare D1 (SQLite)
- **Charts**: Chart.js with date-fns adapter
- **Build**: Vite + Wrangler
- **Language**: TypeScript

## Build & Test Commands

```bash
npm install                # Install dependencies
npm run dev                # Local dev server
npm run build              # Production build (react-router build)
npm run typecheck           # TypeScript type checking
npm run deploy             # Build + wrangler deploy (staging)
npm run deploy:prod        # Build + wrangler deploy (production)
npm run typegen            # Generate Wrangler types
```

## Project Structure

- `app/` — React Router application (routes, components, styles)
- `workers/` — Cloudflare Worker entry point and API handlers
- `public/` — Static assets
- `scripts/` — Utility and data scripts
- `react-router.config.ts` — React Router configuration

## Code Conventions

- TypeScript strict mode
- React Router v7 patterns for SSR on Workers
- D1 for data persistence
- Chart.js for data visualization

## Review Focus Areas

- Data fetching logic accuracy (GitHub API integration)
- D1 query correctness and performance
- React component rendering and SSR compatibility on Workers
- Chart.js configuration and data formatting
- Wrangler/Workers configuration changes
