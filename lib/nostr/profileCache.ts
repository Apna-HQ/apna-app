import type { UserMetadata } from '@apna/sdk';
import { normalizePublicKey } from './utils.ts';

export interface CachedNpubProfile {
  nprofile: string;
  metadata: UserMetadata;
  followers: string[];
  following: string[];
}

type CacheEntry<T> = {
  value: T;
  cachedAt: number;
};

type Fetcher<T> = () => Promise<T>;

const METADATA_TTL_MS = 10 * 60 * 1000;
const PROFILE_TTL_MS = 2 * 60 * 1000;

const metadataCache = new Map<string, CacheEntry<UserMetadata>>();
const profileCache = new Map<string, CacheEntry<CachedNpubProfile>>();
const metadataInFlight = new Map<string, Promise<UserMetadata>>();
const profileInFlight = new Map<string, Promise<CachedNpubProfile>>();

function nowMs(): number {
  return Date.now();
}

function isFresh<T>(entry: CacheEntry<T> | undefined, ttlMs: number): boolean {
  return Boolean(entry && nowMs() - entry.cachedAt < ttlMs);
}

function cacheKey(pubkeyOrNpub: string): string {
  return normalizePublicKey(pubkeyOrNpub);
}

async function fromCache<T>(
  cache: Map<string, CacheEntry<T>>,
  inFlight: Map<string, Promise<T>>,
  key: string,
  ttlMs: number,
  fetcher: Fetcher<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached && isFresh(cached, ttlMs)) return cached.value;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const work = fetcher()
    .then((value) => {
      cache.set(key, { value, cachedAt: nowMs() });
      return value;
    })
    .catch((error) => {
      if (cached) return cached.value;
      throw error;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, work);
  return work;
}

export function primeUserMetadata(pubkeyOrNpub: string, metadata: UserMetadata): void {
  metadataCache.set(cacheKey(pubkeyOrNpub), {
    value: metadata,
    cachedAt: nowMs(),
  });
}

export function primeUserProfile(pubkeyOrNpub: string, profile: CachedNpubProfile): void {
  const key = cacheKey(pubkeyOrNpub);
  profileCache.set(key, {
    value: profile,
    cachedAt: nowMs(),
  });
  primeUserMetadata(key, profile.metadata);
}

export function invalidateUserProfile(pubkeyOrNpub: string): void {
  const key = cacheKey(pubkeyOrNpub);
  metadataCache.delete(key);
  profileCache.delete(key);
  metadataInFlight.delete(key);
  profileInFlight.delete(key);
}

export async function getCachedUserMetadata(
  pubkeyOrNpub: string,
  fetcher: Fetcher<UserMetadata>,
): Promise<UserMetadata> {
  return fromCache(
    metadataCache,
    metadataInFlight,
    cacheKey(pubkeyOrNpub),
    METADATA_TTL_MS,
    fetcher,
  );
}

export async function getCachedUserProfile(
  pubkeyOrNpub: string,
  fetcher: Fetcher<CachedNpubProfile>,
): Promise<CachedNpubProfile> {
  const key = cacheKey(pubkeyOrNpub);
  return fromCache(profileCache, profileInFlight, key, PROFILE_TTL_MS, async () => {
    const profile = await fetcher();
    primeUserMetadata(key, profile.metadata);
    return profile;
  });
}

export function clearProfileCacheForTests(): void {
  metadataCache.clear();
  profileCache.clear();
  metadataInFlight.clear();
  profileInFlight.clear();
}
