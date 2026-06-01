import crypto from "node:crypto";

export type EncryptedSecretPayload = {
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
  secretPreview: string;
  secretFingerprint: string;
};

export function hasCredentialEncryptionKey() {
  return Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY?.trim());
}

function encryptionKey() {
  const configured = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!configured) return null;
  return crypto.createHash("sha256").update(configured).digest();
}

export function previewSecret(secret: string) {
  const trimmed = secret.trim();
  if (trimmed.length <= 4) return "****";
  return `****${trimmed.slice(-4)}`;
}

export function fingerprintSecret(secret: string) {
  return crypto.createHash("sha256").update(secret.trim()).digest("hex");
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
