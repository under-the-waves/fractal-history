import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { ClerkEnabledContext } from './hooks/useClerkAuth'
import './index.css'
import App from './App.jsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  console.warn('Missing VITE_CLERK_PUBLISHABLE_KEY – auth features will be disabled')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkEnabledContext.Provider value={!!PUBLISHABLE_KEY}>
      {PUBLISHABLE_KEY ? (
        <ClerkProvider afterSignOutUrl="/">
          <App />
        </ClerkProvider>
      ) : (
        <App />
      )}
    </ClerkEnabledContext.Provider>
  </StrictMode>,
)
