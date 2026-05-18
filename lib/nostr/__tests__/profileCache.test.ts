import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearProfileCacheForTests,
  getCachedUserMetadata,
  getCachedUserProfile,
  invalidateUserProfile,
  primeUserMetadata,
} from '../profileCache.ts';

const PUBKEY = 'a'.repeat(64);

beforeEach(() => {
  clearProfileCacheForTests();
});

describe('profile cache', () => {
  test('dedupes concurrent metadata fetches for the same pubkey', async () => {
    let calls = 0;
    let releaseFetch: (() => void) | undefined;

    const fetcher = async () => {
      calls++;
      await new Promise<void>((resolve) => {
        releaseFetch = resolve;
      });
      return { name: 'Ada' };
    };

    const first = getCachedUserMetadata(PUBKEY, fetcher);
    const second = getCachedUserMetadata(PUBKEY, fetcher);

    assert.equal(calls, 1);
    releaseFetch?.();

    assert.deepEqual(await first, { name: 'Ada' });
    assert.deepEqual(await second, { name: 'Ada' });
    assert.equal(calls, 1);
  });

  test('full profile fetches prime the metadata cache', async () => {
    let metadataFetches = 0;

    await getCachedUserProfile(PUBKEY, async () => ({
      nprofile: 'nprofile-test',
      metadata: { name: 'Grace', picture: 'https://example.com/grace.png' },
      followers: [],
      following: [],
    }));

    const metadata = await getCachedUserMetadata(PUBKEY, async () => {
      metadataFetches++;
      return { name: 'Network' };
    });

    assert.deepEqual(metadata, {
      name: 'Grace',
      picture: 'https://example.com/grace.png',
    });
    assert.equal(metadataFetches, 0);
  });

  test('invalidateUserProfile clears cached metadata', async () => {
    let calls = 0;

    primeUserMetadata(PUBKEY, { name: 'Cached' });
    invalidateUserProfile(PUBKEY);

    const metadata = await getCachedUserMetadata(PUBKEY, async () => {
      calls++;
      return { name: 'Fresh' };
    });

    assert.deepEqual(metadata, { name: 'Fresh' });
    assert.equal(calls, 1);
  });
});
