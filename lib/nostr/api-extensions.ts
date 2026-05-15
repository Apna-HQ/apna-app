import * as nip19 from 'nostr-tools/nip19'
import { Event as NostrEvent, Filter } from 'nostr-tools'
import { fetchFromRelay, fetchAllFromRelay, subscribeToEvents as subscribeToEventsCore, fetchEventsFromRelays, DEFAULT_RELAYS } from './core'
import { publishEvent } from './events'
import { normalizePublicKey, normalizeNoteId } from './utils'
import { IUnsignedEvent, IEvent } from '@apna/sdk'
import { getKeyPairFromLocalStorage } from '@/lib/utils'

// Define types that are not exported from the SDK
type ProfilePointer = {
  pubkey: string;
  relays?: string[];
};

type EventPointer = {
  id: string;
  relays?: string[];
  author?: string;
  kind?: number;
};

type AddressPointer = {
  identifier: string;
  pubkey: string;
  kind: number;
  relays?: string[];
};

type Prefixes = {
  nprofile: ProfilePointer;
  nrelay: string;
  nevent: EventPointer;
  naddr: AddressPointer;
  nsec: Uint8Array;
  npub: string;
  note: string;
};

type DecodeValue<Prefix extends keyof Prefixes> = {
  type: Prefix;
  data: Prefixes[Prefix];
};

type DecodeResult = {
  [P in keyof Prefixes]: DecodeValue<P>;
}[keyof Prefixes];

/**
 * Encodes a value into a bech32-encoded Nostr identifier string.
 * 
 * @param type - The type of identifier to create (npub, note, nprofile, etc.)
 * @param data - The data to encode, must match the expected structure for the prefix
 * @returns A bech32-encoded string with the specified prefix (e.g., npub1...)
 */
export const encode = <Prefix extends keyof Prefixes>(type: Prefix, data: Prefixes[Prefix]): string => {
  switch (type) {
    case 'npub':
      return nip19.npubEncode(data as string);
    case 'note':
      return nip19.noteEncode(data as string);
    case 'nprofile':
      return nip19.nprofileEncode(data as Prefixes['nprofile']);
    case 'nevent':
      return nip19.neventEncode(data as Prefixes['nevent']);
    case 'naddr':
      return nip19.naddrEncode(data as Prefixes['naddr']);
    case 'nrelay':
      return nip19.nrelayEncode(data as string);
    default:
      throw new Error(`Unsupported encoding type: ${String(type)}`);
  }
};

/**
 * Decodes a bech32-encoded Nostr identifier string back into its component data.
 * 
 * @param nip19String - A bech32-encoded string with a valid Nostr prefix
 * @returns An object containing the decoded data and type information
 */
export const decode = <Prefix extends keyof Prefixes>(nip19String: string): DecodeResult => {
  try {
    return nip19.decode(nip19String) as DecodeResult;
  } catch (error) {
    throw new Error(`Failed to decode NIP-19 string: ${nip19String}. ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Fetches a single Nostr event matching the provided filter.
 * 
 * @param eventFilter - Filter criteria to match a single event (limit is set to 1)
 * @param relaysOverride - Optional array of relay URLs to query instead of default relays
 * @returns A single Nostr event matching the filter
 */
export const fetchEvent = async (eventFilter: any, relaysOverride?: string[]): Promise<IEvent> => {
  // Ensure the filter has limit=1
  const filter = { ...eventFilter, limit: 1 };
  
  // If it's a note ID, normalize it
  if (filter.ids && filter.ids.length > 0) {
    filter.ids = filter.ids.map((id: string) => {
      try {
        return normalizeNoteId(id);
      } catch (error) {
        return id;
      }
    });
  }
  
  // If it's an author, normalize it
  if (filter.authors && filter.authors.length > 0) {
    filter.authors = filter.authors.map((author: string) => {
      try {
        return normalizePublicKey(author);
      } catch (error) {
        return author;
      }
    });
  }
  
  // const event = await fetchAllFromAPI(filter, true, undefined, true);
  const event = await fetchEventsFromRelays(DEFAULT_RELAYS, filter, true)
  if (!event) {
    throw new Error('No event found matching the filter');
  }
  
  return event as IEvent;
};

/**
 * Fetches multiple Nostr events matching the provided filter.
 * 
 * @param eventFilter - Filter criteria to match events
 * @param relaysOverride - Optional array of relay URLs to query instead of default relays
 * @returns An array of Nostr events matching the filter
 */
export const fetchEvents = async (eventFilter: any, relaysOverride?: string[]): Promise<IEvent[]> => {
  // Process the filter to normalize IDs and authors
  const filter = { ...eventFilter };
  
  // If it's a note ID, normalize it
  if (filter.ids && filter.ids.length > 0) {
    filter.ids = filter.ids.map((id: string) => {
      try {
        return normalizeNoteId(id);
      } catch (error) {
        return id;
      }
    });
  }
  
  // If it's an author, normalize it
  if (filter.authors && filter.authors.length > 0) {
    filter.authors = filter.authors.map((author: string) => {
      try {
        return normalizePublicKey(author);
      } catch (error) {
        return author;
      }
    });
  }
  
  // const events = await fetchAllFromAPI(filter, true);
  const events = await fetchEventsFromRelays(DEFAULT_RELAYS, filter)
  return events as IEvent[];
};

/**
 * Subscribes to a stream of events matching the provided filter.
 * 
 * @param eventFilter - Filter criteria for events to subscribe to
 * @param onevent - Callback function that will be called for each matching event
 * @param relaysOverride - Optional array of relay URLs to subscribe to instead of default relays
 * @returns A Promise that resolves when the subscription is established
 */
export const subscribeToEvents = async (
  eventFilter: any, 
  onevent: (event: IEvent) => void, 
  relaysOverride?: string[]
): Promise<void> => {
  // Process the filter to normalize IDs and authors
  const filter = { ...eventFilter };
  
  // If it's a note ID, normalize it
  if (filter.ids && filter.ids.length > 0) {
    filter.ids = filter.ids.map((id: string) => {
      try {
        return normalizeNoteId(id);
      } catch (error) {
        return id;
      }
    });
  }
  
  // If it's an author, normalize it
  if (filter.authors && filter.authors.length > 0) {
    filter.authors = filter.authors.map((author: string) => {
      try {
        return normalizePublicKey(author);
      } catch (error) {
        return author;
      }
    });
  }
  
  await subscribeToEventsCore(filter, onevent as (e: NostrEvent) => void);
};

/**
 * Signs an unsigned event with the user's private key and publishes it to relays.
 * 
 * @param event - The unsigned event to sign and publish
 * @param relaysOverride - Optional array of relay URLs to publish to instead of default relays
 * @returns The signed and published event with its signature
 */
export const signAndPublishEvent = async (event: IUnsignedEvent, relaysOverride?: string[]): Promise<IEvent> => {
  const existingKeyPair = getKeyPairFromLocalStorage();
  if (!existingKeyPair) {
    throw new Error("No active user profile found");
  }
  
  // Use the appropriate key based on profile type
  const key = existingKeyPair.isRemoteSigner ? existingKeyPair.npub : existingKeyPair.nsec;
  
  // Publish the event
  return publishEvent(key, event) as Promise<IEvent>;
};
