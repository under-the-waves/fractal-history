import { useContext, createContext } from 'react'

// Clerk stores its context internally. We detect its presence by checking
// if the ClerkProvider rendered (main.jsx only wraps when the key exists).
// We export a simple boolean context that main.jsx sets.

export const ClerkEnabledContext = createContext(false)

export function useClerkEnabled() {
    return useContext(ClerkEnabledContext)
}
