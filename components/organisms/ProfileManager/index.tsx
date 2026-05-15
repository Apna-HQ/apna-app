"use client"

import React, { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { GetNpubProfileMetadata } from "@/lib/nostr"
import {
  getAllUserProfilesFromLocalStorage,
  getKeyPairFromLocalStorage,
  addUserProfileToLocalStorage,
  addRemoteSignerProfileToLocalStorage,
  addExtensionProfileToLocalStorage,
  removeUserProfileFromLocalStorage,
  setActiveUserProfile,
  getUserProfileByNpub,
  saveProfileToLocalStorage,
  profileExistsWithNsec,
  IUserKeyPair
} from "@/lib/utils"
import { getPublicKey, nip19 } from "nostr-tools"
import { User, KeyRound, Shuffle, Link, AlertTriangle, Puzzle } from "lucide-react"
import { GenerateKeyPair } from "@/lib/nostr/events"
import { parseRemoteSignerInput, connectToRemoteSigner, disconnectFromRemoteSigner, switchActiveRemoteSignerConnection, saveRemoteSignerConnectionToLocalStorage, isRemoteSignerConnected } from "@/lib/nostr/nip46"
import { isNip07Available, getNip07Signer } from "@/lib/nostr/nip07"

const nsecFormSchema = z.object({
  nsec: z.string().startsWith("nsec", {
    message: `Nsec is invalid! Should start with "nsec"`,
  }),
  alias: z.string().optional()
})

const remoteSignerFormSchema = z.object({
  bunkerUrl: z.string().min(1, {
    message: "Bunker URL is required",
  }),
  alias: z.string().optional()
})

interface ProfileManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProfileChange?: () => void;
}

