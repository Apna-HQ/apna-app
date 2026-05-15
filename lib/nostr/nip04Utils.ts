import { nip04 } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import { publishEvent } from './events'
import { getPublicKey } from 'nostr-tools'
import { isRemoteSignerConnected, signEventWithRemoteSigner } from './nip46'
import { isRemoteSignerProfile } from '@/lib/utils'

// Define the server's public key (this would be the public key of your notification server)
export const SERVER_NPUB = process.env.NEXT_PUBLIC_SERVER_NPUB as string // Replace with your actual server npub
// Guard the decode: NEXT_PUBLIC_SERVER_NPUB is optional and may be unset (e.g. at
// build time / in environments without push configured). A bare nip19.decode on
// `undefined` throws at module load and breaks `next build`.
export const SERVER_PUBKEY = SERVER_NPUB ? (nip19.decode(SERVER_NPUB).data as string) : ''

/**
 * Send an encrypted direct message to the server
 * @param nsecOrNpub The nsec or npub to sign with
 * @param content The content to encrypt
 * @returns The published event
 */
export async function sendEncryptedDirectMessage(
  nsecOrNpub: string,
  content: any
): Promise<any> {
  try {
    // Convert content to string if it's not already
    const contentStr = typeof content === 'object' ? JSON.stringify(content) : content
    
    // Add the server's pubkey as a 'p' tag
    const tags = [['p', SERVER_PUBKEY]]
    
    let encryptedContent: string
    
    // Check if the input is an npub (for remote signing)
    if (nsecOrNpub.startsWith('npub')) {
      const decodedNpub = nip19.decode(nsecOrNpub)
      if (decodedNpub.type !== 'npub') {
        throw new Error('Invalid npub')
      }
      const pubkey = decodedNpub.data as string
      
      // Check if this pubkey is connected to a remote signer
      if (isRemoteSignerConnected(pubkey)) {
        // For remote signing, we need to use the remote signer's encryption
        const signedEvent = await signEventWithRemoteSigner(pubkey, {
          kind: 4,
          tags,
          content: contentStr,
          created_at: Math.floor(Date.now() / 1000),
          pubkey
        })
        
        return signedEvent
      } else {
        // Check if this is a remote signer profile that's not currently connected
        if (isRemoteSignerProfile(pubkey)) {
          throw new Error('Remote signer is not currently connected. Please reconnect to the remote signer.')
        } else {
          throw new Error('No remote signer connected for this npub')
        }
      }
    } else {
      // Traditional nsec signing
      const decodedNsec = nip19.decode(nsecOrNpub)
      if (decodedNsec.type !== 'nsec') {
        throw new Error('Invalid nsec')
      }
      const sk = decodedNsec.data as Uint8Array
      
      // Encrypt the content
      encryptedContent = await nip04.encrypt(sk, SERVER_PUBKEY, contentStr)
      
      // Create and publish the event
      const event = {
        kind: 4, // Encrypted direct message
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: encryptedContent,
      }
      
      return await publishEvent(nsecOrNpub, event)
    }
  } catch (error) {
    console.error('Error sending encrypted direct message:', error)
    throw error
  }
}

/**
 * Store push subscription in Nostr relays
 * @param nsecOrNpub The nsec or npub to sign with
 * @param subscription The push subscription object
 * @returns The published event
 */
export async function sendPushSubscription(
  nsecOrNpub: string,
  subscription: PushSubscription
): Promise<any> {
  // Create a subscription message
  const subscriptionMessage = {
    type: 'PUSH_SUBSCRIPTION',
    subscription: JSON.stringify(subscription),
    timestamp: Date.now()
  }
  
  // Send as an encrypted direct message
  return await sendEncryptedDirectMessage(nsecOrNpub, subscriptionMessage)
}

/**
 * Remove push subscription from Nostr relays
 * @param nsecOrNpub The nsec or npub to sign with
 * @param endpoint The subscription endpoint to unsubscribe
 * @returns The published event
 */
export async function sendPushUnsubscription(
  nsecOrNpub: string,
  endpoint: string
): Promise<any> {
  // Create an unsubscription message
  const unsubscriptionMessage = {
    type: 'PUSH_UNSUBSCRIPTION',
    endpoint,
    timestamp: Date.now()
  }
  
  // Send as an encrypted direct message
  return await sendEncryptedDirectMessage(nsecOrNpub, unsubscriptionMessage)
}
