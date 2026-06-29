import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth, SignInButton } from '@clerk/react'
import { useClerkEnabled } from '../hooks/useClerkAuth'
import './generative.css'

// The "learn" entry for an anchor: a choice between reading the guided narrative and writing your
// own. Works for ANY anchor — "Read" always points at the existing /narrative/:id page. The
// write-your-own flow (study -> write -> mark) is only wired for anchors that have local study data
// (the prototype anchor, Emergence of Life); for others it shows as coming soon.
// "Read the guided narrative" reuses the existing /narrative/:id page.

const LAYERS = [
    { key: 'what', label: 'What happened' },
    { key: 'why', label: 'Why it happened' },
    { key: 'how', label: 'How we know' },
    { key: 'debates', label: 'Debates' },
    { key: 'vignettes', label: 'Vignettes' },
]

const WHY_DISCLAIMER = 'This is the mainstream explanation. Where the causes are genuinely debated, see the Debates layer for more nuance.'

function FactCard({ fact }) {
    const [open, setOpen] = useState(null)
    // Only show a layer tab when that layer actually has content (bullets).
    const available = LAYERS.filter(l => Array.isArray(fact[l.key]) && fact[l.key].length > 0)
    return (
        <div className="gl-fact">
            <p className="gl-fact-headline">{fact.headline}</p>
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
                        {fact[open].map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                </>
            )}
        </div>
    )
}

