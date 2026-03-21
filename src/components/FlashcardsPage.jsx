import { useState, useEffect, useCallback } from 'react'
import { useAuth, RedirectToSignIn } from '@clerk/clerk-react'
import { useClerkEnabled } from '../hooks/useClerkAuth'

function FlashcardsPageInner() {
    const auth = useAuth()
    const [flashcards, setFlashcards] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [flippedCards, setFlippedCards] = useState(new Set())
    const [deletingId, setDeletingId] = useState(null)

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

    const toggleFlip = (id) => {
        setFlippedCards(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

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

    // Group flashcards by anchor
    const grouped = flashcards.reduce((acc, card) => {
        const key = card.anchor_title || card.anchor_id
        if (!acc[key]) acc[key] = []
        acc[key].push(card)
        return acc
    }, {})

    if (loading) {
        return (
            <div className="flashcards-page">
                <div className="flashcards-loading">Loading your flashcards...</div>
            </div>
        )
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
                <h1>Your Flashcards</h1>
                <p className="flashcards-count">
                    {flashcards.length} {flashcards.length === 1 ? 'card' : 'cards'}
                </p>
            </header>

            {flashcards.length === 0 ? (
                <div className="flashcards-empty">
                    <h2>No flashcards yet</h2>
                    <p>Read narratives and save questions to build your collection.</p>
                </div>
            ) : (
                <div className="flashcards-groups">
                    {Object.entries(grouped).map(([anchorTitle, cards]) => (
                        <section key={anchorTitle} className="flashcard-group">
                            <h2 className="flashcard-group-title">{anchorTitle}</h2>
                            <div className="flashcard-grid">
                                {cards.map(card => (
                                    <div
                                        key={card.id}
                                        className={`flashcard ${flippedCards.has(card.id) ? 'flipped' : ''}`}
                                        onClick={() => toggleFlip(card.id)}
                                    >
                                        <div className="flashcard-inner">
                                            <div className="flashcard-front">
                                                <p className="flashcard-question">{card.question}</p>
                                                <span className="flashcard-hint">Click to reveal answer</span>
                                            </div>
                                            <div className="flashcard-back">
                                                <p className="flashcard-answer">{card.answer}</p>
                                                <button
                                                    className="flashcard-delete"
                                                    disabled={deletingId === card.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDelete(card.id)
                                                    }}
                                                >
                                                    {deletingId === card.id ? 'Removing...' : 'Remove'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    )
}

// Outer component handles the case where Clerk is not configured
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
