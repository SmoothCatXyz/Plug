import { safeStorage } from "electron";

const SAFE_STORAGE_PREFIX = "safe:v1:";
const DEV_FALLBACK_PREFIX = "dev-fallback:v1:";

type SafeStorageLike = {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
};

export function encryptSecret(secret: string): string {
  if (!secret) {
    return "";
  }

  const storage = getSafeStorage();

  if (storage?.isEncryptionAvailable()) {
    return `${SAFE_STORAGE_PREFIX}${storage.encryptString(secret).toString("base64")}`;
  }

  if (process.env.PLUG_ALLOW_INSECURE_SECRET_FALLBACK === "1") {
    return `${DEV_FALLBACK_PREFIX}${Buffer.from(secret, "utf8").toString("base64")}`;
  }

  throw new Error("Electron safeStorage is not available for API key encryption.");
}

export function decryptSecret(encryptedSecret: string): string {
  if (!encryptedSecret) {
    return "";
  }

  if (encryptedSecret.startsWith(SAFE_STORAGE_PREFIX)) {
    const storage = getSafeStorage();

    if (!storage?.isEncryptionAvailable()) {
      throw new Error("Electron safeStorage is not available for API key decryption.");
    }

    return storage.decryptString(Buffer.from(encryptedSecret.slice(SAFE_STORAGE_PREFIX.length), "base64"));
  }

  if (encryptedSecret.startsWith(DEV_FALLBACK_PREFIX) && process.env.PLUG_ALLOW_INSECURE_SECRET_FALLBACK === "1") {
    return Buffer.from(encryptedSecret.slice(DEV_FALLBACK_PREFIX.length), "base64").toString("utf8");
  }

  throw new Error("Unsupported encrypted secret format.");
}

export function hasEncryptedSecret(encryptedSecret: string): boolean {
  return encryptedSecret.startsWith(SAFE_STORAGE_PREFIX) || encryptedSecret.startsWith(DEV_FALLBACK_PREFIX);
}

function getSafeStorage(): SafeStorageLike | null {
  if (safeStorage && typeof safeStorage.isEncryptionAvailable === "function") {
    return safeStorage;
  }

  return null;
}
