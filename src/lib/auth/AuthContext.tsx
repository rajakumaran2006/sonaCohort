'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

type UserMode = 'admin' | 'faculty' | 'peer' | 'student'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithMicrosoft: () => Promise<void>
  signOut: () => Promise<void>
  userMode: UserMode
  setUserMode: (mode: UserMode) => void
  // Keep backward compatibility
  isFacultyMode: boolean
  setIsFacultyMode: (mode: boolean) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [userMode, setUserModeState] = useState<UserMode>('admin')

  // Load userMode from localStorage on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('user_mode') as UserMode
    if (savedMode && ['admin', 'faculty', 'peer', 'student'].includes(savedMode)) {
      setUserModeState(savedMode)
    }
  }, [])

  const setUserMode = (mode: UserMode) => {
    setUserModeState(mode)
    localStorage.setItem('user_mode', mode)
  }

  // Backward compatibility
  const isFacultyMode = userMode === 'faculty'
  const setIsFacultyMode = (mode: boolean) => setUserMode(mode ? 'faculty' : 'admin')

  useEffect(() => {
    const supabase = createClient()
    
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          setSession(session)
          setUser(session.user)
        } else {
          logger.info('No initial session found')
          setSession(null)
          setUser(null)
        }
      } catch (error) {
        logger.error('Error getting initial session:', error)
        setSession(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // console.log('Auth state change:', _event, session)
      
      if (session?.user) {
        // console.log('User authenticated:', session.user)
        setUser(session.user)
        setSession(session)
        // console.log('User state updated, setting loading to false')
      } else {
        // console.log('User signed out')
        setUser(null)
        setSession(null)
        // console.log('User state cleared, setting loading to false')
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithMicrosoft = async () => {
    try {
      const supabase = createClient()
      
      // Redirect to callback which will handle role detection
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'email openid profile User.Read User.ReadBasic.All offline_access',
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline'
          }
        }
      })
      if (error) throw error
    } catch (error) {
      logger.error('Error signing in with Microsoft:', error)
      throw error
    }
  }

  const signOut = async () => {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error) {
        // Check for AuthSessionMissingError - if session is missing, we're effectively signed out
        const isSessionMissing = 
          error.name === 'AuthSessionMissingError' || 
          error.message === 'Auth session missing!'
          
        if (!isSessionMissing) {
          throw error
        }
      }
      
      // Clear user state
      setUser(null)
      setSession(null)
    } catch (error: unknown) {
      // Handle case where it might throw directly
      const err = error as { name?: string; message?: string } | null
      const isSessionMissing = 
        err?.name === 'AuthSessionMissingError' || 
        err?.message === 'Auth session missing!'

      if (isSessionMissing) {
        logger.info('Auth session missing during sign out, clearing local state')
        setUser(null)
        setSession(null)
        return
      }

      logger.error('Error signing out:', error)
      throw error
    }
  }

  const value = {
    user,
    session,
    loading,
    signInWithMicrosoft,
    signOut,
    userMode,
    setUserMode,
    isFacultyMode,
    setIsFacultyMode
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
