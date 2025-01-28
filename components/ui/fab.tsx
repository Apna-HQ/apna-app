"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Expand, Star } from "lucide-react"
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

const MotionDiv = motion.div
const FAB_SIZE = 48 // Reduced size by ~15%

interface FabProps {
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  appId?: string;
  onRate?: () => void;
}

export function Fab({ onToggleFullscreen, isFullscreen, appId, onRate }: FabProps) {
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
      }
    }

    updateConstraints()
    updatePosition()
    window.addEventListener('resize', () => {
      updateConstraints()
      updatePosition()
    })
    return () => window.removeEventListener('resize', updateConstraints)
  }, [x, y])

  const onDragEnd = () => {
    if (fabRef.current) {
      const currentX = x.get()
      const windowWidth = window.innerWidth
      const currentY = y.get()
      
      // Snap to nearest side with 16px padding
      if (currentX < windowWidth / 2) {
        x.set(16) // Snap to left with padding
      } else {
        x.set(windowWidth - FAB_SIZE - 16) // Snap to right with padding
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
          align="end" 
          className="z-[100]"
          sideOffset={8}
          alignOffset={-8}
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
                      className="p-1 hover:bg-[#e6efe9]"
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      onClick={() => setRating(star)}
                    >
                      <Star
                        className="w-8 h-8"
                        fill={(hoveredRating || rating) >= star ? "#368564" : "none"}
                        color="#368564"
                      />
                    </Button>
                  ))}
                </div>
                <textarea
                  placeholder="Share your feedback about this app (optional)"
                  value={feedback}
                  onChange={handleFeedbackChange}
                  className="w-full min-h-[100px] p-2 border rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-[#368564]"
                />
                <Button
                  onClick={handleRate}
                  disabled={rating === 0}
                  className="w-full bg-[#368564] hover:bg-[#2c6b51] text-white"
                >
                  Submit Rating
                </Button>
              </DialogContent>
            </Dialog>
          )}
          <DropdownMenuItem onClick={onToggleFullscreen}>
            <Expand className="mr-2 h-4 w-4" />
            {isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </MotionDiv>
  )
}