'use client'

import { Button } from '../../../components/ui/button'
import { ArrowLeft, Settings } from 'lucide-react'
import UserDrawer from '../UserDrawer'
import { usePathname, useRouter } from 'next/navigation'

interface TopBarProps {
  appId?: string;
  appName?: string;
  onClose?: () => void;
  showBackButton?: boolean;
}

export default function TopBar(props: TopBarProps = {}) {
  const { appId, appName, onClose, showBackButton } = props
  const pathname = usePathname()
  const router = useRouter()

  const getPageTitle = () => {
    if (appName) return appName
    
    switch (pathname) {
      case '/':
        return 'Apna'
      case '/explore':
        return 'Explore Apps'
      case '/settings':
        return 'User Settings'
      case '/feedback':
        return 'Community Feedback'
      case '/my-apps':
        return 'My Apps'
      case '/admin':
        return 'Admin Dashboard'
      default:
        return appName || ''
    }
  }

  const handleBackClick = () => {
    if (onClose) {
      onClose()
    } else {
      router.back()
    }
  }

  const isSimpleHeader = pathname === '/settings' || pathname === '/feedback' || pathname === '/my-apps' || pathname === '/admin' || !!appId
  const displayBackButton = showBackButton || isSimpleHeader

  return (
    <div className="flex h-12 items-center justify-between border-b border-ink/10 bg-chrome px-4 text-ink">
      <div className="flex items-center gap-3">
        {displayBackButton && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-ink-3 hover:bg-surface-2 hover:text-ink"
            onClick={handleBackClick}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {!isSimpleHeader && <UserDrawer />}
        <h1 className="text-sm font-semibold text-ink-2">
          {getPageTitle()}
        </h1>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-ink-3 hover:bg-surface-2 hover:text-ink"
        onClick={() => router.push('/settings')}
        aria-label="Settings"
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  )
}
