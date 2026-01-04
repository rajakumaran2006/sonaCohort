import { MicrosoftUser } from '@/lib/types'
import { createClient } from '@/utils/supabase/client'
import { NotificationService } from '@/lib/utils/notificationService'

export class MicrosoftGraphService {
  private static async getAccessToken(): Promise<string | null> {
    try {
      // Get the access token from the current user's session
      const response = await fetch('/api/microsoft/token')
      if (response.ok) {
        const data = await response.json()
        return data.accessToken
      } else {
        const errorData = await response.json()
        console.warn('Failed to get Microsoft token:', errorData.error)
        
        // If token is missing or expired, try to refresh
        if (errorData.error === 'No Microsoft token available') {
          console.log('Attempting to refresh Microsoft token...')
          const refreshResponse = await fetch('/api/microsoft/refresh-token', {
            method: 'POST'
          })
          
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
            return refreshData.accessToken
          } else {
            // If refresh fails, sign out the user and redirect to login
            console.warn('Token refresh failed, signing out user for re-authentication')
            await this.handleTokenExpiration()
            return null
          }
        }
        
        return null
      }
    } catch (error) {
      console.error('Error getting Microsoft Graph access token:', error)
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
      console.error('Error handling token expiration:', error)
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
      params.append('$select', 'id,displayName,mail,userPrincipalName')
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
        console.error(`Graph API error ${response.status}:`, errorText)
        console.error('Request URL:', url.toString())
        
        // If it's an authentication error, handle token expiration
        if (response.status === 401 || response.status === 403) {
          console.warn('Graph API authentication failed, handling token expiration')
          await this.handleTokenExpiration()
        }
        
        return []
      }

      const data = await response.json()
      return data.value || []
    } catch (error) {
      console.error('Error searching Microsoft users:', error)
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
        `https://graph.microsoft.com/v1.0/users/${userId}?$select=id,displayName,mail,userPrincipalName`,
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
      console.error('Error getting Microsoft user:', error)
      return null
    }
  }

  static async getUserByEmail(email: string): Promise<MicrosoftUser | null> {
    try {
      const accessToken = await this.getAccessToken()
      if (!accessToken) {
        console.error('No access token available for Microsoft Graph')
        return null
      }

      // Search for user by email
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${email}' or userPrincipalName eq '${email}'&$select=id,displayName,mail,userPrincipalName`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Graph API error ${response.status}:`, errorText)
        return null
      }

      const data = await response.json()
      return data.value && data.value.length > 0 ? data.value[0] : null
    } catch (error) {
      console.error('Error searching Microsoft user by email:', error)
      return null
    }
  }
}