function MarkReport({ result, onRevise, onRestart }) {
    const errors = result.factualErrors || []
    const misconceptions = result.misconceptions || []
    const missing = result.missingConcepts || []
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
                    <span className="gl-coverage-label">key concepts covered</span>
                </div>
                {typeof result.xpEarned === 'number' && (
                    <div className="gl-coverage">
                        <span className="gl-coverage-num">+{result.xpEarned} XP</span>
                        <span className="gl-coverage-label">added to your mastery</span>
                    </div>
                )}
            </div>

            {typeof result.nextReviewDays === 'number' && (
                <p className="gl-rewrite-note">
                    These points fade over time. Rewrite this in about {result.nextReviewDays} day{result.nextReviewDays === 1 ? '' : 's'} to keep them{result.passed === false ? ' — and aim for 60+ next time to stretch the interval' : ''}.
                </p>
            )}

            {result.mark?.rationale && <p className="gl-rationale">{result.mark.rationale}</p>}

            <Section title="Factual errors" items={errors} tone="error" empty="No factual errors found."
                render={e => (<><strong>“{e.quote}”</strong><span>{e.problem}</span>
                    {e.contradicts && <span className="gl-cite">Fact base: {e.contradicts}</span>}</>)} />

            <Section title="Misconceptions" items={misconceptions} tone="warn" empty="No misconceptions found."
                render={m => (<><strong>“{m.quote}”</strong><span>{m.problem}</span></>)} />

            <Section title="Missing key concepts" items={missing} tone="info" empty="You covered every key concept."
                render={m => (<><strong>{m.subAnchor}</strong><span>{m.note}</span></>)} />

            <Section title="Interpretation notes" items={interp} tone="ok"
                empty="No unconventional interpretations flagged."
                subtitle="Defensible takes on open debates — these are not errors."
                render={n => (<><strong>“{n.quote}”</strong><span>{n.note}</span></>)} />

            <div className="gl-result-actions">
                <button type="button" className="gl-btn gl-btn-primary" onClick={onRevise}>
                    Edit and resubmit
                </button>
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

function GenerativeLearning() {
    const { id } = useParams()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const breadth = searchParams.get('breadth') || 'A'
    const clerkEnabled = useClerkEnabled()
    const { isSignedIn, getToken } = useAuth()

    const [stage, setStage] = useState('choice') // choice | generating | study | write | marking | result
    const [text, setText] = useState('')
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [anchorInfo, setAnchorInfo] = useState(null)
    const [data, setData] = useState(null) // study fact-cards for this anchor+breadth, from the DB

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

    // Fall back to the anchor's title/scope for the choice screen when no study content exists yet.
    // get-narrative returns the anchor metadata without triggering narrative generation.
    useEffect(() => {
        if (data || anchorInfo) return
        let cancelled = false
        fetch(`/api/get-narrative?id=${id}&breadth=${breadth}`)
            .then(r => r.json())
            .then(d => { if (!cancelled && d.anchor) setAnchorInfo({ title: d.anchor.title, scope: d.anchor.scope }) })
            .catch(() => { })
        return () => { cancelled = true }
    }, [id, breadth, data, anchorInfo])

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length

    // Start the write path. Requires sign-in: generation costs API spend and marking is per-user, so the
    // whole write-your-own path is gated (the choice card shows a sign-in button when logged out — this
    // is a backstop). If the study cards are already cached, go straight to study; otherwise generate
    // them on demand (research -> cards, ~1 min) behind a loading screen, then study.
    const startWrite = async () => {
        setError(null)
        if (clerkEnabled && !isSignedIn) {
            setError('Please sign in to write your own.')
            return
        }
        if (data) { setStage('study'); return }
        setStage('generating')
        try {
            const token = clerkEnabled ? await getToken() : null
            const res = await fetch('/api/learn?action=generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ id, breadth }),
            })
            const d = await res.json()
            if (!res.ok || !d.success || !d.exists) throw new Error(d.error || 'Could not prepare this topic.')
            setData(d)
            setAnchorInfo({ title: d.title, scope: d.scope })
            setStage('study')
        } catch (err) {
            setError(err.message)
            setStage('choice')
        }
    }

    const submit = async () => {
        setError(null)
        if (clerkEnabled && !isSignedIn) {
            setError('Sign in to get your writing marked and earn XP.')
            return
        }
        setStage('marking')
        try {
            const token = clerkEnabled ? await getToken() : null
            const res = await fetch('/api/learn?action=mark', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ narrative: text, anchorId: id, breadth }),
            })
            const d = await res.json()
            if (!res.ok || !d.success) throw new Error(d.error || 'Marking failed.')
            setResult(d)
            setStage('result')
        } catch (err) {
            setError(err.message)
            setStage('write')
        }
    }

    return (
        <div className="gl-page">
            <div className="gl-back-bar"><Link to="/" className="gl-back">← Back to the tree</Link></div>

            {/* ---------- CHOICE ---------- */}
            {stage === 'choice' && (
                <div className="gl-choice">
                    <p className="gl-eyebrow">New topic</p>
                    <h1 className="gl-title">{anchorInfo?.title || 'Loading…'}</h1>
                    {anchorInfo?.scope && <p className="gl-scope">{anchorInfo.scope}</p>}
                    <p className="gl-choice-prompt">How do you want to learn it?</p>

                    <div className="gl-choice-cards">
                        <button
                            type="button"
                            className="gl-choice-card"
                            onClick={() => navigate(`/narrative/${id}?breadth=${breadth}`)}
                        >
                            <span className="gl-choice-card-title">Read the guided narrative</span>
                            <span className="gl-choice-card-desc">
                                A ready-made history, written for you. The quickest way in.
                            </span>
                            <span className="gl-choice-card-cta">Read →</span>
                        </button>

                        {clerkEnabled && !isSignedIn ? (
                            // Logged out: the whole write-your-own path is gated (generation costs API
                            // spend and marking is per-user). Clicking opens the Clerk sign-in modal;
                            // once signed in this card re-renders to the start button below.
                            <SignInButton mode="modal">
                                <button type="button" className="gl-choice-card gl-choice-card-featured">
                                    <span className="gl-choice-badge">Earns more</span>
                                    <span className="gl-choice-card-title">Write your own</span>
                                    <span className="gl-choice-card-desc">
                                        Study the facts, then write the history yourself and get it marked.
                                        Harder, but you remember far more.
                                    </span>
                                    <span className="gl-choice-card-cta">Sign in to start →</span>
                                </button>
                            </SignInButton>
                        ) : (
                            <button
                                type="button"
                                className="gl-choice-card gl-choice-card-featured"
                                onClick={startWrite}
                            >
                                <span className="gl-choice-badge">Earns more</span>
                                <span className="gl-choice-card-title">Write your own</span>
                                <span className="gl-choice-card-desc">
                                    Study the facts, then write the history yourself and get it marked.
                                    Harder, but you remember far more.
                                </span>
                                <span className="gl-choice-card-cta">{data ? 'Start →' : 'Prepare & start →'}</span>
                            </button>
                        )}
                    </div>
                    {error && <p className="gl-error">{error}</p>}
                </div>
            )}

            {/* ---------- GENERATING ---------- */}
            {stage === 'generating' && (
                <div className="gl-marking">
                    <div className="gl-spinner" />
                    <p className="gl-marking-text">Preparing this topic…</p>
                    <p className="gl-marking-note">Researching authoritative sources and writing your study facts. This takes about a minute.</p>
                </div>
            )}

            {/* ---------- STUDY ---------- */}
            {stage === 'study' && (
                <div className="gl-study">
                    <p className="gl-eyebrow">Step 1 of 2 · Study</p>
                    <h1 className="gl-title">{data.title}</h1>
                    <p className="gl-instruction">
                        Read through the facts and open the layers that interest you. When you click
                        <strong> I’m ready to write</strong>, the facts disappear and you write the history
                        from memory.
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

                    <div className="gl-study-footer">
                        <button type="button" className="gl-btn gl-btn-ghost" onClick={() => setStage('choice')}>
                            ← Back
                        </button>
                        <button type="button" className="gl-btn gl-btn-primary" onClick={() => setStage('write')}>
                            I’m ready to write →
                        </button>
                    </div>
                </div>
            )}

            {/* ---------- WRITE ---------- */}
            {stage === 'write' && (
                <div className="gl-write">
                    <p className="gl-eyebrow">Step 2 of 2 · Write</p>
                    <h1 className="gl-title">{data.title}</h1>
                    <p className="gl-instruction">
                        Write the history of this topic in your own words, from memory. You get full marks
                        if you remember all the key parts of the story, explain them clearly so they hang
                        together, and get nothing factually wrong. You don’t need to include every detail
                        from the facts page.
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
                        <button type="button" className="gl-btn gl-btn-ghost" onClick={() => { setText(''); setStage('study') }}>
                            ← Start over
                        </button>
                        <button
                            type="button"
                            className="gl-btn gl-btn-primary"
                            onClick={submit}
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
                    <p className="gl-marking-text">Marking your narrative…</p>
                    <p className="gl-marking-note">Checking facts, misconceptions, and coverage.</p>
                </div>
            )}

            {/* ---------- RESULT ---------- */}
            {stage === 'result' && result && (
                <div className="gl-result-wrap">
                    <p className="gl-eyebrow">Your mark</p>
                    <h1 className="gl-title">{data.title}</h1>
                    <MarkReport
                        result={result}
                        onRevise={() => setStage('write')}
                        onRestart={() => { setText(''); setResult(null); setStage('choice') }}
                    />
                </div>
            )}
        </div>
    )
}

export default GenerativeLearning
