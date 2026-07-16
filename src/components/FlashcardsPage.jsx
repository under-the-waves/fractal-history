import { useState, useEffect, useCallback } from 'react'
import { useAuth, RedirectToSignIn } from '@clerk/react'
import { useClerkEnabled } from '../hooks/useClerkAuth'
import { Link } from 'react-router-dom'
import { useToasts } from './AchievementToasts'

let xpChipSeq = 0 // ids for the floating "+N XP" chips, so rapid ratings stack cleanly

const RATING_BUTTONS = [
    { label: 'Again', rating: 0, className: 'rating-again' },
    { label: 'Hard', rating: 1, className: 'rating-hard' },
    { label: 'Good', rating: 2, className: 'rating-good' },
    { label: 'Easy', rating: 3, className: 'rating-easy' },
]

function formatInterval(days) {
    if (days === 0) return '< 10m'
    if (days < 1) return '< 1d'
    if (days === 1) return '1d'
    if (days < 30) return `${days}d`
    if (days < 365) return `${Math.round(days / 30)}mo`
    return `${(days / 365).toFixed(1)}y`
}

// Preview what the interval would be after each rating
function previewIntervals(card) {
    const ease = card.ease_factor || 2.5
    const interval = card.interval_days || 0
    const reps = card.repetitions || 0

    const calc = (rating) => {
        if (rating === 0) return 0 // Again — re-show in session
        if (reps === 0) {
            // New card — fixed graduating intervals
            if (rating === 1) return 1
            if (rating === 2) return 3
            return 5 // Easy
        }
        if (reps === 1) {
            // Second review — graduating
            if (rating === 1) return Math.max(interval + 1, Math.round(interval * 1.2))
            if (rating === 2) return 6
            return 8 // Easy
        }
        // Mature — SM-2
        const base = Math.round(interval * ease)
        if (rating === 1) return Math.max(interval + 1, Math.round(interval * 1.2))
        if (rating === 2) return Math.max(interval + 1, base)
        return Math.max(interval + 1, Math.round(base * 1.3)) // Easy
    }

    return RATING_BUTTONS.map(b => ({
        ...b,
        interval: formatInterval(calc(b.rating))
    }))
}

