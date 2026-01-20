/**
 * Formats a time string (HH:mm:ss or HH:mm) to 12-hour format with AM/PM
 * @param timeStr Time string in HH:mm:ss or HH:mm format
 * @returns Formatted time string (e.g., "10:30 AM") or "--:--" if invalid
 */
export function formatTimeTo12Hour(timeStr: string | null | undefined): string {
  if (!timeStr) return '--:--'

  try {
    // Split the time string and get hours and minutes
    const parts = timeStr.split(':')
    if (parts.length < 2) return timeStr

    let hours = parseInt(parts[0], 10)
    const minutes = parseInt(parts[1], 10)

    if (isNaN(hours) || isNaN(minutes)) return timeStr

    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    hours = hours ? hours : 12 // the hour '0' should be '12'
    const minutesStr = minutes < 10 ? '0' + minutes : minutes

    return `${hours}:${minutesStr} ${ampm}`
  } catch {
    return timeStr
  }
}

/**
 * Sorts an array of objects by a date field and then a time field
 * @param items Array of objects to sort
 * @param dateField The field name containing the date (ISO string or YYYY-MM-DD)
 * @param timeField The field name containing the time (HH:mm:ss or HH:mm)
 * @param ascending Whether to sort in ascending order (default: true)
 * @returns Sorted array
 */
export function sortByDateAndTime<T>(
  items: T[],
  dateField: keyof T,
  timeField: keyof T,
  ascending: boolean = true
): T[] {
  return [...items].sort((a, b) => {
    const dateA = new Date(a[dateField] as unknown as string).getTime()
    const dateB = new Date(b[dateField] as unknown as string).getTime()

    if (dateA !== dateB) {
      return ascending ? dateA - dateB : dateB - dateA
    }

    // Dates are equal, sort by time
    const timeA = String(a[timeField] || '00:00')
    const timeB = String(b[timeField] || '00:00')

    return ascending 
      ? timeA.localeCompare(timeB)
      : timeB.localeCompare(timeA)
  })
}
