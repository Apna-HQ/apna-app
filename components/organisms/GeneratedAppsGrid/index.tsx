"use client";

import { useGeneratedApps } from "@/lib/contexts/GeneratedAppsContext";
import { useState, useRef, useEffect } from "react";
import { AppIcon } from "@/components/molecules/AppIcon";
import { Button } from "@/components/ui/button";
import { Trash2, MoreVertical, Globe } from "lucide-react";
import { ChatMessage } from "@/lib/generatedAppsDB";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GeneratedAppsGridProps {
  onAppSelect: (htmlContent: string, id: string, messages: ChatMessage[], name: string) => void;
}

export default function GeneratedAppsGrid({ onAppSelect }: GeneratedAppsGridProps) {
  const { apps, loading, error, deleteApp } = useGeneratedApps();
  const [appToDelete, setAppToDelete] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuApp, setContextMenuApp] = useState<string | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressDuration = 500; // ms

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, []);

  // Handle long press
  const handleTouchStart = (appId: string) => {
    longPressTimeoutRef.current = setTimeout(() => {
      setAppToDelete(appId);
    }, longPressDuration);
  };

  const handleTouchEnd = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  // Handle right click
  const handleContextMenu = (e: React.MouseEvent, appId: string) => {
    e.preventDefault();
    setContextMenuApp(appId);
  };

  const handleDeleteApp = async () => {
    if (appToDelete) {
      await deleteApp(appToDelete);
      setAppToDelete(null);
    }
  };

  const handleAppSelect = (appURL: string | null, appId: string) => {
    const app = apps.find(a => a.id === appId);
    if (app) {
      onAppSelect(app.htmlContent, app.id, app.messages, app.name);
    }
  };

  if (loading) {
    return (
      <div className="w-full">
        <h2 className="text-lg font-medium text-gray-600 mb-4">Generated Apps</h2>
        <div className="flex items-center justify-center min-h-[100px]">
          <p className="text-gray-600">Loading apps...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <h2 className="text-lg font-medium text-gray-600 mb-4">Generated Apps</h2>
        <div className="flex items-center justify-center min-h-[100px]">
          <p className="text-red-500">Error loading apps: {error}</p>
        </div>
      </div>
    );
  }

  if (apps.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-600">Generated Apps</h2>
      </div>
      
      <div className="grid grid-cols-4 gap-4">
        {apps.map((app) => (
          <div
            key={app.id}
            className="relative group"
            onContextMenu={(e) => handleContextMenu(e, app.id)}
            onTouchStart={() => handleTouchStart(app.id)}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <div className="relative">
              <AppIcon
                appId={app.id}
                appName={app.name}
                appURL={`data:text/html,${encodeURIComponent(app.htmlContent)}`}
                isGeneratedApp={true}
                onSelect={handleAppSelect}
              />
              
              {/* Published indicator */}
              {app.published && app.published.some(item => !!item) && (
                <div className="absolute -top-1 -right-1 bg-[#368564] text-white rounded-full p-1 shadow-md" title="Published">
                  <Globe className="h-3 w-3" />
                </div>
              )}
            </div>
            
            {/* Context menu for right-click */}
            {contextMenuApp === app.id && (
              <DropdownMenu open={true} onOpenChange={(open) => !open && setContextMenuApp(null)}>
                <DropdownMenuTrigger asChild>
                  <div className="absolute top-0 right-0 opacity-0 w-0 h-0 overflow-hidden">
                    <Button size="sm" variant="ghost">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {/* Publish option - only show if not published */}
                  {(!app.published || app.published.every(item => !item)) && (
                    <DropdownMenuItem
                      className="text-[#368564] focus:text-[#368564]"
                      onClick={() => {
                        setContextMenuApp(null);
                        // Redirect to submit app page with this app pre-selected
                        window.location.href = `/explore?publish=${app.id}`;
                      }}
                    >
                      <Globe className="h-4 w-4 mr-2" />
                      Publish
                    </DropdownMenuItem>
                  )}
                  
                  {/* Delete option */}
                  <DropdownMenuItem
                    className="text-red-500 focus:text-red-500"
                    onClick={() => {
                      setContextMenuApp(null);
                      setAppToDelete(app.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>

      <AlertDialog open={!!appToDelete} onOpenChange={(open: boolean) => !open && setAppToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this generated app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteApp}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}