function StudyMode({ auth, onSwitchToBrowse }) {
    const [cards, setCards] = useState([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [showAnswer, setShowAnswer] = useState(false)
    const [loading, setLoading] = useState(true)
    const [reviewing, setReviewing] = useState(false)
    const [removing, setRemoving] = useState(false)
    const [sessionStats, setSessionStats] = useState({ total: 0, again: 0, hard: 0, good: 0, easy: 0, xp: 0 })
    const [sessionComplete, setSessionComplete] = useState(false)
    const [stats, setStats] = useState(null)
    const [xpChips, setXpChips] = useState([])
    const toasts = useToasts()

    const fetchReviewCards = useCallback(async () => {
        try {
            setLoading(true)
            const token = await auth.getToken()
            const response = await fetch('/api/flashcards?mode=review', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            if (data.success) {
                setCards(data.flashcards)
                setCurrentIndex(0)
                setShowAnswer(false)
                setSessionComplete(false)
                setSessionStats({ total: 0, again: 0, hard: 0, good: 0, easy: 0, xp: 0 })
            }
        } catch (err) {
            console.error('Failed to fetch review cards:', err)
        } finally {
            setLoading(false)
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const fetchStats = useCallback(async () => {
        try {
            const token = await auth.getToken()
            const response = await fetch('/api/flashcards?mode=stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            if (data.success) {
                setStats(data.stats)
            }
        } catch (err) {
            console.error('Failed to fetch stats:', err)
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        fetchReviewCards()
        fetchStats()
    }, [])

    const handleRating = async (rating) => {
        if (reviewing) return
        setReviewing(true)

        const card = cards[currentIndex]
        const ratingNames = ['again', 'hard', 'good', 'easy']

        try {
            const token = await auth.getToken()
            const res = await fetch('/api/flashcards', {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id: card.id, rating })
            })
            const data = await res.json().catch(() => null)
            let xpGain = 0
            if (data?.success) {
                if (data.achievements?.length) toasts?.achievements(data.achievements)
                if (data.levelUps?.length) toasts?.levelUps(data.levelUps)
                // Float a brief "+N XP" chip when the review moved the global score up.
                if (typeof data.xpDelta === 'number' && data.xpDelta > 0) {
                    xpGain = data.xpDelta
                    const id = ++xpChipSeq
                    setXpChips(prev => [...prev, { id, amount: xpGain }])
                    setTimeout(() => setXpChips(prev => prev.filter(c => c.id !== id)), 1400)
                }
            }

            setSessionStats(prev => ({
                ...prev,
                total: prev.total + 1,
                xp: prev.xp + xpGain,
                [ratingNames[rating]]: prev[ratingNames[rating]] + 1
            }))

            if (rating === 0) {
                // Again: move card to end of queue for re-show later in session
                setCards(prev => {
                    const next = [...prev]
                    const [again] = next.splice(currentIndex, 1)
                    next.push(again)
                    return next
                })
                setShowAnswer(false)
            } else if (currentIndex + 1 >= cards.length) {
                setSessionComplete(true)
                fetchStats()
            } else {
                setCurrentIndex(prev => prev + 1)
                setShowAnswer(false)
            }
        } catch (err) {
            console.error('Failed to submit review:', err)
        } finally {
            setReviewing(false)
        }
    }

    // Remove the current card from the collection mid-session.
    const handleRemove = async () => {
        if (removing || reviewing) return
        if (!window.confirm('Remove this card from your collection? This cannot be undone.')) return

        const card = cards[currentIndex]
        const wasLast = currentIndex >= cards.length - 1
        setRemoving(true)
        try {
            const token = await auth.getToken()
            await fetch(`/api/flashcards?id=${card.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            // Drop it from the queue. currentIndex then points at the next card
            // (which shifts into this slot), unless we just removed the last one.
            setCards(prev => prev.filter((_, i) => i !== currentIndex))
            setShowAnswer(false)
            if (wasLast) {
                setSessionComplete(true)
                fetchStats()
            }
        } catch (err) {
            console.error('Failed to remove card:', err)
        } finally {
            setRemoving(false)
        }
    }

    // Rendered in both the live session and the completion screen, so a chip from the final
    // rating isn't cut off when the view switches.
    const xpChipHost = (
        <div className="xp-chip-host" aria-hidden="true">
            {xpChips.map(c => <span key={c.id} className="xp-chip">+{c.amount} XP</span>)}
        </div>
    )

    if (loading) {
        return <div className="flashcards-loading">Loading study session...</div>
    }

    if (cards.length === 0) {
        return (
            <div className="study-empty">
                <h2>Nothing to review</h2>
                <p>
                    {stats && stats.total > 0
                        ? 'All caught up. Come back later when cards are due.'
                        : 'Read some narratives and save flashcards to start studying.'}
                </p>
                {stats && (
                    <div className="study-stats-summary">
                        <span>{stats.total} total</span>
                        <span>{stats.reviewedToday} reviewed today</span>
                    </div>
                )}
                <button onClick={onSwitchToBrowse} className="study-browse-link">
                    Browse all cards
                </button>
            </div>
        )
    }

    if (sessionComplete) {
        return (
            <div className="study-complete">
                {xpChipHost}
                <h2>Session complete</h2>
                <div className="study-complete-stats">
                    <p className="study-complete-total">{sessionStats.total} cards reviewed</p>
                    {sessionStats.xp > 0 && <p className="study-complete-xp">+{sessionStats.xp} XP earned</p>}
                    <div className="study-complete-breakdown">
                        {sessionStats.again > 0 && <span className="rating-again">{sessionStats.again} Again</span>}
                        {sessionStats.hard > 0 && <span className="rating-hard">{sessionStats.hard} Hard</span>}
                        {sessionStats.good > 0 && <span className="rating-good">{sessionStats.good} Good</span>}
                        {sessionStats.easy > 0 && <span className="rating-easy">{sessionStats.easy} Easy</span>}
                    </div>
                </div>
                {stats && (
                    <p className="study-next-due">
                        {stats.due > 0
                            ? `${stats.due} more cards due`
                            : 'No more cards due today'}
                    </p>
                )}
                <div className="study-complete-actions">
                    <button onClick={fetchReviewCards} className="study-again-button">
                        Study more
                    </button>
                    <button onClick={onSwitchToBrowse} className="study-browse-link">
                        Browse all cards
                    </button>
                </div>
            </div>
        )
    }

    const card = cards[currentIndex]
    const intervals = previewIntervals(card)

    return (
        <div className="study-session">
            {xpChipHost}
            <div className="study-progress">
                <div className="study-progress-bar">
                    <div
                        className="study-progress-fill"
                        style={{ width: `${(currentIndex / cards.length) * 100}%` }}
                    />
                </div>
                <span className="study-progress-text">
                    Card {currentIndex + 1} of {cards.length}
                </span>
            </div>

            <div className="study-card-context">
                <Link
                    to={`/narrative/${card.anchor_id}?breadth=${card.breadth}`}
                    className="study-narrative-link"
                >
                    {card.anchor_title}
                </Link>
                <span className={`study-breadth-badge breadth-${card.breadth}`}>
                    {card.breadth}
                </span>
            </div>

            <div className="study-card">
                <div className="study-card-front">
                    <p className="study-question">{card.question}</p>
                </div>

                {!showAnswer ? (
                    <button
                        className="study-show-answer"
                        onClick={() => setShowAnswer(true)}
                    >
                        Show Answer
                    </button>
                ) : (
                    <>
                        <div className="study-card-divider" />
                        <div className="study-card-back">
                            <p className="study-answer">{card.answer}</p>
                        </div>
                        <div className="study-rating-buttons">
                            {intervals.map(({ label, rating, className, interval }) => (
                                <button
                                    key={rating}
                                    className={`study-rating-btn ${className}`}
                                    onClick={() => handleRating(rating)}
                                    disabled={reviewing}
                                >
                                    <span className="rating-label">{label}</span>
                                    <span className="rating-interval">{interval}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <button
                type="button"
                className="study-remove-card"
                onClick={handleRemove}
                disabled={removing || reviewing}
            >
                {removing ? 'Removing...' : 'Remove this card'}
            </button>
        </div>
    )
}

const BREADTH_LABEL = { A: 'Analytical', B: 'Temporal', C: 'Geographic' }

// Column definitions for the sortable Browse table header. `key` matches the state used to
// track the active sort column; `getValue` extracts the value to compare for that column.
// Missing/null values (e.g. a card whose anchor lacks a canonical tree position, or a card
// that has never been studied) are pushed to the end when sorting ascending, and so to the
// start when the sort is reversed to descending.
const BROWSE_COLUMNS = [
    { key: 'narrative', label: 'Narrative', getValue: (card) => card.anchor_title || '' },
    { key: 'type', label: 'Type', getValue: (card) => BREADTH_LABEL[card.breadth] || card.breadth || '' },
    { key: 'question', label: 'Question', getValue: (card) => card.question || '' },
    { key: 'answer', label: 'Answer', getValue: (card) => card.answer || '' },
    { key: 'level', label: 'Level', getValue: (card) => (card.level === null || card.level === undefined ? null : card.level) },
    { key: 'due', label: 'Due', getValue: (card) => (card.next_review_date ? new Date(card.next_review_date).getTime() : null) },
]

// Ascending comparator with nulls sorted last, so the direction toggle naturally puts them
// first when reversed.
function compareValues(a, b) {
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1
    if (typeof a === 'string') return a.localeCompare(b)
    return a - b
}

function BrowseMode({ auth, flashcards, setFlashcards }) {
    const [deletingId, setDeletingId] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortKey, setSortKey] = useState(null)
    const [sortDir, setSortDir] = useState('asc')

    const handleDelete = async (id) => {
        setDeletingId(id)
        try {
            const token = await auth.getToken()
            const response = await fetch(`/api/flashcards?id=${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            if (data.success) {
                setFlashcards(prev => prev.filter(f => f.id !== id))
            }
        } catch (err) {
            console.error('Failed to delete flashcard:', err)
        } finally {
            setDeletingId(null)
        }
    }

    const formatDue = (card) => {
        if (!card.next_review_date) return 'Not yet studied'
        const due = new Date(card.next_review_date)
        return due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    }

    const formatLevel = (card) => {
        if (card.level === null || card.level === undefined) return '—'
        return card.level === 0 ? 'Root' : String(card.level)
    }

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
        } else {
            setSortKey(key)
            setSortDir('asc')
        }
    }

    if (flashcards.length === 0) {
        return (
            <div className="flashcards-empty">
                <h2>No flashcards yet</h2>
                <p>Read narratives and save questions to build your collection.</p>
            </div>
        )
    }

    const query = searchQuery.trim().toLowerCase()
    const visibleCards = query
        ? flashcards.filter(card => (
            (card.question || '').toLowerCase().includes(query) ||
            (card.answer || '').toLowerCase().includes(query) ||
            (card.anchor_title || '').toLowerCase().includes(query)
        ))
        : flashcards

    const activeColumn = BROWSE_COLUMNS.find(c => c.key === sortKey)
    const sortedCards = activeColumn
        ? [...visibleCards].sort((a, b) => {
            const result = compareValues(activeColumn.getValue(a), activeColumn.getValue(b))
            return sortDir === 'asc' ? result : -result
        })
        : visibleCards

    return (
        <div className="flashcards-groups">
            <div className="flashcard-search-bar">
                <input
                    type="text"
                    className="flashcard-search-input"
                    placeholder="Search cards..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search flashcards"
                />
                {query && (
                    <span className="flashcard-search-count">
                        {sortedCards.length} of {flashcards.length} cards
                    </span>
                )}
            </div>
            <div className="flashcard-table-scroll">
                <table className="flashcard-table">
                    <thead>
                        <tr>
                            {BROWSE_COLUMNS.map(col => (
                                <th
                                    key={col.key}
                                    className="flashcard-table-sortable"
                                    onClick={() => handleSort(col.key)}
                                    aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                >
                                    <span className="flashcard-table-sort-label">
                                        {col.label}
                                        <span className="flashcard-table-sort-arrow">
                                            {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                                        </span>
                                    </span>
                                </th>
                            ))}
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedCards.map(card => (
                            <tr key={card.id}>
                                <td>
                                    <Link
                                        to={`/narrative/${card.anchor_id}?breadth=${card.breadth}`}
                                        className="flashcard-narrative-link"
                                    >
                                        {card.anchor_title}
                                    </Link>
                                </td>
                                <td>{BREADTH_LABEL[card.breadth] || card.breadth}</td>
                                <td className="flashcard-table-question">{card.question}</td>
                                <td className="flashcard-table-answer">{card.answer}</td>
                                <td className="flashcard-table-level">{formatLevel(card)}</td>
                                <td className="flashcard-table-due">{formatDue(card)}</td>
                                <td>
                                    <button
                                        className="flashcard-delete"
                                        disabled={deletingId === card.id}
                                        onClick={() => handleDelete(card.id)}
                                    >
                                        {deletingId === card.id ? '...' : 'Remove'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {sortedCards.length === 0 && (
                    <p className="flashcard-search-empty">No cards match your search.</p>
                )}
            </div>
        </div>
    )
}

function FlashcardsPageInner() {
    const auth = useAuth()
    const [activeTab, setActiveTab] = useState('study')
    const [flashcards, setFlashcards] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const fetchFlashcards = useCallback(async () => {
        if (!auth.isSignedIn) return
        try {
            setLoading(true)
            const token = await auth.getToken()
            const response = await fetch('/api/flashcards', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            if (data.success) {
                setFlashcards(data.flashcards)
            } else {
                setError(data.error || 'Failed to load flashcards')
            }
        } catch (err) {
            setError('Failed to load flashcards')
        } finally {
            setLoading(false)
        }
    }, [auth.isSignedIn])

    useEffect(() => {
        if (auth.isSignedIn) {
            fetchFlashcards()
        }
    }, [auth.isSignedIn, fetchFlashcards])

    // Refetch flashcards when switching to Browse tab so due dates are current
    useEffect(() => {
        if (activeTab === 'browse' && auth.isSignedIn) {
            fetchFlashcards()
        }
    }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

    if (!auth.isLoaded) {
        return (
            <div className="flashcards-page">
                <div className="flashcards-loading">Loading...</div>
            </div>
        )
    }

    if (!auth.isSignedIn) {
        return <RedirectToSignIn />
    }

    if (error) {
        return (
            <div className="flashcards-page">
                <div className="flashcards-empty">
                    <h1>Error</h1>
                    <p>{error}</p>
                    <button onClick={fetchFlashcards} className="retry-button">Try Again</button>
                </div>
            </div>
        )
    }

    return (
        <div className="flashcards-page">
            <header className="flashcards-header">
                <h1>Flashcards</h1>
                <div className="flashcards-tabs">
                    <button
                        className={`flashcards-tab ${activeTab === 'study' ? 'active' : ''}`}
                        onClick={() => setActiveTab('study')}
                    >
                        Study
                    </button>
                    <button
                        className={`flashcards-tab ${activeTab === 'browse' ? 'active' : ''}`}
                        onClick={() => setActiveTab('browse')}
                    >
                        Browse
                    </button>
                </div>
            </header>

            {activeTab === 'study' ? (
                <StudyMode
                    auth={auth}
                    onSwitchToBrowse={() => setActiveTab('browse')}
                />
            ) : (
                loading ? (
                    <div className="flashcards-loading">Loading your flashcards...</div>
                ) : (
                    <BrowseMode
                        auth={auth}
                        flashcards={flashcards}
                        setFlashcards={setFlashcards}
                    />
                )
            )}
        </div>
    )
}

function FlashcardsPage() {
    const clerkEnabled = useClerkEnabled()

    if (!clerkEnabled) {
        return (
            <div className="flashcards-page">
                <div className="flashcards-empty">
                    <h1>Flashcards</h1>
                    <p>Authentication is not configured. Flashcards require sign-in.</p>
                </div>
            </div>
        )
    }

    return <FlashcardsPageInner />
}

export default FlashcardsPage
