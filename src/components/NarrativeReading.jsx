function NarrativeReading({ anchor, onComplete }) {
    return (
        <div className="narrative-reading">
            <div className="narrative-header">
                <h1>{anchor.title}</h1>
                {anchor.prerequisites && (
                    <p className="prerequisites">
                        Prerequisites: {anchor.prerequisites}
                    </p>
                )}
            </div>

            <div className="narrative-text">
                <div dangerouslySetInnerHTML={{ __html: anchor.narrative }} />
            </div>

            <div className="key-concepts">
                <h2>Key Concepts</h2>
                <p className="concepts-note">Each of these concepts can be explored deeper as its own anchor</p>
                <ol>
                    {anchor.keyConcepts.map((concept, index) => (
                        <li key={index}>{concept}</li>
                    ))}
                </ol>
            </div>

            <button className="quiz-button" onClick={onComplete}>
                Take Knowledge Check →
            </button>
        </div>
    )
}

export default NarrativeReading