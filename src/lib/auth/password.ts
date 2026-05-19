import crypto from "node:crypto";

const iterations = 120000;
const keyLength = 64;
const digest = "sha512";

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("hex");
  return { hash, salt, iterations };
}

export function verifyPassword(input: {
  password: string;
  hash: string;
  salt: string;
  iterations?: number;
}) {
  const candidate = crypto
    .pbkdf2Sync(input.password, input.salt, input.iterations ?? iterations, keyLength, digest)
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(input.hash, "hex"));
}

export function randomSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
