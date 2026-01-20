export interface Notification {
  id: string
  created_at: string
  title: string
  sender_id: string
  recipient_email: string
  is_read: boolean
  read_at: string | null
}

export interface CreateNotificationParams {
  title: string
  sender_id: string
  recipient_emails: string[]
}

import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

export class NotificationService {
  private static supabase = createClient()

  /**
   * Send notification to one or more peer tutors
   */
  static async sendNotification(params: CreateNotificationParams): Promise<boolean> {
    try {
      const notifications = params.recipient_emails.map(recipientEmail => ({
        title: params.title,
        sender_id: params.sender_id,
        recipient_email: recipientEmail,
        is_read: false
      }))
      logger.info('Sending notifications:', notifications) // Added this line based on the example's intent

      const { error } = await this.supabase
        .from('notifications')
        .insert(notifications)

      if (error) {
        logger.error('Error sending notification:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in sendNotification:', error)
      return false
    }
  }

  /**
   * Get all notifications for a peer tutor
   */
  static async getNotificationsByRecipient(recipientEmail: string): Promise<Notification[]> {
    if (!recipientEmail) return []

    try {
      const { data, error } = await this.supabase
        .from('notifications')
        .select('*')
        .eq('recipient_email', recipientEmail)
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('Error fetching notifications:', error)
        return []
      }

      return data || []
    } catch (error) {
      logger.error('Error in getNotificationsByRecipient:', error)
      return []
    }
  }

  /**
   * Get unread notification count for a peer tutor
   */
  static async getUnreadCount(recipientEmail: string): Promise<number> {
    if (!recipientEmail) return 0

    try {
      const { count, error } = await this.supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_email', recipientEmail)
        .eq('is_read', false)

      if (error) {
        logger.error('Error fetching unread count:', error)
        return 0
      }

      return count || 0
    } catch (error) {
      logger.error('Error in getUnreadCount:', error)
      return 0
    }
  }

  /**
   * Mark a notification as read
   */
  static async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('id', notificationId)

      if (error) {
        logger.error('Error marking notification as read:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in markAsRead:', error)
      return false
    }
  }

  /**
   * Mark all notifications as read for a peer tutor
   */
  static async markAllAsRead(recipientEmail: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('recipient_email', recipientEmail)
        .eq('is_read', false)

      if (error) {
        logger.error('Error marking all as read:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in markAllAsRead:', error)
      return false
    }
  }

  /**
   * Delete a notification
   */
  static async deleteNotification(notificationId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)

      if (error) {
        logger.error('Error deleting notification:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in deleteNotification:', error)
      return false
    }
  }

  /**
   * Delete all notifications for a peer tutor
   */
  static async deleteAllNotifications(recipientEmail: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .delete()
        .eq('recipient_email', recipientEmail)

      if (error) {
        logger.error('Error deleting all notifications:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in deleteAllNotifications:', error)
      return false
    }
  }
}
