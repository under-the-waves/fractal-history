import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth, SignInButton } from '@clerk/react'
import { useClerkEnabled } from '../hooks/useClerkAuth'
import { useToasts } from './AchievementToasts'
import './generative.css'

// The "learn" flow for an anchor. Write-first, with a COLD write before study (settled 2026-07-10, see
// project knowledge/Cold_Write_Flow_Plan.md):
//   start -> write what you already know (cold; cards generate in the background) -> mark
//         -> study the fact cards -> write it again from memory -> mark -> save flashcards -> narrative.
// The cold write is the pretest: attempting an account before studying primes what you then read, and
// it counts for XP like any write, so someone who already knows the topic isn't made to repeat it. No
// step is ever locked — the mark only changes the guiding text, which always steers toward reading the
// cards and writing again. Marking is coverage-based and kind: say something true about each part,
// connect them, get nothing wrong = full marks (lib/marking.js).

// Order the learner sees. "Why it happened" follows "What happened" so it reads as explaining the
// event, not the "What it was like" scene; the scene comes after the cause.
const LAYERS = [
    { key: 'what', label: 'What happened' },
    { key: 'why', label: 'Why it happened' },
    { key: 'like', label: 'What it was like' },
    { key: 'how', label: 'How we know' },
    { key: 'debates', label: 'Debates' },
    { key: 'vignettes', label: 'Vignettes' },
]

