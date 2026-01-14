'use client'

import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/index'

interface BackButtonProps {
  className?: string
  onClick?: () => void
  href?: string
}

export const BackButton: React.FC<BackButtonProps> = ({ className, onClick, href }) => {
  const router = useRouter()

  const handleBack = () => {
    if (onClick) {
      onClick()
    } else if (href) {
      router.push(href)
    } else {
      router.back()
    }
  }

  return (
    <div className={cn("relative flex items-center justify-center p-2", className)}>
      <button
        onClick={handleBack}
        className={cn(
          "relative z-10 px-6 py-2.5 rounded-full bg-white transition-all duration-300",
          "shadow-[0_0_15px_rgba(59,130,246,0.15),0_0_25px_rgba(168,85,247,0.1),0_0_35px_rgba(249,115,22,0.05)]",
          "hover:scale-105 active:scale-95 hover:shadow-[0_0_20px_rgba(59,130,246,0.3),0_0_30px_rgba(168,85,247,0.2),0_0_40px_rgba(249,115,22,0.1)]",
          "group flex items-center justify-center gap-2 border border-gray-100/50"
        )}
      >
        {/* Glow Border Overlay (matches AnimatedRefreshButton) */}
        <div className="absolute inset-0 p-[1.5px] rounded-full overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-300">
           <div className="absolute inset-0 rounded-full opacity-70 animate-gradient" 
                style={{
                  background: 'linear-gradient(45deg, #3b82f6, #8b5cf6, #f97316, #3b82f6)',
                }} 
           />
           <div className="absolute inset-[1.5px] bg-white rounded-full z-0" />
        </div>

        <ArrowLeft 
          className={cn(
            "w-4 h-4 relative z-10 transition-all text-gray-600 group-hover:text-blue-600"
          )} 
        />
        <span className="relative z-10 text-sm font-bold uppercase tracking-wider text-gray-600 group-hover:text-gray-900 transition-colors">
          Back
        </span>
        
        {/* Subtle dot to match refresh button aesthetic */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-400 rounded-full z-20 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" />
      </button>
    </div>
  )
}
