"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import { ReplyToRootNote } from "@/lib/nostr"
import { getKeyPairFromLocalStorage } from "@/lib/utils"
import { APP_CATEGORIES, AppCategory } from "@/lib/hooks/useApps"
import { revalidateTags } from "@/app/actions/feedback"
import { APPS_ROOT_NOTE_ID } from "@/lib/constants"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GeneratedApp, generatedAppsDB } from "@/lib/generatedAppsDB"

// Schema for external apps
const ExternalAppSchema = z.object({
  appType: z.literal("external"),
  appName: z.string().min(2, {
    message: "App name must be at least 2 characters.",
  }),
  appUrl: z.string().url({
    message: "Please enter a valid URL.",
  }),
  categories: z.array(z.enum(APP_CATEGORIES)).min(1, {
    message: "Please select at least one category.",
  }),
  defaultDisplay: z.enum(["tab", "fullscreen"]),
  mode: z.literal("Full-page"),
  description: z.string().min(10, {
    message: "Description must be at least 10 characters.",
  }).max(500, {
    message: "Description must not exceed 500 characters.",
  }),
})

// Schema for generated apps
const GeneratedAppSchema = z.object({
  appType: z.literal("generated"),
  selectedAppId: z.string().min(1, {
    message: "Please select an app.",
  }),
  categories: z.array(z.enum(APP_CATEGORIES)).min(1, {
    message: "Please select at least one category.",
  }),
  defaultDisplay: z.enum(["tab", "fullscreen"]),
  mode: z.literal("Full-page"),
  description: z.string().min(10, {
    message: "Description must be at least 10 characters.",
  }).max(500, {
    message: "Description must not exceed 500 characters.",
  }),
})

// Combined schema with discriminated union
const FormSchema = z.discriminatedUnion("appType", [
  ExternalAppSchema,
  GeneratedAppSchema,
])

type FormData = z.infer<typeof FormSchema>

