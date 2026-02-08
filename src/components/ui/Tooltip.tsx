'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
    content: React.ReactNode
    children: React.ReactNode
    className?: string
}

export function Tooltip({ content, children, className }: TooltipProps) {
    const [isVisible, setIsVisible] = React.useState(false)

    return (
        <div
            className="relative inline-block"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
        >
            {children}
            {isVisible && (
                <div
                    className={cn(
                        "absolute bottom-full left-1/2 -translate-x-1/2 mb-1 text-xs text-gray-500 font-medium whitespace-nowrap z-50 animate-in fade-in zoom-in-95 duration-200 select-none pointer-events-none",
                        className
                    )}
                >
                    {content}
                </div>
            )}
        </div>
    )
}
