import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'

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
    'A': 'Essential Aspects',
    'B': 'Timeline',
    'C': 'Regional Perspectives'
}

function NarrativeReading() {
    const { id } = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()

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
            // First, check if narrative exists
            const checkResponse = await fetch(`/api/get-narrative?id=${id}&breadth=${breadth}`)
            const checkData = await checkResponse.json()

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

            // Determine initial stage based on whether children exist
            if (!checkData.anchor.childAnchorsExist) {
                setLoadingStage('generating_children')
            } else {
                setLoadingStage('generating_narrative')
            }

            // Store basic anchor info for loading display
            setAnchor({
                id: checkData.anchor.id,
                title: checkData.anchor.title,
                scope: checkData.anchor.scope,
                breadth
            })

            // Call the generate endpoint
            const generateResponse = await fetch(`/api/generate-narrative?id=${id}&breadth=${breadth}`)
            const generateData = await generateResponse.json()

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
                <div
                    className="narrative-text"
                    dangerouslySetInnerHTML={{ __html: anchor.narrative }}
                />
            </article>

            {/* Key concepts box */}
            {anchor.keyConcepts && anchor.keyConcepts.length > 0 && (
                <section className="key-concepts-box">
                    <h2 className="concepts-heading">Key Takeaways</h2>
                    <ol className="concepts-list">
                        {anchor.keyConcepts.map((concept, index) => (
                            <li key={index} className="concept-item">{concept}</li>
                        ))}
                    </ol>
                    <p className="concepts-note">
                        Each of these concepts can be explored deeper as its own anchor in the fractal tree.
                    </p>
                </section>
            )}

            {/* Child anchors (if available) */}
            {anchor.childAnchors && anchor.childAnchors.length > 0 && (
                <section className="child-anchors-box">
                    <h2 className="child-anchors-heading">
                        Explore {BREADTH_LABELS[breadth]}
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

            {/* Quiz button */}
            {anchor.questions && anchor.questions.length > 0 && (
                <div className="quiz-section">
                    <button
                        className="quiz-button"
                        onClick={() => navigate(`/quiz/${anchor.id}?breadth=${breadth}`)}
                    >
                        Take Knowledge Check →
                    </button>
                </div>
            )}
        </div>
    )
}

export default NarrativeReading
