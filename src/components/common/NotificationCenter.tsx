'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Bell, Check, Info, FileText } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export interface Notification {
  id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'action_required'
  timestamp: Date
  read: boolean
  onClick?: () => void
  actionLabel?: string
}

interface NotificationCenterProps {
  notifications: Notification[]
  onMarkAsRead?: (id: string) => void
  onClearAll?: () => void
}

export function NotificationCenter({ 
  notifications, 
  onMarkAsRead,
  onClearAll 
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // Calculate unread count
  const unreadCount = notifications.filter(n => !n.read).length
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = (notification: Notification) => {
    if (onMarkAsRead && !notification.read) {
      onMarkAsRead(notification.id)
    }
    if (notification.onClick) {
      notification.onClick()
      setIsOpen(false)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'action_required':
        return <Bell className="w-4 h-4 text-white" />
      case 'success':
        return <Check className="w-4 h-4 text-white" />
      case 'warning':
        return <Info className="w-4 h-4 text-white" />
      default:
        return <FileText className="w-4 h-4 text-white" />
    }
  }

  const getBgColor = (type: string) => {
    switch (type) {
      case 'action_required':
        return 'bg-red-500 shadow-red-200'
      case 'success':
        return 'bg-emerald-500 shadow-emerald-200'
      case 'warning':
        return 'bg-amber-500 shadow-amber-200'
      default:
        return 'bg-blue-500 shadow-blue-200'
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center hover:bg-gray-50 hover:scale-105 transition-all duration-200 group"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-gray-900' : 'text-gray-400'} group-hover:text-gray-900 transition-colors`} />
        
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[9px] font-bold text-white items-center justify-center border-2 border-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-3 w-80 md:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden origin-top-right"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-bold border border-red-100">
                    {unreadCount} New
                  </span>
                )}
              </div>
              {notifications.length > 0 && onClearAll && (
                <button 
                  onClick={onClearAll}
                  className="text-[10px] font-bold text-gray-400 hover:text-gray-600 uppercase tracking-wider transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {notifications.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {notifications.map((notification) => (
                    <div 
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer relative group ${!notification.read ? 'bg-blue-50/30' : ''}`}
                    >
                      <div className="flex gap-4">
                        {/* Type Icon */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ${getBgColor(notification.type)}`}>
                          {getIcon(notification.type)}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <h4 className={`text-sm font-bold truncate pr-2 ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                              {notification.title}
                            </h4>
                            <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                              {new Date(notification.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          
                          <p className={`text-xs leading-relaxed mb-2 ${!notification.read ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                            {notification.message}
                          </p>
                          
                          {notification.actionLabel && (
                            <span className="inline-flex items-center text-[10px] font-black text-blue-600 uppercase tracking-wider group-hover:underline">
                              {notification.actionLabel} &rarr;
                            </span>
                          )}
                        </div>

                        {/* Unread indicator dot */}
                        {!notification.read && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                  <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 text-gray-300">
                    <Bell className="w-8 h-8 opacity-50" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 mb-1">No Notifications</h4>
                  <p className="text-xs text-gray-400 max-w-[200px]">You&apos;re all caught up! Check back later for updates.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
