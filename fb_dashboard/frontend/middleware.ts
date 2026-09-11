import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPrefixes = [
  "/_next", "/favicon.png", "/robots.txt", "/sitemap.xml", "/manifest.json",
  "/static", "/brand-icon.png",
  "/api/auth", "/api/plans",
  "/login", "/register", "/pricing", "/subscribe", "/demo",
];

/* v10-C1 (G3 rec §8-1) — font files must NOT inherit the page-wide no-store:
 * the matcher below does not exclude /fonts/*.woff2, so every internal
 * navigation re-downloaded ~117-210KB of self-hosted fonts (G3 resource
 * timing, login→dashboard→messages). The fonts are content-stable but NOT
 * hash-named, so they get 7d + stale-while-revalidate (never immutable — a
 * font update still propagates within a day of max-age expiring).
 * Hash-named /_next/static assets never reach this middleware at all (the
 * matcher already excludes them) and keep Next's own immutable caching —
 * verified, nothing to change there. API responses keep no-store. */
const FONT_FILE_RE = /\.(?:woff2?|ttf|otf)$/i;
const FONT_CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";

/* v12-E5.4 (D8 live finding): the matcher's extension alternatives only
 * exclude paths whose remainder STARTS with ".png" — so /opengraph-image.png,
 * /favicon.ico, /apple-touch-icon.png, /icon-*.png, /brand-icon.png and
 * /manifest.webmanifest DO hit this middleware and previously inherited the
 * page-wide no-store (og:image re-fetched by every social crawler, icons by
 * every navigation). These public/ assets are content-stable (og-image is a
 * committed build artifact) → hard-cache them; the manifest is semi-live
 * (name/short_name can change per deploy) → 1h SWR. */
const IMMUTABLE_STATIC_RE =
  /^\/(?:opengraph-image\.png|favicon\.ico|apple-touch-icon\.png|brand-icon\.png|icon-[^/]+\.(?:png|ico)|manifest\.webmanifest)$/;
const MANIFEST_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

function setHeaders(resp: NextResponse, pathname: string) {
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
  resp.headers.set(
    "Cache-Control",
    FONT_FILE_RE.test(pathname)
      ? FONT_CACHE_CONTROL
      : IMMUTABLE_STATIC_RE.test(pathname)
        ? "public, max-age=31536000, immutable"
        : pathname === "/manifest.webmanifest"
          ? MANIFEST_CACHE_CONTROL
          : "no-store, no-cache, must-revalidate"
  );
  resp.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    // Static/public — headers only
    if (publicPrefixes.some(p => pathname.startsWith(p)) || pathname === "/") {
      const resp = NextResponse.next();
      setHeaders(resp, pathname);
      return resp;
    }

    const response = NextResponse.next();
    setHeaders(response, pathname);

    // API routes — CSRF handled by SameSite=Lax session cookie
    if (pathname.startsWith("/api")) {
      return response;
    }

    // Auth gate: protect admin and dashboard routes
    /* v25 (W-12): /connect added to the cookie gate — the page's own 401
     * redirect (window.location.replace after /api/facebook/settings 401s)
     * only fires AFTER the page mounts, so an anonymous visitor saw the
     * connect skeleton flash first. Same cookie-presence check + redirect
     * contract as /dashboard & /admin (login?redirect=<pathname>). */
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/connect")
    ) {
      const token = request.cookies.get("token")?.value;
      if (!token) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        const redirect = NextResponse.redirect(loginUrl);
        /* v12-E4.14: the 307 auth redirect carried NO security headers —
         * setHeaders is now applied on this branch too (D8 live finding:
         * every other response on the route ships the full CSP/HSTS set).
         * The page-level Cache-Control (no-store) also lands here, which is
         * correct for a personalized redirect. */
        setHeaders(redirect, pathname);
        return redirect;
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
