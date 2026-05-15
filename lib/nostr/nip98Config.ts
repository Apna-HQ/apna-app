/**
 * NIP-98 Authentication Configuration
 * 
 * This file contains the configuration for NIP-98 authentication,
 * including authorized pubkeys for different routes.
 */

export interface Nip98Config {
  /**
   * Authorized pubkeys for different routes
   */
  authorizedPubkeys: {
    /**
     * Pubkeys authorized to access the push/send endpoint
     */
    pushSend: string[];

    /**
     * Pubkeys authorized to access the push/test endpoint
     */
    pushTest: string[];

    /**
     * Pubkeys authorized to access the per-mini-app notifications/send endpoint
     * (/api/apna/notifications/send).
     *
     * NOTE: This list is used only as a pre-filter when callers supply an
     * explicit allowlist.  The primary gate is the NIP-98 signature + the
     * mini-app ownership check (the signer must be the author of a published
     * mini-app metadata note).  Leave empty to allow any valid NIP-98 signer
     * that owns an app, or populate it to additionally restrict to known pubkeys.
     */
    apnaNotificationsSend: string[];

    /**
     * Add more route-specific pubkey lists as needed
     */
    // otherRoute: string[];
  };
}

/**
 * NIP-98 authentication configuration
 * 
 * Add pubkeys to the appropriate arrays to authorize them for specific routes.
 * For example, to authorize a pubkey for the push/send endpoint, add it to the
 * pushSend array.
 */
const nip98Config: Nip98Config = {
  authorizedPubkeys: {
    // Pubkeys authorized to send push notifications (admin endpoint)
    pushSend: [
      // Example: "7575b94fa81152fe529a4899d390294af142277154ce44036d50e2ad99d5c267"
      "7575b94fa81152fe529a4899d390294af142277154ce44036d50e2ad99d5c267",
    ],

    // Pubkeys authorized to send test push notifications
    pushTest: [
      // Example: "7575b94fa81152fe529a4899d390294af142277154ce44036d50e2ad99d5c267"
      "7575b94fa81152fe529a4899d390294af142277154ce44036d50e2ad99d5c267",
    ],

    // Pubkeys authorized to call POST /api/apna/notifications/send.
    // The route already enforces NIP-98 + mini-app ownership; this list is an
    // optional extra allowlist.  Leave empty [] to allow any app publisher.
    apnaNotificationsSend: [],
  },
};

export default nip98Config;