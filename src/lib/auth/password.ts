import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters (m=19 MiB, t=2, p=1). Algorithm 2 = Argon2id.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 as const };

export async function hashPassword(pw: string): Promise<string> {
  return hash(pw, OPTS);
}

export async function verifyPassword(stored: string, pw: string): Promise<boolean> {
  try {
    return await verify(stored, pw);
  } catch {
    return false;
  }
}

// Used to equalise timing when the account does not exist.
let dummy: string | undefined;
export async function dummyVerify(pw: string) {
  dummy ??= await hashPassword("dummy-password-for-timing-equalisation");
  await verifyPassword(dummy, pw);
}
