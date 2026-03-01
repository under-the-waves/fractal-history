# Fractal History MVP - Project Summary

## Core Concept
Educational web app teaching world history through 30 essential "anchors" (topics) with AI-generated Dan Carlin-style narratives and simple flashcards.

## Content Structure
- **30 anchors** covering Big Bang to present (from existing curriculum)
- Each anchor: ~1000-word narrative + 5 key concepts + 5 quiz questions
- Sequential learning path with prerequisites
- Visual fractal tree map showing progress

## Tech Stack

### Frontend
- React app (component-based UI)
- Hosted on Vercel (free tier, auto-deploys from GitHub)
- Tailwind CSS for styling
- localStorage for progress tracking (no login/database initially - stores data in user's browser)

### Backend
- Vercel serverless functions (run code on-demand, no server management)
- Node.js/Express API routes

### LLM Integration
- **Content generation**: OpenAI gpt-oss-20b via Hugging Face Inference API
  - Open-source model, free tier (1000 requests/month)
  - Generates historical narratives from prompts
- **Fact-checking**: Perplexity API with built-in web search
  - LLM with web search capability (~$0.03/anchor)
  - Verifies factual claims against web sources
  - Auto-corrects errors before caching content
- Two-step process: Generate → Fact-check with web search → Auto-correct if needed → Cache approved content

### Code Storage
- GitHub repository
- Auto-deploy to Vercel on push

## Content Pipeline

### Prompt Structure
```javascript
const prompt = `
${SYSTEM_INSTRUCTIONS} // Full methodology from documents
${ANCHOR_DATA}         // Specific anchor details
${FORMAT_REQUIREMENTS} // Expected output structure
`;
```

### Quality Control
1. Generate narrative with gpt-oss (conservative prompting)
2. Fact-check with Perplexity web search
3. Auto-correct errors if found
4. Human spot-check for style/pedagogy
5. Cache approved content

## User Interface

### Core Pages
1. **Landing** - Explain concept, CTA to start
2. **Anchor List/Dashboard** - Show all 30 anchors with progress
3. **Reading Page** - Display narrative (clean typography, minimal UI)
4. **Quiz Page** - 5 questions, immediate feedback
5. **Results** - Score + continue to next anchor

### Visual Fractal Map
- Interactive tree diagram showing learning progress
- Node states: completed (✓), current (→), available (○), locked (🔒)
- Unlock animations when completing anchors
- Click nodes to navigate
- Start simple (static SVG), enhance later (React Flow)

## Costs (First 3 Months)
- Hosting: $0 (Vercel free tier)
- LLM API: ~$1-2 for initial 30 narratives
- Domain (optional): $12/year
- **Total: ~$1-2 to launch**

## Future Enhancements (Not MVP)
- User accounts/authentication
- Spaced repetition scheduling
- Social features
- Mobile app
- Expanded anchor tree beyond 30
- Multiple complexity levels for questions