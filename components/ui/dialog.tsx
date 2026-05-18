'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  variant?: 'default' | 'fullscreen'
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ${className}`}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className = '', variant = 'default', children, ...props }, ref) => {
  // Use a ref to track the content element
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  
  // Combine refs
  const handleRef = (el: HTMLDivElement) => {
    contentRef.current = el;
    if (typeof ref === 'function') {
      ref(el);
    } else if (ref) {
      ref.current = el;
    }
  };
  
  // Clean up function to ensure all event listeners are removed
  React.useEffect(() => {
    return () => {
      // Force cleanup when component unmounts
      if (contentRef.current) {
        // Remove all event listeners
        const clone = contentRef.current.cloneNode(true);
        if (contentRef.current.parentNode) {
          contentRef.current.parentNode.replaceChild(clone, contentRef.current);
        }
      }
    };
  }, []);
  
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={handleRef}
        className={`${
          variant === 'fullscreen'
            ? 'fixed inset-0 z-50 h-screen w-screen bg-surface text-ink'
            : 'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-ink/10 bg-surface p-6 text-ink shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg'
        } ${className}`}
        onCloseAutoFocus={(e) => {
          // Prevent focus trapping
          e.preventDefault();
          // Ensure body can receive events
          document.body.style.pointerEvents = '';
        }}
        {...props}
      >
        {children}
        {variant === 'default' && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm text-ink-3 opacity-70 ring-offset-surface transition-opacity hover:text-ink hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-amber-strong focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-surface-2 data-[state=open]:text-ink-3">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`flex flex-col space-y-1.5 text-center sm:text-left ${className}`}
    {...props}
  />
)
DialogHeader.displayName = 'DialogHeader'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={`text-lg font-semibold leading-none tracking-tight ${className}`}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

// Create a custom Dialog component that properly cleans up
export const Dialog = ({ children, open, onOpenChange, ...props }: DialogPrimitive.DialogProps) => {
  // Use a ref to track if the dialog was previously open
  const wasOpenRef = React.useRef(open);
  
  React.useEffect(() => {
    // If dialog was open and is now closed, force a cleanup
    if (wasOpenRef.current && !open) {
      // Force cleanup of any lingering event listeners or styles
      document.body.style.pointerEvents = '';
      document.body.style.overflow = '';
      
      // Remove any aria-hidden attributes that might have been added
      document.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
        if (el instanceof HTMLElement && el.dataset.dialogHidden) {
          el.removeAttribute('aria-hidden');
          delete el.dataset.dialogHidden;
        }
      });
    }
    
    // Update the ref
    wasOpenRef.current = open;
  }, [open]);
  
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} {...props}>
      {children}
    </DialogPrimitive.Root>
  );
};
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export {
  DialogContent,
  DialogHeader,
  DialogTitle,
  type DialogContentProps,
}
