function AboutPage({ onBack }) {
    return (
        <div className="about-page">
            <button className="back-button" onClick={onBack}>← Back</button>

            <h1>About Fractal History</h1>

            <section className="about-section">
                <h2>What is Fractal History?</h2>
                <p>
                    Fractal History is a learning system designed to help you build coherent
                    understanding of world history through hierarchical "anchors" - topics that
                    branch into progressively more detailed subtopics.
                </p>
            </section>

            <section className="about-section">
                <h2>How It Works</h2>

                <h3>Anchors</h3>
                <p>
                    An anchor is a historical topic with a unique ID (like "1A-G7H2K: Agricultural Revolution").
                    Each anchor contains 3-5 key concepts that represent the most important aspects of that topic.
                    These concepts can themselves become anchors for deeper exploration.
                </p>

                <h3>Narratives</h3>
                <p>
                    Each anchor has an accompanying narrative - a ~1000-word historical account written in
                    an engaging style. These narratives explain what happened, when, and why it matters.
                </p>

                <h3>The Fractal Structure</h3>
                <p>
                    Like a fractal in mathematics, each level of the system mirrors the structure of the whole.
                    You can start with broad overviews and progressively zoom into specific topics, events,
                    or themes that interest you. Every topic has context above it and detail below it.
                </p>
            </section>

            <section className="about-section">
                <h2>The 30 Essential Anchors</h2>
                <p>
                    This site presents 30 carefully selected anchors that provide foundational knowledge
                    of world history from the Big Bang to the present. These anchors follow a recommended
                    sequence designed to build understanding progressively, with each topic providing
                    context for those that follow.
                </p>
                <p>
                    You can work through them in order, or explore topics that interest you. Prerequisites
                    are noted when one anchor assumes knowledge from another.
                </p>
            </section>

            <section className="about-section">
                <h2>How to Use This Site</h2>
                <ol>
                    <li>Browse the list of 30 anchors</li>
                    <li>Select an anchor to read its narrative</li>
                    <li>Review the 3-5 key concepts</li>
                    <li>Take the knowledge check to reinforce what you learned</li>
                    <li>Continue to the next anchor</li>
                </ol>
            </section>
        </div>
    )
}

export default AboutPage