function AnchorList() {
    // For now, just a simple list of the first few anchors
    const anchors = [
        { id: 1, title: "0-ROOT: The Story of Everything", completed: false },
        { id: 2, title: "1A-B4C7D: Cosmic Origins", completed: false },
        { id: 3, title: "1A-G7H2K: Agricultural Revolution", completed: false },
    ]

    return (
        <div className="anchor-list">
            <h2>Your Learning Path</h2>
            <p>Complete anchors in sequence to build your understanding</p>

            <div className="anchors">
                {anchors.map(anchor => (
                    <div key={anchor.id} className="anchor-card">
                        <span className="anchor-status">
                            {anchor.completed ? '✓' : '○'}
                        </span>
                        <h3>{anchor.title}</h3>
                        <button className="start-anchor-button">
                            {anchor.completed ? 'Review' : 'Start'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default AnchorList