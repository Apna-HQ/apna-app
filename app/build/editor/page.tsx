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
import { usePermissionPromptQueue } from "@/lib/apna-host/use-permission-prompt-queue";
import {
  getDesignSelections,
  subscribeToDesignSelections,
} from "@/lib/apna-host/design-selections";
import BottomNav from "@/components/organisms/BottomNav";
import CodeEditor from "@/components/molecules/CodeEditor";
import { ReplyToRootNote } from "@/lib/nostr";
import { signOnly } from "@/lib/nostr/events";
import { revalidateTags } from "@/app/actions/feedback";
import { blossomUpload, DEFAULT_BLOSSOM_SERVERS } from "@/lib/blossom";
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

/**
 * Starter app shown when the editor first opens.
 *
 * Designed as a "look how little code you need" demo:
 *   - one import for the SDK
 *   - one constructor for the host bridge
 *   - one line each for identity, feed, and publish
 *
 * Every async step shows a spinner / success / error state so users
 * can see exactly what the SDK is doing on their behalf — no silent
 * blank screens.
 */
const STARTER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>My Apna App</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 16px;
      background: #f8faf9;
      color: #1f2937;
      line-height: 1.5;
    }
    h1 { color: #368564; font-size: 1.5rem; margin: 0 0 4px; }
    .sub { color: #6b7280; font-size: 0.875rem; margin: 0 0 16px; }
    .card {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 12px;
    }
    .card h2 {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6b7280;
      margin: 0 0 10px;
    }
    .card h2 code {
      text-transform: none;
      letter-spacing: 0;
      color: #368564;
      background: #e6efe9;
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 0.95em;
    }
    .profile { display: flex; align-items: center; gap: 12px; }
    .avatar {
      width: 44px; height: 44px; border-radius: 50%;
      background: #e6efe9; flex-shrink: 0; object-fit: cover;
    }
    .name { font-weight: 600; color: #111827; }
    .npub { font-size: 0.75rem; color: #6b7280; word-break: break-all; }
    .note {
      padding: 12px 0;
      border-top: 1px solid #f3f4f6;
      font-size: 0.875rem;
    }
    .note:first-child { border-top: none; padding-top: 0; }
    .note-head {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 6px;
    }
    .note-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: #e6efe9; flex-shrink: 0; object-fit: cover;
    }
    .note-author { font-weight: 600; color: #111827; font-size: 0.85rem; line-height: 1.2; }
    .note-author .skeleton {
      display: inline-block; width: 110px; height: 10px;
      background: #eef2f0; border-radius: 4px;
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
    .note .meta { font-size: 0.7rem; color: #9ca3af; line-height: 1.2; }
    .note-body { white-space: pre-wrap; word-break: break-word; color: #1f2937; }
    button {
      background: #368564; color: #fff;
      border: none; border-radius: 8px;
      padding: 10px 14px; font-size: 0.875rem; font-weight: 600;
      cursor: pointer; width: 100%;
    }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .status { font-size: 0.85rem; color: #6b7280; }
    .status.ok { color: #1f2937; }
    .status.err { color: #b91c1c; }
    .spinner {
      display: inline-block;
      width: 12px; height: 12px;
      border: 2px solid #e5e7eb;
      border-top-color: #368564;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      vertical-align: -1px;
      margin-right: 6px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hint {
      font-size: 0.75rem; color: #9ca3af; margin-top: 16px; text-align: center;
    }
    .controls {
      display: flex; gap: 6px; align-items: center;
      margin-bottom: 10px; flex-wrap: wrap;
    }
    .controls label {
      font-size: 0.7rem; color: #6b7280;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .pill {
      background: #fff; border: 1px solid #d1d5db;
      border-radius: 999px; padding: 3px 10px;
      font-size: 0.75rem; cursor: pointer;
      color: #374151; transition: all 0.15s;
      width: auto; font-weight: 500;
    }
    .pill.active {
      background: #368564; border-color: #368564; color: #fff;
    }
    .pill:disabled { opacity: 0.5; cursor: not-allowed; }
    .ghost-btn {
      background: transparent; color: #368564;
      border: 1px solid #368564; border-radius: 8px;
      padding: 8px 14px; font-size: 0.8rem; font-weight: 600;
      cursor: pointer; width: 100%; margin-top: 10px;
    }
    .ghost-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .meter {
      font-size: 0.7rem; color: #9ca3af; text-align: right;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <h1>Hello from Apna 👋</h1>
  <p class="sub">Each card below is <strong>one SDK call</strong>. No relay code, no signing, no nostr-tools.</p>

  <div class="card">
    <h2>Who am I — <code>apna.identity.me()</code></h2>
    <div id="me" class="status"><span class="spinner"></span>Connecting to the Apna host…</div>
  </div>

  <div class="card">
    <h2>Following feed — <code>apna.social.feed()</code></h2>
    <div class="controls">
      <label>limit</label>
      <button class="pill" data-limit="5">5</button>
      <button class="pill active" data-limit="10">10</button>
      <button class="pill" data-limit="20">20</button>
    </div>
    <div id="feed" class="status"><span class="spinner"></span>Loading notes from people you follow…</div>
    <button id="loadOlder" class="ghost-btn" style="display:none;">Load older notes ↓</button>
    <p id="feedMeter" class="meter"></p>
  </div>

  <div class="card">
    <h2>Publish a note — <code>apna.social.publishNote()</code></h2>
    <button id="publish" disabled>Loading SDK…</button>
    <p id="publishStatus" class="status" style="margin-top:10px;min-height:18px;"></p>
  </div>

  <p class="hint">Edit anything in the editor — preview reloads instantly.</p>

  <script type="module">
    const $ = (id) => document.getElementById(id);
    const setStatus = (el, html, cls) => {
      el.innerHTML = html;
      el.className = 'status' + (cls ? ' ' + cls : '');
    };
    const esc = (s) =>
      String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
      ));

    // 1. One import + one constructor wires up the full host bridge:
    //    capability negotiation, RPC correlation, permission gating —
    //    all hidden behind \`await apna.ready\`.
    const { ApnaApp } = await import('https://esm.sh/@apna/sdk@0.3.2?bundle');
    const apna = new ApnaApp({ appId: 'my-editor-app' });
    await apna.ready;

    // 2. Identity — returns the active user's profile (npub + kind-0
    //    metadata) without you ever touching a relay or NIP-19 encoder.
    (async () => {
      try {
        const me = await apna.identity.me();
        const meta = (me && me.metadata) || {};
        const name = meta.name || meta.display_name || 'Anonymous Nostrich';
        const pic = meta.picture;
        const npub = (me && (me.npub || me.pubkey)) || '';
        setStatus($('me'),
          '<div class="profile">' +
          (pic
            ? '<img class="avatar" src="' + esc(pic) + '" alt="" referrerpolicy="no-referrer" />'
            : '<div class="avatar"></div>') +
          '<div>' +
            '<div class="name">' + esc(name) + '</div>' +
            '<div class="npub">' + esc(npub.slice(0, 28)) + (npub.length > 28 ? '…' : '') + '</div>' +
          '</div></div>',
          'ok'
        );
      } catch (err) {
        setStatus($('me'), '⚠ ' + esc(err && err.message || err), 'err');
      }
    })();

    // 3. Feed — under the hood the host loads your kind-3 contact list,
    //    batches kind-1 queries across multiple relays, dedupes, sorts,
    //    and hands you a clean array. From here, it's one line.
    //
    //    This card showcases three knobs of the same call:
    //      • limit  → fetch N notes (pick a pill: 5 / 10 / 20)
    //      • until  → pagination cursor for "load older"
    //      • since  → (used by refresh flows; not wired into the UI here)
    //
    //    Each note is enriched with apna.social.userMetadata(pubkey),
    //    one call per unique author, fanned out in parallel and dropped
    //    into the DOM as each one resolves.
    const FeedState = {
      limit: 10,
      notes: [],                  // accumulated feed events (newest first)
      metaCache: new Map(),       // pubkey -> metadata
      loadingOlder: false,
    };

    const renderFeed = () => {
      const list = FeedState.notes;
      if (!list.length) {
        setStatus($('feed'), 'No notes yet — try following a few people on Nostr.', 'ok');
        $('loadOlder').style.display = 'none';
        $('feedMeter').textContent = '';
        return;
      }
      $('feed').className = '';
      $('feed').innerHTML = list.map((e, i) => {
        const when = new Date(e.created_at * 1000).toLocaleString();
        const body = e.content.length > 220 ? e.content.slice(0, 220) + '…' : e.content;
        const cached = FeedState.metaCache.get(e.pubkey);
        const name = cached ? (cached.name || cached.display_name || (e.pubkey.slice(0, 10) + '…')) : null;
        const pic = cached && cached.picture;
        return '<div class="note" data-i="' + i + '">' +
          '<div class="note-head">' +
            (pic
              ? '<img class="note-avatar" id="av-' + i + '" src="' + esc(pic) + '" alt="" referrerpolicy="no-referrer" />'
              : '<div class="note-avatar" id="av-' + i + '"></div>') +
            '<div>' +
              '<div class="note-author" id="au-' + i + '">' +
                (name ? esc(name) : '<span class="skeleton"></span>') +
              '</div>' +
              '<div class="meta">' + esc(when) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="note-body">' + esc(body) + '</div>' +
        '</div>';
      }).join('');
      $('loadOlder').style.display = 'block';
      $('feedMeter').textContent =
        'Showing ' + list.length + ' note' + (list.length === 1 ? '' : 's') +
        ' · limit=' + FeedState.limit;
    };

    const hydrateAuthors = async () => {
      const need = [...new Set(FeedState.notes.map((e) => e.pubkey))]
        .filter((pk) => !FeedState.metaCache.has(pk));
      await Promise.all(need.map(async (pubkey) => {
        let meta = {};
        try {
          meta = (await apna.social.userMetadata(pubkey)) || {};
        } catch (_) { /* fall back to truncated pubkey */ }
        FeedState.metaCache.set(pubkey, meta);
        const name = meta.name || meta.display_name || (pubkey.slice(0, 10) + '…');
        const pic = meta.picture;
        FeedState.notes.forEach((e, i) => {
          if (e.pubkey !== pubkey) return;
          const av = $('av-' + i);
          const au = $('au-' + i);
          if (pic && av) {
            av.outerHTML = '<img class="note-avatar" id="av-' + i +
              '" src="' + esc(pic) + '" alt="" referrerpolicy="no-referrer" />';
          }
          if (au) au.textContent = name;
        });
      }));
    };

    const loadFeed = async () => {
      setStatus($('feed'), '<span class="spinner"></span>Fetching latest ' + FeedState.limit + ' notes…');
      $('loadOlder').style.display = 'none';
      $('feedMeter').textContent = '';
      try {
        const events = await apna.social.feed('FOLLOWING_FEED', { limit: FeedState.limit });
        FeedState.notes = events;
        renderFeed();
        hydrateAuthors();
      } catch (err) {
        setStatus($('feed'), '⚠ ' + esc(err && err.message || err), 'err');
      }
    };

    // Pagination — fetch older notes by passing the oldest visible
    // timestamp as the "until" cursor. The host returns the next page,
    // we de-dupe by id and append.
    $('loadOlder').onclick = async () => {
      if (FeedState.loadingOlder || !FeedState.notes.length) return;
      FeedState.loadingOlder = true;
      const btn = $('loadOlder');
      btn.disabled = true;
      btn.textContent = 'Loading older…';
      const oldestTs = FeedState.notes[FeedState.notes.length - 1].created_at;
      try {
        const older = await apna.social.feed('FOLLOWING_FEED', {
          until: oldestTs,
          limit: FeedState.limit,
        });
        const seen = new Set(FeedState.notes.map((e) => e.id));
        const unique = older.filter((e) => !seen.has(e.id));
        if (!unique.length) {
          btn.textContent = '— no older notes found —';
        } else {
          FeedState.notes = FeedState.notes.concat(unique)
            .sort((a, b) => b.created_at - a.created_at);
          renderFeed();
          hydrateAuthors();
        }
      } catch (err) {
        btn.textContent = '⚠ ' + (err && err.message || err);
      } finally {
        FeedState.loadingOlder = false;
        btn.disabled = false;
      }
    };

    // Limit pills — clicking a pill changes the limit and refetches.
    document.querySelectorAll('[data-limit]').forEach((pill) => {
      pill.onclick = () => {
        FeedState.limit = Number(pill.dataset.limit);
        document.querySelectorAll('[data-limit]').forEach((p) =>
          p.classList.toggle('active', p === pill));
        loadFeed();
      };
    });

    loadFeed();

    // 4. Publish — one call. The host signs with the active user's key
    //    and fans the event out to every relay they've configured.
    const btn = $('publish');
    btn.textContent = 'Publish "Hello from my mini-app!"';
    btn.disabled = false;
    btn.onclick = async () => {
      const status = $('publishStatus');
      btn.disabled = true;
      setStatus(status, '<span class="spinner"></span>Asking the host to sign and broadcast…');
      try {
        const note = await apna.social.publishNote(
          'Hello from my mini-app, built in the Apna browser editor!'
        );
        setStatus(status,
          '✓ Published. Event id: <code>' + esc(note.id.slice(0, 16)) + '…</code>',
          'ok'
        );
      } catch (err) {
        setStatus(status, '⚠ ' + esc(err && err.message || err), 'err');
      } finally {
        btn.disabled = false;
      }
    };
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
  // Hosting strategy chosen at publish time.
  //  - 'auto'    : inline if ≤ 48 KiB, else fall back to a Kind-1 content event
  //  - 'blossom' : always upload the source to a Blossom server (BUD-01) and
  //                reference it from the metadata note via { blossomUrl, sha256 }
  const [hostingChoice, setHostingChoice] = useState<"auto" | "blossom">("auto");
  const [blossomServer, setBlossomServer] = useState<string>(DEFAULT_BLOSSOM_SERVERS[0]);
  const [publishStep, setPublishStep] = useState<string | null>(null);
  const [lastPublish, setLastPublish] = useState<{
    metadataId: string;
    hosting: "nostr-inline" | "nostr-content-event" | "blossom";
    blossomUrl?: string;
    sha256?: string;
  } | null>(null);

  // Persist draft to IndexedDB on source change (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewIframeEl, setPreviewIframeEl] =
    useState<HTMLIFrameElement | null>(null);
  const {
    activePermissionRequest,
    permissionPrompt,
    resolveActivePermissionPrompt,
    cancelActivePermissionPrompt,
    clearPermissionPrompts,
  } = usePermissionPromptQueue();

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
      permissionPrompt,
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
      clearPermissionPrompts();
    };
  }, [
    clearPermissionPrompts,
    draftId,
    draftName,
    permissionPrompt,
    previewIframeEl,
    previewMode,
  ]);

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

  // Publish: routes the source through one of three strategies and posts the
  // metadata note to APPS_ROOT_NOTE_ID. Strategy is decided by `hostingChoice`:
  //   - 'auto'    -> inline (≤ 48 KiB) or Kind-1 content event (> 48 KiB)
  //   - 'blossom' -> always upload to a Blossom server, reference by URL + hash
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
    setPublishStep(null);
    setLastPublish(null);

    try {
      const sourceBytes = new TextEncoder().encode(source).length;
      let submitData: Record<string, unknown>;
      let hostingTag: "nostr-inline" | "nostr-content-event" | "blossom";
      let blossomDescriptor: { url: string; sha256: string } | null = null;

      // Resolve the right token for the host's signer abstraction. Remote-
      // signer (NIP-46) profiles store no nsec locally, so we have to route
      // via the npub. Used by both the Blossom upload AND the metadata-note
      // publish below — every step needs to support every signer type.
      const signingSource =
        keyPair.signerType === "nip07"
          ? "nip07"
          : keyPair.signerType === "nip46"
            ? keyPair.npub
            : keyPair.nsec;

      if (hostingChoice === "blossom") {
        // 1) Upload to Blossom first. We delegate signing of the Kind-24242
        //    auth event to the host's `signOnly()` so the upload works for
        //    any profile type.
        setPublishStep(`Uploading source to ${blossomServer}…`);
        const descriptor = await blossomUpload({
          server: blossomServer,
          signEvent: async (template) => signOnly(signingSource, template),
          data: source,
          contentType: "text/html",
          description: `${draftName} mini-app source for Apna`,
        });
        blossomDescriptor = { url: descriptor.url, sha256: descriptor.sha256 };
        hostingTag = "blossom";

        submitData = {
          appName: draftName,
          hosting: "blossom",
          isGeneratedApp: true, // back-compat alias for old loaders
          blossomUrl: descriptor.url,
          sha256: descriptor.sha256,
          categories: selectedCategories,
          mode: "Full-page",
          description: publishDescription,
        };
      } else if (sourceBytes <= INLINE_SIZE_LIMIT) {
        // Inline the source in the metadata note.
        hostingTag = "nostr-inline";
        submitData = {
          appName: draftName,
          htmlContent: source,
          hosting: "nostr",
          isGeneratedApp: true,
          categories: selectedCategories,
          mode: "Full-page",
          description: publishDescription,
        };
      } else {
        // Too large to inline — publish raw source as its own Kind-1 event and
        // reference it via contentEventId. fetchAppList.ts then fetches that
        // event and uses its `.content` as the HTML source.
        setPublishStep("Publishing source as a Nostr content event…");
        const contentEvent = await ReplyToRootNote(
          APPS_ROOT_NOTE_ID,
          source,
          signingSource
        );
        if (!contentEvent?.id) throw new Error("Failed to publish content event.");
        hostingTag = "nostr-content-event";
        submitData = {
          appName: draftName,
          hosting: "nostr",
          isGeneratedApp: true,
          contentEventId: contentEvent.id,
          categories: selectedCategories,
          mode: "Full-page",
          description: publishDescription,
        };
      }

      setPublishStep("Signing & broadcasting metadata note…");
      const response = await ReplyToRootNote(
        APPS_ROOT_NOTE_ID,
        JSON.stringify(submitData),
        signingSource
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

      setLastPublish({
        metadataId: response?.id ?? "",
        hosting: hostingTag,
        blossomUrl: blossomDescriptor?.url,
        sha256: blossomDescriptor?.sha256,
      });

      // Invalidate the cached app list so /explore shows the new entry
      // on its next render instead of waiting up to 5 min for the
      // unstable_cache TTL.
      try {
        await revalidateTags(["ApnaMiniAppDetails", APPS_ROOT_NOTE_ID]);
      } catch {
        // Non-critical — cache will still refresh eventually.
      }

      setPublishStep(null);
      setPublishStatus("success");
    } catch (err) {
      setPublishStep(null);
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

      {activePermissionRequest && (
        <PermissionPrompt
          open={!!activePermissionRequest}
          appId={activePermissionRequest.appId}
          appName={activePermissionRequest.appName}
          capabilities={activePermissionRequest.capabilities}
          onResolve={resolveActivePermissionPrompt}
          onCancel={cancelActivePermissionPrompt}
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
                <div className="text-center py-6 space-y-3">
                  <p className="text-[#368564] font-semibold text-lg">Published!</p>
                  <p className="text-gray-500 text-sm">
                    Your app is live and will appear in{" "}
                    <Link href="/explore" className="underline text-[#368564]">
                      Explore
                    </Link>{" "}
                    shortly.
                  </p>
                  {lastPublish && (
                    <div className="mx-auto max-w-sm rounded-lg border border-gray-100 bg-gray-50 p-3 text-left text-xs text-gray-600 space-y-1">
                      <div>
                        <span className="font-medium text-gray-500">hosting:</span>{" "}
                        <code className="text-[#368564]">{lastPublish.hosting}</code>
                      </div>
                      {lastPublish.blossomUrl && (
                        <div className="truncate">
                          <span className="font-medium text-gray-500">blob:</span>{" "}
                          <a
                            href={lastPublish.blossomUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#368564] underline"
                          >
                            {lastPublish.blossomUrl}
                          </a>
                        </div>
                      )}
                      {lastPublish.sha256 && (
                        <div className="truncate">
                          <span className="font-medium text-gray-500">sha256:</span>{" "}
                          <code className="text-gray-700">{lastPublish.sha256.slice(0, 24)}…</code>
                        </div>
                      )}
                      {lastPublish.metadataId && (
                        <div className="truncate">
                          <span className="font-medium text-gray-500">note id:</span>{" "}
                          <code className="text-gray-700">{lastPublish.metadataId.slice(0, 24)}…</code>
                        </div>
                      )}
                    </div>
                  )}
                  <Button
                    className="bg-[#368564] hover:bg-[#2a6b4f] text-white"
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

                  {/* Hosting strategy */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Hosting</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setHostingChoice("auto")}
                        className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                          hostingChoice === "auto"
                            ? "border-[#368564] bg-[#e6efe9] text-[#1f3a2a]"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <div className="font-semibold text-sm">Nostr (auto)</div>
                        <div className="mt-1 text-[11px] leading-snug opacity-80">
                          Inline if ≤ 48 KiB, otherwise a referenced Kind-1 content event.
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setHostingChoice("blossom")}
                        className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                          hostingChoice === "blossom"
                            ? "border-[#368564] bg-[#e6efe9] text-[#1f3a2a]"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <div className="font-semibold text-sm">Blossom 🌸</div>
                        <div className="mt-1 text-[11px] leading-snug opacity-80">
                          Content-addressed blob storage. Bigger apps, hash-verified.
                        </div>
                      </button>
                    </div>

                    {hostingChoice === "blossom" && (
                      <div className="space-y-1 pt-1">
                        <label className="text-xs font-medium text-gray-500">Blossom server</label>
                        <select
                          className="w-full rounded-md border p-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#368564]"
                          value={blossomServer}
                          onChange={(e) => setBlossomServer(e.target.value)}
                        >
                          {DEFAULT_BLOSSOM_SERVERS.map((s) => (
                            <option key={s} value={s}>
                              {s.replace(/^https?:\/\//, "")}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="p-3 bg-[#e6efe9] rounded-lg text-xs text-[#368564]">
                      {hostingChoice === "blossom" ? (
                        <>
                          The source will be uploaded to{" "}
                          <strong>{blossomServer.replace(/^https?:\/\//, "")}</strong>{" "}
                          and referenced by{" "}
                          <code className="bg-white/60 px-1 rounded">blossomUrl</code> +{" "}
                          <code className="bg-white/60 px-1 rounded">sha256</code> in the metadata note.
                          The loader verifies the hash on every fetch.
                        </>
                      ) : (
                        <>
                          <strong>hosting: &apos;nostr&apos;</strong> — full source stored on
                          Nostr relays.{" "}
                          {new TextEncoder().encode(source).length > INLINE_SIZE_LIMIT
                            ? "Source exceeds 48 KiB and will be published via a referenced content event."
                            : "Source fits inline in the metadata note."}
                        </>
                      )}
                    </div>
                  </div>

                  {publishStep && (
                    <p className="flex items-center gap-2 text-xs text-gray-600">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {publishStep}
                    </p>
                  )}

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
