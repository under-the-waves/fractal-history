import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Show, SignInButton, UserButton } from '@clerk/react'
import { useClerkEnabled } from './hooks/useClerkAuth'
import NarrativeReading from './components/NarrativeReading'
import GenerativeLearning from './components/GenerativeLearning'
import TreeVisualization from './components/TreeVisualization.jsx'
import AboutPage from './components/AboutPage'
import FlashcardsPage from './components/FlashcardsPage'
import AchievementsPage from './components/AchievementsPage'
import { ToastProvider } from './components/AchievementToasts'
import './App.css'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const clerkEnabled = useClerkEnabled()

  const isTreeRoute = location.pathname === '/' || location.pathname === '/tree' || location.pathname.startsWith('/narrative/')

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="app-nav">
        <button className={isTreeRoute ? 'active' : ''} onClick={() => navigate('/')}>Tree</button>
        {clerkEnabled && (
          <Show when="signed-in">
            <button className={location.pathname === '/flashcards' ? 'active' : ''} onClick={() => navigate('/flashcards')}>Flashcards</button>
          </Show>
        )}
        {clerkEnabled && (
          <Show when="signed-in">
            <button className={location.pathname === '/achievements' ? 'active' : ''} onClick={() => navigate('/achievements')}>Achievements</button>
          </Show>
        )}
        <button className={location.pathname === '/about' ? 'active' : ''} onClick={() => navigate('/about')}>About</button>
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
        <Route path="/" element={<TreeVisualization />} />
        <Route path="/tree" element={<TreeVisualization />} />
        <Route path="/narrative/:id" element={<NarrativeReading />} />
        <Route path="/learn/:id" element={<GenerativeLearning />} />
        <Route path="/flashcards" element={<FlashcardsPage />} />
        <Route path="/achievements" element={<AchievementsPage />} />
        <Route path="/about" element={<AboutPage onBack={() => navigate('/')} />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <Router>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </Router>
  )
}

export default App
