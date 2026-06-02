function LandingPage({ onStart, onAbout }) {
    return (
        <div className="landing-page">
            <h1>Fractal History</h1>

            <p className="intro">
                A first-principles approach to world history through hierarchical, branching topics.
            </p>

            <div className="landing-buttons">
                <button className="primary-button" onClick={onStart}>
                    Start Exploring
                </button>
                <button className="primary-button" onClick={onAbout}>
                    Learn How This Works
                </button>
            </div>
        </div>
    )
}

export default LandingPage