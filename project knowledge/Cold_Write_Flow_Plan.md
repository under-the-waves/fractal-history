# Cold-write flow + kinder marking — implementation plan

Branch: `feat/cold-write-flow`. Two connected changes, built together.

## The flow

```
start
  → COLD WRITE      write what you already know; card generation runs in the background   [Skip this]
  → mark            kind, coverage-based; counts for XP like any write
  → result          score only changes the guiding text; every next step is reachable.
                    Guidance ALWAYS encourages: read the cards, then write it again.
  → FACT CARDS      study
  → SECOND WRITE    from memory (textarea keeps the cold-write text to extend); before flashcards
  → mark            same marker; overwrites the session's mark
  → FLASHCARDS      save to deck — no gap badging
  → NARRATIVE       the reveal
```

Principles:
- No step is ever locked. The score only points at the sensible next step.
- The write comes before the flashcards; the cold write is the first from-memory act and stays effortful.
- Cold and informed writes are both just `action=mark`; the endpoint doesn't distinguish them.

## 1. Coverage-based marking (`prompts/_marking-pass.md` + `lib/marking.js`)

Replace the unguided 0–100 judgement with a transparent per-sub-anchor rubric. The model returns
per-part credit; `marking.js` computes the number deterministically.

Model output contract:
```json
{
  "subAnchorScores": [{"subAnchor": "<rubric item>", "credit": "full|partial|none", "note": "<short>"}],
  "coherent": true,
  "factualErrors": [{"quote","problem","contradicts"}],
  "misconceptions": [{"quote","problem"}],
  "interpretationNotes": [{"quote","note"}],
  "rationale": "<2–3 sentences, honest + encouraging>"
}
```

- `credit`: **full** = something substantive and true about the part, no factual error; **partial** =
  thin or a minor slip; **none** = absent or wrong. A factual error in a part downgrades that part.
- `coherent`: does the whole thing hang together as one story, or is it a disconnected list?

`marking.js` computes the score against the authoritative rubric (not the model's count):
```
credit map keyed by normalised sub-anchor title; unlisted rubric items => 'none'
full = #full, partial = #partial, total = rubric length (min 1)
score = round((full + 0.5*partial) / total * 100)
if (!coherent) score = max(0, score - round(100/total))   // a disconnected list can't reach the top
coverage = { covered: full + partial, total }
mark = { score, rationale }
```
With five parts this yields 20/40/60/80/100; four right + one partial = 90. Step size floats with the
part count (a four-part topic scores in 25s). Feedback lists are unchanged and still shown.

Nothing downstream changes: `recordWriteMark` takes the 0–100 as a linear input, so quantised score =
quantised XP; `WRITE_PASS = 60` stays reachable (three of five).

## 2. Same-session / spaced rewrites (`lib/scoring.js` `recordWriteMark`)

Key the schedule off `last_written_at` instead of counting rewrites:
- The most recent write's score is what's stored (unchanged "latest, not best").
- The interval advances **only when the previous interval had actually elapsed** (you were due). An
  early rewrite (same session, or before due) refreshes the timestamp and score but holds the ladder.
- One rule covers same-session and multi-week. Change: pull `last_written_at` into the prior-state
  query; gate `nextWriteInterval` on `daysSince >= currentInterval`.

## 3. Frontend (`src/components/GenerativeLearning.jsx`)

- New `coldwrite` stage: textarea shown immediately; fire `action=generate` in the background on entry
  (skip if content already cached). `[Skip this]` jumps to study without marking.
- On cold submit: if generation is still running, show the marking spinner until it resolves, then mark.
- `result` screen content depends on `hasStudied`: before study, guidance always nudges "read the
  cards, then write again", primary CTA "Read the fact cards →"; after study, primary CTA "Save your
  flashcards →". Rewrite and read-narrative are always available.
- `text` persists from cold write into the second write (extend, don't retype).
- Replace the "Missing key concepts" section with a per-part **full/partial/none** breakdown.
- Write-screen copy states the bar plainly on both writes.

## 4. Flashcards decoupled (`FlashcardDeck` in the same file)

Remove the `missing` prop, the "you skipped this" badges, and the missing-first sort. Cards for the
topic, save what you want. (Can be re-added later keyed off the latest mark if wanted.)

## Testing

- `scripts/marking-harness.mjs` against the seeded Emergence of Life fact base: confirm the new rubric
  scores sample narratives sensibly (clean = high, planted-error = downgraded part, thin = partials).
- Unit-check the `recordWriteMark` interval rule (early rewrite holds, due rewrite advances).
- `npm run build` + `npm run lint`.
- Drive the UX with Playwright on local dev: cold write → skip path, cold write → mark → cards →
  second write → flashcards → narrative; verify no step is locked and the guidance changes with score.
