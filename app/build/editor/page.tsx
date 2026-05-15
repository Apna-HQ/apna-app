"use client";

/**
 * /build/editor — In-browser single-file mini-app editor with live preview.
 *
 * Entry points:
 *   1. Write HTML/JS by hand in the textarea — live iframe preview updates on demand.
 *   2. Use the "Generate with AI" button (GenerateAppFab) to create initial source via
 *      OpenRouter — same flow as the /app page's GenerateAppFab, but the result drops
 *      into the editor instead of immediately launching a modal.
 *
 * Drafts are persisted in generatedAppsDB (IndexedDB) — same store as the existing
 * AI-generation flow, including the v2 migration.
 *
 * Publishing uses the SubmitApp drawer (inline wrapper below) with `hosting: 'nostr'`.
 * When the source fits in the metadata note it is inlined as `htmlContent`.
 * When the source exceeds INLINE_SIZE_LIMIT the publisher should store it in a
 * separate Kind-1 content event and reference it via `contentEventId` — the loader
 * in fetchAppList.ts handles both conventions.
 *
 * Design-selection sync is handled inside MiniAppModal (APNA-RD-HOST-016) — apps
 * previewed here receive `design:selections` events automatically on mount and on change.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { useGeneratedApps } from "@/lib/contexts/GeneratedAppsContext";
import { useOpenRouteApiKey } from "@/lib/hooks/useOpenRouteApiKey";
import { callOpenRouterApi } from "@/lib/utils/openRouterApi";
import { generatedAppsDB, ChatMessage, GeneratedApp } from "@/lib/generatedAppsDB";
import { createInitialMessages } from "@/lib/utils/htmlTemplates";
import { miniAppInstanceManager } from "@/lib/apna-host/instance-manager";
import { apnaHostCapabilities } from "@/lib/apna-host/capabilities";
import PermissionPrompt from "@/components/organisms/PermissionPrompt";
import type {
  PermissionPromptRequest,
  PermissionPromptResult,
} from "@/lib/apna-host/permissions";
import {
  getDesignSelections,
  subscribeToDesignSelections,
} from "@/lib/apna-host/design-selections";
import BottomNav from "@/components/organisms/BottomNav";
import CodeEditor from "@/components/molecules/CodeEditor";
import { ReplyToNote } from "@/lib/nostr";
import { getKeyPairFromLocalStorage } from "@/lib/utils";
import { APPS_ROOT_NOTE_ID } from "@/lib/constants";
import { APP_CATEGORIES, AppCategory } from "@/lib/types/apps";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Eye, Pencil } from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Nostr event content max safe size. Above this the source should go into a
 *  separate content event and be referenced via contentEventId.
 *  Kind-1 events typically have a relay-enforced max around 64 KiB; we use
 *  48 KiB as a conservative inline limit so the metadata note stays small. */
const INLINE_SIZE_LIMIT = 48 * 1024; // 48 KiB in bytes

