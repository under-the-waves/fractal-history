import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth, SignInButton } from '@clerk/react'
import { useClerkEnabled } from '../hooks/useClerkAuth'
import { citationsToFootnotes } from '../utils/citationsToFootnotes'
import { getRandomFact } from '../data/historyFacts'
import './scoredCards.css'

// Loading stages for generation process
const LOADING_STAGES = {
    checking: { text: 'Checking knowledge structure...', order: 0 },
    generating_children: { text: 'Building foundation...', order: 1 },
    generating_narrative: { text: 'Generating narrative...', order: 2 },
    storing: { text: 'Almost ready...', order: 3 },
    complete: { text: 'Complete', order: 4 },
    error: { text: 'Error occurred', order: -1 }
}

// Breadth labels for display
const BREADTH_LABELS = {
    'A': 'Analytical anchors',
    'B': 'Temporal anchors',
    'C': 'Regional Perspectives'
}

// Separate component that safely uses Clerk hooks (only rendered inside ClerkProvider)
// Turn the human-facing label for a group key. "sub:Title" -> "Title".
function flashcardGroupLabel(key) {
    if (key === 'general') return 'Across the topic'
    if (key.startsWith('sub:')) return key.slice(4)
    return key
}

// Cluster the candidate cards by their group, preserving first-appearance order
// for sub-topics and pushing the catch-all "general" group to the end.
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
    // Stable partition: everything except 'general' keeps its order, 'general' last.
    return groups.sort((a, b) => (a.key === 'general' ? 1 : 0) - (b.key === 'general' ? 1 : 0))
}

