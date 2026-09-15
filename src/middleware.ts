import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // This will refresh session if needed
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      // If refresh token is expired or invalid, clear stale auth cookies to prevent header bloat and 431 errors
      if (error.code === 'refresh_token_not_found' || error.message?.includes('Refresh Token Not Found')) {
        const allCookies = request.cookies.getAll();
        allCookies.forEach((cookie) => {
          if (cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')) {
            response.cookies.delete(cookie.name);
          }
        });
      }
    } else {
      user = data.user;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Middleware auth check failed:', err);
    // Continue as unauthenticated
  }

  // Check if the request is for protected routes (exact segment match to prevent matching /peers.ico etc)
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/faculty" ||
    pathname.startsWith("/faculty/") ||
    pathname === "/peer" ||
    pathname.startsWith("/peer/");

  // If accessing protected route without authenticated user, redirect to login
  // Preserve the originally requested URL so we can redirect back after login
  if (isProtectedRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder static files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