const STARTER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>My Apna App</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; }
    h1 { color: #368564; }
  </style>
</head>
<body>
  <h1>Hello from Apna!</h1>
  <p id="status">Connecting…</p>
  <script type="module">
    const status = document.getElementById('status');

    try {
      const { ApnaApp } = await import(
        'https://esm.sh/@apna/sdk@0.3.2?bundle'
      );
      const apna = new ApnaApp({ appId: 'my-editor-app' });
      await apna.ready;
      status.textContent = 'Connected to Apna host.';

      try {
        const me = await apna.identity.me();
        status.textContent =
          'Signed in as: ' + (me?.metadata?.name || me?.npub?.slice(0, 16) || me?.pubkey?.slice(0, 12) || 'unknown');
      } catch (err) {
        status.textContent = 'Connected. Profile unavailable: ' + (err instanceof Error ? err.message : String(err));
      }
    } catch (err) {
      status.textContent = 'SDK init failed: ' + (err instanceof Error ? err.message : String(err));
    }
  </script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EditorPage() {
  // Editor state
  const [source, setSource] = useState(STARTER_HTML);
  const [previewKey, setPreviewKey] = useState(0); // bump to reload preview
  const [previewMode, setPreviewMode] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("My App");

  // AI generation
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const { apiKey, isLoaded: apiKeyLoaded } = useOpenRouteApiKey();
  const { createApp, updateApp } = useGeneratedApps();

  // Publish
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<AppCategory[]>([]);
  const [publishDescription, setPublishDescription] = useState("");

  // Persist draft to IndexedDB on source change (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const permissionResolverRef = useRef<
    ((permissions: PermissionPromptResult) => void) | null
  >(null);
  const [previewIframeEl, setPreviewIframeEl] =
    useState<HTMLIFrameElement | null>(null);
  const [permissionRequest, setPermissionRequest] =
    useState<PermissionPromptRequest | null>(null);

  const attachPreviewIframe = useCallback((el: HTMLIFrameElement | null) => {
    setPreviewIframeEl(el);
  }, []);

  useEffect(() => {
    if (!previewMode || !previewIframeEl) return;

    const designRemote =
      typeof window !== "undefined"
        ? `${window.location.origin}/_next/static/chunks/remoteEntry.js`
        : undefined;

    const instance = miniAppInstanceManager.create({
      appId: draftId ?? "build-editor-preview",
      appName: draftName || "Build preview",
      iframe: previewIframeEl,
      handlers: apnaHostCapabilities,
      designRemote,
      permissionPrompt: (request) =>
        new Promise((resolve) => {
          permissionResolverRef.current = resolve;
          setPermissionRequest(request);
        }),
    });

    const sendInitialSelections = setTimeout(() => {
      instance.emit("design:selections", getDesignSelections());
    }, 500);

    const unsubscribeSelections = subscribeToDesignSelections((selections) => {
      instance.emit("design:selections", selections);
    });

    return () => {
      clearTimeout(sendInitialSelections);
      unsubscribeSelections();
      instance.dispose();
      permissionResolverRef.current?.([]);
      permissionResolverRef.current = null;
      setPermissionRequest(null);
    };
  }, [draftId, draftName, previewMode, previewIframeEl]);

  const saveDraft = useCallback(
    async (src: string, name: string, id: string | null) => {
      try {
        if (id) {
          await generatedAppsDB.updateApp(id, {
            htmlContent: src,
            htmlContents: [src],
            name,
          });
        } else {
          const newId = nanoid();
          await generatedAppsDB.addApp({
            id: newId,
            name,
            htmlContent: src,
            htmlContents: [src],
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          setDraftId(newId);
          return newId;
        }
        return id;
      } catch (err) {
        console.error("Failed to save draft:", err);
        return id;
      }
    },
    []
  );

  const handleSourceChange = (value: string) => {
    setSource(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft(value, draftName, draftId);
    }, 1000);
  };

  // Run preview
  const handleRunPreview = () => {
    setPreviewKey((k) => k + 1);
    setPreviewMode(true);
  };

  // AI generation
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setAiError("Please describe what you want to build.");
      return;
    }
    if (!apiKey) {
      setAiError("OpenRoute API key required — add it in Settings.");
      return;
    }
    setIsGenerating(true);
    setAiError(null);
    try {
      const messages = createInitialMessages(prompt.trim());
      const data = await callOpenRouterApi({ messages, apiKey });
      if (data.html) {
        setSource(data.html);
        setPreviewKey((k) => k + 1);

        // Persist as a named draft
        const newId = nanoid();
        await generatedAppsDB.addApp({
          id: newId,
          name: draftName || "Generated App",
          htmlContent: data.html,
          htmlContents: [data.html],
          messages: data.messages,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        setDraftId(newId);
        setIsAiOpen(false);
        setPrompt("");
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsGenerating(false);
    }
  };

  // Publish (hosting: 'nostr')
  const handlePublish = async () => {
    const keyPair = getKeyPairFromLocalStorage();
    if (!keyPair) {
      setPublishError("No keypair found. Please set up your profile first.");
      setPublishStatus("error");
      return;
    }
    if (selectedCategories.length === 0) {
      setPublishError("Please select at least one category.");
      return;
    }
    if (publishDescription.length < 10) {
      setPublishError("Description must be at least 10 characters.");
      return;
    }

    setPublishStatus("submitting");
    setPublishError(null);

    try {
      const sourceBytes = new TextEncoder().encode(source).length;

      let submitData: Record<string, unknown>;

      if (sourceBytes <= INLINE_SIZE_LIMIT) {
        // Inline the source in the metadata note.
        submitData = {
          appName: draftName,
          htmlContent: source,
          hosting: "nostr",
          isGeneratedApp: true, // back-compat for old loaders
          categories: selectedCategories,
          mode: "Full-page",
          description: publishDescription,
        };
      } else {
        // Source is too large to inline — publish it as a separate Kind-1 event
        // and reference it via contentEventId.
        //
        // We publish the raw source as a plain text Kind-1 note, then reference
        // its id in the metadata note.  The loader in fetchAppList.ts will fetch
        // the content event and use its `.content` field as the HTML source.
        const contentEvent = await ReplyToNote(
          APPS_ROOT_NOTE_ID,
          source,
          keyPair.nsec
        );
        if (!contentEvent?.id) throw new Error("Failed to publish content event.");

        submitData = {
          appName: draftName,
          hosting: "nostr",
          isGeneratedApp: true, // back-compat
          contentEventId: contentEvent.id,
          categories: selectedCategories,
          mode: "Full-page",
          description: publishDescription,
        };
      }

      const response = await ReplyToNote(
        APPS_ROOT_NOTE_ID,
        JSON.stringify(submitData),
        keyPair.nsec
      );

      // Update draft published status if it's in the DB
      if (draftId && response?.id) {
        try {
          const app = await generatedAppsDB.getApp(draftId);
          if (app) {
            const published = app.published ?? new Array(app.htmlContents.length).fill(undefined);
            published[0] = response.id;
            await generatedAppsDB.updateApp(draftId, { published });
          }
        } catch {
          // Non-critical
        }
      }

      setPublishStatus("success");
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Unknown error");
      setPublishStatus("error");
    }
  };

  const toggleCategory = (cat: AppCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  return (
    <>
      <div className="min-h-[100dvh] bg-[#f8faf9] flex flex-col pb-16">
        {/* ---- Header ---- */}
        <header className="border-b border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
          <Link
            href="/build"
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <span aria-hidden>&#8592;</span> Build
          </Link>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="flex-1 min-w-0 text-sm font-medium bg-transparent border-none outline-none text-gray-900 placeholder:text-gray-400"
            placeholder="App name…"
          />
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle edit / preview */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!previewMode) handleRunPreview();
                else setPreviewMode(false);
              }}
              className="text-xs gap-1"
            >
              {previewMode ? (
                <>
                  <Pencil className="h-3 w-3" /> Edit
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3" /> Preview
                </>
              )}
            </Button>

            {/* AI generate */}
            {apiKeyLoaded && apiKey && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAiOpen(true)}
                className="text-xs"
              >
                AI
              </Button>
            )}

            {/* Publish */}
            <Button
              size="sm"
              className="text-xs bg-[#368564] hover:bg-[#2a6b4f] text-white"
              onClick={() => {
                setPublishStatus("idle");
                setPublishError(null);
                setIsPublishOpen(true);
              }}
            >
              Publish
            </Button>
          </div>
        </header>

        {/* ---- Main area ---- */}
        <main className="flex-1 relative overflow-hidden">
          {/* Editor panel */}
          <div
            className={`absolute inset-0 ${
              previewMode ? "opacity-0 pointer-events-none" : "opacity-100"
            } transition-opacity`}
          >
            <CodeEditor
              value={source}
              onChange={handleSourceChange}
              language="html"
              ariaLabel="HTML source editor"
            />
          </div>

          {/* Preview panel */}
          <div
            className={`absolute inset-0 ${
              previewMode ? "opacity-100" : "opacity-0 pointer-events-none"
            } transition-opacity bg-white`}
          >
            {previewMode && (
              <iframe
                key={previewKey}
                ref={attachPreviewIframe}
                srcDoc={source}
                className="w-full h-full border-none"
                sandbox="allow-scripts allow-same-origin allow-forms"
                title="App preview"
              />
            )}
          </div>
        </main>

        {/* ---- Status bar ---- */}
        <footer className="border-t border-gray-200 bg-white px-4 py-1 flex items-center justify-between text-xs text-gray-400">
          <span>
            {new TextEncoder().encode(source).length.toLocaleString()} bytes
            {new TextEncoder().encode(source).length > INLINE_SIZE_LIMIT && (
              <span className="ml-2 text-amber-600">
                (large — will use referenced content event on publish)
              </span>
            )}
          </span>
          <span>
            {draftId ? "Draft saved" : "Unsaved"}
          </span>
        </footer>
      </div>

      <BottomNav />

      {permissionRequest && (
        <PermissionPrompt
          open={!!permissionRequest}
          appId={permissionRequest.appId}
          appName={permissionRequest.appName}
          capabilities={permissionRequest.capabilities}
          onResolve={(permissions) => {
            permissionResolverRef.current?.(permissions);
            permissionResolverRef.current = null;
            setPermissionRequest(null);
          }}
          onCancel={() => {
            permissionResolverRef.current?.(
              permissionRequest.capabilities.map((capability) => ({
                capability,
                decision: "deny",
                scope: "once",
              }))
            );
            permissionResolverRef.current = null;
            setPermissionRequest(null);
          }}
        />
      )}

      {/* ---- AI Generation Dialog ---- */}
      <Dialog open={isAiOpen} onOpenChange={setIsAiOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate with AI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!apiKey && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">
                  OpenRoute API key required. Add it in{" "}
                  <Link href="/settings" className="underline">
                    Settings
                  </Link>
                  .
                </p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">App name</p>
              <input
                type="text"
                className="w-full p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#368564]"
                placeholder="Generated App"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                disabled={isGenerating}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">Describe your app</p>
              <textarea
                className="w-full min-h-[100px] p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#368564]"
                placeholder="e.g. a timer app that uses the Apna identity"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating || !apiKey}
              />
              {aiError && <p className="text-sm text-red-500">{aiError}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setIsAiOpen(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              className="bg-[#368564] hover:bg-[#2c6b51] text-white"
              disabled={isGenerating || !apiKey}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Publish Drawer ---- */}
      <Drawer
        open={isPublishOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsPublishOpen(false);
            if (publishStatus === "success") {
              setPublishStatus("idle");
              setSelectedCategories([]);
              setPublishDescription("");
            }
          }
        }}
      >
        <DrawerContent>
          <div className="mx-auto w-full max-w-lg">
            <DrawerHeader className="border-b border-gray-100 pb-4 px-4">
              <DrawerTitle className="text-xl font-semibold text-[#368564]">
                Publish to Nostr
              </DrawerTitle>
              <DrawerDescription className="text-gray-500 text-sm">
                Your app source is published directly to Nostr — no URL or hosting required.
              </DrawerDescription>
            </DrawerHeader>

            <div className="p-4 space-y-5">
              {publishStatus === "success" ? (
                <div className="text-center py-6">
                  <p className="text-[#368564] font-semibold text-lg mb-2">Published!</p>
                  <p className="text-gray-500 text-sm">
                    Your app is live on Nostr and will appear in{" "}
                    <Link href="/explore" className="underline text-[#368564]">
                      Explore
                    </Link>{" "}
                    shortly.
                  </p>
                  <Button
                    className="mt-4 bg-[#368564] hover:bg-[#2a6b4f] text-white"
                    onClick={() => setIsPublishOpen(false)}
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <>
                  {/* App name */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">App name</label>
                    <input
                      type="text"
                      className="w-full p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#368564]"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      className="w-full min-h-[80px] p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#368564]"
                      placeholder="Describe your app (min 10 characters)"
                      value={publishDescription}
                      onChange={(e) => setPublishDescription(e.target.value)}
                      maxLength={500}
                    />
                  </div>

                  {/* Categories */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Categories (select at least one)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {APP_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          className={`rounded-full px-3 py-1 text-sm border transition-colors ${
                            selectedCategories.includes(cat)
                              ? "bg-[#368564] text-white border-[#368564]"
                              : "bg-white text-gray-700 border-gray-200 hover:bg-[#e6efe9]"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Info box about hosting */}
                  <div className="p-3 bg-[#e6efe9] rounded-lg text-xs text-[#368564]">
                    <strong>hosting: &apos;nostr&apos;</strong> — the full source is stored on
                    Nostr relays.{" "}
                    {new TextEncoder().encode(source).length > INLINE_SIZE_LIMIT
                      ? "Your source exceeds 48 KiB and will be published via a referenced content event."
                      : "Your source is small enough to inline in the metadata note."}
                  </div>

                  {publishError && (
                    <p className="text-sm text-red-500">{publishError}</p>
                  )}

                  <Button
                    className="w-full bg-[#368564] hover:bg-[#2a6b4f] text-white font-semibold py-2 rounded-lg"
                    onClick={handlePublish}
                    disabled={publishStatus === "submitting"}
                  >
                    {publishStatus === "submitting" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Publishing…
                      </>
                    ) : (
                      "Publish App"
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
