'use client'

import { useState, useEffect } from 'react'
import { PushNotificationToggle } from '@/components/atoms/PushNotificationToggle'
import { AlertTriangle, Bell } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  sendPushSubscription,
  sendPushUnsubscription,
  SERVER_NPUB
} from '@/lib/nostr/nip04Utils'
import { getKeyPairFromLocalStorage } from '@/lib/utils'

export default function PushNotificationSettings() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isTestingNotification, setIsTestingNotification] = useState(false)
  const [userKeyPair, setUserKeyPair] = useState<any>(null)
  const [isBrowser, setIsBrowser] = useState<boolean>(false)
  
  // Get the user's key pair on component mount
  useEffect(() => {
    setIsBrowser(true)
    const keyPair = getKeyPairFromLocalStorage()
    setUserKeyPair(keyPair)
  }, [])

  // Function to convert URL base64 to Uint8Array
  // This is needed for the applicationServerKey
  const urlBase64ToUint8Array = (base64String: string) => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      throw new Error('This function can only be used in a browser environment')
    }
    
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const handleSubscribe = async () => {
    try {
      setError(null)
      setSuccess(null)

      // Check if user is logged in
      if (!userKeyPair || !userKeyPair.npub) {
        throw new Error('You need to be logged in to subscribe to push notifications')
      }

      // Check if we're in a browser environment
      if (typeof window === 'undefined') {
        throw new Error('This operation can only be performed in a browser')
      }

      // Check if service workers are supported
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications are not supported in this browser')
      }

      // Get the service worker registration
      const registration = await navigator.serviceWorker.ready

      // Get the push subscription
      let subscription = await registration.pushManager.getSubscription()

      // If already subscribed, unsubscribe first
      if (subscription) {
        await subscription.unsubscribe()
      }

      // Subscribe to push notifications using our VAPID public key
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string)
      })

      // Send the subscription to the server via Nostr
      console.log('Push notification subscription:', JSON.stringify(subscription))
      
      // Send the subscription to the server via encrypted DM
      await sendPushSubscription(userKeyPair.nsec || userKeyPair.npub, subscription)

      setSuccess(`Successfully subscribed to push notifications! Your notifications will be encrypted for your keys only.`)
    } catch (err) {
      console.error('Error subscribing to push notifications:', err)
      setError(err instanceof Error ? err.message : 'Failed to subscribe to push notifications')
    }
  }

  const handleUnsubscribe = async () => {
    try {
      setError(null)
      setSuccess(null)

      // Check if user is logged in
      if (!userKeyPair || !userKeyPair.npub) {
        throw new Error('You need to be logged in to manage push notifications')
      }

      // Check if we're in a browser environment
      if (typeof window === 'undefined') {
        throw new Error('This operation can only be performed in a browser')
      }
      
      // Check if service workers are supported
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications are not supported in this browser')
      }

      // Get the service worker registration
      const registration = await navigator.serviceWorker.ready

      // Get the push subscription
      const subscription = await registration.pushManager.getSubscription()

      // If not subscribed, nothing to do
      if (!subscription) {
        setSuccess('You are not subscribed to push notifications')
        return
      }

      // Unsubscribe from push notifications
      await subscription.unsubscribe()

      // Notify the server about the unsubscription via Nostr
      await sendPushUnsubscription(
        userKeyPair.nsec || userKeyPair.npub,
        subscription.endpoint
      )

      setSuccess('Successfully unsubscribed from push notifications')
    } catch (err) {
      console.error('Error unsubscribing from push notifications:', err)
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe from push notifications')
    }
  }

  const handleTestNotification = async () => {
    try {
      setIsTestingNotification(true);
      setError(null);
      setSuccess(null);

      // Check if user is logged in
      if (!userKeyPair || !userKeyPair.npub) {
        throw new Error('You need to be logged in to test push notifications');
      }

      // Check if we're in a browser environment
      if (typeof window === 'undefined') {
        throw new Error('This operation can only be performed in a browser');
      }
      
      // Check if service workers are supported
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications are not supported in this browser');
      }

      // Get the service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Get the push subscription
      const subscription = await registration.pushManager.getSubscription();

      // If not subscribed, show error
      if (!subscription) {
        throw new Error('You are not subscribed to push notifications. Please subscribe first.');
      }

      // Call the test endpoint
      const response = await fetch('/api/push/test');
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send test notification');
      }

      const data = await response.json();
      setSuccess(data.message || 'Test notification sent successfully!');
    } catch (err) {
      console.error('Error testing push notification:', err);
      setError(err instanceof Error ? err.message : 'Failed to send test notification');
    } finally {
      setIsTestingNotification(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Subscribe to push notifications to stay updated with the latest information and alerts.
        Your subscription data is securely stored using Nostr&apos;s encrypted direct messages.
      </p>
      
      {!userKeyPair && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You need to be logged in with a Nostr key to use push notifications.
          </AlertDescription>
        </Alert>
      )}
      
      {isBrowser && (!('serviceWorker' in navigator) || !('PushManager' in window)) ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Push notifications are not supported in this browser.
          </AlertDescription>
        </Alert>
      ) : null}
      
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {success && (
        <Alert variant="default" className="bg-green-50 border-green-200 text-green-800">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      
      <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600 border border-gray-200">
        <p>
          <strong>Server:</strong> {SERVER_NPUB ? `${SERVER_NPUB.slice(0, 10)}...${SERVER_NPUB.slice(-5)}` : '(not configured)'}
        </p>
        <p className="mt-1">
          Your push subscription data is encrypted using Nostr NIP-04 and stored on Nostr relays.
          Only you and the notification server can decrypt this data. The actual notifications
          are delivered through the standard Web Push API.
        </p>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-3">
        <PushNotificationToggle
          onSubscribe={handleSubscribe}
          onUnsubscribe={handleUnsubscribe}
        />
        
        <Button
          onClick={handleTestNotification}
          disabled={isTestingNotification || !userKeyPair || !('serviceWorker' in navigator) || !('PushManager' in window)}
          variant="outline"
          className="flex items-center gap-2"
        >
          {isTestingNotification ? (
            <span className="animate-spin">⏳</span>
          ) : (
            <Bell className="h-4 w-4" />
          )}
          <span>Test Notification</span>
        </Button>
      </div>
    </div>
  )
}