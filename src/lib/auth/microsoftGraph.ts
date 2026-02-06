import { MicrosoftUser } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { NotificationService } from '@/lib/utils/notificationService'
import { logger } from '@/lib/logger'

export class MicrosoftGraphService {
  /**
   * Ensure the Microsoft session is valid by checking/refreshing the token
   * This is useful for keeping the session alive in protected routes
   */
  static async ensureSessionValid(): Promise<boolean> {
    const token = await this.getAccessToken()
    return !!token
  }

  private static async getAccessToken(): Promise<string | null> {
    try {
      // Get the access token from the current user's session
      const response = await fetch('/api/microsoft/token')
      const data = await response.json()
      
      if (response.ok && data.accessToken) {
        return data.accessToken
      }
      
      // If token endpoint failed, check if we can refresh
      if (data.requiresReauth) {
        // User needs to re-authenticate - their refresh token is also expired
        logger.warn('Token refresh failed, signing out user for re-authentication')
        await this.handleTokenExpiration()
        return null
      }
      
      // Try to refresh the token
      logger.info('Attempting to refresh Microsoft token...')
      const refreshResponse = await fetch('/api/microsoft/refresh-token', {
        method: 'POST'
      })
      
      const refreshData = await refreshResponse.json()
      
      if (refreshResponse.ok && refreshData.accessToken) {
        logger.info('Token refreshed successfully via:', refreshData.source)
        return refreshData.accessToken
      }
      
      // If refresh also failed with requiresReauth, sign out the user
      if (refreshData.requiresReauth) {
        logger.warn('Token refresh failed - user needs to re-authenticate')
        await this.handleTokenExpiration()
        return null
      }
      
      logger.warn('Failed to get or refresh Microsoft token')
      return null
    } catch (error) {
      logger.error('Error getting Microsoft Graph access token:', error)
      // If there's a network error or other issue, sign out the user
      await this.handleTokenExpiration()
      return null
    }
  }

  /**
   * Handle token expiration by signing out the user and redirecting to login
   */
  private static async handleTokenExpiration(): Promise<void> {
    try {
      const supabase = createClient()
      
      // Show user-friendly notification
      NotificationService.showSessionExpired()
      
      // Sign out the user
      await supabase.auth.signOut()
      
      // Redirect to login page after a short delay to show notification
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000) // 2 second delay to show notification
      }
    } catch (error) {
      logger.error('Error handling token expiration:', error)
      // Force redirect even if sign out fails
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    }
  }

  static async searchUsers(query: string): Promise<MicrosoftUser[]> {
    try {
      const accessToken = await this.getAccessToken()
      if (!accessToken) {
        // Token handling is already done in getAccessToken()
        // User will be automatically signed out and redirected
        return []
      }

      // Sanitize the query to prevent OData injection and handle special characters
      const sanitizedQuery = query.trim().replace(/'/g, "''")
      
      // Construct the URL with proper encoding using URLSearchParams
      const url = new URL('https://graph.microsoft.com/v1.0/users')
      const params = new URLSearchParams()
      
      // Advanced query to search by name or email
      // Note: Advanced queries with OR usually require ConsistencyLevel: eventual and $count=true
      const filterQuery = `startsWith(displayName,'${sanitizedQuery}') or startsWith(mail,'${sanitizedQuery}') or startsWith(userPrincipalName,'${sanitizedQuery}')`
      
      params.append('$filter', filterQuery)
      params.append('$select', 'id,displayName,mail,userPrincipalName,givenName,surname')
      params.append('$top', '10')
      params.append('$count', 'true')
      
      url.search = params.toString()

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'ConsistencyLevel': 'eventual',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Graph API error ${response.status}:`, errorText)
        logger.error('Request URL:', url.toString())
        
        // If it's an authentication error, handle token expiration
        if (response.status === 401 || response.status === 403) {
          logger.warn('Graph API authentication failed, handling token expiration')
          await this.handleTokenExpiration()
        }
        
        return []
      }

      const data = await response.json()
      return data.value || []
    } catch (error) {
      logger.error('Error searching Microsoft users:', error)
      return []
    }
  }

  static async getUserById(userId: string): Promise<MicrosoftUser | null> {
    try {
      const accessToken = await this.getAccessToken()
      if (!accessToken) {
        throw new Error('No access token available')
      }

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${userId}?$select=id,displayName,mail,userPrincipalName,givenName,surname`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Graph API error: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      logger.error('Error getting Microsoft user:', error)
      return null
    }
  }

  static async getUserByEmail(email: string): Promise<MicrosoftUser | null> {
    try {
      const accessToken = await this.getAccessToken()
      if (!accessToken) {
        logger.error('No access token available for Microsoft Graph')
        return null
      }

      // Search for user by email
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${email}' or userPrincipalName eq '${email}'&$select=id,displayName,mail,userPrincipalName,givenName,surname`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Graph API error ${response.status}:`, errorText)
        return null
      }

      const data = await response.json()
      return data.value && data.value.length > 0 ? data.value[0] : null
    } catch (error) {
      logger.error('Error searching Microsoft user by email:', error)
      return null
    }
  }

  /**
   * Send an email using Microsoft Graph API
   * @param to - Array of recipient email addresses
   * @param subject - Email subject
   * @param body - Email body (HTML supported)
   * @returns Success status and optional error message
   */
  static async sendMail(params: {
    to: string[];
    subject: string;
    body: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await this.getAccessToken()
      if (!accessToken) {
        return { success: false, error: 'No access token available. Please sign in again.' }
      }

      // Build the email message payload
      const message = {
        message: {
          subject: params.subject,
          body: {
            contentType: 'HTML',
            content: params.body.replace(/\n/g, '<br>') // Convert newlines to HTML breaks
          },
          toRecipients: params.to.map(email => ({
            emailAddress: {
              address: email
            }
          }))
        },
        saveToSentItems: true
      }

      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message)
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Graph API sendMail error ${response.status}:`, errorText)
        
        // If it's an authentication error, handle token expiration
        if (response.status === 401 || response.status === 403) {
          logger.warn('Graph API authentication failed for sendMail, handling token expiration')
          await this.handleTokenExpiration()
          return { success: false, error: 'Session expired. Please sign in again.' }
        }
        
        // Parse error message if possible
        try {
          const errorJson = JSON.parse(errorText)
          return { success: false, error: errorJson.error?.message || 'Failed to send email' }
        } catch {
          return { success: false, error: 'Failed to send email' }
        }
      }

      logger.info('Email sent successfully via Microsoft Graph')
      return { success: true }
    } catch (error) {
      logger.error('Error sending email via Microsoft Graph:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }
    }
  }
}
