'use client';
/**
 * design-remote/Textarea
 *
 * Stable MF-exposed wrapper around ui/textarea.
 */

import * as React from 'react';
import { Textarea as BaseTextarea } from '@/components/ui/textarea';

export interface TextareaProps {
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  readOnly?: boolean;
  rows?: number;
  className?: string;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  [key: string]: unknown;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...rest }, ref) => (
    <BaseTextarea ref={ref} className={className} {...rest} />
  ),
);
Textarea.displayName = 'DesignRemote.Textarea';

export default Textarea;
