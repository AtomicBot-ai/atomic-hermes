import { describe, expect, it } from "vitest";
import { parseDeepLinkUrl } from "../../src/main/atomic-auth/deep-link";

describe("parseDeepLinkUrl", () => {
  it("parses atomicbot-hermes://auth with token, email, userId, isNewUser", () => {
    const url =
      "atomicbot-hermes://auth?token=jwt-abc&email=alice%40example.com&userId=u_123&isNewUser=true";
    const payload = parseDeepLinkUrl(url);

    expect(payload).not.toBeNull();
    expect(payload!.host).toBe("auth");
    expect(payload!.params.token).toBe("jwt-abc");
    expect(payload!.params.email).toBe("alice@example.com");
    expect(payload!.params.userId).toBe("u_123");
    expect(payload!.params.isNewUser).toBe("true");
  });

  it("parses atomicbot-hermes://stripe-success with session_id", () => {
    const payload = parseDeepLinkUrl(
      "atomicbot-hermes://stripe-success?session_id=cs_test_xyz",
    );
    expect(payload).not.toBeNull();
    expect(payload!.host).toBe("stripe-success");
    expect(payload!.params.session_id).toBe("cs_test_xyz");
  });

  it("parses atomicbot-hermes://stripe-cancel with no params", () => {
    const payload = parseDeepLinkUrl("atomicbot-hermes://stripe-cancel");
    expect(payload).not.toBeNull();
    expect(payload!.host).toBe("stripe-cancel");
    expect(payload!.params).toEqual({});
  });

  it("returns null for malformed URLs", () => {
    expect(parseDeepLinkUrl("not a url")).toBeNull();
    expect(parseDeepLinkUrl("")).toBeNull();
  });
});
