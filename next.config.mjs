import nextPWA from "next-pwa";

// ── Module Federation expose map ─────────────────────────────────────────────
// Remote name: designRemote
// remoteEntry URL (production): <host-origin>/_next/static/chunks/remoteEntry.js
// Each key is the import path mini-apps use, e.g. `designRemote/Button`.
const MF_EXPOSES = {
  "./Button":   "./components/design-remote/Button.tsx",
  "./Card":     "./components/design-remote/Card.tsx",
  "./Input":    "./components/design-remote/Input.tsx",
  "./Textarea": "./components/design-remote/Textarea.tsx",
  "./Avatar":   "./components/design-remote/Avatar.tsx",
  "./Label":    "./components/design-remote/Label.tsx",
};

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false, // Enable React strict mode for improved error handling
    swcMinify: true,      // Enable SWC minification for improved performance
    compiler: {
        removeConsole: process.env.NODE_ENV !== "development", // Remove console.log in production
    },
    images: {
        remotePatterns: [{hostname:'*'}]
    },
    experimental: {
        // Next.js 14 disables the build worker when a custom webpack function is
        // present (next/dist/build/index.js:763). Force it back on so the server
        // and client compilers run in separate worker processes — this preserves
        // the behaviour that existed before we added the MF webpack callback and
        // prevents the pages-manifest.json ENOENT race that appears otherwise.
        webpackBuildWorker: true,
    },

    /**
     * Webpack customisation — runs before next-pwa's Workbox layer.
     *
     * We use webpack's own built-in ModuleFederationPlugin (webpack.container.ModuleFederationPlugin)
     * which works with App Router unlike @module-federation/nextjs-mf (pages-only).
     *
     * Only the CLIENT compiler emits remoteEntry.js; the server compiler is skipped.
     * next-pwa's buildExcludes strips remoteEntry.js from the SW pre-cache manifest.
     */
    webpack(config, { webpack, isServer }) {
        if (!isServer) {
            // NOTE on `shared`: we intentionally do NOT share `react` / `react-dom`
            // with the remote. Next.js's chunk-splitting interferes with MF's
            // shared-module hoisting in App Router — sharing eagerly throws
            // "ReactCurrentDispatcher of undefined" at runtime, and sharing
            // non-eagerly throws "Shared module is not available for eager
            // consumption". The leaf design-system components exposed here
            // (Button/Card/Input/Textarea/Avatar/Label) render their own subtree
            // and don't rely on host-side React context, so each consumer loads
            // its own React. If a future exposed component DOES require shared
            // React state, switch to the official @module-federation/nextjs-mf
            // plugin (currently pages-router only) or migrate that component
            // out of the remote.
            config.plugins.push(
                new webpack.container.ModuleFederationPlugin({
                    name: "designRemote",
                    filename: "static/chunks/remoteEntry.js",
                    exposes: MF_EXPOSES,
                }),
            );
        }
        return config;
    },
};

// Configuration object tells the next-pwa plugin
const withPWA = nextPWA({
    dest: "public", // Destination directory for the PWA files
    // disable: process.env.NODE_ENV === "development", // Disable PWA in development mode
    register: true, // Register the PWA service worker
    skipWaiting: true, // Skip waiting for service worker activation
    customWorkerDir: "worker", // Custom service worker file path
    buildExcludes: [
        /app-build-manifest.json$/,
        // Exclude the MF remoteEntry from service-worker pre-cache so the SW
        // doesn't try to cache a chunk that changes on every deploy separately.
        /remoteEntry\.js$/,
    ],
});

// Export the combined configuration for Next.js with PWA support
const nextConfigWithPWA = withPWA(nextConfig);

export default nextConfigWithPWA;
