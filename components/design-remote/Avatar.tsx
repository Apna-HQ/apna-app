'use client';
/**
 * design-remote/Avatar
 *
 * Stable MF-exposed wrapper around ui/avatar.
 * Exports Avatar + AvatarImage + AvatarFallback as named exports and Avatar as default.
 */

import * as React from 'react';
import {
  Avatar as BaseAvatar,
  AvatarImage as BaseAvatarImage,
  AvatarFallback as BaseAvatarFallback,
} from '@/components/ui/avatar';

export interface AvatarProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export interface AvatarImageProps {
  src?: string;
  alt?: string;
  className?: string;
  [key: string]: unknown;
}

export interface AvatarFallbackProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, children, ...rest }, ref) => (
    <BaseAvatar ref={ref} className={className} {...rest}>{children}</BaseAvatar>
  ),
);
Avatar.displayName = 'DesignRemote.Avatar';

export const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, src, alt, ...rest }, ref) => (
    <BaseAvatarImage ref={ref} className={className} src={src} alt={alt} {...rest} />
  ),
);
AvatarImage.displayName = 'DesignRemote.AvatarImage';

export const AvatarFallback = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(
  ({ className, children, ...rest }, ref) => (
    <BaseAvatarFallback ref={ref} className={className} {...rest}>{children}</BaseAvatarFallback>
  ),
);
AvatarFallback.displayName = 'DesignRemote.AvatarFallback';

export default Avatar;
