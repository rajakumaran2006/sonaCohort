import { createClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

export interface TokenData {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

/**
 * Service for managing Microsoft OAuth tokens
 */
export class MicrosoftTokenService {
  /**
   * Store or update the Microsoft refresh token for a user
   */
  static async storeRefreshToken(userId: string, refreshToken: string, supabaseClient?: SupabaseClient): Promise<boolean> {
    try {
      const supabase = supabaseClient || await createClient()
      
      const { error } = await supabase
        .from('user_tokens')
        .upsert({
          user_id: userId,
          provider: 'azure',
          refresh_token: refreshToken,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,provider'
        })

      if (error) {
        logger.error('Error storing refresh token:', error)
        return false
      }

      logger.info('Successfully stored refresh token for user:', userId)
      return true
    } catch (error) {
      logger.error('Error in storeRefreshToken:', error)
      return false
    }
  }

  /**
   * Get the stored refresh token for a user
   */
  static async getRefreshToken(userId: string, supabaseClient?: SupabaseClient): Promise<string | null> {
    try {
      const supabase = supabaseClient || await createClient()
      
      const { data, error } = await supabase
        .from('user_tokens')
        .select('refresh_token')
        .eq('user_id', userId)
        .eq('provider', 'azure')
        .single()

      if (error || !data) {
        logger.warn('No refresh token found for user:', userId)
        return null
      }

      return data.refresh_token
    } catch (error) {
      logger.error('Error in getRefreshToken:', error)
      return null
    }
  }

  /**
   * Delete the stored refresh token for a user (on sign out)
   */
  static async deleteRefreshToken(userId: string): Promise<boolean> {
    try {
      const supabase = await createClient()
      
      const { error } = await supabase
        .from('user_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'azure')

      if (error) {
        logger.error('Error deleting refresh token:', error)
        return false
      }

      return true
    } catch (error) {
      logger.error('Error in deleteRefreshToken:', error)
      return false
    }
  }

  /**
   * Refresh the Microsoft access token using the stored refresh token
   */
  static async refreshAccessToken(userId: string, supabaseClient?: SupabaseClient): Promise<TokenData | null> {
    try {
      const refreshToken = await this.getRefreshToken(userId, supabaseClient)
      
      if (!refreshToken) {
        logger.warn('No refresh token available for user:', userId)
        return null
      }

      // Get Azure OAuth config from environment
      const clientId = process.env.AZURE_CLIENT_ID
      const clientSecret = process.env.AZURE_CLIENT_SECRET
      const tenantId = process.env.AZURE_TENANT_ID || 'common'

      if (!clientId || !clientSecret) {
        logger.error('Azure OAuth credentials not configured in environment')
        return null
      }

      // Call Azure's token endpoint to refresh the access token
      const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
      
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'email openid profile User.Read User.ReadBasic.All Mail.Send offline_access'
      })

      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      })

      if (!response.ok) {
        const errorData = await response.json()
        logger.error('Azure token refresh failed:', errorData)
        
        // If refresh token is invalid/expired, delete it
        if (errorData.error === 'invalid_grant') {
          await this.deleteRefreshToken(userId)
        }
        
        return null
      }

      const tokenData = await response.json()

      // If Azure returns a new refresh token (token rotation), store it
      if (tokenData.refresh_token && tokenData.refresh_token !== refreshToken) {
        await this.storeRefreshToken(userId, tokenData.refresh_token, supabaseClient)
      }

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : undefined
      }
    } catch (error) {
      logger.error('Error refreshing access token:', error)
      return null
    }
  }
}
