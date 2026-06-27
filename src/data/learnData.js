// Registry of learn/study data, keyed by `${anchorId}:${breadth}`. Each entry has
// { id, title, scope, prelude, subAnchors } (generated entries also carry `breadth`) — the fact
// cards used by the study/write flow and (server-side) by the marking engine. Emergence of Life is
// hand-authored (breadth A); others are generated via the learn pipeline (scripts/learn-chain-
// harness.mjs --save-id, one file per breadth). Use .js extensions so this resolves under Node too
// (lib/marking.js imports this module).
import { EMERGENCE_FACTS } from './emergenceFacts.js'
import ww1A from './learn/2A-XKOOC-A.js'
import ww1B from './learn/2A-XKOOC-B.js'

const REGISTRY = {
  '1A-E8F2G:A': EMERGENCE_FACTS,
  [`${ww1A.id}:${ww1A.breadth}`]: ww1A,
  [`${ww1B.id}:${ww1B.breadth}`]: ww1B,
}

export function getLearnData(id, breadth = 'A') {
  return REGISTRY[`${id}:${breadth}`] || null
}

export const LEARN_KEYS = Object.keys(REGISTRY)
