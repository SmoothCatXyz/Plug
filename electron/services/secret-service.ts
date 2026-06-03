const SAFE_STORAGE_PREFIX = "safe:v1:";
const DEV_FALLBACK_PREFIX = "dev-fallback:v1:";
const LOCAL_SECRET_PREFIX = "local:v1:";

export function encryptSecret(secret: string): string {
  if (!secret) {
    return "";
  }

  return `${LOCAL_SECRET_PREFIX}${encodeSecret(secret)}`;
}

export function decryptSecret(encryptedSecret: string): string {
  if (!encryptedSecret) {
    return "";
  }

  if (encryptedSecret.startsWith(LOCAL_SECRET_PREFIX)) {
    return decodeSecret(encryptedSecret.slice(LOCAL_SECRET_PREFIX.length));
  }

  if (encryptedSecret.startsWith(DEV_FALLBACK_PREFIX) && process.env.PLUG_ALLOW_INSECURE_SECRET_FALLBACK === "1") {
    return decodeSecret(encryptedSecret.slice(DEV_FALLBACK_PREFIX.length));
  }

  if (encryptedSecret.startsWith(SAFE_STORAGE_PREFIX)) {
    throw new Error(
      "This provider still uses a legacy Keychain-backed API key. Re-enter the API key in Settings to store it locally without Keychain."
    );
  }

  throw new Error("Unsupported encrypted secret format.");
}

export function hasEncryptedSecret(encryptedSecret: string): boolean {
  return (
    encryptedSecret.startsWith(LOCAL_SECRET_PREFIX) ||
    (encryptedSecret.startsWith(DEV_FALLBACK_PREFIX) && process.env.PLUG_ALLOW_INSECURE_SECRET_FALLBACK === "1")
  );
}

function encodeSecret(secret: string): string {
  return Buffer.from(secret, "utf8").toString("base64");
}

function decodeSecret(encodedSecret: string): string {
  return Buffer.from(encodedSecret, "base64").toString("utf8");
}
