import * as http from "node:http";

/**
 * Fixed local port for the post-Stripe-Checkout "thank-you" page. Stripe
 * requires a valid HTTP(S) `success_url` and silently rewrites unknown
 * URI schemes (e.g. `atomicbot-hermes://`) to `https://`, breaking the
 * deep-link return path. Routing through `http://localhost:<PORT>` lets
 * us serve a small landing page that triggers the proper deep link
 * (atomicbot-hermes://stripe-success?session_id=…) and brings focus back
 * to the Electron app.
 *
 * The port is fixed (not random) so that a checkout session created in
 * one process lifetime still resolves after an app restart.
 */
export const STRIPE_THANKS_PORT = 27871;

export const STRIPE_THANKS_PATH = "/stripe-thanks";

const DEEP_LINK_SCHEME = "atomicbot-hermes";

/** Public URL we hand to Stripe as `success_url`. */
export function getStripeThanksUrl(): string {
  return `http://localhost:${STRIPE_THANKS_PORT}${STRIPE_THANKS_PATH}?session_id={CHECKOUT_SESSION_ID}`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderThanksPage(deepLinkUrl: string): string {
  const safeDeepLink = escapeAttr(deepLinkUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Payment successful</title>
  <style>
    :root { color-scheme: dark; }
    html, body {
      margin: 0;
      min-height: 100vh;
      background: #121212;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      max-width: 420px;
      width: 100%;
      padding: 36px 32px;
      border-radius: 18px;
      background:
        linear-gradient(#1d1d1d, #1d1d1d) padding-box,
        linear-gradient(150deg, rgba(255,255,255,.18) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,.18) 100%) border-box;
      border: 1px solid transparent;
      box-shadow: 0 12px 40px rgba(0,0,0,.5);
      text-align: center;
    }
    .check {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      margin: 0 auto 18px;
      border-radius: 50%;
      background: rgba(174, 255, 0, .12);
      color: #aeff00;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 20px;
      font-weight: 650;
      letter-spacing: -0.01em;
    }
    p {
      margin: 0;
      color: rgba(230, 237, 243, .65);
      font-size: 14px;
      line-height: 20px;
    }
    .hint {
      margin-top: 22px;
      font-size: 12px;
      color: rgba(230, 237, 243, .4);
    }
  </style>
</head>
<body>
  <div class="card" role="status" aria-live="polite">
    <div class="check" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h1>Payment successful</h1>
    <p>Returning you to Atomic Hermes…</p>
    <div class="hint">You can close this tab.</div>
  </div>
  <script>
    (function () {
      var deepLink = "${safeDeepLink}";
      // Trigger the protocol handler so macOS / Windows brings the Hermes
      // window forward and the renderer fires its stripe-success handler.
      try { window.location.href = deepLink; } catch (e) { /* ignore */ }
      // Best-effort tab close. Browsers only allow window.close() on tabs
      // the page itself opened — works for popups, no-op otherwise.
      setTimeout(function () { try { window.close(); } catch (e) { /* ignore */ } }, 1200);
    })();
  </script>
</body>
</html>`;
}

export type StripeThanksServer = {
  stop: () => Promise<void>;
};

/**
 * Starts a localhost-only HTTP server that serves the post-checkout
 * landing page on `STRIPE_THANKS_PORT`. Idempotent: returns null if the
 * port is busy (another Hermes instance, port collision) — callers should
 * fall back to the renderer's polling-only flow.
 */
export function startStripeThanksServer(): Promise<StripeThanksServer | null> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        if (!req.url) {
          res.writeHead(404).end();
          return;
        }
        const url = new URL(req.url, `http://localhost:${STRIPE_THANKS_PORT}`);
        if (url.pathname !== STRIPE_THANKS_PATH) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
          return;
        }
        const sessionId = url.searchParams.get("session_id") ?? "";
        const deepLinkUrl = sessionId
          ? `${DEEP_LINK_SCHEME}://stripe-success?session_id=${encodeURIComponent(sessionId)}`
          : `${DEEP_LINK_SCHEME}://stripe-success`;
        const html = renderThanksPage(deepLinkUrl);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(html);
      } catch (err) {
        console.warn("[stripe-thanks-server] handler error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain" });
        }
        res.end();
      }
    });

    let resolved = false;

    server.once("error", (err) => {
      console.warn(
        `[stripe-thanks-server] failed to bind :${STRIPE_THANKS_PORT}:`,
        err,
      );
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });

    server.listen(STRIPE_THANKS_PORT, "127.0.0.1", () => {
      if (resolved) return;
      resolved = true;
      console.log(
        `[stripe-thanks-server] listening on http://127.0.0.1:${STRIPE_THANKS_PORT}${STRIPE_THANKS_PATH}`,
      );
      resolve({
        stop: () =>
          new Promise<void>((stopResolve) => {
            server.close(() => stopResolve());
          }),
      });
    });
  });
}
