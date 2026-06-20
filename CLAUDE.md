# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fractal History is an educational platform that teaches world history through a hierarchical "fractal" structure. Users navigate from broad historical concepts down to specific topics, with each anchor (topic) branching into sub-anchors with progressively more detail.

## Commands

```bash
vercel dev       # Start dev server (localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Architecture

**Stack:** React 18 + Vite frontend, Vercel serverless API, Neon PostgreSQL, OpenAI for anchor generation

**Key Directories:**
- `src/components/` - React components (App.jsx manages view routing)
- `api/` - Vercel serverless endpoints
- `src/data/` - Static data including tree hierarchy definitions

**API Endpoints:**
- `GET /api/get-tree` - Fetch tree nodes (params: `parentId`, `breadth`)
- `GET /api/get-generation-metadata` - Fetch AI selection reasoning
- `GET /api/anchors` - Query tree positions
- `POST /api/generate-anchors` - Generate new anchors via OpenAI

## Data Model

**Anchor ID Format:**
- Level 0: `0-ROOT`
- Level 1A: `1A-XXXXX` (analytical anchors)
- Level 1B: `1B-XXXXX` (temporal anchors)
- Deeper levels: `{level}{breadth}-{hash}`

**Breadth System (applies to ALL levels):**
- A = Analytical anchors (most essential aspects/themes)
- B = Temporal anchors (complete time coverage)
- C = Geographic anchors (complete space coverage)

**Database Tables:**
- `anchors` - Core topic definitions (id, title, scope, generation_status)
- `tree_positions` - Hierarchical positioning (position_id, anchor_id, parent_position_id, level, breadth, position)
- `anchor_generation_metadata` - AI generation reasoning

## Environment Setup

Create `.env.local` with:
- `DATABASE_URL` - Neon PostgreSQL connection string
- `OPENAI_API_KEY` - OpenAI API key

## Key Files

- `src/components/TreeVisualization.jsx` - Large (900+ lines) interactive SVG tree component
- `api/generate-anchors.js` - Core AI integration for anchor generation
- `src/data/treeStructure.js` - Complete anchor hierarchy definition

## Parallel Sessions Protocol

When more than one Claude session (or person) works on this repo at the same time,
follow this protocol. It exists because all sessions previously shared one working
directory and pushed straight to `main`, which caused two failures: git index race
conditions (one session's staging area clobbered another's), and one broken commit
blocking every session's deploy because `main` is the production deploy target.

**Rules:**

1. **One branch per session. Never push to `main` directly while another session is
   active.** Branch names: `feat/<area>` for features, `fix/<area>` for fixes,
   `ops/<area>` for tooling or config. Example: `feat/anchor-generation`,
   `fix/mobile-why-panel`.

2. **One git worktree per session.** Each session works in its own directory with its
   own index, so sessions cannot corrupt each other's staging area. They share the
   same git history and object store, so branches and fetches are visible to all.
   Create one with the helper:

   ```powershell
   pwsh scripts/new-worktree.ps1 feat/my-feature
   # -> creates ../fractal-history-wt/feat-my-feature off the latest origin/main
   ```

   Then `cd` into that directory and run `npm install` once (each worktree has its
   own `node_modules`).

3. **Test on the branch's Vercel preview deploy, not on production.** Pushing a
   branch creates an isolated preview URL. A broken branch never affects production
   or the other sessions. Find the preview URL on the PR or the Vercel dashboard.

4. **Local dev servers contend for ports.** The local workaround binds fixed ports
   (`:3000` frontend, `:3001` API), so only one session can run it at a time. If you
   need local dev while another session holds those ports, either rely on the preview
   deploy instead, or override the ports in `vite.dev-local.config.js` and
   `dev-api-server.mjs` for your session.

5. **Merge to `main` only via a pull request, and only when the preview deploy is
   green.** `main` stays deployable at all times. Open the PR with
   `gh pr create --fill --base main`.

6. **Stay in your lane.** Edit the files your task owns. If two sessions must touch
   the same file, coordinate through the human rather than editing the shared
   working tree.

**Deploy mechanism:** Vercel auto-deploys production from `origin/main` and creates a
preview deploy for every other branch. This supersedes any older instruction to push
fixes straight to `main`; that default only holds for a single solo session.
