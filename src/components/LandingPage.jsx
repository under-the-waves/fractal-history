function LandingPage({ onStart }) {
    return (
        <div className="landing-page">
            <h1>Fractal History</h1>
            <p className="tagline">
                Master world history through 30 essential stories, from the Big Bang to the present
            </p>

            <div className="features">
                <div className="feature">
                    <h3>📚 30 Essential Anchors</h3>
                    <p>Curated topics that build comprehensive historical understanding</p>
                </div>
                <div className="feature">
                    <h3>🎯 Guided Learning Path</h3>
                    <p>Follow a sequence designed for retention and coherence</p>
                </div>
                <div className="feature">
                    <h3>✨ Engaging Narratives</h3>
                    <p>Engaging storytelling that makes history memorable</p>
                </div>
            </div>

            <button className="start-button" onClick={onStart}>
                Begin Your Journey
            </button>
        </div>
    )
}

export default LandingPage