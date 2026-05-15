import { nip04 } from 'nostr-tools'
import { Event as NostrEvent, Filter } from 'nostr-tools'
import { SERVER_NPUB } from '@/lib/nostr/nip04Utils'
import * as nip19 from 'nostr-tools/nip19'
import { fetchAllFromRelay } from '@/lib/nostr/core'

// Decode the server's npub to get the pubkey. SERVER_NPUB is optional and may be
// unset at build time — guard the decode so module load doesn't throw.
const SERVER_PUBKEY = SERVER_NPUB ? (nip19.decode(SERVER_NPUB).data as string) : ''
export const SERVER_NSEC = process.env.SERVER_NSEC as string

// Define the PushSubscription type
export interface PushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  nostr?: {
    pubkey: string;
  };
}

// Create a store that uses Nostr relays as the source of truth
class PushSubscriptionStore {
  private subscriptions: Map<string, PushSubscription> = new Map();
  private initialized: boolean = false;
  private serverPrivateKey: string | Uint8Array | null = null;

  constructor() {
    // In a real implementation, you would securely load the server's private key
    // For development, we'll use a placeholder approach
    this.loadServerPrivateKey();
  }

  // Load the server's private key (in a real implementation, this would be securely stored)
  private async loadServerPrivateKey(): Promise<void> {
    // This is just a placeholder - in a real implementation, you would load this from a secure source
    // For development, we're assuming the server has access to its private key
    console.log('Server would load its private key here');
    
    // For now, we'll just use a mock implementation
    // In production, you would NEVER hardcode this or expose it in client-side code
    this.serverPrivateKey = SERVER_NSEC; // Replace with actual key loading logic on server
  }

  // Initialize the store by fetching subscriptions from Nostr relays
  async initialize(): Promise<void> {
    // if (this.initialized) return;
    
    try {
      console.log('Initializing push subscription store from Nostr relays...');
      
      // Fetch encrypted direct messages from relays
      const filter: Filter = {
        kinds: [4], // Encrypted direct messages
        '#p': [SERVER_PUBKEY], // Messages sent to the server
      };
      
      const events = await fetchAllFromRelay(filter);
      events.sort((a,b) => a.created_at - b.created_at)

      console.log(`Found ${events.length} encrypted messages on relays`);
      
      // Process each event to extract subscription data
      for (const event of events) {
        await this.processNostrEvent(event);
      }
      
      // this.initialized = true;
      console.log(`Initialized with ${this.subscriptions.size} subscriptions`);
    } catch (error) {
      console.error('Error initializing push subscription store:', error);
    }
  }

  // Process a Nostr event to extract subscription data
  private async processNostrEvent(event: NostrEvent): Promise<void> {
    try {
      // Skip if we don't have the server's private key (client-side)
      if (!this.serverPrivateKey) return;
      
      // Decrypt the content
      const decryptedContent = await nip04.decrypt(
        nip19.decode(this.serverPrivateKey as string).data as Uint8Array,
        event.pubkey,
        event.content
      );
      
      // Parse the content
      const data = JSON.parse(decryptedContent);
      
      // Handle subscription/unsubscription messages
      if (data.type === 'PUSH_SUBSCRIPTION' && data.subscription) {
        const subscription = JSON.parse(data.subscription) as PushSubscription;
        
        // Add the pubkey to the subscription data
        subscription.nostr = {
          pubkey: event.pubkey
        };
        
        this.subscriptions.set(subscription.endpoint, subscription);
        console.log(`Subscription added from Nostr: ${subscription.endpoint}`);
      } else if (data.type === 'PUSH_UNSUBSCRIPTION' && data.endpoint) {
        this.subscriptions.delete(data.endpoint);
        console.log(`Subscription removed from Nostr: ${data.endpoint}`);
      }
    } catch (error) {
      console.error('Error processing Nostr event:', error);
    }
  }

  // Get all subscriptions
  async getAllSubscriptions(): Promise<PushSubscription[]> {
    // Ensure the store is initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    return Array.from(this.subscriptions.values());
  }

  // Get subscription count
  async getCount(): Promise<number> {
    // Ensure the store is initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.subscriptions.size;
  }
}

// Export a singleton instance
export const pushSubscriptionStore = new PushSubscriptionStore();
