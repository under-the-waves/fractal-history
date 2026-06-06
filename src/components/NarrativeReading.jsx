import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth, SignInButton } from '@clerk/react'
import { useClerkEnabled } from '../hooks/useClerkAuth'
import { citationsToFootnotes } from '../utils/citationsToFootnotes'
import { getRandomFact } from '../data/historyFacts'

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

function FlashcardSaveSection({ anchorId, breadth, questions: initialQuestions }) {
    const auth = useAuth()
    const [questions, setQuestions] = useState(initialQuestions || [])
    const [generating, setGenerating] = useState(false)
    const [generateError, setGenerateError] = useState(null)
    const [savedCards, setSavedCards] = useState(new Set())
    const [revealed, setRevealed] = useState(new Set())

    // Sync if parent passes updated questions
    useEffect(() => {
        if (initialQuestions && initialQuestions.length > 0) {
            setQuestions(initialQuestions)
        }
    }, [initialQuestions])

    // Generate (or regenerate) the candidate pool on demand. refresh=true bypasses
    // the shared server-side cache so old-format pools can be upgraded.
    const generateFlashcards = async (refresh = false) => {
        setGenerating(true)
        setGenerateError(null)
        try {
            const url = `/api/generate-flashcards?id=${anchorId}&breadth=${breadth}${refresh ? '&refresh=1' : ''}`
            const response = await fetch(url)
            const data = await response.json()
            if (data.success && data.questions) {
                setQuestions(data.questions)
                setRevealed(new Set())
            } else {
                setGenerateError(data.error || 'Failed to generate flashcards')
            }
        } catch (err) {
            console.error('Failed to generate flashcards:', err)
            setGenerateError('Failed to generate flashcards. Please try again.')
        } finally {
            setGenerating(false)
        }
    }

    // Load already-saved flashcards on mount
    useEffect(() => {
        const loadSavedCards = async () => {
            try {
                const token = await auth.getToken()
                const response = await fetch(`/api/flashcards?anchorId=${anchorId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                const data = await response.json()
                if (data.success) {
                    const matching = data.flashcards
                        .filter(f => f.breadth === breadth)
                        .map(f => f.question)
                    setSavedCards(new Set(matching))
                }
            } catch (err) {
                console.error('Failed to load saved flashcards:', err)
            }
        }
        if (auth.isSignedIn) {
            loadSavedCards()
        }
    }, [auth, anchorId, breadth])

    // Save one or more {question, answer} items as independent cards (each gets its
    // own review schedule). Returns true on success so callers can chain directions.
    const saveItems = async (items) => {
        const fresh = items.filter(it => it.question && it.answer && !savedCards.has(it.question))
        if (fresh.length === 0) return true
        try {
            const token = await auth.getToken()
            const response = await fetch('/api/flashcards', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ anchorId, breadth, flashcards: fresh })
            })
            const data = await response.json()
            if (data.success) {
                setSavedCards(prev => new Set([...prev, ...fresh.map(it => it.question)]))
                return true
            }
        } catch (err) {
            console.error('Failed to save flashcard(s):', err)
        }
        return false
    }

    const reveal = (key) => setRevealed(prev => new Set([...prev, key]))

    if (!auth.isSignedIn) {
        return (
            <section className="flashcard-save-section">
                <h2 className="flashcard-save-heading">Save as Flashcards</h2>
                <div className="flashcard-sign-in-prompt">
                    <p>Sign in to save flashcards from this narrative.</p>
                    <SignInButton mode="modal">
                        <button className="sign-in-prompt-button">Sign in to save flashcards</button>
                    </SignInButton>
                </div>
            </section>
        )
    }

    if (!questions || questions.length === 0) {
        return (
            <section className="flashcard-save-section">
                <h2 className="flashcard-save-heading">Flashcards</h2>
                {generateError && <p className="flashcard-error">{generateError}</p>}
                <button
                    className="save-all-button"
                    onClick={() => generateFlashcards(false)}
                    disabled={generating}
                >
                    {generating ? 'Generating flashcards...' : 'Generate flashcards'}
                </button>
            </section>
        )
    }

    const groups = groupFlashcards(questions)

    return (
        <section className="flashcard-save-section">
            <div className="flashcard-save-header">
                <h2 className="flashcard-save-heading">Save as Flashcards</h2>
                <button
                    type="button"
                    className="flashcard-regenerate"
                    onClick={() => generateFlashcards(true)}
                    disabled={generating}
                    title="Generate a fresh set of candidate cards"
                >
                    {generating ? 'Regenerating...' : 'Regenerate'}
                </button>
            </div>
            <p className="flashcard-pool-hint">
                Pick the cards worth remembering -- skip what you already know. Reversible
                cards can be saved in either direction, or both.
            </p>
            {generateError && <p className="flashcard-error">{generateError}</p>}

            {groups.map(group => {
                const unsavedForward = group.cards.filter(c => !savedCards.has(c.question))
                return (
                    <div key={group.key} className="flashcard-group">
                        <div className="flashcard-group-header">
                            <h3 className="flashcard-group-heading">{group.label}</h3>
                            <button
                                type="button"
                                className="flashcard-group-save-all"
                                onClick={() => saveItems(group.cards.map(c => ({ question: c.question, answer: c.answer })))}
                                disabled={unsavedForward.length === 0}
                            >
                                {unsavedForward.length === 0 ? 'All saved' : `Save all ${unsavedForward.length}`}
                            </button>
                        </div>
                        <div className="flashcard-save-list">
                            {group.cards.map(card => {
                                const fKey = `${card.index}`
                                const rKey = `${card.index}-r`
                                const fSaved = savedCards.has(card.question)
                                const rSaved = card.reverse && savedCards.has(card.reverse.question)
                                return (
                                    <div key={card.index} className="flashcard-save-item">
                                        <div className="flashcard-save-content">
                                            <p className="flashcard-save-question"><strong>Q:</strong> {card.question}</p>
                                            {revealed.has(fKey) ? (
                                                <p className="flashcard-save-answer"><strong>A:</strong> {card.answer}</p>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="flashcard-reveal-button"
                                                    onClick={() => reveal(fKey)}
                                                >
                                                    Show answer
                                                </button>
                                            )}

                                            {card.reverse && (
                                                <div className="flashcard-reverse">
                                                    <span className="flashcard-reverse-label">Reverse</span>
                                                    <p className="flashcard-save-question"><strong>Q:</strong> {card.reverse.question}</p>
                                                    {revealed.has(rKey) ? (
                                                        <p className="flashcard-save-answer"><strong>A:</strong> {card.reverse.answer}</p>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="flashcard-reveal-button"
                                                            onClick={() => reveal(rKey)}
                                                        >
                                                            Show answer
                                                        </button>
                                                    )}
                                                    <div className="flashcard-reverse-actions">
                                                        <button
                                                            className={`flashcard-save-button ${rSaved ? 'saved' : ''}`}
                                                            onClick={() => saveItems([{ question: card.reverse.question, answer: card.reverse.answer }])}
                                                            disabled={rSaved}
                                                        >
                                                            {rSaved ? 'Reverse saved' : 'Save reverse'}
                                                        </button>
                                                        <button
                                                            className="flashcard-save-button flashcard-save-both"
                                                            onClick={() => saveItems([
                                                                { question: card.question, answer: card.answer },
                                                                { question: card.reverse.question, answer: card.reverse.answer }
                                                            ])}
                                                            disabled={fSaved && rSaved}
                                                        >
                                                            {fSaved && rSaved ? 'Both saved' : 'Save both'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            className={`flashcard-save-button ${fSaved ? 'saved' : ''}`}
                                            onClick={() => saveItems([{ question: card.question, answer: card.answer }])}
                                            disabled={fSaved}
                                        >
                                            {fSaved ? 'Saved' : 'Save'}
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })}
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

            {/* Breadcrumb bar */}
            <nav className="narrative-breadcrumbs">
                {anchor.ancestors?.map((ancestor) => (
                    <span key={ancestor.id}>
                        <Link
                            to={`/narrative/${ancestor.id}?breadth=${breadth}`}
                            className="breadcrumb-link"
                        >
                            {ancestor.title}
                        </Link>
                        <span className="breadcrumb-separator">→</span>
                    </span>
                ))}
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
                    questions={anchor.questions || []}
                />
            )}

        </div>
    )
}

export default NarrativeReading
