import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import AnchorList from './components/AnchorList'
import NarrativeReading from './components/NarrativeReading'
import TreeVisualization from './components/TreeVisualization.jsx'
import './App.css'

function AppContent() {
  const navigate = useNavigate()

  const handleSelectAnchor = (anchor) => {
    navigate(`/narrative/${anchor.id}`)
  }

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="app-nav">
        <button onClick={() => navigate('/')}>Home</button>
        <button onClick={() => navigate('/tree')}>Tree View</button>
        <button onClick={() => navigate('/anchors')}>30 Essentials</button>
      </nav>

      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
              onStart={() => navigate('/tree')}
              onAbout={() => navigate('/about')}
            />
          }
        />
        <Route path="/tree" element={<TreeVisualization />} />
        <Route path="/anchors" element={<AnchorList onSelectAnchor={handleSelectAnchor} />} />
        <Route path="/narrative/:id" element={<NarrativeReading />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
