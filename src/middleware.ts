import { NextRequest, NextResponse } from "next/server";

/**
 * Per-request Content-Security-Policy with a nonce.
 *
 * Production uses a strict, nonce-based script policy (no 'unsafe-inline',
 * no 'unsafe-eval') plus 'strict-dynamic' so Next's own runtime can load its
 * chunks. Development relaxes script-src because React Fast Refresh / HMR need
 * inline + eval. Next.js reads the CSP from the request header and automatically
 * stamps the nonce onto its framework <script> tags; our one hand-written inline
 * script (service-worker registration in app/layout.tsx) reads the nonce too.
 *
 * The other static security headers (HSTS, X-Frame-Options, etc.) stay in
 * next.config.ts — only the CSP is dynamic, so it lives here.
 */
export function middleware(request: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'unsafe-inline' 'unsafe-eval'`;

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://storage.googleapis.com https://*.googleusercontent.com",
    "font-src 'self'",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://firestore.googleapis.com wss://*.firebaseio.com wss://firestore.googleapis.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Run on pages, not on static assets or images (they need no CSP nonce).
    {
      source: "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
