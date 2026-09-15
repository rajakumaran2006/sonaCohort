import { logger } from '@/lib/logger'

interface OtpEntry {
  otp: string
  email: string
  deptId: string
  expiresAt: number
}

// Global in-memory cache for OTPs (persists across server invocations)
const globalForOtp = globalThis as unknown as {
  otpStore?: Map<string, OtpEntry>
}

const otpStore = globalForOtp.otpStore || new Map<string, OtpEntry>()
if (process.env.NODE_ENV !== 'production') globalForOtp.otpStore = otpStore

export class OtpService {
  /**
   * Generate and store a 6-digit OTP for department deletion
   */
  static generateOtp(deptId: string, email: string): string {
    const key = `${deptId}_${email.toLowerCase()}`
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes TTL

    otpStore.set(key, { otp, email: email.toLowerCase(), deptId, expiresAt })
    logger.info(`[OtpService] Generated OTP for key: ${key}`)

    return otp
  }

  /**
   * Verify an OTP for department deletion
   */
  static verifyOtp(deptId: string, email: string, inputOtp: string): { valid: boolean; reason?: string } {
    const key = `${deptId}_${email.toLowerCase()}`
    const entry = otpStore.get(key)

    if (!entry) {
      return { valid: false, reason: 'OTP expired or not requested. Please request a new OTP.' }
    }

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(key)
      return { valid: false, reason: 'OTP has expired. Please request a new OTP.' }
    }

    if (entry.otp.trim() !== inputOtp.trim()) {
      return { valid: false, reason: 'Invalid OTP code. Please check and try again.' }
    }

    // OTP verified successfully, clear it to prevent reuse
    otpStore.delete(key)
    return { valid: true }
  }
}
