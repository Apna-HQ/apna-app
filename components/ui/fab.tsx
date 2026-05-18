"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Expand, Star, X, Edit, User, Repeat } from "lucide-react"
import Image from "next/image"
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion"
import { useEffect, useRef, useState, ChangeEvent } from "react"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { ReactToNote } from "@/lib/nostr"
import { getKeyPairFromLocalStorage } from "@/lib/utils"
import ProfileManager from "@/components/organisms/ProfileManager"

const MotionDiv = motion.div
const FAB_SIZE = 48 // Reduced size by ~15%

interface FabProps {
  onToggleHighlight: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  appId?: string;
  onRate?: () => void;
  onClose?: () => void;
  onIterate?: () => void;
  onProfileChange?: () => void;
  isGeneratedApp?: boolean;
}

export function Fab({
  onToggleHighlight,
  onToggleFullscreen,
  isFullscreen,
  appId,
  onRate,
  onClose,
  onIterate,
  onProfileChange,
  isGeneratedApp = false
}: FabProps) {
  const fabRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [constraints, setConstraints] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0
  })
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [menuSide, setMenuSide] = useState<'left' | 'right'>('left')
  const [isProfileManagerOpen, setIsProfileManagerOpen] = useState(false)
  const [keyPair, setKeyPair] = useState<{ npub: string; nsec: string } | null>(null)

  useEffect(() => {
    setKeyPair(getKeyPairFromLocalStorage())
  }, [])
  
  // Spring animation for snapping to sides
  const springX = useSpring(x, { damping: 20 })
  const springY = useSpring(y, { damping: 20 })

  useEffect(() => {
    const updateConstraints = () => {
      if (typeof window !== 'undefined') {
        setConstraints({
          top: 64, // Below top bar
          bottom: window.innerHeight - FAB_SIZE,
          left: 0,
          right: window.innerWidth - FAB_SIZE
        })
      }
    }

    const updatePosition = () => {
      if (fabRef.current) {
        // Start at top right
        x.set(window.innerWidth - FAB_SIZE - 16)
        y.set(64)
        setMenuSide('left')
      }
    }

    updateConstraints()
    updatePosition()
    const handleResize = () => {
      updateConstraints()
      updatePosition()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [x, y])

  const onDragEnd = () => {
    if (fabRef.current) {
      const currentX = x.get()
      const windowWidth = window.innerWidth
      const currentY = y.get()
      
      // Snap to nearest side with 16px padding
      if (currentX < windowWidth / 2) {
        x.set(16) // Snap to left with padding
        setMenuSide('right')
      } else {
        x.set(windowWidth - FAB_SIZE - 16) // Snap to right with padding
        setMenuSide('left')
      }

      // Ensure y position stays within bounds
      const minY = constraints.top
      const maxY = constraints.bottom
      if (currentY < minY) y.set(minY)
      if (currentY > maxY) y.set(maxY)
    }
  }

  const handleRate = async () => {
    if (!appId || !onRate || !keyPair) return

    const ratingData = JSON.stringify({
      rating,
      feedback
    })

    await ReactToNote(appId, keyPair.nsec, ratingData)
    onRate()
    setIsOpen(false)
  }

  const handleFeedbackChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setFeedback(e.target.value)
  }

  return (
    <MotionDiv 
      ref={fabRef}
      drag
      dragMomentum={false}
      dragElastic={0.1}
      dragConstraints={constraints}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        x: springX,
        y: springY,
        touchAction: 'none',
      }}
      onDragEnd={onDragEnd}
      className="z-[100] pointer-events-auto"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            size="icon"
            className="relative rounded-full shadow-lg p-0 overflow-hidden h-12 w-12" // h-12/w-12 is 48px
          >
            <Image
              src="/icon-192x192.png"
              alt="App Logo"
              fill
              className="object-cover"
              sizes="48px"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={menuSide}
          align="center"
          className="z-[100]"
          sideOffset={8}
        >
          {appId && (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <DropdownMenuItem onSelect={(e: Event) => e.preventDefault()}>
                  <Star className="mr-2 h-4 w-4" />
                  Rate App
                </DropdownMenuItem>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rate this App</DialogTitle>
                </DialogHeader>
                <div className="flex justify-center space-x-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Button
                      key={star}
                      variant="ghost"
                      size="sm"
                      className="p-1 hover:bg-amber-soft"
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      onClick={() => setRating(star)}
                    >
                      <Star
                        className="w-8 h-8"
                        fill={(hoveredRating || rating) >= star ? "hsl(var(--amber-strong))" : "none"}
                        color="hsl(var(--amber-strong))"
                      />
                    </Button>
                  ))}
                </div>
                <textarea
                  placeholder="Share your feedback about this app (optional)"
                  value={feedback}
                  onChange={handleFeedbackChange}
                  className="w-full min-h-[100px] p-2 border rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-amber-strong"
                />
                <Button
                  onClick={handleRate}
                  disabled={rating === 0}
                  className="w-full bg-amber-strong hover:bg-amber-strong/90 text-white"
                >
                  Submit Rating
                </Button>
              </DialogContent>
            </Dialog>
          )}
          {isGeneratedApp && onIterate && (
            <DropdownMenuItem onClick={onIterate}>
              <Repeat className="mr-2 h-4 w-4" />
              Iterate
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onToggleHighlight}>
            <Edit className="mr-2 h-4 w-4" />
            Customise Mode
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsProfileManagerOpen(true)}>
            <User className="mr-2 h-4 w-4" />
            Switch Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleFullscreen}>
            <Expand className="mr-2 h-4 w-4" />
            {isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          </DropdownMenuItem>
          {onClose && (
            <DropdownMenuItem onClick={onClose}>
              <X className="mr-2 h-4 w-4" />
              Exit App
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      
      <ProfileManager
        open={isProfileManagerOpen}
        onOpenChange={setIsProfileManagerOpen}
        onProfileChange={() => {
          // Refresh keyPair when profile changes
          setKeyPair(getKeyPairFromLocalStorage())
          onProfileChange?.()
        }}
      />
    </MotionDiv>
  )
}
