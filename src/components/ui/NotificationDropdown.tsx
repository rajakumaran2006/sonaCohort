'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, X } from 'lucide-react'
import { NotificationService, Notification } from '@/lib/services/notificationService'
import { formatDistanceToNow } from 'date-fns'

interface NotificationDropdownProps {
  peerTutorId: string
}

export default function NotificationDropdown({ peerTutorId }: NotificationDropdownProps) {
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)

  // Fetch notifications
  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const data = await NotificationService.getNotificationsByRecipient(peerTutorId)
      setNotifications(data)
      const unread = data.filter(n => !n.is_read).length
      setUnreadCount(unread)
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch
  useEffect(() => {
    if (peerTutorId) {
      fetchNotifications()
      
      // Poll for new notifications every 30 seconds
      const interval = setInterval(fetchNotifications, 30000)
      return () => clearInterval(interval)
    }
  }, [peerTutorId])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Mark as read
  const handleMarkAsRead = async (notificationId: string) => {
    const success = await NotificationService.markAsRead(notificationId)
    if (success) {
      fetchNotifications()
    }
  }

  // Clear all notifications
  const handleClearAll = async () => {
    const success = await NotificationService.deleteAllNotifications(peerTutorId)
    if (success) {
      fetchNotifications()
    }
  }

  // Delete notification
  const handleDelete = async (notificationId: string) => {
    const success = await NotificationService.deleteNotification(notificationId)
    if (success) {
      fetchNotifications()
    }
  }

  // View Details
  const handleViewDetails = async (notification: Notification) => {
    setSelectedNotification(notification)
    setIsOpen(false) // Close dropdown
    if (!notification.is_read) {
      await handleMarkAsRead(notification.id)
    }
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Bell Icon Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative p-2 rounded-full hover:bg-gray-100 transition-colors group"
          aria-label="Notifications"
        >
          <Bell className="w-6 h-6 text-gray-600 group-hover:text-gray-900 transition-colors" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown Panel */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-[600px] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white rounded-t-xl sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                  NOTIFICATIONS
                </h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-bold border border-red-100">
                    {unreadCount} NEW
                  </span>
                )}
              </div>
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-[10px] font-bold text-gray-400 hover:text-red-600 uppercase tracking-wider transition-colors"
                >
                  CLEAR ALL
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto flex-1 max-h-[400px] custom-scrollbar">
              {loading ? (
                <div className="p-8 text-center text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="mt-2 text-xs font-medium">Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                  <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 text-gray-300">
                    <Bell className="w-8 h-8 opacity-50" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 mb-1">No Notifications</h4>
                  <p className="text-xs text-gray-400 max-w-[200px]">You&apos;re all caught up! Check back later for updates.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-gray-50 transition-colors relative group ${
                        !notification.is_read ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <div className="flex gap-4">
                        {/* Status Icon */}
                        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${!notification.is_read ? 'bg-red-500' : 'bg-gray-200'}`} />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <h4 className={`text-sm font-bold truncate pr-2 ${!notification.is_read ? 'text-gray-900' : 'text-gray-600'}`}>
                              Notification
                            </h4>
                            <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          
                          <p className={`text-xs leading-relaxed mb-3 line-clamp-2 ${!notification.is_read ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                            {notification.title}
                          </p>

                          <button
                            onClick={() => handleViewDetails(notification)}
                            className="text-[10px] font-black text-blue-600 uppercase tracking-wider hover:underline flex items-center gap-1"
                          >
                            VIEW DETAILS 
                            <span className="text-lg leading-none">→</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedNotification(null)}
          />
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full relative z-10 overflow-hidden text-left animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Notification</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(selectedNotification.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedNotification(null)}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {selectedNotification.title}
                </p>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex justify-end gap-3">
               <button
                  onClick={() => {
                     handleDelete(selectedNotification.id)
                     setSelectedNotification(null)
                  }}
                  className="px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors uppercase tracking-wide"
               >
                  Delete
               </button>
               <button
                  onClick={() => setSelectedNotification(null)}
                  className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-colors uppercase tracking-wide shadow-sm"
               >
                  Close
               </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
