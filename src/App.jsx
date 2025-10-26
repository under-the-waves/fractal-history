import { useState } from 'react'
import LandingPage from './components/LandingPage'
import AnchorList from './components/AnchorList'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('landing')

  return (
    <div className="app">
      {currentView === 'landing' && (
        <LandingPage onStart={() => setCurrentView('anchors')} />
      )}

      {currentView === 'anchors' && (
        <AnchorList />
      )}
    </div>
  )
}

export default App