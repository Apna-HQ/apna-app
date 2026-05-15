import { EventTemplate, getPublicKey, VerifiedEvent } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import { setNostrWasm, generateSecretKey, finalizeEvent, verifyEvent } from 'nostr-tools/wasm'
import { initNostrWasm } from 'nostr-wasm'
import { pool, DEFAULT_RELAYS } from './core'
import { getNip07Signer } from './nip07'
import { isRemoteSignerConnected, signEventWithRemoteSigner } from './nip46'
import { getKeyPairFromLocalStorage, isRemoteSignerProfile, normalizeProfile } from '@/lib/utils'

// make sure this promise resolves before your app starts calling finalizeEvent or verifyEvent
const initPromise = initNostrWasm().then(setNostrWasm)

declare global {
    interface Window {
        nip19: any;
    }
}
if (typeof window !== "undefined") {
    window.nip19 = nip19
}

export const GenerateKeyPair = () => {
    let sk = generateSecretKey() // `sk` is a Uint8Array
    let nsec = nip19.nsecEncode(sk)

    let pk = getPublicKey(sk) // `pk` is a hex string
    let npub = nip19.npubEncode(pk)

    const keyPair = {
        nsec,
        npub,
    }
    console.log(keyPair)
    return keyPair
}

const getActiveSigningSource = (): string | 'nip07' => {
    const stored = getKeyPairFromLocalStorage()
    if (!stored) {
        throw new Error("No active user profile found")
    }

    const profile = normalizeProfile(stored)
    if (profile.signerType === 'nip07') {
        return 'nip07'
    }
    if (profile.signerType === 'nip46') {
        return profile.npub
    }
    if (!profile.nsec) {
        throw new Error("Active local profile has no nsec key")
    }
    return profile.nsec
}

const verifySignedEvent = async (signedEvent: VerifiedEvent): Promise<VerifiedEvent> => {
    await initPromise
    const isGood = verifyEvent(signedEvent)
    console.log(`signedEvent - ${JSON.stringify(signedEvent)}`)
    if (!isGood) {
        throw new Error("event verification failed")
    }
    return signedEvent
}

export function signOnly(template: EventTemplate): Promise<VerifiedEvent>
export function signOnly(nsecOrNpub: string, template: EventTemplate): Promise<VerifiedEvent>
export async function signOnly(
    nsecOrNpubOrTemplate: string | EventTemplate,
    maybeTemplate?: EventTemplate
): Promise<VerifiedEvent> {
    const explicitKey = typeof nsecOrNpubOrTemplate === 'string'
    const nsecOrNpub = explicitKey
        ? nsecOrNpubOrTemplate
        : getActiveSigningSource()
    const event = explicitKey ? maybeTemplate : nsecOrNpubOrTemplate

    if (!event) {
        throw new Error("event template is required")
    }

    if (nsecOrNpub === 'nip07') {
        const signedEvent = await getNip07Signer().signEvent(event)
        return verifySignedEvent(signedEvent)
    }

    let signedEvent: VerifiedEvent;

    // Check if the input is an npub
    if (nsecOrNpub.startsWith('npub')) {
        const decodedNpub = nip19.decode(nsecOrNpub);
        if (decodedNpub.type !== "npub") {
            throw new Error("invalid npub");
        }
        const pubkey = decodedNpub.data as string;
        
        // Check if this pubkey is connected to a remote signer
        if (isRemoteSignerConnected(pubkey)) {
            // Use remote signer to sign the event
            try {
                signedEvent = await signEventWithRemoteSigner(pubkey, {
                    ...event,
                    pubkey
                });
            } catch (error) {
                console.error('Remote signing failed:', error);
                throw new Error(`Remote signing failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            // Check if this is a remote signer profile that's not currently connected
            if (isRemoteSignerProfile(pubkey)) {
                throw new Error("Remote signer is not currently connected. Please reconnect to the remote signer.");
            } else {
                throw new Error("No remote signer connected for this npub");
            }
        }
    } else {
        // Traditional nsec signing
        const decodedNsec = nip19.decode(nsecOrNpub);
        if (decodedNsec.type !== "nsec") {
            throw new Error("invalid nsec");
        }
        const sk = decodedNsec.data;
        await initPromise;
        signedEvent = finalizeEvent(event, sk)
    }

    return verifySignedEvent(signedEvent)
}

export const publishEvent = async (nsecOrNpub: string, event: any) => {
    const signedEvent = await signOnly(nsecOrNpub, event)
    const pub = await pool.publish(DEFAULT_RELAYS, signedEvent)
    console.log(`published event - `, pub)
    return signedEvent
}

export const publishKind0 = async (nsec: string, profile: any) => {
    const event = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(profile),
    }
    return publishEvent(nsec, event)
}

export const publishKind1 = async (nsec: string, content: string, tags: any[] = []) => {
    const event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content,
    }
    return (await publishEvent(nsec, event)) as VerifiedEvent & { kind: 1 }
}

export const publishKind3 = async (nsec: string, tags: any[]) => {
    const event = {
        kind: 3,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: "",
    }
    await publishEvent(nsec, event)
}

export const publishKind6 = async (nsec: string, content: string, tags: any[]) => {
    const event = {
        kind: 6,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content,
    }
    return (await publishEvent(nsec, event)) as VerifiedEvent & { kind: 6 }
}

export const publishKind7 = async (nsec: string, tags: any[], content: string = "+") => {
    const event = {
        kind: 7,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content,
    }
    return (await publishEvent(nsec, event)) as VerifiedEvent & { kind: 7 }
}
