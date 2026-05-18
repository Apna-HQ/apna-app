"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChatMessage } from "@/lib/generatedAppsDB";

interface PromptIterationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSubmit: (newMessage: string) => Promise<void>;
  isLoading?: boolean;
}

export default function PromptIterationSheet({
  isOpen,
  onClose,
  messages,
  onSubmit,
  isLoading = false,
}: PromptIterationSheetProps) {
  const [newMessage, setNewMessage] = useState("");

  const handleSubmit = async () => {
    if (!newMessage.trim()) return;
    
    await onSubmit(newMessage);
    setNewMessage(""); // Clear the input after submission
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[500px] overflow-y-auto border-ink/10 bg-shell text-ink">
        <SheetHeader>
          <SheetTitle>Iterate on Generated App</SheetTitle>
          <SheetDescription>
            Continue the conversation to improve or modify the generated app
          </SheetDescription>
        </SheetHeader>
        
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-ink-2">Conversation</h3>
            <div className="space-y-3 max-h-[250px] overflow-y-auto p-2 border border-ink/10 rounded-md bg-surface">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg text-sm ${
                    message.role === 'user'
                      ? 'bg-[#cddff5] text-[#214f88] dark:bg-[#1f3354] dark:text-[#cddff5] ml-8'
                      : message.role === 'system'
                      ? 'bg-amber-soft text-ink-2'
                      : 'bg-chrome text-ink-2 mr-8'
                  }`}
                >
                  <div className="font-medium mb-1 text-xs opacity-70">
                    {message.role === 'user'
                      ? 'You'
                      : message.role === 'system'
                      ? 'System'
                      : 'Assistant'}
                  </div>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-ink-2">Your Message</h3>
            <textarea
              className="w-full min-h-[100px] p-3 text-sm border border-ink/10 bg-surface rounded-md focus:outline-none focus:ring-2 focus:ring-amber-strong"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Enter your message here..."
            />
          </div>
        </div>
        
        <SheetFooter>
          <Button
            className="w-full bg-amber-strong hover:bg-amber-strong/90 text-white"
            onClick={handleSubmit}
            disabled={isLoading || !newMessage.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Send Message"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
