import crypto from "node:crypto";

export type EncryptedSecretPayload = {
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
  secretPreview: string;
  secretFingerprint: string;
};

export type StoredEncryptedSecret = {
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
};

export function hasCredentialEncryptionKey() {
  return (process.env.CREDENTIAL_ENCRYPTION_KEY?.trim().length ?? 0) >= 32;
}

function encryptionKey(configured = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim()) {
  if (!configured || configured.length < 32) return null;
  return crypto.createHash("sha256").update(configured).digest();
}

function decryptionKeys() {
  const current = encryptionKey();
  const previous = encryptionKey(process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS?.trim());
  return [current, previous].flatMap((key) => (key ? [key] : []));
}

export function previewSecret(secret: string) {
  const trimmed = secret.trim();
  if (trimmed.length <= 4) return "****";
  return `****${trimmed.slice(-4)}`;
}

export function fingerprintSecret(secret: string) {
  const key = process.env.SECURITY_HMAC_KEY?.trim() || process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!key) return "";
  return crypto.createHmac("sha256", key).update(secret.trim()).digest("hex");
}

export function encryptSecret(secret: string): EncryptedSecretPayload | null {
  const key = encryptionKey();
  if (!key) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret.trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encryptedSecret: encrypted.toString("base64"),
    encryptionIv: iv.toString("base64"),
    encryptionTag: tag.toString("base64"),
    secretPreview: previewSecret(secret),
    secretFingerprint: fingerprintSecret(secret)
  };
}

export function decryptSecret(payload: StoredEncryptedSecret): string | null {
  for (const key of decryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(payload.encryptionIv, "base64")
      );
      decipher.setAuthTag(Buffer.from(payload.encryptionTag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(payload.encryptedSecret, "base64")),
        decipher.final()
      ]).toString("utf8");
    } catch {
      // Continue to the previous key during a controlled rotation window.
    }
  }
  return null;
}
