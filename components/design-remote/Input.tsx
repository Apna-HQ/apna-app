'use client';
/**
 * design-remote/Input
 *
 * Stable MF-exposed wrapper around ui/input.
 */

import * as React from 'react';
import { Input as BaseInput } from '@/components/ui/input';

/** Stable prop contract. */
export interface InputProps {
  /** HTML input type. */
  type?: string;
  /** Placeholder text. */
  placeholder?: string;
  /** Controlled value. */
  value?: string | number | readonly string[];
  /** Default value for uncontrolled usage. */
  defaultValue?: string | number | readonly string[];
  /** Whether the input is disabled. */
  disabled?: boolean;
  /** Whether the input is read-only. */
  readOnly?: boolean;
  /** Extra CSS class. */
  className?: string;
  /** Change handler. */
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  /** Any remaining native input attributes. */
  [key: string]: unknown;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...rest }, ref) => (
    <BaseInput ref={ref} type={type} className={className} {...rest} />
  ),
);
Input.displayName = 'DesignRemote.Input';

export default Input;
