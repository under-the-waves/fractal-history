function AboutPage({ onBack }) {
    return (
        <div className="about-page">
            <button className="back-button" onClick={onBack}>← Back</button>

            <header className="about-hero">
                <h1>About Fractal History</h1>
                <p className="about-tagline">
                    A first-principles map of world history — from the Big Bang to the present —
                    that you explore by zooming from broad topics into ever-finer detail.
                </p>
            </header>

            <section className="about-section">
                <h2>What is Fractal History?</h2>
                <p>
                    Fractal History is a learning system that helps you build a coherent understanding
                    of world history through hierarchical <em>anchors</em> — topics that branch into
                    progressively more detailed subtopics. Instead of a flat timeline or a single
                    fixed narrative, it lets you choose your own depth and path through the past.
                </p>
            </section>

            <section className="about-section">
                <h2>How It Works</h2>
                <div className="about-cards">
                    <div className="about-card">
                        <h3>Anchors</h3>
                        <p>
                            An anchor is a historical topic with a unique ID, such as{' '}
                            <code>1A-G7H2K: Agricultural Revolution</code>. Each one captures a single
                            significant subject and can branch into deeper anchors.
                        </p>
                    </div>
                    <div className="about-card">
                        <h3>Narratives</h3>
                        <p>
                            Every anchor has an accompanying narrative — a concise, readable historical
                            account that explains what happened, when, and why it matters.
                        </p>
                    </div>
                    <div className="about-card">
                        <h3>The Fractal Structure</h3>
                        <p>
                            Like a fractal, each level mirrors the structure of the whole. Zoom out for
                            the big picture or in for the specifics; every topic has context above it and
                            detail below it.
                        </p>
                    </div>
                </div>
            </section>

            <section className="about-section">
                <h2>Three Ways to Branch</h2>
                <p>
                    Any topic can be broken down along three dimensions, so you can study it from
                    whichever angle fits your question.
                </p>
                <div className="about-breadths">
                    <div className="about-breadth" style={{ '--breadth-color': '#3498db' }}>
                        <span className="about-breadth-tag">A</span>
                        <div>
                            <h4>Analytical</h4>
                            <p>The most essential aspects and themes of a topic.</p>
                        </div>
                    </div>
                    <div className="about-breadth" style={{ '--breadth-color': '#27ae60' }}>
                        <span className="about-breadth-tag">B</span>
                        <div>
                            <h4>Temporal</h4>
                            <p>Chronological periods that give complete time coverage.</p>
                        </div>
                    </div>
                    <div className="about-breadth" style={{ '--breadth-color': '#e67e22' }}>
                        <span className="about-breadth-tag">C</span>
                        <div>
                            <h4>Geographic</h4>
                            <p>Regions and places that give complete spatial coverage.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="about-section">
                <h2>How to Use This Site</h2>
                <ol className="about-steps">
                    <li>Open the <strong>Tree View</strong> to see history as a branching map.</li>
                    <li>Select any anchor to read its narrative.</li>
                    <li>Drill deeper — each anchor branches into more detailed sub-anchors.</li>
                    <li>Switch between the Analytical, Temporal, and Geographic views of a topic.</li>
                    <li>Save key questions as flashcards to review later.</li>
                </ol>
            </section>
        </div>
    )
}

export default AboutPage