// The flashcard panel for a narrative: the 5 automatic core cards, plus the learner's up-to-3
// personal picks chosen from the non-core pool. Drives /api/flashcards mode=slots and set-slot.
function PersonalSlots({ auth, anchorId, breadth, reloadKey }) {
    const [data, setData] = useState(null)
    const [busy, setBusy] = useState(null)
    const [error, setError] = useState(null)
    const [revealed, setRevealed] = useState(new Set())

    const load = useCallback(async () => {
        try {
            const token = await auth.getToken()
            const res = await fetch(`/api/flashcards?mode=slots&anchorId=${anchorId}&breadth=${breadth}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const d = await res.json()
            if (d.success) setData(d)
        } catch (err) {
            console.error('Failed to load slots:', err)
        }
    }, [auth, anchorId, breadth])

    useEffect(() => { load() }, [load, reloadKey])

    const toggle = async (card, enabled) => {
        setBusy(card.question)
        setError(null)
        try {
            const token = await auth.getToken()
            const res = await fetch('/api/flashcards', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set-slot', anchorId, breadth, question: card.question, answer: card.answer, enabled })
            })
            const d = await res.json()
            if (!d.success) setError(d.error || 'Could not update pick')
            await load()
        } catch (err) {
            setError('Could not update pick')
        } finally {
            setBusy(null)
        }
    }

    const reveal = (key) => setRevealed(prev => new Set([...prev, key]))

    if (!data) return <p className="flashcard-pool-hint">Loading flashcards...</p>
    if ((data.cores?.length || 0) === 0 && (data.available?.length || 0) === 0) {
        return <p className="flashcard-pool-hint">Flashcards aren't ready for this narrative yet.</p>
    }

    const atMax = data.used >= data.max
    const availableGroups = groupFlashcards(data.available)

    const answer = (key, text) => revealed.has(key)
        ? <p className="scored-a">{text}</p>
        : <button type="button" className="flashcard-reveal-button" onClick={() => reveal(key)}>Show answer</button>

    return (
        <div className="scored-cards">
            <p className="scored-intro">
                Your {data.cores.length} core cards are studied automatically. Add up to {data.max} more
                cards to count toward your score.
            </p>

            <p className="scored-cards-sub">Core cards &middot; automatic</p>
            <ul className="scored-core-list">
                {data.cores.map((c, i) => {
                    const k = `core-${i}`
                    return (
                        <li key={k} className="scored-core-item">
                            <span className="scored-badge">Core</span>
                            <div className="scored-card-text">
                                <p className="scored-q">{c.question}</p>
                                {answer(k, c.answer)}
                            </div>
                        </li>
                    )
                })}
            </ul>

            <p className="scored-cards-sub">Your picks &middot; {data.used}/{data.max}</p>
            {error && <p className="flashcard-error">{error}</p>}
            {availableGroups.map(group => (
                <div key={group.key} className="scored-slot-group">
                    <h4 className="scored-slot-group-label">{group.label}</h4>
                    <ul className="scored-slot-list">
                        {group.cards.map(c => {
                            const k = `slot-${c.index}`
                            return (
                                <li key={k} className={`scored-slot-item ${c.selected ? 'selected' : ''}`}>
                                    <button
                                        type="button"
                                        className={`scored-slot-toggle ${c.selected ? 'selected' : ''}`}
                                        disabled={busy === c.question || (!c.selected && atMax)}
                                        onClick={() => toggle(c, !c.selected)}
                                    >
                                        {c.selected ? 'Remove' : (atMax ? 'Full' : 'Add')}
                                    </button>
                                    <div className="scored-card-text">
                                        <p className="scored-q">{c.question}</p>
                                        {answer(k, c.answer)}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            ))}
        </div>
    )
}

function FlashcardSaveSection({ anchorId, breadth }) {
    const auth = useAuth()
    const [preparing, setPreparing] = useState(true)
    const [reloadKey, setReloadKey] = useState(0)
    const loadingFact = useMemo(() => getRandomFact(), [])

    // On mount (first study): ensure this narrative's pool + 5 cores exist and are instantiated for
    // the user (generates on first view), then reveal the flashcard panel.
    useEffect(() => {
        if (!auth.isSignedIn) { setPreparing(false); return }
        let cancelled = false
        const run = async () => {
            try {
                const token = await auth.getToken()
                await fetch(`/api/instantiate-cores?id=${anchorId}&breadth=${breadth}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            } catch (err) {
                console.error('Failed to prepare flashcards:', err)
            }
            if (!cancelled) { setReloadKey(k => k + 1); setPreparing(false) }
        }
        run()
        return () => { cancelled = true }
    }, [auth, anchorId, breadth])

    if (!auth.isSignedIn) {
        return (
            <section className="flashcard-save-section">
                <h2 className="flashcard-save-heading">Flashcards</h2>
                <div className="flashcard-sign-in-prompt">
                    <p>Sign in to study this narrative's flashcards.</p>
                    <SignInButton mode="modal">
                        <button className="sign-in-prompt-button">Sign in</button>
                    </SignInButton>
                </div>
            </section>
        )
    }

    return (
        <section className="flashcard-save-section">
            <h2 className="flashcard-save-heading">Flashcards</h2>
            {preparing ? (
                <div className="flashcard-preparing">
                    <div className="loading-spinner"></div>
                    <p className="loading-stage">Generating flashcards...</p>
                    <p className="loading-note">First-time generation may take 20-30 seconds</p>
                    <div className="loading-fact">
                        <span className="loading-fact-label">Did you know?</span>
                        <p className="loading-fact-text">{loadingFact}</p>
                    </div>
                </div>
            ) : (
                <PersonalSlots auth={auth} anchorId={anchorId} breadth={breadth} reloadKey={reloadKey} />
            )}
        </section>
    )
}

