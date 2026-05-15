'use client';
/**
 * design-remote/Button
 *
 * Stable MF-exposed wrapper around ui/button.
 * Mini-apps consuming `designRemote/Button` get this exact contract — the
 * underlying shadcn/Radix implementation may change but the prop surface below
 * is a **public API**: never remove or rename props without a major version bump.
 */

import * as React from 'react';
import { Button as BaseButton, type ButtonProps as BaseButtonProps } from '@/components/ui/button';

/** Stable prop contract exposed to MF consumers. */
export interface ButtonProps {
  /** Visual style — matches shadcn/cva variants. */
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  /** Size preset. */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Render as child element (Radix Slot). */
  asChild?: boolean;
  /** Extra CSS class (Tailwind-merge applied). */
  className?: string;
  /** Whether the button is disabled. */
  disabled?: boolean;
  /** Click handler. */
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  children?: React.ReactNode;
  /** Any remaining native button attributes. */
  [key: string]: unknown;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, asChild, className, children, ...rest }, ref) => (
    <BaseButton
      ref={ref}
      variant={variant}
      size={size}
      asChild={asChild}
      className={className}
      {...(rest as Omit<BaseButtonProps, 'variant' | 'size' | 'asChild' | 'className'>)}
    >
      {children}
    </BaseButton>
  ),
);
Button.displayName = 'DesignRemote.Button';

export default Button;
