import { anchors } from '../data/anchors'

function AnchorList({ onSelectAnchor, onBack }) {
    return (
        <div className="anchor-list">
            <button className="back-button" onClick={onBack}>← Back</button>

            <h2>30 Essential Anchors</h2>
            <p className="anchor-list-description">
                These 30 anchors provide foundational knowledge of world history from the Big Bang
                to the present. They follow a recommended sequence designed to build understanding
                progressively, with each topic providing context for those that follow. After
                completing these anchors, you will have a coherent framework for understanding
                how the modern world came to be.
            </p>

            <div className="anchors">
                {anchors.map((anchor, index) => (
                    <div key={anchor.id} className="anchor-card">
                        <span className="anchor-status">
                            {anchor.completed ? '✓' : '○'}
                        </span>
                        <div className="anchor-info">
                            <h3>{index + 1} - {anchor.title.split(': ')[1] || anchor.title}</h3>
                            <span className="anchor-code">{anchor.id}</span>
                        </div>
                        <button
                            className="start-anchor-button"
                            onClick={() => onSelectAnchor(anchor)}
                        >
                            {anchor.completed ? 'Review' : 'Start'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default AnchorList