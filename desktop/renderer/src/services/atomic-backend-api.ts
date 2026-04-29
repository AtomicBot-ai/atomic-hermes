/**
 * HTTP client for atomic-bot-backend (https://api.atomicbot.ai by default).
 * Used by the PAYG onboarding flow to fetch the user's OpenRouter key,
 * top up credits, read balance, and open the Stripe billing portal.
 *
 * See atomic-bot-backend/docs/DESKTOP_INTEGRATION.md for the full contract.
 */

const DEFAULT_BACKEND_URL = "https://api.atomicbot.ai";

export function getAtomicBackendUrl(): string {
  const fromEnv = import.meta.env.VITE_ATOMIC_BACKEND_URL;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, "");
  }
  return DEFAULT_BACKEND_URL;
}

export type SubscriptionPlan = "free" | "base" | "pro" | "max";

export type AuthMeResponse = {
  userId: string;
  email: string;
  subscriptionPlan: SubscriptionPlan;
};

export type SubscriptionPool = {
  limit: number;
  remaining: number;
  expiresAt: string | null;
};

export type PaygPool = {
  limit: number;
  remaining: number;
};

export type BalanceResponse = {
  total: number;
  subscriptionPlan: SubscriptionPlan;
  subscription: SubscriptionPool | null;
  payg: PaygPool | null;
};

export type PaygKeyResponse = {
  key: string;
  keyHash: string;
  remaining: number;
  limit: number;
};

export type PaygTopupRequest = {
  amountUsd: number;
  successUrl?: string;
  cancelUrl?: string;
};

export type PaygTopupResponse = {
  checkoutUrl: string;
};

export type PortalUrlResponse = {
  portalUrl: string;
};

export type PurchaseHistoryItem = {
  id: string;
  type: "subscription" | "addon" | "payg_topup";
  amountUsd: number;
  creditsAdded: number;
  createdAt: string;
};

export type PurchaseHistoryResponse = {
  purchases: PurchaseHistoryItem[];
};

