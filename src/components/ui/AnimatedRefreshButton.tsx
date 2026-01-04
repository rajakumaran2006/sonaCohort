'use client'

import React from 'react'
import { RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils/index'

interface AnimatedRefreshButtonProps {
  onRefresh: () => void | Promise<void>
  isRefreshing: boolean
  className?: string
  title?: string
}

export const AnimatedRefreshButton: React.FC<AnimatedRefreshButtonProps> = ({
  onRefresh,
  isRefreshing,
  className,
  title = "Refresh data"
}) => {
  return (
    <div className={cn("relative flex items-center justify-center p-2", className)}>
      {/* Wavy Rings - Expanding Outwards (Image 2 effect) */}
      {isRefreshing && (
        <div className="absolute inset-0 flex items-center justify-center">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i}
              className={cn(
                "absolute w-12 h-12 rounded-full border border-opacity-40 animate-wavy",
                i % 3 === 0 ? "border-blue-400" : i % 3 === 1 ? "border-purple-400" : "border-orange-400"
              )}
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </div>
      )}

      {/* Main Refresh Button */}
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        title={title}
        className={cn(
          "relative z-10 p-3 rounded-full bg-white transition-all duration-500",
          "shadow-[0_0_15px_rgba(59,130,246,0.3),0_0_25px_rgba(168,85,247,0.2),0_0_35px_rgba(249,115,22,0.1)]",
          "hover:scale-110 active:scale-95 hover:shadow-[0_0_20px_rgba(59,130,246,0.5),0_0_30px_rgba(168,85,247,0.3),0_0_40px_rgba(249,115,22,0.2)]",
          "disabled:opacity-90 disabled:cursor-not-allowed",
          isRefreshing ? "scale-140 shadow-[0_0_40px_rgba(59,130,246,0.5),0_0_60px_rgba(168,85,247,0.4),0_0_80px_rgba(249,115,22,0.3)]" : "scale-100",
          "group flex items-center justify-center"
        )}
      >
        {/* Glow Border Overlay (Image 1 rainbow aesthetic) */}
        <div className="absolute inset-0 p-[2px] rounded-full overflow-hidden">
           <div className="absolute inset-0 rounded-full opacity-70 animate-gradient" 
                style={{
                  background: 'linear-gradient(45deg, #3b82f6, #8b5cf6, #f97316, #3b82f6)',
                }} 
           />
           <div className="absolute inset-[2px] bg-white rounded-full z-0" />
        </div>

        <RotateCw 
          className={cn(
            "w-5 h-5 relative z-10 transition-all text-gray-700",
            isRefreshing ? "animate-spin text-blue-600" : "group-hover:text-blue-500"
          )} 
        />
        
        {/* Subtle dot at the bottom to match Image 1's "pill" like indicator */}
        {!isRefreshing && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full z-20 shadow-sm border border-gray-100" />
        )}
      </button>
    </div>
  )
}
