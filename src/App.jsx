import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import { Show, SignInButton, UserButton } from '@clerk/react'
import { useClerkEnabled } from './hooks/useClerkAuth'
import LandingPage from './components/LandingPage'
import AnchorList from './components/AnchorList'
import NarrativeReading from './components/NarrativeReading'
import TreeVisualization from './components/TreeVisualization.jsx'
import AboutPage from './components/AboutPage'
import FlashcardsPage from './components/FlashcardsPage'
import './App.css'

function AppContent() {
  const navigate = useNavigate()
  const clerkEnabled = useClerkEnabled()

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
        {clerkEnabled && (
          <Show when="signed-in">
            <button onClick={() => navigate('/flashcards')}>Flashcards</button>
          </Show>
        )}
        <button onClick={() => navigate('/about')}>About</button>
        {clerkEnabled && (
          <div className="nav-auth">
            <Show when="signed-in">
              <UserButton />
            </Show>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="sign-in-button">Sign In</button>
              </SignInButton>
            </Show>
          </div>
        )}
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
        <Route path="/flashcards" element={<FlashcardsPage />} />
        <Route path="/about" element={<AboutPage onBack={() => navigate('/')} />} />
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
