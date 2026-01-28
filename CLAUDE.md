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
