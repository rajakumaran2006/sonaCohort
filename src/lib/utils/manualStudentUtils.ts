import { Student } from '../services/studentService'

/**
 * Check if a student is manually added (no email)
 */
export function isManualStudent(student: Student): boolean {
  return student.is_manual_entry === true || student.email === null
}

/**
 * Check if an email can be assigned to a student
 */
export function canAssignEmail(student: Student): boolean {
  return isManualStudent(student)
}

/**
 * Format manual student display name with indicator
 */
export function formatManualStudentDisplay(student: Student): string {
  if (isManualStudent(student)) {
    return `${student.name} (Manual Entry)`
  }
  return student.name
}
