import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth, SignInButton } from '@clerk/react'
import { useClerkEnabled } from '../hooks/useClerkAuth'
import { citationsToFootnotes } from '../utils/citationsToFootnotes'

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
function FlashcardSaveSection({ anchorId, breadth, questions }) {
    const auth = useAuth()
    const [savedCards, setSavedCards] = useState(new Set())
    const [savingAll, setSavingAll] = useState(false)

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

    const saveFlashcard = async (question, answer) => {
        try {
            const token = await auth.getToken()
            const response = await fetch('/api/flashcards', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ anchorId, breadth, question, answer })
            })
            const data = await response.json()
            if (data.success) {
                setSavedCards(prev => new Set([...prev, question]))
            }
        } catch (err) {
            console.error('Failed to save flashcard:', err)
        }
    }

    const saveAllFlashcards = async () => {
        setSavingAll(true)
        try {
            const token = await auth.getToken()
            const response = await fetch('/api/flashcards', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    anchorId,
                    breadth,
                    flashcards: questions
                })
            })
            const data = await response.json()
            if (data.success) {
                setSavedCards(new Set(questions.map(q => q.question)))
            }
        } catch (err) {
            console.error('Failed to save flashcards:', err)
        } finally {
            setSavingAll(false)
        }
    }

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

    return (
        <section className="flashcard-save-section">
            <h2 className="flashcard-save-heading">Save as Flashcards</h2>
            <div className="flashcard-save-actions">
                <button
                    className="save-all-button"
                    onClick={saveAllFlashcards}
                    disabled={savingAll || savedCards.size === questions.length}
                >
                    {savedCards.size === questions.length
                        ? 'All saved'
                        : savingAll
                            ? 'Saving...'
                            : `Save all ${questions.length} as flashcards`}
                </button>
            </div>
            <div className="flashcard-save-list">
                {questions.map((q, index) => (
                    <div key={index} className="flashcard-save-item">
                        <div className="flashcard-save-content">
                            <p className="flashcard-save-question"><strong>Q:</strong> {q.question}</p>
                            <p className="flashcard-save-answer"><strong>A:</strong> {q.answer}</p>
                        </div>
                        <button
                            className={`flashcard-save-button ${savedCards.has(q.question) ? 'saved' : ''}`}
                            onClick={() => saveFlashcard(q.question, q.answer)}
                            disabled={savedCards.has(q.question)}
                        >
                            {savedCards.has(q.question) ? 'Saved' : 'Save'}
                        </button>
                    </div>
                ))}
            </div>
        </section>
    )
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

    // Change breadth
    const changeBreadth = useCallback((newBreadth) => {
        setSearchParams({ breadth: newBreadth })
        setAnchor(null)
        setLoading(true)
        setLoadingStage('checking')
        setError(null)
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

    // Fetch on mount and when id/breadth changes
    useEffect(() => {
        fetchNarrative()
    }, [fetchNarrative])

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

    // Loading state during generation
    if (loading || isGenerating) {
        return (
            <div className="narrative-page">
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
                        <button onClick={() => navigate('/tree')} className="back-button">
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
                    <button onClick={() => navigate('/tree')} className="back-button">
                        Return to Tree View
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="narrative-page">
            {/* Breadcrumb bar */}
            <nav className="narrative-breadcrumbs">
                {anchor.ancestors?.map((ancestor, index) => (
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
                    {['A', 'B'].map((b) => (
                        <button
                            key={b}
                            className={`breadth-tab ${breadth === b ? 'active' : ''}`}
                            onClick={() => changeBreadth(b)}
                        >
                            {BREADTH_LABELS[b]}
                        </button>
                    ))}
                    <button
                        className="breadth-tab disabled"
                        disabled
                        title="Coming soon"
                    >
                        {BREADTH_LABELS['C']}
                    </button>
                </div>
            </header>

            {/* Narrative area */}
            <article className="narrative-content">
                <NarrativeBody html={anchor.factCheckedNarrative || anchor.narrative} />
            </article>

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
            {anchor.questions && anchor.questions.length > 0 && clerkEnabled && (
                <FlashcardSaveSection
                    anchorId={id}
                    breadth={breadth}
                    questions={anchor.questions}
                />
            )}

        </div>
    )
}

export default NarrativeReading
