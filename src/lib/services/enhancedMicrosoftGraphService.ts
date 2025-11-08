import { MicrosoftGraphService } from '@/lib/auth/microsoftGraph'
import { NotificationService } from '@/lib/utils/notificationService'

/**
 * Enhanced Microsoft Graph service with better error handling
 */
export class EnhancedMicrosoftGraphService {
  /**
   * Search users with enhanced error handling
   */
  static async searchUsers(query: string): Promise<any[]> {
    try {
      const users = await MicrosoftGraphService.searchUsers(query)
      return users
    } catch (error) {
      console.error('Error in enhanced Microsoft Graph search:', error)
      
      // Show user-friendly error notification
      NotificationService.showNotification(
        'Unable to search users. Please try again or contact support.',
        'error'
      )
      
      return []
    }
  }

  /**
   * Get user profile with enhanced error handling
   */
  static async getUserProfile(userId: string): Promise<any | null> {
    try {
      const profile = await MicrosoftGraphService.getUserProfile(userId)
      return profile
    } catch (error) {
      console.error('Error getting user profile:', error)
      
      NotificationService.showNotification(
        'Unable to load user profile. Please try again.',
        'error'
      )
      
      return null
    }
  }
}
