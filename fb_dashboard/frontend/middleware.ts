import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPrefixes = [
  "/_next", "/favicon.png", "/robots.txt", "/sitemap.xml", "/manifest.json",
  "/static", "/brand-icon.png",
  "/api/auth", "/api/plans",
  "/login", "/register", "/pricing", "/subscribe", "/demo",
];

function setHeaders(resp: NextResponse) {
  resp.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  resp.headers.set("X-Content-Type-Options", "nosniff");
  resp.headers.set("X-Frame-Options", "DENY");
  resp.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // ponytail: Next.js injects inline <script> for hydration bootstrap + RSC payload.
  // Full protection needs per-request nonce plumbing; 'unsafe-inline' is the
  // practical bridge. dev mode also needs 'unsafe-eval' for React Fast Refresh.
  const isDev = process.env.NODE_ENV === "development";
  const scriptSrc = `'self' 'unsafe-inline' https://va.vercel-scripts.com${isDev ? " 'unsafe-eval'" : ""}`;
  resp.headers.set("Content-Security-Policy", `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self'; manifest-src 'self' blob:`);
  resp.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  resp.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    // Static/public — headers only
    if (publicPrefixes.some(p => pathname.startsWith(p)) || pathname === "/") {
      const resp = NextResponse.next();
      setHeaders(resp);
      return resp;
    }

    const response = NextResponse.next();
    setHeaders(response);

    // API routes — CSRF handled by SameSite=Lax session cookie
    if (pathname.startsWith("/api")) {
      return response;
    }

    // Auth gate: protect admin and dashboard routes
    if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      const token = request.cookies.get("token")?.value;
      if (!token) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
      }
    }

    return response;
  } catch (e) {
    console.error("[middleware] Unhandled error:", (e as Error).message);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.png|sitemap\\.xml|robots\\.txt|manifest\\.json|\\.png|\\.jpg|\\.jpeg|\\.webp|\\.avif).*)",
  ],
};