export default function ProfileManager({ open, onOpenChange, onProfileChange }: ProfileManagerProps) {
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [exportNpub, setExportNpub] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<IUserKeyPair[]>([])
  const [activeNpub, setActiveNpub] = useState<string | null>(null)
  const [confirmRemoveNpub, setConfirmRemoveNpub] = useState<string | null>(null)
  const [duplicateProfile, setDuplicateProfile] = useState<IUserKeyPair | null>(null)
  const [pendingImport, setPendingImport] = useState<{nsec: string, npub: string, alias?: string} | null>(null)
  const [activeConnectionStatus, setActiveConnectionStatus] = useState<boolean>(false)

  // Load profiles on mount and when they change
  const loadProfiles = () => {
    const allProfiles = getAllUserProfilesFromLocalStorage()
    setProfiles(allProfiles)
    
    const keyPair = getKeyPairFromLocalStorage()
    if (keyPair && keyPair.npub) {
      setActiveNpub(keyPair.npub)
      
      // Check connection status for active profile if it's a remote signer
      const activeProfile = getUserProfileByNpub(keyPair.npub)
      if (activeProfile?.isRemoteSigner) {
        setActiveConnectionStatus(isRemoteSignerConnected(keyPair.npub))
      } else {
        setActiveConnectionStatus(false)
      }
    }
  }

  // Get profiles on mount and when open changes
  useEffect(() => {
    if (open) {
      loadProfiles()
    }
  }, [open])

  const [importTab, setImportTab] = useState<string>("nsec")
  const [isConnecting, setIsConnecting] = useState(false)
  const [authUrl, setAuthUrl] = useState<string | null>(null)

  // NIP-07 browser-extension tab state.
  const [nip07Available, setNip07Available] = useState(false)
  const [isConnectingExtension, setIsConnectingExtension] = useState(false)
  const [extensionAlias, setExtensionAlias] = useState("")

  // Detect a NIP-07 provider whenever the import drawer opens. `window.nostr`
  // is injected client-side by the extension, so this must run in an effect.
  useEffect(() => {
    if (isImportOpen) {
      setNip07Available(isNip07Available())
    }
  }, [isImportOpen])

  const nsecForm = useForm<z.infer<typeof nsecFormSchema>>({
    resolver: zodResolver(nsecFormSchema),
    defaultValues: {
      nsec: "",
      alias: "",
    },
  })

  const remoteSignerForm = useForm<z.infer<typeof remoteSignerFormSchema>>({
    resolver: zodResolver(remoteSignerFormSchema),
    defaultValues: {
      bunkerUrl: "",
      alias: "",
    },
  })
  
  // Function to generate a random nsec key
  function generateRandomNsec() {
    // Use the project's GenerateKeyPair function
    const keyPair = GenerateKeyPair();
    nsecForm.setValue("nsec", keyPair.nsec);
  }

  async function onSubmit(values: z.infer<typeof nsecFormSchema>) {
    try {
      const nsec = values.nsec
      const alias = values.alias
      const decodedNsec = nip19.decode(nsec)
      if (!decodedNsec || !decodedNsec.data) {
        throw new Error("Invalid nsec key")
      }
      
      const npub = nip19.npubEncode(getPublicKey(decodedNsec.data as Uint8Array))
      
      // Check if this nsec already exists
      const existingProfile = profileExistsWithNsec(nsec)
      if (existingProfile) {
        setDuplicateProfile(existingProfile)
        setPendingImport({ nsec, npub, alias })
        return
      }
      
      // Proceed with import
      await completeImport(nsec, npub, alias)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import nsec key")
    }
  }
  
  async function completeImport(nsec: string, npub: string, alias?: string) {
    try {
      const profile = {
        metadata: await GetNpubProfileMetadata(npub)
      }
      
      // Add to profiles instead of replacing
      addUserProfileToLocalStorage(npub, nsec, true, alias)
      saveProfileToLocalStorage(profile)
      
      // Update UI
      loadProfiles()
      nsecForm.reset()
      setIsImportOpen(false)
      setPendingImport(null)
      setDuplicateProfile(null)
      
      // Notify parent component if needed
      if (onProfileChange) {
        onProfileChange()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import nsec key")
    }
  }

  async function onRemoteSignerSubmit(values: z.infer<typeof remoteSignerFormSchema>) {
    try {
      setIsConnecting(true)
      setError(null)

      // Parse the bunker URL
      const bunkerPointer = await parseRemoteSignerInput(values.bunkerUrl)
      if (!bunkerPointer) {
        throw new Error("Invalid bunker URL or NIP-05 identifier")
      }

      // Connect to the remote signer
      const connection = await connectToRemoteSigner(
        bunkerPointer,
        (url) => {
          // Handle auth URL if needed
          setAuthUrl(url)
        },
        undefined, // No existing client secret key
        undefined, // No existing client pubkey
        values.alias // Pass the alias parameter
      )

      if (!connection || !connection.userPubkey) {
        throw new Error("Failed to connect to remote signer")
      }

      // connection.userPubkey is the raw pubkey, so we need to encode it as npub
      const nip19 = require('nostr-tools/nip19');
      const npub = nip19.npubEncode(connection.userPubkey);
      
      console.log(`Remote signer connection established:`);
      console.log(`Raw pubkey: ${connection.userPubkey.slice(0, 8)}...${connection.userPubkey.slice(-8)}`);
      console.log(`Npub: ${npub.slice(0, 8)}...${npub.slice(-8)}`);
      
      // The connectToRemoteSigner function already handles saving the connection to localStorage
      console.log(`Remote signer connection established and saved to localStorage`);

      // Update connection status for the new remote signer
      setActiveConnectionStatus(true);
      
      // Reset form and update UI
      remoteSignerForm.reset()
      loadProfiles()
      setIsImportOpen(false)
      
      // Notify parent component if needed
      if (onProfileChange) {
        onProfileChange()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to remote signer")
    } finally {
      setIsConnecting(false)
    }
  }

  async function onConnectExtension() {
    try {
      setIsConnectingExtension(true)
      setError(null)

      if (!isNip07Available()) {
        throw new Error(
          "No NIP-07 browser extension found. Install a Nostr extension (e.g. Alby or nos2x) and reload."
        )
      }

      // Ask the extension for the user's public key, then store a `nip07`
      // profile — no nsec is ever held locally for extension identities.
      const signer = getNip07Signer()
      const pubkey = await signer.getPublicKey()
      const npub = pubkey.startsWith("npub")
        ? pubkey
        : nip19.npubEncode(pubkey)

      const alias = extensionAlias.trim() || undefined
      addExtensionProfileToLocalStorage(npub, alias, true)

      // Best-effort: stash profile metadata like the other import paths do.
      try {
        const profile = { metadata: await GetNpubProfileMetadata(npub) }
        saveProfileToLocalStorage(profile)
      } catch {
        // Metadata is non-critical — the profile is still usable without it.
      }

      setExtensionAlias("")
      loadProfiles()
      setIsImportOpen(false)

      if (onProfileChange) {
        onProfileChange()
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to connect to browser extension"
      )
    } finally {
      setIsConnectingExtension(false)
    }
  }

  async function handleSwitchProfile(npub: string) {
    console.log(`Switching to profile: ${npub.slice(0, 8)}...${npub.slice(-8)}`);
    
    // First set the active profile in localStorage
    setActiveUserProfile(npub);
    
    // Check if this is a remote signer profile
    const profile = getUserProfileByNpub(npub);
    if (profile?.isRemoteSigner) {
      console.log(`This is a remote signer profile, initializing connection...`);
      
      try {
        // Explicitly switch the active remote signer connection
        await switchActiveRemoteSignerConnection(npub);
        console.log(`Successfully switched remote signer connection`);
        
        // Update connection status
        setActiveConnectionStatus(isRemoteSignerConnected(npub));
      } catch (error) {
        console.error(`Error switching remote signer connection: ${error instanceof Error ? error.message : String(error)}`);
        setError(`Failed to switch remote signer connection: ${error instanceof Error ? error.message : "Unknown error"}`);
        setActiveConnectionStatus(false);
      }
    } else {
      console.log(`This is a local profile, no remote signer connection needed`);
      setActiveConnectionStatus(false);
    }
    
    // Reload profiles to update UI
    loadProfiles();
    
    // Notify parent component if needed
    if (onProfileChange) {
      onProfileChange();
    }
  }

  function handleRemoveProfile(npub: string) {
    setConfirmRemoveNpub(npub)
  }

  async function confirmRemoveProfile() {
    if (confirmRemoveNpub) {
      try {
        // Get the profile to check if it's a remote signer
        const profile = getUserProfileByNpub(confirmRemoveNpub);
        
        // If it's a remote signer, disconnect it first
        if (profile?.isRemoteSigner) {
          console.log(`Disconnecting remote signer for profile: ${confirmRemoveNpub.slice(0, 8)}...${confirmRemoveNpub.slice(-8)}`);
          
          try {
            // Disconnect from the remote signer
            await disconnectFromRemoteSigner(confirmRemoveNpub);
            console.log(`Successfully disconnected remote signer for profile: ${confirmRemoveNpub.slice(0, 8)}...${confirmRemoveNpub.slice(-8)}`);
          } catch (error) {
            console.error(`Error disconnecting remote signer: ${error instanceof Error ? error.message : String(error)}`);
            // Continue with removal even if disconnection fails
          }
        }
        
        // Remove the profile from localStorage
        removeUserProfileFromLocalStorage(confirmRemoveNpub);
        loadProfiles();
        setConfirmRemoveNpub(null);
        
        // Notify parent component if needed
        if (onProfileChange) {
          onProfileChange();
        }
      } catch (error) {
        console.error(`Error removing profile: ${error instanceof Error ? error.message : String(error)}`);
        setError(`Failed to remove profile: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }

  function handleExportProfile(npub: string) {
    setExportNpub(npub)
    setIsExportOpen(true)
  }

  return (
    <>
      {/* Error Dialog */}
      <Dialog open={!!error} onOpenChange={() => setError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-500">Error</DialogTitle>
          </DialogHeader>
          <div className="text-gray-700 mt-2">{error}</div>
          <Button
            onClick={() => setError(null)}
            className="mt-4 w-full bg-red-500 hover:bg-red-600 text-white"
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>
      
      {/* Auth URL Dialog */}
      <Dialog open={!!authUrl} onOpenChange={() => setAuthUrl(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authentication Required</DialogTitle>
          </DialogHeader>
          <div className="text-gray-700 mt-2">
            <p className="mb-4">The remote signer requires authentication. The authentication page has been opened in a new tab.</p>
            <div className="bg-gray-100 p-3 rounded-md break-all">
              <button
                onClick={() => authUrl && window.open(authUrl, "_blank")}
                className="text-blue-600 hover:underline flex items-center gap-2 text-left"
              >
                {authUrl}
                <Link className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-4 text-sm text-gray-500">After authenticating, you&apos;ll be able to use the remote signer.</p>
          </div>
          <div className="flex flex-col gap-2 mt-4">
            <Button
              onClick={() => setAuthUrl(null)}
              className="w-full bg-[#368564] hover:bg-[#2a684d] text-white"
            >
              I&apos;ve Accepted the Connection Request
            </Button>
            <Button
              onClick={() => setAuthUrl(null)}
              className="w-full bg-white hover:bg-gray-50 text-gray-700 border border-gray-300"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Confirm Remove Dialog */}
      <Dialog open={!!confirmRemoveNpub} onOpenChange={() => setConfirmRemoveNpub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Remove Profile</DialogTitle>
            <div className="text-sm text-gray-500 mt-1">
              Are you sure you want to remove this profile? This action cannot be undone.
            </div>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900 px-4 py-2"
              onClick={() => setConfirmRemoveNpub(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2"
              onClick={confirmRemoveProfile}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Duplicate Profile Dialog */}
      <Dialog open={!!duplicateProfile} onOpenChange={() => setDuplicateProfile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Profile</DialogTitle>
            <div className="text-sm text-gray-500 mt-1">
              This nsec key already exists for profile:
              <span className="font-mono ml-1">
                {duplicateProfile?.npub?.slice(0, 8)}...{duplicateProfile?.npub?.slice(-8)}
              </span>
              {duplicateProfile?.alias && <span className="ml-1">({duplicateProfile.alias})</span>}
            </div>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900 px-4 py-2"
              onClick={() => {
                setDuplicateProfile(null);
                setPendingImport(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#368564] hover:bg-[#2a684d] text-white px-4 py-2"
              onClick={() => {
                if (pendingImport) {
                  completeImport(pendingImport.nsec, pendingImport.npub, pendingImport.alias);
                }
              }}
            >
              Update Profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Export Profile Dialog */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Private Key</DialogTitle>
            <div className="text-sm text-gray-500 mt-1">
              This is your private key. Never share it with anyone!
            </div>
          </DialogHeader>
          <div className="bg-gray-100 p-3 rounded-md overflow-x-auto">
            <code className="text-sm break-all">
              {exportNpub && getUserProfileByNpub(exportNpub)?.nsec}
            </code>
          </div>
          <div className="flex justify-end mt-4">
            <Button
              className="bg-[#368564] hover:bg-[#2a684d] text-white px-4 py-2"
              onClick={() => setIsExportOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-lg">
            <DrawerHeader className="border-b border-gray-100 pb-4 px-4 sm:px-6">
              <DrawerTitle className="text-xl sm:text-2xl font-semibold text-[#368564]">
                Manage Profiles
              </DrawerTitle>
              <DrawerDescription className="text-gray-600 text-sm sm:text-base">
                Switch between profiles or add a new one
              </DrawerDescription>
            </DrawerHeader>
            
            <div className="p-4 sm:p-6 space-y-6">
              <div className="flex flex-col gap-4">
                <h3 className="text-md font-medium">User Profiles</h3>
                
                {profiles.length > 0 ? (
                  <div className="space-y-4">
                    {profiles.map((profile) => (
                      <div
                        key={profile.npub}
                        className={`flex flex-col p-3 rounded-lg border ${
                          profile.npub === activeNpub
                            ? 'border-[#368564] bg-[#e6efe9]'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex flex-col gap-2 mb-2">
                          <div>
                            {profile.alias ? (
                              <>
                                <span className="text-sm font-medium">
                                  {profile.alias}
                                </span>
                                <span className="font-mono text-xs text-gray-600 ml-2">
                                  {profile.npub.slice(0, 6)}...{profile.npub.slice(-6)}
                                </span>
                              </>
                            ) : (
                              <span className="font-mono text-sm">
                                {profile.npub.slice(0, 8)}...{profile.npub.slice(-8)}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-2">
                            {profile.npub === activeNpub && (
                              <span className="text-xs bg-[#368564] text-white px-2 py-0.5 rounded-full">
                                Active
                              </span>
                            )}
                            {profile.signerType === 'nip46' && (
                              <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">
                                Remote
                              </span>
                            )}
                            {profile.signerType === 'nip07' && (
                              <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded-full">
                                Extension
                              </span>
                            )}
                            {(profile.signerType === 'local' || !profile.signerType) && (
                              <span className="text-xs bg-gray-500 text-white px-2 py-0.5 rounded-full">
                                Local
                              </span>
                            )}
                            {profile.npub === activeNpub && profile.isRemoteSigner && (
                              <span className={`text-xs ${activeConnectionStatus ? 'bg-green-500' : 'bg-red-500'} text-white px-2 py-0.5 rounded-full`}>
                                {activeConnectionStatus ? 'Connected' : 'Disconnected'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {profile.npub !== activeNpub && (
                            <Button
                              className="py-1 px-2 text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900"
                              onClick={() => handleSwitchProfile(profile.npub)}
                            >
                              Switch
                            </Button>
                          )}
                          {!profile.isRemoteSigner ? (
                            <Button
                              className="py-1 px-2 text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900"
                              onClick={() => handleExportProfile(profile.npub)}
                            >
                              Export
                            </Button>
                          ) : (
                            <Button
                              className="py-1 px-2 text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900 opacity-50 cursor-not-allowed"
                              disabled
                              title="Remote signer profiles don't have exportable private keys"
                            >
                              Export
                            </Button>
                          )}
                          {profiles.length > 1 && (
                            <Button
                              className="py-1 px-2 text-sm bg-red-500 hover:bg-red-600 text-white"
                              onClick={() => handleRemoveProfile(profile.npub)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 text-sm">No profiles found</div>
                )}
              </div>
              
              <Drawer open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DrawerTrigger asChild>
                  <Button
                    className="bg-white hover:bg-[#e6efe9] shadow-sm hover:shadow-md transition-all duration-300 text-[#368564] hover:text-[#2a684d] border border-[#368564] hover:border-[#2a684d]"
                    onClick={() => setIsImportOpen(true)}
                  >
                    <span className="flex items-center gap-2">
                      <KeyRound className="w-5 h-5" />
                      Import New Profile
                    </span>
                  </Button>
                </DrawerTrigger>
                <DrawerContent>
                  <div className="mx-auto w-full max-w-lg">
                    <DrawerHeader className="border-b border-gray-100 pb-4 px-4 sm:px-6">
                      <DrawerTitle className="text-xl sm:text-2xl font-semibold text-[#368564]">
                        Import New Profile
                      </DrawerTitle>
                      <DrawerDescription className="text-gray-600 text-sm sm:text-base">
                        Add a new profile using your nsec key or connect to a remote signer
                      </DrawerDescription>
                    </DrawerHeader>
                    <Tabs value={importTab} onValueChange={setImportTab} className="w-full">
                      <TabsList className="grid w-full grid-cols-3 mb-6 mx-4 sm:mx-6 mt-4">
                        <TabsTrigger value="nsec" className="text-center">
                          <span className="flex items-center gap-1.5">
                            <KeyRound className="w-4 h-4" />
                            Local Key
                          </span>
                        </TabsTrigger>
                        <TabsTrigger value="extension" className="text-center">
                          <span className="flex items-center gap-1.5">
                            <Puzzle className="w-4 h-4" />
                            Extension
                          </span>
                        </TabsTrigger>
                        <TabsTrigger value="remote" className="text-center">
                          <span className="flex items-center gap-1.5">
                            <Link className="w-4 h-4" />
                            Remote Signer
                          </span>
                        </TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="nsec" className="mt-0">
                        <div className="p-4 bg-gray-50 rounded-lg mb-4 mx-4 sm:mx-6">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-gray-700">
                              Local keys are stored in your browser. While convenient, this means your private key is exposed to this application.
                              For better security, consider using a remote signer.
                            </p>
                          </div>
                        </div>
                        <Form {...nsecForm}>
                          <form onSubmit={nsecForm.handleSubmit(onSubmit)} className="space-y-6 p-4 sm:p-6">
                            <div className="space-y-4">
                              <FormField
                                control={nsecForm.control}
                                name="nsec"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-gray-700">Nsec Key</FormLabel>
                                    <FormControl>
                                      <div className="flex gap-2">
                                        <div className="relative flex-grow">
                                          <Input
                                            placeholder="Enter your nsec"
                                            {...field}
                                            className="border-gray-200 focus:border-[#368564] focus:ring-[#e6efe9] pl-10 w-full"
                                          />
                                          <KeyRound className="w-5 h-5 text-[#368564] absolute left-3 top-1/2 transform -translate-y-1/2" />
                                        </div>
                                        <Button
                                          type="button"
                                          onClick={generateRandomNsec}
                                          className="bg-[#368564] hover:bg-[#2a684d] text-white flex items-center gap-1 px-3"
                                        >
                                          <Shuffle className="w-4 h-4" />
                                          Random
                                        </Button>
                                      </div>
                                    </FormControl>
                                    <FormMessage className="text-red-500" />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={nsecForm.control}
                                name="alias"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-gray-700">Alias (Optional)</FormLabel>
                                    <FormControl>
                                      <div className="relative">
                                        <Input
                                          placeholder="Enter a name for this profile"
                                          {...field}
                                          className="border-gray-200 focus:border-[#368564] focus:ring-[#e6efe9] pl-10"
                                        />
                                        <User className="w-5 h-5 text-[#368564] absolute left-3 top-1/2 transform -translate-y-1/2" />
                                      </div>
                                    </FormControl>
                                    <FormMessage className="text-red-500" />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <Button
                              type="submit"
                              className="w-full bg-[#368564] hover:bg-[#2a684d] text-white font-semibold py-2 rounded-lg transition-all duration-300 shadow-sm hover:shadow-md"
                            >
                              Import Key
                            </Button>
                          </form>
                        </Form>
                      </TabsContent>
                      
                      <TabsContent value="extension" className="mt-0">
                        <div className="p-4 bg-gray-50 rounded-lg mb-4 mx-4 sm:mx-6">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-gray-700">
                              Browser-extension signers (NIP-07) keep your private key inside
                              the extension. This app never sees your key — it only requests
                              signatures and your public key.
                            </p>
                          </div>
                        </div>
                        <div className="space-y-6 p-4 sm:p-6">
                          {nip07Available ? (
                            <>
                              <div className="space-y-2">
                                <label className="text-gray-700 text-sm font-medium">
                                  Alias (Optional)
                                </label>
                                <div className="relative">
                                  <Input
                                    placeholder="Enter a name for this profile"
                                    value={extensionAlias}
                                    onChange={(e) => setExtensionAlias(e.target.value)}
                                    className="border-gray-200 focus:border-[#368564] focus:ring-[#e6efe9] pl-10"
                                  />
                                  <User className="w-5 h-5 text-[#368564] absolute left-3 top-1/2 transform -translate-y-1/2" />
                                </div>
                              </div>
                              <Button
                                type="button"
                                onClick={onConnectExtension}
                                disabled={isConnectingExtension}
                                className="w-full bg-[#368564] hover:bg-[#2a684d] text-white font-semibold py-2 rounded-lg transition-all duration-300 shadow-sm hover:shadow-md"
                              >
                                {isConnectingExtension ? "Connecting..." : "Connect Browser Extension"}
                              </Button>
                            </>
                          ) : (
                            <div className="text-sm text-gray-700 space-y-2">
                              <p className="font-medium">No NIP-07 extension detected.</p>
                              <p>
                                Install a Nostr browser extension such as{" "}
                                <a
                                  href="https://getalby.com"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#368564] hover:underline"
                                >
                                  Alby
                                </a>{" "}
                                or{" "}
                                <a
                                  href="https://github.com/fiatjaf/nos2x"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#368564] hover:underline"
                                >
                                  nos2x
                                </a>
                                , then reload this page and reopen this tab.
                              </p>
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="remote" className="mt-0">
                        <div className="p-4 bg-gray-50 rounded-lg mb-4 mx-4 sm:mx-6">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-gray-700">
                              Remote signers keep your private key secure on a separate device or server. 
                              This app will request signatures from the remote signer when needed.
                            </p>
                          </div>
                        </div>
                        <Form {...remoteSignerForm}>
                          <form onSubmit={remoteSignerForm.handleSubmit(onRemoteSignerSubmit)} className="space-y-6 p-4 sm:p-6">
                            <div className="space-y-4">
                              <FormField
                                control={remoteSignerForm.control}
                                name="bunkerUrl"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-gray-700">Bunker URL or NIP-05</FormLabel>
                                    <FormControl>
                                      <div className="relative">
                                        <Input
                                          placeholder="bunker://... or name@domain.com"
                                          {...field}
                                          className="border-gray-200 focus:border-[#368564] focus:ring-[#e6efe9] pl-10"
                                        />
                                        <Link className="w-5 h-5 text-[#368564] absolute left-3 top-1/2 transform -translate-y-1/2" />
                                      </div>
                                    </FormControl>
                                    <FormMessage className="text-red-500" />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={remoteSignerForm.control}
                                name="alias"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-gray-700">Alias (Optional)</FormLabel>
                                    <FormControl>
                                      <div className="relative">
                                        <Input
                                          placeholder="Enter a name for this connection"
                                          {...field}
                                          className="border-gray-200 focus:border-[#368564] focus:ring-[#e6efe9] pl-10"
                                        />
                                        <User className="w-5 h-5 text-[#368564] absolute left-3 top-1/2 transform -translate-y-1/2" />
                                      </div>
                                    </FormControl>
                                    <FormMessage className="text-red-500" />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <Button
                              type="submit"
                              className="w-full bg-[#368564] hover:bg-[#2a684d] text-white font-semibold py-2 rounded-lg transition-all duration-300 shadow-sm hover:shadow-md"
                              disabled={isConnecting}
                            >
                              {isConnecting ? "Connecting..." : "Connect to Remote Signer"}
                            </Button>
                          </form>
                        </Form>
                      </TabsContent>
                    </Tabs>
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}