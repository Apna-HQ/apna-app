"use client"

import { useState } from "react"
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
import { ReplyToNote } from "@/lib/nostr"
import { getKeyPairFromLocalStorage } from "@/lib/utils"
import { APP_CATEGORIES, AppCategory, AppDetails } from "@/lib/types/apps"
import { Pencil } from "lucide-react"
import { revalidateTags } from "@/app/actions/feedback"

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
  appName: z.string().min(2, {
    message: "App name must be at least 2 characters.",
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

interface EditAppProps {
  app: AppDetails;
  onSuccess?: () => void;
}

export default function EditApp({ app, onSuccess }: EditAppProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [selectedCategories, setSelectedCategories] = useState<AppCategory[]>(app.categories)
  
  // Determine app type based on the app properties
  const appType = app.isGeneratedApp ? "generated" : "external"

  const form = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      appType,
      appName: app.appName,
      ...(app.appURL ? { appUrl: app.appURL } : {}),
      categories: app.categories,
      defaultDisplay: app.defaultDisplay ?? "tab",
      mode: "Full-page",
      description: app.description,
    } as FormData,
  })

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Trigger a refresh of the app list when drawer closes
      localStorage.setItem('apna_drawer_closed', Date.now().toString());
      // Remove it immediately to allow future triggers
      localStorage.removeItem('apna_drawer_closed');
    }
  };

  const toggleCategory = (category: AppCategory) => {
    const newCategories = selectedCategories.includes(category)
      ? selectedCategories.filter(c => c !== category)
      : [...selectedCategories, category];
    setSelectedCategories(newCategories);
    form.setValue('categories', newCategories);
  };

  const onSubmit = async (data: FormData) => {
    try {
      let submitData;
      
      if (data.appType === "external") {
        submitData = {
          appName: data.appName,
          appURL: data.appUrl,
          categories: data.categories,
          defaultDisplay: data.defaultDisplay,
          mode: data.mode,
          description: data.description,
        };
      } else {
        // For generated apps
        submitData = {
          appName: data.appName,
          htmlContent: app.htmlContent, // Keep the original HTML content
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

      // Reply to the app's note ID instead of the original submission note
      revalidateTags(['ApnaMiniAppDetails', app.id]);
      await ReplyToNote(
        app.id, // Use the app's note ID for the reply
        JSON.stringify(submitData),
        existingKeyPair.nsec
      );

      setIsOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to update app:', error);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={handleOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg">
          <DrawerHeader className="border-b border-ink/10 pb-4 px-4 sm:px-6">
            <DrawerTitle className="text-xl sm:text-2xl font-semibold text-ink">
              Edit App
            </DrawerTitle>
            <DrawerDescription className="text-ink-3 text-sm sm:text-base">
              Update your app details
            </DrawerDescription>
          </DrawerHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-4 sm:p-6">
              {/* App Type Information */}
              <div className="bg-chrome p-3 rounded-md border border-ink/10 mb-4">
                <p className="text-sm font-medium text-ink-2">
                  App Type: {app.isGeneratedApp ? "Generated App" : "External App"}
                </p>
                {app.isGeneratedApp && (
                  <p className="text-xs text-ink-3 mt-1">
                    Generated apps maintain their HTML content when updated
                  </p>
                )}
              </div>
              
              {/* App Name - Common for both types */}
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
              
              {/* App URL - Only for external apps */}
              {appType === "external" && (
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
              )}
              
              {/* HTML Content Preview - Only for generated apps */}
              {appType === "generated" && app.htmlContent && (
                <div className="p-3 bg-chrome rounded-md border border-ink/10">
                  <p className="text-sm font-medium text-ink-2">HTML Content</p>
                  <p className="text-xs text-ink-3 mt-1">
                    The HTML content of this generated app will be preserved when updating
                  </p>
                </div>
              )}
              
              {/* Categories - Common for both types */}
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

              {/* Categories - Common for both types */}
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
              
              {/* Description - Common for both types */}
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
                        className="border-ink/10 bg-surface focus:border-amber-strong focus:ring-amber-strong/20 min-h-[100px]"
                      />
                    </FormControl>
                    <FormMessage className="text-danger" />
                  </FormItem>
                )}
              />
              
              <Button
                type="submit"
                className="w-full rounded-lg bg-amber-strong py-2 font-semibold text-white shadow-sm transition-all duration-300 hover:bg-amber-strong/90 hover:shadow-md"
              >
                Update App
              </Button>
            </form>
          </Form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
