import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const encryptStringMock = vi.fn();
const decryptStringMock = vi.fn();
const isEncryptionAvailableMock = vi.fn();

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => isEncryptionAvailableMock(),
    encryptString: (s: string) => encryptStringMock(s),
    decryptString: (b: Buffer) => decryptStringMock(b),
  },
}));

import {
  clearAtomicAuth,
  readAtomicAuth,
  writeAtomicAuth,
} from "../../src/main/atomic-auth/jwt-storage";

let stateDir = "";

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-auth-test-"));
  encryptStringMock.mockReset();
  decryptStringMock.mockReset();
  isEncryptionAvailableMock.mockReset();
});

afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

describe("jwt-storage", () => {
  it("writes encrypted payload when safeStorage is available", () => {
    isEncryptionAvailableMock.mockReturnValue(true);
    encryptStringMock.mockImplementation((s: string) => Buffer.from(`enc:${s}`));

    writeAtomicAuth(stateDir, {
      jwt: "jwt-abc",
      email: "alice@example.com",
      userId: "u_1",
    });

    const filePath = path.join(stateDir, "atomic-auth.json");
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(raw.encrypted).toBeTypeOf("string");
    expect(raw.plaintext).toBeUndefined();
    expect(encryptStringMock).toHaveBeenCalledOnce();
  });

  it("writes plaintext payload when safeStorage is not available", () => {
    isEncryptionAvailableMock.mockReturnValue(false);

    writeAtomicAuth(stateDir, { jwt: "jwt-x", email: "", userId: "u_2" });

    const filePath = path.join(stateDir, "atomic-auth.json");
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(raw.encrypted).toBeUndefined();
    expect(raw.plaintext).toEqual({ jwt: "jwt-x", email: "", userId: "u_2" });
  });

  it("reads back encrypted payload via safeStorage", () => {
    isEncryptionAvailableMock.mockReturnValue(true);
    const ciphertext = Buffer.from("enc:fake");
    encryptStringMock.mockReturnValue(ciphertext);
    decryptStringMock.mockImplementation((b: Buffer) => {
      expect(b).toEqual(ciphertext);
      return JSON.stringify({ jwt: "jwt-abc", email: "a@b.c", userId: "u_3" });
    });

    writeAtomicAuth(stateDir, { jwt: "jwt-abc", email: "a@b.c", userId: "u_3" });
    const got = readAtomicAuth(stateDir);

    expect(got).toEqual({ jwt: "jwt-abc", email: "a@b.c", userId: "u_3" });
  });

  it("falls back to plaintext when encryption is no longer available on read", () => {
    isEncryptionAvailableMock.mockReturnValue(false);

    writeAtomicAuth(stateDir, { jwt: "jwt-y", email: "y@z", userId: "u_4" });
    const got = readAtomicAuth(stateDir);

    expect(got).toEqual({ jwt: "jwt-y", email: "y@z", userId: "u_4" });
  });

  it("returns null when no file exists", () => {
    expect(readAtomicAuth(stateDir)).toBeNull();
  });

  it("clearAtomicAuth removes the file", () => {
    isEncryptionAvailableMock.mockReturnValue(false);
    writeAtomicAuth(stateDir, { jwt: "j", email: "e", userId: "u" });

    clearAtomicAuth(stateDir);

    expect(fs.existsSync(path.join(stateDir, "atomic-auth.json"))).toBe(false);
  });
});
