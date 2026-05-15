'use client';
/**
 * design-remote/Card
 *
 * Stable MF-exposed wrapper around ui/card.
 * Exposes the full Card compound (Card + Header + Title + Description + Content + Footer)
 * as a single named default plus named exports — consumers import from the same entry.
 */

import * as React from 'react';
import {
  Card as BaseCard,
  CardHeader as BaseCardHeader,
  CardTitle as BaseCardTitle,
  CardDescription as BaseCardDescription,
  CardContent as BaseCardContent,
  CardFooter as BaseCardFooter,
} from '@/components/ui/card';

// ── Stable prop interfaces ────────────────────────────────────────────────────

export interface CardProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export interface CardHeaderProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export interface CardTitleProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export interface CardDescriptionProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export interface CardContentProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export interface CardFooterProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

// ── Wrapped components ────────────────────────────────────────────────────────

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...rest }, ref) => (
    <BaseCard ref={ref} className={className} {...rest}>{children}</BaseCard>
  ),
);
Card.displayName = 'DesignRemote.Card';

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, children, ...rest }, ref) => (
    <BaseCardHeader ref={ref} className={className} {...rest}>{children}</BaseCardHeader>
  ),
);
CardHeader.displayName = 'DesignRemote.CardHeader';

export const CardTitle = React.forwardRef<HTMLParagraphElement, CardTitleProps>(
  ({ className, children, ...rest }, ref) => (
    <BaseCardTitle ref={ref} className={className} {...rest}>{children}</BaseCardTitle>
  ),
);
CardTitle.displayName = 'DesignRemote.CardTitle';

export const CardDescription = React.forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className, children, ...rest }, ref) => (
    <BaseCardDescription ref={ref} className={className} {...rest}>{children}</BaseCardDescription>
  ),
);
CardDescription.displayName = 'DesignRemote.CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, children, ...rest }, ref) => (
    <BaseCardContent ref={ref} className={className} {...rest}>{children}</BaseCardContent>
  ),
);
CardContent.displayName = 'DesignRemote.CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, children, ...rest }, ref) => (
    <BaseCardFooter ref={ref} className={className} {...rest}>{children}</BaseCardFooter>
  ),
);
CardFooter.displayName = 'DesignRemote.CardFooter';

// Default export = root Card (for simple `import Card from 'designRemote/Card'` usage)
export default Card;
