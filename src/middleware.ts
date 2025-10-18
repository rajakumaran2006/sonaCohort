import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  // Check if the request is for protected routes
  const isProtectedRoute = req.nextUrl.pathname.startsWith('/admin') || req.nextUrl.pathname.startsWith('/faculty')
  const isLoginRoute = req.nextUrl.pathname === '/login'
  
  // Get all cookies and check for any Supabase auth cookies
  const cookies = req.cookies.getAll()
  const hasSupabaseAuth = cookies.some(cookie => 
    cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')
  )
  
  // If accessing protected route without Supabase auth cookies, redirect to login
  if (isProtectedRoute && !hasSupabaseAuth) {
    console.log('Middleware: No Supabase auth cookies found, redirecting to login')
    return NextResponse.redirect(new URL('/login', req.url))
  }
  
  // If accessing login route with auth cookies, let the login page handle the redirect
  // This allows the login page to determine the correct dashboard based on user role
  // if (isLoginRoute && hasSupabaseAuth) {
  //   return NextResponse.redirect(new URL('/dashboard', req.url))
  // }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/login', '/faculty/:path*', '/admin/:path*', '/auth/callback']
}
