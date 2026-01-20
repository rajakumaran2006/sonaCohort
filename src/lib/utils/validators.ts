// Validates if a string is a valid URL
export const isValidUrl = (urlString: string): boolean => {
  if (!urlString) return false
  try {
    const url = new URL(urlString)
    // Allow http or https
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    // Basic format check if new URL fails (for things like "google.com")
    return /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/.test(urlString)
  }
}
