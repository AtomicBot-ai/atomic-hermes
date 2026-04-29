import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patchConfigMock = vi.fn();
vi.mock("../../renderer/src/services/api", () => ({
  patchConfig: (...args: unknown[]) => patchConfigMock(...args),
}));

const getPaygKeyMock = vi.fn();
const getBalanceMock = vi.fn();
const getMeMock = vi.fn();
vi.mock("../../renderer/src/services/atomic-backend-api", async () => {
  const actual = await vi.importActual<
    typeof import("../../renderer/src/services/atomic-backend-api")
  >("../../renderer/src/services/atomic-backend-api");
  return {
    ...actual,
    atomicBackendApi: {
      getMe: (jwt: string) => getMeMock(jwt),
      getBalance: (jwt: string, opts?: unknown) => getBalanceMock(jwt, opts),
      getPaygKey: (jwt: string) => getPaygKeyMock(jwt),
      createPaygTopup: vi.fn(),
      getPortalUrl: vi.fn(),
      getHistory: vi.fn(),
    },
  };
});

import {
  applyPaygKey,
  atomicAuthActions,
  atomicAuthReducer,
  clearAtomicAuthThunk,
  fetchAtomicBalance,
  restoreAtomicAuth,
  storeAtomicToken,
} from "../../renderer/src/store/slices/atomicAuthSlice";

function makeStore() {
  return configureStore({ reducer: { atomicAuth: atomicAuthReducer } });
}

beforeEach(() => {
  window.localStorage.clear();
  patchConfigMock.mockReset();
  getPaygKeyMock.mockReset();
  getBalanceMock.mockReset();
  getMeMock.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("atomicAuthSlice", () => {
  it("storeAtomicToken populates jwt/email/userId and persists to localStorage", async () => {
    const store = makeStore();

    await store
      .dispatch(
        storeAtomicToken({ jwt: "j", email: "e@x", userId: "u_1" }) as never,
      );

    const state = store.getState().atomicAuth;
    expect(state.jwt).toBe("j");
    expect(state.email).toBe("e@x");
    expect(state.userId).toBe("u_1");

    const persisted = window.localStorage.getItem("atomic-auth");
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted as string)).toEqual({
      jwt: "j",
      email: "e@x",
      userId: "u_1",
    });
  });

  it("restoreAtomicAuth reads JWT back from localStorage", async () => {
    window.localStorage.setItem(
      "atomic-auth",
      JSON.stringify({ jwt: "jwt-restored", email: "r@x", userId: "u_42" }),
    );

    const store = makeStore();
    await store.dispatch(restoreAtomicAuth() as never);

    const state = store.getState().atomicAuth;
    expect(state.jwt).toBe("jwt-restored");
    expect(state.email).toBe("r@x");
    expect(state.userId).toBe("u_42");
    expect(state.restoreLoaded).toBe(true);
  });

  it("restoreAtomicAuth tolerates missing or malformed entries", async () => {
    window.localStorage.setItem("atomic-auth", "not json");

    const store = makeStore();
    await store.dispatch(restoreAtomicAuth() as never);

    const state = store.getState().atomicAuth;
    expect(state.jwt).toBeNull();
    expect(state.restoreLoaded).toBe(true);
  });

  it("clearAtomicAuthThunk wipes the slice and localStorage entry", async () => {
    const store = makeStore();
    await store.dispatch(
      storeAtomicToken({ jwt: "j", email: "e@x", userId: "u_1" }) as never,
    );
    expect(window.localStorage.getItem("atomic-auth")).not.toBeNull();

    await store.dispatch(clearAtomicAuthThunk() as never);

    const state = store.getState().atomicAuth;
    expect(state.jwt).toBeNull();
    expect(window.localStorage.getItem("atomic-auth")).toBeNull();
  });

  it("applyPaygKey rejects when no JWT is present", async () => {
    const store = makeStore();
    const action = await store.dispatch(applyPaygKey({ port: 8080 }) as never);
    expect((action as { type: string }).type).toBe("atomicAuth/applyPaygKey/rejected");
    expect(store.getState().atomicAuth.applyKeyError).toMatch(/Not authenticated/);
  });

  it("applyPaygKey calls patchConfig with OPENROUTER_API_KEY env", async () => {
    const store = makeStore();
    await store.dispatch(
      storeAtomicToken({ jwt: "jwt-x", email: "e", userId: "u" }) as never,
    );

    getPaygKeyMock.mockResolvedValueOnce({
      key: "sk-or-fake",
      keyHash: "hash",
      remaining: 10,
      limit: 10,
    });
    patchConfigMock.mockResolvedValueOnce({ ok: true });

    const result = await store.dispatch(applyPaygKey({ port: 8123 }) as never);

    expect((result as { type: string }).type).toBe("atomicAuth/applyPaygKey/fulfilled");
    expect(patchConfigMock).toHaveBeenCalledWith(8123, {
      config: { provider: "openrouter" },
      env: { OPENROUTER_API_KEY: "sk-or-fake" },
    });
  });

  it("fetchAtomicBalance stores the result and the subscription plan", async () => {
    const store = makeStore();
    await store.dispatch(
      storeAtomicToken({ jwt: "jwt", email: "e", userId: "u" }) as never,
    );

    getBalanceMock.mockResolvedValueOnce({
      total: 5,
      subscriptionPlan: "pro",
      subscription: { limit: 100, remaining: 80, expiresAt: null },
      payg: { limit: 5, remaining: 5 },
    });

    await store.dispatch(fetchAtomicBalance({}) as never);

    const state = store.getState().atomicAuth;
    expect(state.subscriptionPlan).toBe("pro");
    expect(state.balance?.payg?.remaining).toBe(5);
  });

  it("setTopupPending and setTopupError reducers update state", () => {
    const store = makeStore();

    store.dispatch(atomicAuthActions.setTopupPending(true));
    expect(store.getState().atomicAuth.topupPending).toBe(true);

    store.dispatch(atomicAuthActions.setTopupError("oops"));
    expect(store.getState().atomicAuth.topupError).toBe("oops");
  });
});
