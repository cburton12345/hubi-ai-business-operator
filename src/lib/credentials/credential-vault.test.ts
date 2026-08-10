import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./credential-vault";

const originalEncryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
const originalPreviousEncryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS;

afterEach(() => {
  if (originalEncryptionKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  else process.env.CREDENTIAL_ENCRYPTION_KEY = originalEncryptionKey;
  if (originalPreviousEncryptionKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS;
  else process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS = originalPreviousEncryptionKey;
});

describe("credential vault", () => {
  it("round trips an encrypted tenant secret", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "test-only-key-with-at-least-thirty-two-characters";
    const encrypted = encryptSecret("customer-secret");
    expect(encrypted).not.toBeNull();
    expect(decryptSecret({
      encryptedSecret: encrypted!.encryptedSecret,
      encryptionIv: encrypted!.encryptionIv,
      encryptionTag: encrypted!.encryptionTag
    })).toBe("customer-secret");
  });

  it("does not decrypt with a different key", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "first-test-key-with-at-least-thirty-two-characters";
    const encrypted = encryptSecret("customer-secret")!;
    process.env.CREDENTIAL_ENCRYPTION_KEY = "other-test-key-with-at-least-thirty-two-characters";
    expect(decryptSecret({
      encryptedSecret: encrypted.encryptedSecret,
      encryptionIv: encrypted.encryptionIv,
      encryptionTag: encrypted.encryptionTag
    })).toBeNull();
  });

  it("decrypts a legacy record with the previous key during rotation", () => {
    const previous = "previous-test-key-with-at-least-thirty-two-characters";
    process.env.CREDENTIAL_ENCRYPTION_KEY = previous;
    const encrypted = encryptSecret("customer-secret")!;
    process.env.CREDENTIAL_ENCRYPTION_KEY = "current-test-key-with-at-least-thirty-two-characters";
    process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS = previous;

    expect(decryptSecret({
      encryptedSecret: encrypted.encryptedSecret,
      encryptionIv: encrypted.encryptionIv,
      encryptionTag: encrypted.encryptionTag
    })).toBe("customer-secret");
  });
});
