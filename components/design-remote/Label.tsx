'use client';
/**
 * design-remote/Label
 *
 * Stable MF-exposed wrapper around ui/label.
 */

import * as React from 'react';
import { Label as BaseLabel } from '@/components/ui/label';

export interface LabelProps {
  htmlFor?: string;
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, htmlFor, children, ...rest }, ref) => (
    <BaseLabel ref={ref} className={className} htmlFor={htmlFor} {...rest}>
      {children}
    </BaseLabel>
  ),
);
Label.displayName = 'DesignRemote.Label';

export default Label;
