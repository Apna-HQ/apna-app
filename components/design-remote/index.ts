/**
 * design-remote — Module Federation expose map
 *
 * This file documents the curated set of host design-system components
 * exposed via the `designRemote` MF remote.  Each entry here corresponds
 * to an `exposes` key in next.config.mjs.
 *
 * Remote name:  designRemote
 * Entry URL:    <host-origin>/_next/static/chunks/remoteEntry.js
 *
 * Usage from a mini-app (after `registerRemotes`):
 *
 *   import Button from 'designRemote/Button';
 *   import Card, { CardHeader, CardContent } from 'designRemote/Card';
 *   import Input from 'designRemote/Input';
 *   import Textarea from 'designRemote/Textarea';
 *   import Avatar, { AvatarImage, AvatarFallback } from 'designRemote/Avatar';
 *   import Label from 'designRemote/Label';
 *
 * MF expose map (mirrors next.config.mjs exposes):
 *   './Button'   → ./components/design-remote/Button
 *   './Card'     → ./components/design-remote/Card
 *   './Input'    → ./components/design-remote/Input
 *   './Textarea' → ./components/design-remote/Textarea
 *   './Avatar'   → ./components/design-remote/Avatar
 *   './Label'    → ./components/design-remote/Label
 *
 * Stability contract:
 *   - Props marked in each component's interface are public API.
 *   - The underlying shadcn/Radix implementation may change freely.
 *   - Breaking changes (removing/renaming props) require a major host version bump.
 */

export { default as Button } from './Button';
export { default as Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
export { default as Input } from './Input';
export { default as Textarea } from './Textarea';
export { default as Avatar, AvatarImage, AvatarFallback } from './Avatar';
export { default as Label } from './Label';