export default function SubmitNewApp() {
  const searchParams = useSearchParams();
  const publishAppId = searchParams.get('publish');
  
  const [isOpen, setIsOpen] = useState(!!publishAppId)
  const [selectedCategories, setSelectedCategories] = useState<AppCategory[]>([])
  const [appType, setAppType] = useState<"external" | "generated">(publishAppId ? "generated" : "external")
  const [generatedApps, setGeneratedApps] = useState<GeneratedApp[]>([])
  const [selectedApp, setSelectedApp] = useState<GeneratedApp | null>(null)

  // Fetch generated apps from IndexedDB
  useEffect(() => {
    const fetchGeneratedApps = async () => {
      try {
        const apps = await generatedAppsDB.getAllApps()
        setGeneratedApps(apps)
        
        // If publish parameter is present, pre-select the app
        if (publishAppId) {
          const appToPublish = apps.find(app => app.id === publishAppId);
          if (appToPublish) {
            setSelectedApp(appToPublish);
            setAppType("generated");
          }
        }
      } catch (error) {
        console.error("Failed to fetch generated apps:", error)
      }
    }

    if (isOpen) {
      fetchGeneratedApps()
    }
  }, [isOpen, publishAppId])

  const form = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      appType: "external",
      appName: "",
      appUrl: "",
      categories: [],
      defaultDisplay: "tab",
      mode: "Full-page",
      description: "",
    } as FormData,
  })

  // Update form values when app type changes or when selectedApp changes
  useEffect(() => {
    form.setValue("appType", appType);
    
    // If an app is selected and we're in generated mode, set the selectedAppId
    if (selectedApp && appType === "generated") {
      form.setValue("selectedAppId", selectedApp.id);
    }
  }, [appType, form, selectedApp])

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Trigger a refresh of the app list when drawer closes
      localStorage.setItem('apna_drawer_closed', Date.now().toString());
      // Remove it immediately to allow future triggers
      localStorage.removeItem('apna_drawer_closed');
      
      // Reset form and selected app
      form.reset({
        appType: "external",
        appName: "",
        appUrl: "",
        categories: [],
        defaultDisplay: "tab",
        mode: "Full-page",
        description: "",
      } as FormData)
      setSelectedApp(null)
      setSelectedCategories([])
      
      // Clear the URL parameter if it exists
      if (publishAppId) {
        // Use history API to update URL without full page reload
        const url = new URL(window.location.href);
        url.searchParams.delete('publish');
        window.history.replaceState({}, '', url.toString());
      }
    }
  };

  const toggleCategory = (category: AppCategory) => {
    const newCategories = selectedCategories.includes(category)
      ? selectedCategories.filter(c => c !== category)
      : [...selectedCategories, category];
    setSelectedCategories(newCategories);
    form.setValue('categories', newCategories);
  };

  const handleAppSelection = async (appId: string) => {
    try {
      const app = await generatedAppsDB.getApp(appId)
      if (app) {
        setSelectedApp(app)
        form.setValue("selectedAppId", app.id)
      }
    } catch (error) {
      console.error("Failed to get app details:", error)
    }
  }

  const onSubmit = async (data: FormData) => {
    try {
      let submitData;
      let noteId: string | undefined;
      
      if (data.appType === "external") {
        submitData = {
          appName: data.appName,
          appURL: data.appUrl, // Note: capital URL to match expected structure
          categories: data.categories,
          defaultDisplay: data.defaultDisplay,
          mode: data.mode,
          description: data.description,
        };
      } else {
        // For generated apps
        if (!selectedApp) {
          console.error('No app selected');
          return;
        }
        
        submitData = {
          appName: selectedApp.name,
          htmlContent: selectedApp.htmlContent,
          categories: data.categories,
          defaultDisplay: data.defaultDisplay,
          mode: data.mode,
          description: data.description,
          isGeneratedApp: true,
        };
      }

      const existingKeyPair = getKeyPairFromLocalStorage();
      if (!existingKeyPair) {
        console.error('No keypair found');
        return;
      }

      // Pick the right token for the host signer — remote-signer profiles
      // store no nsec locally, so we have to route via npub instead.
      const signingSource =
        existingKeyPair.signerType === 'nip07'
          ? 'nip07'
          : existingKeyPair.signerType === 'nip46'
            ? existingKeyPair.npub
            : existingKeyPair.nsec;

      revalidateTags(['ApnaMiniAppDetails', APPS_ROOT_NOTE_ID]);
      // Submit the app to Nostr — uses ReplyToRootNote which skips the
      // parent-fetch step that was making publishes intermittently fail.
      const response = await ReplyToRootNote(
        APPS_ROOT_NOTE_ID,
        JSON.stringify(submitData),
        signingSource
      );
      
      // Get the noteId from the response (the event id)
      noteId = response?.id;
      
      // Update the published status in IndexedDB for generated apps
      if (data.appType === "generated" && selectedApp && noteId) {
        try {
          // Find the index of the current htmlContent in the htmlContents array
          const currentIndex = selectedApp.htmlContents.findIndex(
            content => content === selectedApp.htmlContent
          );
          
          if (currentIndex !== -1) {
            // Create or update the published array
            const published = selectedApp.published ||
              new Array(selectedApp.htmlContents.length).fill(undefined);
            
            // Update the published status at the current index
            published[currentIndex] = noteId;
            
            // Update the app in IndexedDB
            await generatedAppsDB.updateApp(selectedApp.id, {
              published
            });
            
            console.log(`Updated published status for app ${selectedApp.name} at index ${currentIndex}`);
          }
        } catch (updateError) {
          console.error('Failed to update published status:', updateError);
          // Continue with the form submission even if updating the published status fails
        }
      }

      setIsOpen(false);
      form.reset();
      setSelectedCategories([]);
      setSelectedApp(null);
    } catch (error) {
      console.error('Failed to submit app:', error);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button
          variant="default"
          className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-amber-strong p-0 text-white shadow-lg transition-all duration-300 hover:bg-amber-strong/90 hover:shadow-xl"
          aria-label="Submit New App"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </Button>
      </DrawerTrigger>
      <DrawerContent className="border-ink/10 bg-shell text-ink">
        <div className="mx-auto w-full max-w-lg">
          <DrawerHeader className="border-b border-ink/10 px-4 pb-4 sm:px-6">
            <DrawerTitle className="text-xl font-semibold text-ink sm:text-2xl">
              Submit New App
            </DrawerTitle>
            <DrawerDescription className="text-sm text-ink-3 sm:text-base">
              Share your app with the Apna community
            </DrawerDescription>
          </DrawerHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-4 sm:p-6">
              {/* App Type Tabs */}
              <Tabs
                defaultValue="external"
                value={appType}
                onValueChange={(value) => setAppType(value as "external" | "generated")}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="external" className="text-sm">External App</TabsTrigger>
                  <TabsTrigger value="generated" className="text-sm">Generated App</TabsTrigger>
                </TabsList>
                
                {/* External App Form */}
                <TabsContent value="external" className="space-y-4">
                  <FormField
                    control={form.control}
                    name="appName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-ink-2">App Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter app name"
                            {...field}
                            className="border-ink/10 bg-surface focus:border-amber-strong focus:ring-amber-strong/20"
                          />
                        </FormControl>
                        <FormMessage className="text-danger" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="appUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-ink-2">App URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://your-app-url.com"
                            {...field}
                            className="border-ink/10 bg-surface focus:border-amber-strong focus:ring-amber-strong/20"
                          />
                        </FormControl>
                        <FormMessage className="text-danger" />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                {/* Generated App Form */}
                <TabsContent value="generated" className="space-y-4">
                  <FormField
                    control={form.control}
                    name="selectedAppId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-ink-2">Select Generated App</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            handleAppSelection(value);
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="border-ink/10 bg-surface focus:border-amber-strong focus:ring-amber-strong/20">
                              <SelectValue placeholder="Select an app" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {generatedApps.length === 0 ? (
                              <SelectItem value="no-apps" disabled>
                                No generated apps available
                              </SelectItem>
                            ) : (
                              // Filter out apps that have already been published
                              (() => {
                                const unpublishedApps = generatedApps.filter(app => {
                                  // Include app if:
                                  // 1. It has no published array, or
                                  // 2. All values in the published array are empty/undefined
                                  return !app.published || app.published.every(item => !item);
                                });
                                
                                if (unpublishedApps.length === 0) {
                                  return (
                                    <SelectItem value="all-published" disabled>
                                      All apps have been published
                                    </SelectItem>
                                  );
                                }
                                
                                return unpublishedApps.map((app) => (
                                  <SelectItem key={app.id} value={app.id}>
                                    {app.name}
                                  </SelectItem>
                                ));
                              })()
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-danger" />
                      </FormItem>
                    )}
                  />
                  
                  {selectedApp && (
                    <div className="rounded-md border border-ink/10 bg-chrome p-3">
                      <p className="text-sm font-medium text-ink-2">Selected App: {selectedApp.name}</p>
                      <p className="mt-1 text-xs text-ink-3">
                        Created: {new Date(selectedApp.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
              
              {/* Common Fields for Both App Types */}
              <FormField
                control={form.control}
                name="defaultDisplay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-ink-2">Default open mode</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-2 gap-2">
                        {(["tab", "fullscreen"] as const).map((mode) => (
                          <Button
                            key={mode}
                            type="button"
                            variant="outline"
                            onClick={() => field.onChange(mode)}
                            className={`rounded-lg px-3 py-2 text-sm capitalize ${
                              field.value === mode
                                ? "border-amber-strong bg-amber-strong text-white"
                                : "border-ink/10 bg-surface text-ink-2 hover:bg-surface-2"
                            }`}
                          >
                            {mode === "tab" ? "Tab screen" : "Fullscreen"}
                          </Button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage className="text-danger" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categories"
                render={() => (
                  <FormItem>
                    <FormLabel className="text-ink-2">Categories (select multiple)</FormLabel>
                    <div className="flex flex-wrap gap-2">
                      {APP_CATEGORIES.map((category) => (
                        <Button
                          key={category}
                          type="button"
                          variant="outline"
                          onClick={() => toggleCategory(category)}
                          className={`rounded-full px-3 py-1 text-sm ${
                            selectedCategories.includes(category)
                              ? "border-amber-strong bg-amber-strong text-white"
                              : "border-ink/10 bg-surface text-ink-2 hover:bg-surface-2"
                          }`}
                        >
                          {category}
                        </Button>
                      ))}
                    </div>
                    <FormMessage className="text-danger" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-ink-2">Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe your app (max 500 characters)"
                        {...field}
                        className="min-h-[100px] border-ink/10 bg-surface focus:border-amber-strong focus:ring-amber-strong/20"
                      />
                    </FormControl>
                    <FormMessage className="text-danger" />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full rounded-lg bg-amber-strong py-2 font-semibold text-white shadow-sm transition-all duration-300 hover:bg-amber-strong/90 hover:shadow-md"
                disabled={appType === "generated" && !selectedApp}
              >
                Submit App
              </Button>
            </form>
          </Form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
