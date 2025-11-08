/**
 * Simple notification service for user feedback
 */
export class NotificationService {
  /**
   * Show a user-friendly notification
   */
  static showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    if (typeof window === 'undefined') return

    // Create notification element
    const notification = document.createElement('div')
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${
      type === 'error' ? 'bg-red-500 text-white' :
      type === 'warning' ? 'bg-yellow-500 text-black' :
      'bg-blue-500 text-white'
    }`
    
    notification.innerHTML = `
      <div class="flex items-center">
        <div class="flex-1">
          <p class="text-sm font-medium">${message}</p>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-current opacity-70 hover:opacity-100">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    `

    // Add to DOM
    document.body.appendChild(notification)

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove()
      }
    }, 5000)
  }

  /**
   * Show session expired notification
   */
  static showSessionExpired(): void {
    this.showNotification(
      'Your session has expired. Please sign in again.',
      'warning'
    )
  }

  /**
   * Show authentication error notification
   */
  static showAuthError(): void {
    this.showNotification(
      'Authentication failed. Please sign in again.',
      'error'
    )
  }
}
