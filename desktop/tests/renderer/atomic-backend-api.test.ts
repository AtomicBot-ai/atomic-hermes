import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  atomicBackendApi,
  isUnauthorizedError,
  getAtomicBackendUrl,
  googleAuthDesktopUrl,
} from "../../renderer/src/services/atomic-backend-api";

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("atomicBackendApi", () => {
  it("getAtomicBackendUrl falls back to https://api.atomicbot.ai", () => {
    expect(getAtomicBackendUrl()).toBe("https://api.atomicbot.ai");
  });

  it("googleAuthDesktopUrl appends scheme=atomicbot-hermes (backend reads query.scheme)", () => {
    const url = googleAuthDesktopUrl();
    expect(url).toContain("/auth/google/desktop");
    expect(url).toContain("scheme=atomicbot-hermes");
    expect(url).not.toContain("redirect_scheme=");
  });

  it("getMe attaches Bearer token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ userId: "u1", email: "a@b", subscriptionPlan: "free" }),
    );

    const me = await atomicBackendApi.getMe("jwt-x");

    expect(me).toEqual({ userId: "u1", email: "a@b", subscriptionPlan: "free" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/me");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer jwt-x");
  });

  it("getBalance passes ?sync=true when requested", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        total: 10,
        subscriptionPlan: "free",
        subscription: null,
        payg: { limit: 10, remaining: 10 },
      }),
    );

    await atomicBackendApi.getBalance("jwt", { sync: true });

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/billing/balance?sync=true");
  });

  it("createPaygTopup posts the JSON body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ checkoutUrl: "https://stripe.test/cs_xyz" }),
    );

    const res = await atomicBackendApi.createPaygTopup("jwt", {
      amountUsd: 25,
      successUrl: "atomicbot-hermes://stripe-success",
      cancelUrl: "atomicbot-hermes://stripe-cancel",
    });

    expect(res.checkoutUrl).toBe("https://stripe.test/cs_xyz");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      amountUsd: 25,
      successUrl: "atomicbot-hermes://stripe-success",
      cancelUrl: "atomicbot-hermes://stripe-cancel",
    });
  });

  it("getPortalUrl appends mode=payg when requested", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ portalUrl: "https://stripe.test/portal" }),
    );

    await atomicBackendApi.getPortalUrl("jwt", { mode: "payg" });

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/billing/portal?mode=payg");
  });

  it("throws an error with status when the backend returns 401", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Invalid token" }, { status: 401 }),
    );

    let caught: unknown = null;
    try {
      await atomicBackendApi.getMe("jwt-bad");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(isUnauthorizedError(caught)).toBe(true);
    expect((caught as Error).message).toBe("Invalid token");
  });
});