async function request<T>(
  path: string,
  init: RequestInit & { jwt?: string | null } = {},
): Promise<T> {
  const { jwt, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (!headers.has("Content-Type") && rest.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (jwt) {
    headers.set("Authorization", `Bearer ${jwt}`);
  }

  const url = `${getAtomicBackendUrl()}${path}`;
  const res = await fetch(url, { ...rest, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = body;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      // body was not JSON — keep raw text
    }
    const error = new Error(message || `HTTP ${res.status}`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }

  return (await res.json()) as T;
}

/**
 * URL scheme this client claims for deep-link delivery. The backend reads
 * this via `?scheme=` on `/auth/{google,apple}/desktop` and propagates it
 * through OAuth `state`. Without it, the post-OAuth redirect falls back to
 * the default `atomicbot://` scheme (used by openclaw) instead of our
 * `atomicbot-hermes://`. The scheme must exactly match an entry in the
 * backend's `ALLOWED_DESKTOP_SCHEMES` env var (see deploy-stage.yml /
 * deploy-prod.yml in atomic-bot-backend), otherwise it is dropped
 * server-side.
 */
export const DEEP_LINK_SCHEME = "atomicbot-hermes";

function withRedirectScheme(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}scheme=${encodeURIComponent(DEEP_LINK_SCHEME)}`;
}

/** Build the URL the desktop opens in the system browser to start Google OAuth. */
export function googleAuthDesktopUrl(): string {
  return withRedirectScheme(`${getAtomicBackendUrl()}/auth/google/desktop`);
}

/** Build the URL the desktop opens in the system browser to start Apple OAuth. */
export function appleAuthDesktopUrl(): string {
  return withRedirectScheme(`${getAtomicBackendUrl()}/auth/apple/desktop`);
}

/**
 * Localhost port (mirrors `STRIPE_THANKS_PORT` in
 * `desktop/src/main/atomic-auth/stripe-thanks-server.ts`). Kept in sync by
 * convention — both ends must agree on the same fixed port so a checkout
 * URL minted in one process lifetime survives an app restart.
 */
const STRIPE_THANKS_LOCAL_PORT = 27871;

/**
 * Stripe Checkout `success_url` for PAYG top-ups.
 *
 * Points at the local thanks server hosted by the Electron main process.
 * The page renders a "Payment successful" landing and triggers
 * `atomicbot-hermes://stripe-success?session_id=…` via JS, which brings
 * the Hermes window forward and triggers an immediate balance refresh.
 *
 * We deliberately avoid passing the custom URI scheme directly to Stripe:
 * Stripe silently rewrites unknown schemes to `https://`, producing
 * `https://atomicbot-hermes//stripe-success?…` (DNS error). Routing
 * through `http://localhost` is the same trick the backend's Google OAuth
 * flow uses (see atomic-bot-backend `auth.ts`, "Authentication Successful"
 * HTML page) — Stripe accepts it, browser hits our local server, JS fires
 * the deep link.
 *
 * `useAtomicTopupPolling` still polls the balance independently, so the
 * flow is robust even if the deep link is blocked or the user dismisses
 * the browser prompt.
 */
export function getStripePaygSuccessUrl(): string {
  return `http://localhost:${STRIPE_THANKS_LOCAL_PORT}/stripe-thanks?session_id={CHECKOUT_SESSION_ID}`;
}

/**
 * Stripe Checkout `cancel_url` for PAYG top-ups. Must be a valid HTTP(S)
 * URL — Stripe rejects custom URI schemes here too.
 */
export const STRIPE_PAYG_CANCEL_URL = "https://atomicbot.ai";

/**
 * After Stripe Checkout, App.tsx consumes this and navigates (e.g. onboarding
 * model step). TTL prevents a stale entry from navigating after an abandoned
 * checkout session.
 */
const POST_PAYG_SUCCESS_NAV_SESSION_KEY = "hermes:postPaygSuccessNavigate";
const POST_PAYG_SUCCESS_NAV_MAX_AGE_MS = 30 * 60 * 1000;

export function rememberPostPaygSuccessNavigate(path: string): void {
  try {
    sessionStorage.setItem(
      POST_PAYG_SUCCESS_NAV_SESSION_KEY,
      JSON.stringify({ path, ts: Date.now() }),
    );
  } catch {
    // private mode / quota
  }
}

export function consumePostPaygSuccessNavigate(): string | null {
  try {
    const raw = sessionStorage.getItem(POST_PAYG_SUCCESS_NAV_SESSION_KEY);
    sessionStorage.removeItem(POST_PAYG_SUCCESS_NAV_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: string; ts?: number };
    if (!parsed.path || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > POST_PAYG_SUCCESS_NAV_MAX_AGE_MS) return null;
    return parsed.path;
  } catch {
    return null;
  }
}

export function clearPostPaygSuccessNavigate(): void {
  try {
    sessionStorage.removeItem(POST_PAYG_SUCCESS_NAV_SESSION_KEY);
  } catch {
    // ignore
  }
}

export const atomicBackendApi = {
  getMe(jwt: string): Promise<AuthMeResponse> {
    return request<AuthMeResponse>("/auth/me", { jwt });
  },

  getBalance(jwt: string, opts: { sync?: boolean } = {}): Promise<BalanceResponse> {
    const qs = opts.sync ? "?sync=true" : "";
    return request<BalanceResponse>(`/billing/balance${qs}`, { jwt });
  },

  /**
   * Returns the decrypted PAYG OpenRouter API key. Idempotent — backend
   * creates the key on demand if missing. TREAT THE RESULT AS A SECRET.
   */
  getPaygKey(jwt: string): Promise<PaygKeyResponse> {
    return request<PaygKeyResponse>("/billing/payg/key", { jwt });
  },

  createPaygTopup(jwt: string, body: PaygTopupRequest): Promise<PaygTopupResponse> {
    return request<PaygTopupResponse>("/billing/payg/topup", {
      jwt,
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /**
   * Stripe Customer Portal URL. Pass `mode: "payg"` for users without an
   * active subscription (uses Customer ID from the latest PAYG payment).
   */
  getPortalUrl(jwt: string, opts: { mode?: "payg" } = {}): Promise<PortalUrlResponse> {
    const qs = opts.mode === "payg" ? "?mode=payg" : "";
    return request<PortalUrlResponse>(`/billing/portal${qs}`, { jwt });
  },

  getHistory(jwt: string, limit = 20): Promise<PurchaseHistoryResponse> {
    return request<PurchaseHistoryResponse>(
      `/billing/history?limit=${encodeURIComponent(String(limit))}`,
      { jwt },
    );
  },
};

export type AtomicBackendError = Error & { status?: number };

export function isUnauthorizedError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as AtomicBackendError).status === 401);
}