function sourceLabel(url) {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function NarrativeBody({ html }) {
    const { html: processedHtml, footnotes } = useMemo(
        () => citationsToFootnotes(html),
        [html]
    );

    return (
        <>
            <div
                className="narrative-text"
                dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
        </>
    );
}

function NarrativeReading() {
    const { id } = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()
    const clerkEnabled = useClerkEnabled()

    // Get breadth from URL query param, default to 'A'
    const breadth = searchParams.get('breadth') || 'A'

    const [anchor, setAnchor] = useState(null)
    const [loading, setLoading] = useState(true)
    const [loadingStage, setLoadingStage] = useState('checking')
    const [error, setError] = useState(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [factCheckStatus, setFactCheckStatus] = useState('idle') // idle | checking | done | error

    // Change breadth
    const changeBreadth = useCallback((newBreadth) => {
        setSearchParams({ breadth: newBreadth })
        setAnchor(null)
        setLoading(true)
        setLoadingStage('checking')
        setError(null)
        setFactCheckStatus('idle')
    }, [setSearchParams])

    // Fetch or generate narrative
    const fetchNarrative = useCallback(async () => {
        setLoading(true)
        setLoadingStage('checking')
        setError(null)

        try {
            // Helper: parse JSON response, throwing a clear error if the
            // server returned non-JSON (e.g. a Vercel timeout page).
            const safeJson = async (response, context) => {
                const text = await response.text()
                try {
                    return JSON.parse(text)
                } catch {
                    throw new Error(
                        response.status === 504 || text.startsWith('An error')
                            ? `${context} timed out. Try again — the server may need a moment.`
                            : `${context} returned an unexpected response.`
                    )
                }
            }

            // First, check if narrative exists
            const checkResponse = await fetch(`/api/get-narrative?id=${id}&breadth=${breadth}`)
            const checkData = await safeJson(checkResponse, 'Checking narrative')

            if (!checkResponse.ok) {
                throw new Error(checkData.error || 'Failed to check narrative')
            }

            // If narrative exists, use it
            if (!checkData.needsGeneration) {
                setAnchor(checkData.anchor)
                setLoading(false)
                setLoadingStage('complete')
                return
            }

            // Narrative needs generation
            setIsGenerating(true)

            // Store basic anchor info for loading display
            setAnchor({
                id: checkData.anchor.id,
                title: checkData.anchor.title,
                scope: checkData.anchor.scope,
                breadth
            })

            // If children don't exist, generate them first (separate call to avoid timeout)
            if (!checkData.anchor.childAnchorsExist) {
                setLoadingStage('generating_children')
                const anchorsResponse = await fetch('/api/generate-anchors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parentId: id,
                        parentTitle: checkData.anchor.title,
                        parentScope: checkData.anchor.scope,
                        breadth
                    })
                })
                if (!anchorsResponse.ok) {
                    const errData = await safeJson(anchorsResponse, 'Generating child anchors')
                    throw new Error(errData.error || 'Failed to generate child anchors')
                }
            }

            // Now generate the narrative (children guaranteed to exist)
            setLoadingStage('generating_narrative')
            const generateResponse = await fetch(`/api/generate-narrative?id=${id}&breadth=${breadth}`)
            const generateData = await safeJson(generateResponse, 'Generating narrative')

            if (!generateResponse.ok || !generateData.success) {
                throw new Error(generateData.error || 'Failed to generate narrative')
            }

            setLoadingStage('complete')
            setAnchor(generateData.anchor)
            setLoading(false)
            setIsGenerating(false)

        } catch (err) {
            console.error('Error fetching/generating narrative:', err)
            setError(err.message || 'Unable to load narrative. Please try again.')
            setLoading(false)
            setLoadingStage('error')
            setIsGenerating(false)
        }
    }, [id, breadth])

    // Fetch on mount and when id/breadth changes (guard against double-fire)
    const fetchInFlight = useRef(null)
    useEffect(() => {
        const key = `${id}-${breadth}`
        if (fetchInFlight.current === key) return
        fetchInFlight.current = key
        fetchNarrative().finally(() => { fetchInFlight.current = null })
    }, [fetchNarrative, id, breadth])

    // Background fact-check (progressive enhancement): once a narrative is shown and
    // not already fact-checked, verify it and swap in the sourced version when ready.
    const factCheckInFlight = useRef(null)
    useEffect(() => {
        if (loading || error || !anchor || !anchor.id) return
        if (anchor.factCheckedNarrative) { setFactCheckStatus('done'); return }
        const key = `${anchor.id}-${breadth}`
        if (factCheckInFlight.current === key) return
        factCheckInFlight.current = key
        setFactCheckStatus('checking')
        fetch('/api/fact-check-narrative', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ anchorId: anchor.id, breadth })
        })
            .then(r => (r.ok ? r.json() : Promise.reject(new Error('fact-check failed'))))
            .then(data => {
                if (!data.success) { setFactCheckStatus('error'); return }
                // Re-fetch so the fact-checked narrative gets the same child-anchor link processing
                return fetch(`/api/get-narrative?id=${anchor.id}&breadth=${breadth}`)
                    .then(r => r.json())
                    .then(fresh => {
                        if (fresh.success && fresh.anchor) {
                            setAnchor(prev => (prev && prev.id === anchor.id ? fresh.anchor : prev))
                        }
                        setFactCheckStatus('done')
                    })
            })
            .catch(() => setFactCheckStatus('error'))
    }, [anchor, loading, error, breadth])

    // Force a fresh narrative from the current prompts. Gated behind ?regen=1 in the
    // URL so it never shows for ordinary readers (each call costs an API generation).
    const regenerateNarrative = async () => {
        try {
            setError(null)
            setIsGenerating(true)
            setLoadingStage('generating_narrative')
            const resp = await fetch(`/api/generate-narrative?id=${id}&breadth=${breadth}&regenerate=true`)
            const text = await resp.text()
            let data
            try { data = JSON.parse(text) }
            catch { throw new Error('Regeneration returned an unexpected response (it may have timed out — try again).') }
            if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to regenerate narrative')
            // Allow the background fact-check to run again on the new text.
            factCheckInFlight.current = null
            setFactCheckStatus('idle')
            setAnchor(data.anchor)
            setLoadingStage('complete')
        } catch (err) {
            setError(err.message || 'Failed to regenerate narrative')
            setLoadingStage('error')
        } finally {
            setIsGenerating(false)
        }
    }

    const showRegen = searchParams.get('regen') === '1'

    // Calculate read time from word count or use estimated
    const getReadTime = () => {
        if (anchor?.estimatedReadTime) {
            return `${anchor.estimatedReadTime} min read`
        }
        if (anchor?.wordCount) {
            const minutes = Math.ceil(anchor.wordCount / 200)
            return `${minutes} min read`
        }
        return '5 min read'
    }

    // Pick one history fact to show on the loading screen (stable per mount)
    const loadingFact = useMemo(() => getRandomFact(), [])

    // Loading state during generation
    if (loading || isGenerating) {
        return (
            <div className="narrative-page">
                <div className="narrative-back-bar">
                    <Link to="/" className="back-to-tree-pill">← Back to the tree</Link>
                </div>
                <div className="narrative-loading">
                    <div className="loading-content">
                        {anchor ? (
                            <>
                                <h1 className="loading-title">{anchor.title}</h1>
                                <p className="loading-scope">{anchor.scope}</p>
                                <p className="loading-breadth">
                                    {BREADTH_LABELS[breadth] || breadth} Narrative
                                </p>
                            </>
                        ) : (
                            <h1 className="loading-title">Loading...</h1>
                        )}

                        <div className="loading-progress">
                            <div className="loading-spinner"></div>
                            <p className="loading-stage">
                                {LOADING_STAGES[loadingStage]?.text || 'Loading...'}
                            </p>
                        </div>

                        {/* Progress indicator dots */}
                        <div className="loading-dots">
                            {['checking', 'generating_children', 'generating_narrative', 'storing'].map((stage, index) => (
                                <div
                                    key={stage}
                                    className={`loading-dot ${
                                        LOADING_STAGES[loadingStage]?.order >= index ? 'active' : ''
                                    } ${loadingStage === stage ? 'current' : ''}`}
                                />
                            ))}
                        </div>

                        <p className="loading-note">
                            {isGenerating
                                ? 'First-time generation may take 20-30 seconds'
                                : 'Loading narrative...'}
                        </p>

                        <div className="loading-fact">
                            <span className="loading-fact-label">Did you know?</span>
                            <p className="loading-fact-text">{loadingFact}</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Error state
    if (error) {
        return (
            <div className="narrative-page">
                <div className="narrative-error">
                    <h1>Narrative Not Available</h1>
                    <p>{error}</p>
                    <div className="error-actions">
                        <button onClick={fetchNarrative} className="retry-button">
                            Try Again
                        </button>
                        <button onClick={() => navigate('/')} className="back-button">
                            Return to Tree View
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (!anchor) {
        return (
            <div className="narrative-page">
                <div className="narrative-error">
                    <h1>Anchor Not Found</h1>
                    <p>The requested anchor could not be found.</p>
                    <button onClick={() => navigate('/')} className="back-button">
                        Return to Tree View
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="narrative-page">
            {/* Back-to-tree pill */}
            <div className="narrative-back-bar">
                <Link to="/" className="back-to-tree-pill">← Back to the tree</Link>
            </div>

            {/* Breadcrumb bar. ancestors includes the current anchor as its last entry,
                so we drop that (shown separately) and link the rest to the tree, expanded
                to that ancestor. */}
            <nav className="narrative-breadcrumbs">
                {anchor.ancestors?.slice(0, -1).map((ancestor, i) => {
                    const path = anchor.ancestors.slice(0, i + 1).map(a => a.id).join(',')
                    return (
                        <span key={ancestor.id}>
                            <Link
                                to={`/tree?path=${path}`}
                                className="breadcrumb-link"
                            >
                                {ancestor.title}
                            </Link>
                            <span className="breadcrumb-separator">→</span>
                        </span>
                    )
                })}
                <span className="breadcrumb-current">{anchor.title}</span>
            </nav>

            {/* Title block */}
            <header className="narrative-header">
                <h1 className="narrative-title">{anchor.title}</h1>
                <div className="narrative-meta">
                    <span className="read-time">{getReadTime()}</span>
                    <span className="breadth-indicator">
                        {BREADTH_LABELS[breadth] || breadth}
                    </span>
                </div>

                {/* Breadth selector tabs */}
                <div className="breadth-tabs">
                    {['A', 'B', 'C'].map((b) => (
                        <button
                            key={b}
                            className={`breadth-tab ${breadth === b ? 'active' : ''}`}
                            onClick={() => changeBreadth(b)}
                        >
                            {BREADTH_LABELS[b]}
                        </button>
                    ))}
                </div>

                {showRegen && (
                    <button
                        type="button"
                        className="narrative-regenerate"
                        onClick={regenerateNarrative}
                        title="Discard this narrative and generate a fresh one from the current prompts"
                    >
                        ↻ Regenerate narrative
                    </button>
                )}
            </header>

            {/* Narrative area */}
            <article className="narrative-content">
                <NarrativeBody html={anchor.factCheckedNarrative || anchor.narrative} />
            </article>

            {factCheckStatus === 'checking' && (
                <div className="factcheck-status">Verifying facts and adding sources…</div>
            )}

            {anchor.sources && anchor.sources.length > 0 && (
                <section className="sources-section">
                    <h2 className="sources-heading">Sources</h2>
                    <ol className="sources-list">
                        {anchor.sources.map((s, i) => (
                            <li key={i} className="source-item">
                                <a className="source-link" href={s.url} target="_blank" rel="noopener noreferrer">
                                    {sourceLabel(s.url)}
                                </a>
                                {s.claim && <span className="source-claim">{s.claim}</span>}
                                {s.quote && <span className="source-quote">“{s.quote}”</span>}
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            {/* Child anchors (if available) */}
            {anchor.childAnchors && anchor.childAnchors.length > 0 && (
                <section className="child-anchors-box">
                    <h2 className="child-anchors-heading">
                        Dive deeper
                    </h2>
                    <div className="child-anchors-grid">
                        {anchor.childAnchors.map((child) => (
                            <Link
                                key={child.id}
                                to={`/narrative/${child.id}?breadth=A`}
                                className="child-anchor-link"
                            >
                                {child.title}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Flashcard save section */}
            {clerkEnabled && (
                <FlashcardSaveSection
                    anchorId={id}
                    breadth={breadth}
                />
            )}

        </div>
    )
}

export default NarrativeReading
