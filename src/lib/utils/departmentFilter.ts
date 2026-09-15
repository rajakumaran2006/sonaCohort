/**
 * Department Filter Utility
 * Provides helpers to construct robust Supabase/PostgREST query filters
 * and in-memory predicates that accurately scope records to the active department.
 *
 * Handles:
 * 1. Exact department UUID (faculty_id) matching.
 * 2. Exact department name matching (properly double-quoted for PostgREST syntax).
 * 3. Base department name fallback for semester-annotated departments (e.g. "AIDS (ODD SEM)" -> "AIDS")
 *    only for historical records where faculty_id IS NULL, ensuring new departments (like "ADS 2nd Year")
 *    remain strictly isolated without any cross-contamination.
 */

export interface DepartmentInfo {
  cleanDept: string
  baseDept: string
  isSuffixDept: boolean
}

/**
 * Extracts clean and base department names from a given department string.
 * Examples:
 * - "AIDS (ODD SEM)" -> cleanDept: "AIDS (ODD SEM)", baseDept: "AIDS", isSuffixDept: true
 * - "ADS 2nd Year"   -> cleanDept: "ADS 2nd Year", baseDept: "ADS 2nd Year", isSuffixDept: false
 */
export function getDepartmentNames(dept?: string): DepartmentInfo {
  let cleanDept = (dept || '').trim()
  try {
    cleanDept = decodeURIComponent(cleanDept)
  } catch {
    // Ignore decode error
  }
  // Strip parentheses and their contents, e.g. "(ODD SEM)", "(EVEN SEM)", etc.
  const baseDept = cleanDept.replace(/\s*\(.*?\)\s*/g, '').trim()
  const isSuffixDept = Boolean(baseDept && baseDept.toLowerCase() !== cleanDept.toLowerCase())

  return { cleanDept, baseDept, isSuffixDept }
}

/**
 * Builds a PostgREST .or() filter string for querying Supabase tables.
 *
 * @param dept Department name (e.g. "AIDS (ODD SEM)", "ADS 2nd Year")
 * @param facultyId Department UUID (e.g. "1f5a907f-3158-4a65-b9fd-67fc651d9bc5")
 * @param tablePrefix Optional table prefix for joined queries without referencedTable (e.g. 'peer_tutors')
 */
export function buildDepartmentFilter(
  dept?: string,
  facultyId?: string,
  tablePrefix?: string
): string | null {
  const colFaculty = tablePrefix ? `${tablePrefix}.faculty_id` : 'faculty_id'
  const colDept = tablePrefix ? `${tablePrefix}.dept` : 'dept'

  const { cleanDept, baseDept, isSuffixDept } = getDepartmentNames(dept)
  const conditions: string[] = []

  // 1. Explicit department UUID match (primary isolation mechanism)
  if (facultyId) {
    conditions.push(`${colFaculty}.eq.${facultyId}`)
  }

  // 2. Exact department name match (double-quoted to handle spaces and parentheses in PostgREST)
  if (cleanDept) {
    conditions.push(`${colDept}.eq."${cleanDept}"`)
  }

  // 3. If this department has a semester/session suffix (e.g. "AIDS (ODD SEM)"),
  // match historical base-code records (e.g. "AIDS" or "ADS") ONLY if faculty_id IS NULL.
  // This ensures historical records are retrieved for the base department,
  // while strictly preventing records allocated to another department (e.g. "ADS 2nd Year") from leaking.
  if (isSuffixDept && baseDept) {
    conditions.push(`and(${colDept}.ilike."${baseDept}",${colFaculty}.is.null)`)

    // Handle common synonyms between AIDS and ADS if applicable
    if (baseDept.toUpperCase() === 'AIDS') {
      conditions.push(`and(${colDept}.ilike."ADS",${colFaculty}.is.null)`)
    } else if (baseDept.toUpperCase() === 'ADS') {
      conditions.push(`and(${colDept}.ilike."AIDS",${colFaculty}.is.null)`)
    }
  }

  if (conditions.length === 0) return null
  return conditions.join(',')
}

/**
 * In-memory predicate to check if a record matches a given department.
 */
export function matchesDepartment(
  recordDept?: string | null,
  recordFacultyId?: string | null,
  targetDept?: string,
  targetFacultyId?: string
): boolean {
  if (!targetDept && !targetFacultyId) return true

  // 1. Match by department UUID
  if (targetFacultyId && recordFacultyId && recordFacultyId === targetFacultyId) {
    return true
  }

  const { cleanDept, baseDept, isSuffixDept } = getDepartmentNames(targetDept)
  const normRecordDept = (recordDept || '').trim().toLowerCase()

  // 2. Match by exact department name
  if (cleanDept && normRecordDept === cleanDept.toLowerCase()) {
    return true
  }

  // 3. Match historical base department if unassigned
  if (isSuffixDept && baseDept && (!recordFacultyId || recordFacultyId === targetFacultyId)) {
    if (normRecordDept === baseDept.toLowerCase()) return true
    if (baseDept.toUpperCase() === 'AIDS' && normRecordDept === 'ads') return true
    if (baseDept.toUpperCase() === 'ADS' && normRecordDept === 'aids') return true
  }

  return false
}
