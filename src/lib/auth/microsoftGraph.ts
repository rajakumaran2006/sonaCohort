import { MicrosoftUser } from '@/lib/types'

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
        return null
      }
    } catch (error) {
      console.error('Error getting Microsoft Graph access token:', error)
      return null
    }
  }

  static async searchUsers(query: string): Promise<MicrosoftUser[]> {
    try {
      const accessToken = await this.getAccessToken()
      if (!accessToken) {
        console.error('No access token available for Microsoft Graph')
        return []
      }

      // Use a simpler query that's more likely to work
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=startsWith(displayName,'${query}')&$select=id,displayName,mail,userPrincipalName&$top=10`,
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
