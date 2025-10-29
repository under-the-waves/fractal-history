import { useState } from 'react'
import LandingPage from './components/LandingPage'
import AnchorList from './components/AnchorList'
import NarrativeReading from './components/NarrativeReading'
import TreeVisualization from './components/TreeVisualization.jsx'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('landing')
  const [selectedAnchor, setSelectedAnchor] = useState(null)

  const handleSelectAnchor = (anchor) => {
    setSelectedAnchor(anchor)
    setCurrentView('reading')
  }

  const handleComplete = () => {
    // For now, just go back to anchor list
    // Later we'll add quiz functionality
    setCurrentView('anchors')
  }

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="app-nav">
        <button onClick={() => setCurrentView('landing')}>Home</button>
        <button onClick={() => setCurrentView('tree')}>Tree View</button>
        <button onClick={() => setCurrentView('anchors')}>30 Essentials</button>
      </nav>

      {currentView === 'landing' && (
        <LandingPage onStart={() => setCurrentView('tree')} />
      )}

      {currentView === 'tree' && (
        <TreeVisualization />
      )}

      {currentView === 'anchors' && (
        <AnchorList onSelectAnchor={handleSelectAnchor} />
      )}

      {currentView === 'reading' && selectedAnchor && (
        <NarrativeReading
          anchor={selectedAnchor}
          onComplete={handleComplete}
        />
      )}
    </div>
  )
}

export default App