// Split the `like` prose (a single string) into sentences so it renders as bullets like the other
// layers. Keeps the spaced en dashes ( – ) intact; only breaks on sentence-ending punctuation
// followed by a capital or quote. Falls back to the whole string as one bullet.
function likeBullets(text) {
    return String(text || '')
        .split(/(?<=[.?!])\s+(?=[A-Z"'“‘])/)
        .map(s => s.trim())
        .filter(Boolean)
}

// A layer has content if it's a non-empty array (bullet layers) or a non-empty string (`like`, prose).
function layerHasContent(v) {
    return typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) && v.length > 0
}

const WHY_DISCLAIMER = 'This is the mainstream explanation. Where the causes are genuinely debated, see the Debates layer for more nuance.'

// The per-part credit -> the human label + tone shown in the coverage breakdown.
const CREDIT_META = {
    full: { label: 'covered', tone: 'ok' },
    partial: { label: 'partial', tone: 'warn' },
    none: { label: 'missing', tone: 'info' },
}

// A source URL -> a short human label (its domain), for the citation popovers. Falls back to the raw
// string if the URL will not parse.
function sourceLabel(url) {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function FactCard({ fact }) {
    const [open, setOpen] = useState(null)
    const [showSrc, setShowSrc] = useState(false)
    const sources = Array.isArray(fact.sources) ? fact.sources.filter(Boolean) : []
    // Only show a layer tab when that layer actually has content (bullets, or prose for `like`).
    const available = LAYERS.filter(l => layerHasContent(fact[l.key]))
    return (
        <div className="gl-fact">
            <p className="gl-fact-headline">
                {fact.headline}
                {sources.length > 0 && (
                    <sup className="gl-cite-sup">
                        <button
                            type="button"
                            className={`gl-cite-btn ${showSrc ? 'active' : ''}`}
                            onClick={() => setShowSrc(v => !v)}
                            aria-label={`${sources.length} source${sources.length > 1 ? 's' : ''}`}
                        >
                            {sources.length}
                        </button>
                    </sup>
                )}
            </p>
            {showSrc && sources.length > 0 && (
                <div className="gl-cite-pop">
                    <p className="gl-cite-pop-title">Source{sources.length > 1 ? 's' : ''}</p>
                    <ul>
                        {sources.map((u, i) => (
                            <li key={i}>
                                <a href={u} target="_blank" rel="noopener noreferrer">{sourceLabel(u)}</a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {fact.when && <p className="gl-fact-when">{fact.when}</p>}
            <div className="gl-layer-tabs">
                {available.map(l => (
                    <button
                        key={l.key}
                        type="button"
                        className={`gl-layer-tab ${open === l.key ? 'active' : ''}`}
                        onClick={() => setOpen(open === l.key ? null : l.key)}
                    >
                        {l.label}
                    </button>
                ))}
            </div>
            {open && (
                <>
                    {open === 'why' && <p className="gl-why-disclaimer">{WHY_DISCLAIMER}</p>}
                    <ul className="gl-layer-body">
                        {(open === 'like' ? likeBullets(fact.like) : fact[open]).map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                </>
            )}
        </div>
    )
}

// The guiding line under the score. It never locks a step; it points at the sensible next one, and
// before study it always steers the learner to read the cards and then write again.
function guidanceText(score, hasStudied) {
    if (!hasStudied) {
        if (score >= 100) return 'You already know this cold. Read the fact cards to check the detail, then write it once more to lock it in.'
        if (score >= 60) return 'Good start. Read the fact cards to fill the gaps, then write it again to raise your score.'
        return 'Read the fact cards carefully, then write the history again from memory.'
    }
    if (score >= 100) return 'Full marks. Save your flashcards, then read the narrative to compare.'
    if (score >= 60) return 'Nicely done. Save your flashcards, or rewrite to push for full marks.'
    return 'Keep going — reread the cards and rewrite from memory. Save flashcards to help it stick.'
}

function MarkReport({ result, hasStudied, onStudy, onFlashcards, onRewrite, onNarrative, onRestart }) {
    const errors = result.factualErrors || []
    const misconceptions = result.misconceptions || []
    const parts = result.subAnchorScores || []
    const interp = result.interpretationNotes || []
    const score = result.mark?.score
    const cov = result.coverage || {}

    return (
        <div className="gl-result">
            <div className="gl-scoreboard">
                <div className="gl-score">
                    <span className="gl-score-num">{score}</span>
                    <span className="gl-score-denom">/100</span>
                </div>
                <div className="gl-coverage">
                    <span className="gl-coverage-num">{cov.covered}/{cov.total}</span>
                    <span className="gl-coverage-label">parts covered</span>
                </div>
                {typeof result.xpEarned === 'number' && (
                    <div className="gl-coverage">
                        <span className="gl-coverage-num">+{result.xpEarned} XP</span>
                        <span className="gl-coverage-label">added to your mastery</span>
                    </div>
                )}
            </div>

            <p className="gl-guidance">{guidanceText(score, hasStudied)}</p>

            {typeof result.nextReviewDays === 'number' && (
                <p className="gl-rewrite-note">
                    These points fade over time. Rewrite this in about {result.nextReviewDays} day{result.nextReviewDays === 1 ? '' : 's'} to keep them{result.passed === false ? ' — and aim for 60+ next time to stretch the interval' : ''}.
                </p>
            )}

            {result.mark?.rationale && <p className="gl-rationale">{result.mark.rationale}</p>}

            <section className="gl-section gl-parts-section">
                <h3 className="gl-section-title">Coverage by part</h3>
                <p className="gl-section-subtitle">
                    Full marks means something substantive and true about each part, connected into one story.
                </p>
                <ul className="gl-parts-list">
                    {parts.map((p, i) => {
                        const meta = CREDIT_META[p.credit] || CREDIT_META.none
                        return (
                            <li key={i} className={`gl-part gl-tone-${meta.tone}`}>
                                <span className="gl-part-badge">{meta.label}</span>
                                <div className="gl-part-text">
                                    <strong>{p.subAnchor}</strong>
                                    {p.note && <span>{p.note}</span>}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </section>

            <Section title="Factual errors" items={errors} tone="error" empty="No factual errors found."
                render={e => (<><strong>“{e.quote}”</strong><span>{e.problem}</span>
                    {e.contradicts && <span className="gl-cite">Fact base: {e.contradicts}</span>}</>)} />

            <Section title="Misconceptions" items={misconceptions} tone="warn" empty="No misconceptions found."
                render={m => (<><strong>“{m.quote}”</strong><span>{m.problem}</span></>)} />

            <Section title="Interpretation notes" items={interp} tone="ok"
                empty="No unconventional interpretations flagged."
                subtitle="Defensible takes on open debates — these are not errors."
                render={n => (<><strong>“{n.quote}”</strong><span>{n.note}</span></>)} />

            <div className="gl-result-actions">
                {!hasStudied ? (
                    <>
                        <button type="button" className="gl-btn gl-btn-primary" onClick={onStudy}>
                            Read the fact cards →
                        </button>
                        <button type="button" className="gl-btn gl-btn-ghost" onClick={onNarrative}>
                            Skip to the narrative
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" className="gl-btn gl-btn-primary" onClick={onFlashcards}>
                            Save your flashcards →
                        </button>
                        <button type="button" className="gl-btn gl-btn-ghost" onClick={onRewrite}>
                            Rewrite from memory
                        </button>
                    </>
                )}
                <button type="button" className="gl-btn gl-btn-ghost" onClick={onRestart}>
                    Start over
                </button>
            </div>
        </div>
    )
}

function Section({ title, subtitle, items, tone, empty, render }) {
    return (
        <section className={`gl-section gl-tone-${tone}`}>
            <h3 className="gl-section-title">
                {title} <span className="gl-section-count">{items.length}</span>
            </h3>
            {subtitle && <p className="gl-section-subtitle">{subtitle}</p>}
            {items.length === 0 ? (
                <p className="gl-section-empty">{empty}</p>
            ) : (
                <ul className="gl-section-list">
                    {items.map((it, i) => <li key={i} className="gl-section-item">{render(it)}</li>)}
                </ul>
            )}
        </section>
    )
}

// Turn a flashcard group key into a human label. "sub:Title" -> "Title".
function flashcardGroupLabel(key) {
    if (key === 'general') return 'Across the topic'
    if (key.startsWith('sub:')) return key.slice(4)
    return key
}

// Cluster candidate cards by group, preserving first-appearance order, pushing "general" last.
function groupFlashcards(cards) {
    const groups = []
    const byKey = new Map()
    cards.forEach((card, index) => {
        const key = card.group || 'general'
        if (!byKey.has(key)) {
            const entry = { key, label: flashcardGroupLabel(key), cards: [] }
            byKey.set(key, entry)
            groups.push(entry)
        }
        byKey.get(key).cards.push({ ...card, index })
    })
    return groups.sort((a, b) => (a.key === 'general' ? 1 : 0) - (b.key === 'general' ? 1 : 0))
}

// The post-mark flashcards step: the 5 auto cores plus the pool the learner picks from (up to 3).
// Reveal an answer to self-test in place. Reuses the existing flashcard machinery (instantiate-cores,
// /api/flashcards slots + set-slot). Decoupled from the mark — it just offers the topic's cards.
function FlashcardDeck({ anchorId, breadth, clerkEnabled, auth }) {
    const [data, setData] = useState(null)
    const [preparing, setPreparing] = useState(true)
    const [busy, setBusy] = useState(null)
    const [error, setError] = useState(null)
    const [revealed, setRevealed] = useState(new Set())

    const signedIn = !clerkEnabled || auth.isSignedIn

    const load = useCallback(async () => {
        try {
            const token = clerkEnabled ? await auth.getToken() : null
            const res = await fetch(`/api/flashcards?mode=slots&anchorId=${anchorId}&breadth=${breadth}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            const d = await res.json()
            if (d.success) setData(d)
        } catch (err) {
            console.error('Failed to load flashcards:', err)
        }
    }, [anchorId, breadth, clerkEnabled, auth])

    // On mount: ensure this topic's pool + 5 cores exist and are added to the user's deck (generates
    // the pool from the fact cards on first call), then load the slots panel.
    useEffect(() => {
        let cancelled = false
        const run = async () => {
            if (!signedIn) { setPreparing(false); return }
            try {
                const token = clerkEnabled ? await auth.getToken() : null
                await fetch(`/api/instantiate-cores?id=${anchorId}&breadth=${breadth}`, {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                })
            } catch (err) {
                console.error('Failed to prepare flashcards:', err)
            }
            if (!cancelled) { await load(); setPreparing(false) }
        }
        run()
        return () => { cancelled = true }
    }, [anchorId, breadth, signedIn, clerkEnabled, auth, load])

    const toggle = async (card, enabled) => {
        setBusy(card.question)
        setError(null)
        try {
            const token = clerkEnabled ? await auth.getToken() : null
            const res = await fetch('/api/flashcards', {
                method: 'POST',
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set-slot', anchorId, breadth, question: card.question, answer: card.answer, enabled }),
            })
            const d = await res.json()
            if (!d.success) setError(d.error || 'Could not update pick')
            await load()
        } catch {
            setError('Could not update pick')
        } finally {
            setBusy(null)
        }
    }

    const reveal = (key) => setRevealed(prev => new Set([...prev, key]))
    const answer = (key, text) => revealed.has(key)
        ? <p className="gl-fc-a">{text}</p>
        : <button type="button" className="gl-fc-reveal" onClick={() => reveal(key)}>Show answer</button>

    if (!signedIn) {
        return (
            <div className="gl-fc-signin">
                <p>Sign in to save these to your spaced-repetition deck.</p>
                <SignInButton mode="modal">
                    <button type="button" className="gl-btn gl-btn-primary">Sign in</button>
                </SignInButton>
            </div>
        )
    }

    if (preparing || !data) return <p className="gl-fc-hint">Preparing your flashcards…</p>
    if ((data.cores?.length || 0) === 0 && (data.available?.length || 0) === 0) {
        return <p className="gl-fc-hint">Flashcards aren’t ready for this topic yet.</p>
    }

    const atMax = data.used >= data.max
    const availableGroups = groupFlashcards(data.available)

    return (
        <div className="gl-fc">
            <p className="gl-fc-intro">
                Your {data.cores.length} core cards are saved automatically. Add up to {data.max} more.
                Reveal any card to test yourself now.
            </p>

            <p className="gl-fc-sub">Core cards · saved</p>
            <ul className="gl-fc-list">
                {data.cores.map((c, i) => {
                    const k = `core-${i}`
                    return (
                        <li key={k} className="gl-fc-item gl-fc-core">
                            <span className="gl-fc-badge">Core</span>
                            <div className="gl-fc-text">
                                <p className="gl-fc-q">{c.question}</p>
                                {answer(k, c.answer)}
                            </div>
                        </li>
                    )
                })}
            </ul>

            <p className="gl-fc-sub">Your picks · {data.used}/{data.max}</p>
            {error && <p className="gl-error">{error}</p>}
            {availableGroups.map(group => (
                <div key={group.key} className="gl-fc-group">
                    <h4 className="gl-fc-group-label">{group.label}</h4>
                    <ul className="gl-fc-list">
                        {group.cards.map(c => {
                            const k = `slot-${c.index}`
                            return (
                                <li key={k} className={`gl-fc-item ${c.selected ? 'selected' : ''}`}>
                                    <button
                                        type="button"
                                        className={`gl-fc-toggle ${c.selected ? 'selected' : ''}`}
                                        disabled={busy === c.question || (!c.selected && atMax)}
                                        onClick={() => toggle(c, !c.selected)}
                                    >
                                        {c.selected ? 'Remove' : (atMax ? 'Full' : 'Add')}
                                    </button>
                                    <div className="gl-fc-text">
                                        <p className="gl-fc-q">{c.question}</p>
                                        {answer(k, c.answer)}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            ))}

            <Link to="/flashcards" className="gl-fc-deck-link">Study your full deck →</Link>
        </div>
    )
}

function GenerativeLearning() {
    const { id } = useParams()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const breadth = searchParams.get('breadth') || 'A'
    const clerkEnabled = useClerkEnabled()
    const auth = useAuth()
    const { isSignedIn, getToken } = auth
    const toasts = useToasts()

    const [stage, setStage] = useState('start') // start | coldwrite | study | write | marking | result | flashcards
    const [text, setText] = useState('')         // persists from the cold write into the second write
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [hasStudied, setHasStudied] = useState(false)
    const [anchorInfo, setAnchorInfo] = useState(null)
    const [data, setData] = useState(null)       // study fact-cards for this anchor+breadth, from the DB
    const genRef = useRef(null)                  // in-flight background generation promise

    // Load the study fact-cards if they already exist for this anchor+breadth (cached in learn_content).
    useEffect(() => {
        let cancelled = false
        setData(null)
        fetch(`/api/learn?action=get&id=${id}&breadth=${breadth}`)
            .then(r => r.json())
            .then(d => {
                if (cancelled || !d) return
                if (d.exists) { setData(d); setAnchorInfo({ title: d.title, scope: d.scope }) }
            })
            .catch(() => { })
        return () => { cancelled = true }
    }, [id, breadth])

    // Fall back to the anchor's title/scope for the start screen when no study content exists yet.
    useEffect(() => {
        if (data || anchorInfo) return
        let cancelled = false
        fetch(`/api/narrative?action=get&id=${id}&breadth=${breadth}`)
            .then(r => r.json())
            .then(d => { if (!cancelled && d.anchor) setAnchorInfo({ title: d.anchor.title, scope: d.anchor.scope }) })
            .catch(() => { })
        return () => { cancelled = true }
    }, [id, breadth, data, anchorInfo])

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length

    // Kick off study-content generation in the background (research -> cards, ~1 min) so it runs while
    // the learner is writing their cold answer. No-op if the content is already cached or already in
    // flight. Resolves to the content; the promise is reused by the cold submit so it can wait if the
    // learner finishes writing first. On failure the ref is cleared so the next call retries.
    const startGeneration = useCallback(() => {
        if (data) return Promise.resolve(data)
        if (genRef.current) return genRef.current
        const p = (async () => {
            const token = clerkEnabled ? await getToken() : null
            const res = await fetch('/api/learn?action=generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ id, breadth }),
            })
            const d = await res.json()
            if (!res.ok || !d.success || !d.exists) throw new Error(d.error || 'Could not prepare this topic.')
            setData(d)
            setAnchorInfo({ title: d.title, scope: d.scope })
            return d
        })()
        genRef.current = p
        p.catch(() => { genRef.current = null })
        return p
    }, [data, clerkEnabled, getToken, id, breadth])

    // From the start screen: go to the cold-write screen and fire generation in the background.
    const startWrite = () => {
        setError(null)
        if (clerkEnabled && !isSignedIn) { setError('Please sign in to start.'); return }
        setStage('coldwrite')
        startGeneration().catch(err => setError(err.message))
    }

    // Skip the cold write: go straight to studying the cards (waits on a spinner if still generating).
    const skipToStudy = () => {
        setError(null)
        if (clerkEnabled && !isSignedIn) { setError('Please sign in to start.'); return }
        setHasStudied(true)
        setStage('study')
        startGeneration().catch(err => setError(err.message))
    }

    // Shared submit for both the cold write and the second write. Ensures the study content exists
    // (usually already generated in the background), marks the text, and shows the result. `returnStage`
    // is where to send the learner if something fails.
    const submitMark = async (returnStage) => {
        setError(null)
        if (clerkEnabled && !isSignedIn) { setError('Sign in to get your writing marked and earn XP.'); return }
        setStage('marking')
        let content
        try {
            content = await startGeneration()
        } catch (err) {
            setError(err.message)
            setStage(returnStage)
            return
        }
        if (!content) { setError('Could not prepare this topic.'); setStage(returnStage); return }
        try {
            const token = clerkEnabled ? await getToken() : null
            const res = await fetch('/api/learn?action=mark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ narrative: text, anchorId: id, breadth }),
            })
            const d = await res.json()
            if (!res.ok || !d.success) throw new Error(d.error || 'Marking failed.')
            setResult(d)
            setStage('result')
            if (d.achievements?.length) toasts?.achievements(d.achievements)
            if (d.levelUps?.length) toasts?.levelUps(d.levelUps)
        } catch (err) {
            setError(err.message)
            setStage(returnStage)
        }
    }

    const restart = () => { setText(''); setResult(null); setHasStudied(false); setStage('start') }

    return (
        <div className="gl-page">
            <div className="gl-back-bar"><Link to="/" className="gl-back">← Back to the tree</Link></div>

            {/* ---------- START ---------- */}
            {stage === 'start' && (
                <div className="gl-start">
                    <p className="gl-eyebrow">Learn this topic</p>
                    <h1 className="gl-title">{anchorInfo?.title || 'Loading…'}</h1>
                    {anchorInfo?.scope && <p className="gl-scope">{anchorInfo.scope}</p>}

                    <div className="gl-start-card">
                        <p className="gl-start-lead">Write what you know, then check and deepen it.</p>
                        <ol className="gl-start-steps">
                            <li>Write what you already know — no need to study first.</li>
                            <li>Read the key facts, then write it again from memory and get marked.</li>
                            <li>Save flashcards, then read the guided narrative to compare.</li>
                        </ol>
                        {clerkEnabled && !isSignedIn ? (
                            <SignInButton mode="modal">
                                <button type="button" className="gl-btn gl-btn-primary gl-btn-lg">Sign in to start →</button>
                            </SignInButton>
                        ) : (
                            <button type="button" className="gl-btn gl-btn-primary gl-btn-lg" onClick={startWrite}>
                                Start writing →
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        className="gl-escape"
                        onClick={() => navigate(`/narrative/${id}?breadth=${breadth}`)}
                    >
                        Prefer to just read it? Read the guided narrative →
                    </button>
                    {error && <p className="gl-error">{error}</p>}
                </div>
            )}

            {/* ---------- COLD WRITE ---------- */}
            {stage === 'coldwrite' && (
                <div className="gl-write">
                    <p className="gl-eyebrow">Step 1 · What you already know</p>
                    <h1 className="gl-title">{anchorInfo?.title || 'This topic'}</h1>
                    <p className="gl-instruction">
                        Before you study anything, write what you already know about this topic, in your own
                        words. Getting it partly wrong is fine — having a go first is what makes the facts
                        stick when you read them. You’ll get a chance to study and rewrite next.
                    </p>

                    <textarea
                        className="gl-textarea"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder={`Tell the story of ${anchorInfo?.title || 'this topic'} as best you can…`}
                        rows={14}
                        autoFocus
                    />
                    <div className="gl-write-meta">
                        <span className="gl-wordcount">{wordCount} words</span>
                        <span className="gl-hidden-note">We’re preparing the facts while you write.</span>
                    </div>

                    {error && <p className="gl-error">{error}</p>}

                    <div className="gl-study-footer">
                        <button type="button" className="gl-btn gl-btn-ghost" onClick={skipToStudy}>
                            Skip this →
                        </button>
                        <button
                            type="button"
                            className="gl-btn gl-btn-primary"
                            onClick={() => submitMark('coldwrite')}
                            disabled={wordCount < 20}
                            title={wordCount < 20 ? 'Write at least ~20 words first' : ''}
                        >
                            Submit for marking →
                        </button>
                    </div>
                </div>
            )}

            {/* ---------- STUDY ---------- */}
            {stage === 'study' && (
                <div className="gl-study">
                    <p className="gl-eyebrow">Step 2 · Study</p>
                    <h1 className="gl-title">{data?.title || anchorInfo?.title || 'This topic'}</h1>
                    {!data ? (
                        <div className="gl-marking">
                            <div className="gl-spinner" />
                            <p className="gl-marking-text">Preparing this topic…</p>
                            <p className="gl-marking-note">Researching authoritative sources and writing your study facts. This takes about a minute.</p>
                        </div>
                    ) : (
                        <>
                            <p className="gl-instruction">
                                Read through the facts and open the layers that interest you. The small number after a
                                fact shows its sources — tap it for the links. When you click
                                <strong> I’m ready to write</strong>, the facts disappear and you write from memory.
                            </p>

                            {data.prelude && (
                                <section className="gl-subanchor gl-prelude">
                                    <h2 className="gl-subanchor-title gl-prelude-title">{data.prelude.title}</h2>
                                    {data.prelude.facts.map((f, j) => <FactCard key={j} fact={f} />)}
                                </section>
                            )}

                            {data.subAnchors.map((sa, i) => (
                                <section key={sa.title} className="gl-subanchor">
                                    <h2 className="gl-subanchor-title">
                                        <span className="gl-subanchor-num">{i + 1}</span>{sa.title}
                                    </h2>
                                    {sa.facts.map((f, j) => <FactCard key={j} fact={f} />)}
                                </section>
                            ))}

                            {Array.isArray(data.sources) && data.sources.length > 0 && (
                                <details className="gl-sources">
                                    <summary>All sources ({data.sources.length})</summary>
                                    <ul>
                                        {data.sources.map((u, i) => (
                                            <li key={i}><a href={u} target="_blank" rel="noopener noreferrer">{sourceLabel(u)}</a></li>
                                        ))}
                                    </ul>
                                </details>
                            )}

                            <div className="gl-study-footer">
                                <button type="button" className="gl-btn gl-btn-ghost" onClick={() => setStage(result ? 'result' : 'start')}>
                                    ← Back
                                </button>
                                <button type="button" className="gl-btn gl-btn-primary" onClick={() => setStage('write')}>
                                    I’m ready to write →
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ---------- SECOND WRITE ---------- */}
            {stage === 'write' && (
                <div className="gl-write">
                    <p className="gl-eyebrow">Step 3 · Write it again</p>
                    <h1 className="gl-title">{data?.title || anchorInfo?.title || 'This topic'}</h1>
                    <p className="gl-instruction">
                        Now write the history in your own words, from memory. You get full marks if you say
                        something true about each part of the story, connect them so they hang together, and get
                        nothing factually wrong. You don’t need to repeat every detail from the facts page — the
                        detail belongs in each part’s own topic.
                    </p>

                    <textarea
                        className="gl-textarea"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder={`Tell the story of ${data?.title || 'this topic'}…`}
                        rows={16}
                        autoFocus
                    />
                    <div className="gl-write-meta">
                        <span className="gl-wordcount">{wordCount} words</span>
                        <span className="gl-hidden-note">Facts are hidden while you write.</span>
                    </div>

                    {error && <p className="gl-error">{error}</p>}

                    <div className="gl-study-footer">
                        <button type="button" className="gl-btn gl-btn-ghost" onClick={() => setStage('study')}>
                            ← Study the facts again
                        </button>
                        <button
                            type="button"
                            className="gl-btn gl-btn-primary"
                            onClick={() => submitMark('write')}
                            disabled={wordCount < 20}
                            title={wordCount < 20 ? 'Write at least ~20 words first' : ''}
                        >
                            Submit for marking →
                        </button>
                    </div>
                </div>
            )}

            {/* ---------- MARKING ---------- */}
            {stage === 'marking' && (
                <div className="gl-marking">
                    <div className="gl-spinner" />
                    <p className="gl-marking-text">Marking your writing…</p>
                    <p className="gl-marking-note">
                        {data ? 'Checking coverage, facts, and how it hangs together.' : 'Preparing this topic, then marking. This can take about a minute.'}
                    </p>
                </div>
            )}

            {/* ---------- RESULT ---------- */}
            {stage === 'result' && result && (
                <div className="gl-result-wrap">
                    <p className="gl-eyebrow">Your mark</p>
                    <h1 className="gl-title">{data?.title || anchorInfo?.title || 'This topic'}</h1>
                    <MarkReport
                        result={result}
                        hasStudied={hasStudied}
                        onStudy={() => { setHasStudied(true); setStage('study') }}
                        onFlashcards={() => setStage('flashcards')}
                        onRewrite={() => setStage('write')}
                        onNarrative={() => navigate(`/narrative/${id}?breadth=${breadth}`)}
                        onRestart={restart}
                    />
                </div>
            )}

            {/* ---------- FLASHCARDS ---------- */}
            {stage === 'flashcards' && (
                <div className="gl-flashcards-stage">
                    <p className="gl-eyebrow">Step 4 · Keep it</p>
                    <h1 className="gl-title">{data?.title || anchorInfo?.title || 'This topic'}</h1>
                    <p className="gl-instruction">
                        Save the facts you want to keep. They go into your spaced-repetition deck and come
                        back over the next few days, which is what makes them stick.
                    </p>

                    <FlashcardDeck
                        anchorId={id}
                        breadth={breadth}
                        clerkEnabled={clerkEnabled}
                        auth={auth}
                    />

                    <div className="gl-study-footer gl-flashcards-footer">
                        <button type="button" className="gl-btn gl-btn-ghost" onClick={() => setStage('write')}>
                            ← Rewrite from memory
                        </button>
                        <button
                            type="button"
                            className="gl-btn gl-btn-primary"
                            onClick={() => navigate(`/narrative/${id}?breadth=${breadth}`)}
                        >
                            Read the narrative →
                        </button>
                    </div>
                    <p className="gl-reveal-note">
                        Reading the narrative is the reveal — do your rewrites first if you want to keep testing yourself.
                    </p>
                </div>
            )}
        </div>
    )
}

export default GenerativeLearning
