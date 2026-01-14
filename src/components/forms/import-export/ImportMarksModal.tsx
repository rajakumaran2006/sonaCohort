/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useRef } from 'react'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@/components/ui'
import { Button } from '@/components/ui'

import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { ExamMarksService } from '@/lib/services/examMarksService'
import { ExamSubject } from '@/lib/services/examSubjectService'
import { toast } from 'sonner'

interface ImportMarksModalProps {
  isOpen: boolean
  onClose: () => void
  examId: string
  peertutorsId: string
  availableSubjects: ExamSubject[]
  onImportComplete: () => void
}

interface ImportResult {
  success: number
  failed: number
  skipped: number
  errors: string[]
}

export default function ImportMarksModal({
  isOpen,
  onClose,
  examId,
  peertutorsId,
  availableSubjects,
  onImportComplete,
}: ImportMarksModalProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('')
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showResult, setShowResult] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.warning('Please select an Excel file (.xlsx or .xls).')
      return
    }

    if (!selectedSubjectId) {
      toast.warning('Please select a subject first.')
      return
    }

    try {
      setIsImporting(true)
      setImportResult(null)
      setShowResult(false)

      // Read Excel file
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { cellDates: true, cellNF: false, cellText: false })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      
      // Handle merged cells - expand merged cell values to all cells in the merge
      if (worksheet['!merges']) {
        worksheet['!merges'].forEach((merge: any) => {
          const startCell = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c })
          const startValue = worksheet[startCell]?.v || worksheet[startCell]?.w || ''
          
          // Expand the value to all cells in the merge range
          for (let row = merge.s.r; row <= merge.e.r; row++) {
            for (let col = merge.s.c; col <= merge.e.c; col++) {
              const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
              if (!worksheet[cellRef] || !worksheet[cellRef].v) {
                if (!worksheet[cellRef]) {
                  worksheet[cellRef] = {}
                }
                worksheet[cellRef].v = startValue
                worksheet[cellRef].w = String(startValue)
              }
            }
          }
        })
      }

      // Convert to JSON array with proper handling of empty cells
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1, 
        defval: '', // Use empty string for empty cells instead of undefined
        raw: false // Get formatted values
      }) as any[][]

      // Find header row and locate columns - search more rows to handle merged header cells
      let headerRowIndex = -1
      let studentNameColIndex = -1
      let consolidatedMarkColIndex = -1

      // Search through more rows (up to 20) to handle merged header cells
      for (let i = 0; i < Math.min(20, jsonData.length); i++) {
        const row = jsonData[i]
        if (!row || row.length === 0) continue

        // Look for StudentName column (case-insensitive)
        const studentNameVariants = ['studentname', 'student name', 'name', 'student']
        // Handle both "Consolidated Mark" and "Consolidted Mark" (with typo)
        const markVariants = ['consolidted mark', 'consolidated mark', 'consolidatedmark', 'consolidated', 'consolidted', 'mark', 'marks', 'total']

        for (let j = 0; j < row.length; j++) {
          const cellValue = String(row[j] || '').toLowerCase().trim()
          
          if (studentNameColIndex === -1 && studentNameVariants.some(v => cellValue.includes(v))) {
            studentNameColIndex = j
          }
          
          if (consolidatedMarkColIndex === -1 && markVariants.some(v => cellValue.includes(v))) {
            consolidatedMarkColIndex = j
          }
        }

        if (studentNameColIndex !== -1 && consolidatedMarkColIndex !== -1) {
          headerRowIndex = i
          break
        }
      }

      if (studentNameColIndex === -1 || consolidatedMarkColIndex === -1) {
        toast.error('Could not find "StudentName" and "Consolidated Mark" (or "Consolidted Mark") columns in the Excel file. Please ensure these columns exist.')
        return
      }

      // Extract data rows - skip empty rows after header
      const dataRows = jsonData.slice(headerRowIndex + 1).filter(row => {
        // Keep rows that have at least the student name column filled
        return row && row.length > 0 && row[studentNameColIndex] && String(row[studentNameColIndex]).trim() !== ''
      })

      // Get all students from database
      const supabase = createClient()
      const { data: allStudents, error: studentsError } = await supabase
        .from('peer_students')
        .select('id, name, assigned_peer_tutor_id, dept, year, section')
        .eq('peer_tutor', false)

      if (studentsError) {
        console.error('Error fetching students:', studentsError)
        toast.error('Error fetching students from database. Please try again.')
        return
      }

      // Create a name mapping (case-insensitive, trimmed, normalized spaces)
      const nameToStudents = new Map<string, typeof allStudents>()
      allStudents?.forEach(student => {
        // Normalize name: lowercase, trim, replace multiple spaces with single space, handle Unicode spaces
        const normalizedName = (student.name || '')
          .toLowerCase()
          .trim()
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
          .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, ' ') // Replace various Unicode spaces
          .trim()
        
        if (normalizedName) {
          if (!nameToStudents.has(normalizedName)) {
            nameToStudents.set(normalizedName, [])
          }
          nameToStudents.get(normalizedName)!.push(student)
        }
      })

      // Process import
      const result: ImportResult = {
        success: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      }

      // Get all exam subjects for all exams to check if subject exists
      const { data: allExamSubjects } = await supabase
        .from('exam_subjects')
        .select('id, exam_id, subject_name')

      // Create a map of exam_id -> subject_name -> exam_subject_id
      const examSubjectMap = new Map<string, Map<string, string>>()
      allExamSubjects?.forEach(subject => {
        if (!examSubjectMap.has(subject.exam_id)) {
          examSubjectMap.set(subject.exam_id, new Map())
        }
        examSubjectMap.get(subject.exam_id)!.set(subject.subject_name, subject.id)
      })

      // Get the selected subject name
      const selectedSubject = availableSubjects.find(s => s.id === selectedSubjectId)
      if (!selectedSubject) {
        toast.error('Selected subject not found.')
        return
      }

      // Process each row
      for (const row of dataRows) {
        if (!row || row.length === 0) continue

        const studentName = String(row[studentNameColIndex] || '').trim()
        const markValue = row[consolidatedMarkColIndex]

        // Skip empty rows
        if (!studentName || markValue === undefined || markValue === null || markValue === '') {
          result.skipped++
          continue
        }

        // Normalize student name for matching (remove extra spaces, handle variations)
        // Handle non-breaking spaces and other whitespace characters
        const normalizedName = studentName
          .toLowerCase()
          .trim()
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
          .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, ' ') // Replace various Unicode spaces
          .trim()
        
        const foundStudents = nameToStudents.get(normalizedName) || []
        
        // Debug: log if no exact match found (helps troubleshoot)
        if (foundStudents.length === 0 && studentName) {
          console.log(`No exact match for: "${studentName}" -> normalized: "${normalizedName}"`)
        }
        
        // If exact match not found, try to find students with very similar names
        // This handles cases where names might have slight formatting differences
        if (foundStudents.length === 0) {
          allStudents?.forEach(student => {
            // Use the same normalization as above
            const dbName = (student.name || '')
              .toLowerCase()
              .trim()
              .replace(/\s+/g, ' ')
              .replace(/\u00A0/g, ' ')
              .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
              .trim()
            
            // Only match if names are very similar (exact match after normalization, or one contains the other with minimal difference)
            if (dbName && normalizedName) {
              // Exact match after normalization (should have been caught above, but double-check)
              if (dbName === normalizedName) {
                foundStudents.push(student)
              }
              // If one name contains the other and they're very close (max 3 char difference)
              else {
                const nameLengthDiff = Math.abs(dbName.length - normalizedName.length)
                if (nameLengthDiff <= 3) {
                  const longerName = dbName.length > normalizedName.length ? dbName : normalizedName
                  const shorterName = dbName.length > normalizedName.length ? normalizedName : dbName
                  // Only match if shorter name is at least 80% of longer name length
                  if (longerName.includes(shorterName) && shorterName.length >= longerName.length * 0.8) {
                    if (!foundStudents.find(s => s.id === student.id)) {
                      foundStudents.push(student)
                    }
                  }
                }
              }
            }
          })
        }

        if (foundStudents.length === 0) {
          result.skipped++
          // Show what was searched for (normalized) to help debug
          result.errors.push(`Student "${studentName}" (normalized: "${normalizedName}") not found in database`)
          continue
        }

        // Process each matching student (in case of duplicates)
        for (const student of foundStudents) {
          if (!student.assigned_peer_tutor_id) {
            result.skipped++
            result.errors.push(`Student "${studentName}" (${student.dept}/${student.year}/${student.section}) has no assigned peer tutor`)
            continue
          }

          // Get the peer tutor's info to find their year
          const { data: peertutors, error: peertutorsError } = await supabase
            .from('peer_tutors')
            .select('year')
            .eq('id', student.assigned_peer_tutor_id)
            .single()

          if (peertutorsError || !peertutors) {
            result.skipped++
            result.errors.push(`Could not find peer tutor for "${studentName}"`)
            continue
          }

          // Get all exams for this peer tutor's year
          const { data: allExams } = await supabase
            .from('exams')
            .select('id, years')
          
          // Filter exams that include this peer tutor's year
          const peertutorsExams = (allExams || []).filter((exam: any) => 
            exam.years && Array.isArray(exam.years) && exam.years.includes(peertutors.year)
          )

          if (peertutorsExams.length === 0) {
            result.skipped++
            result.errors.push(`No exams found for peer tutor's year (${peertutors.year}) for "${studentName}"`)
            continue
          }

          // Check if the selected subject exists for any of this peer tutor's exams
          // If student belongs to current peer tutor, prefer current exam
          let foundExamSubjectId: string | null = null
          let foundExamId: string | null = null

          // First, check current exam if student belongs to current peer tutor
          if (student.assigned_peer_tutor_id === peertutorsId) {
            const currentExamSubjects = examSubjectMap.get(examId)
            if (currentExamSubjects && currentExamSubjects.has(selectedSubject.subject_name)) {
              foundExamSubjectId = currentExamSubjects.get(selectedSubject.subject_name)!
              foundExamId = examId
            }
          }

          // If not found in current exam, check all other exams
          if (!foundExamSubjectId) {
            for (const exam of peertutorsExams) {
              const examSubjects = examSubjectMap.get(exam.id)
              if (examSubjects && examSubjects.has(selectedSubject.subject_name)) {
                foundExamSubjectId = examSubjects.get(selectedSubject.subject_name)!
                foundExamId = exam.id
                break
              }
            }
          }

          if (!foundExamSubjectId || !foundExamId) {
            result.skipped++
            result.errors.push(`Subject "${selectedSubject.subject_name}" does not exist in any exam for peer tutor of "${studentName}"`)
            continue
          }

          // Parse mark value - handle various formats
          let mark: number | string = ''
          if (typeof markValue === 'number') {
            mark = markValue.toString()
          } else if (typeof markValue === 'string') {
            // Try to parse "40/100" format or just "40"
            const markStr = markValue.trim()
            if (!markStr || markStr === '' || markStr.toLowerCase() === 'null') {
              result.skipped++
              result.errors.push(`Empty mark value for "${studentName}"`)
              continue
            }
            if (markStr.includes('/')) {
              mark = markStr.split('/')[0].trim()
            } else {
              mark = markStr
            }
            // Validate it's a number
            const numValue = parseFloat(mark)
            if (isNaN(numValue)) {
              result.skipped++
              result.errors.push(`Invalid mark value "${markValue}" for "${studentName}"`)
              continue
            }
          } else {
            result.skipped++
            result.errors.push(`Invalid mark value type for "${studentName}"`)
            continue
          }

          // Save marks
          const markData = {
            exam_id: foundExamId,
            peer_tutor_id: student.assigned_peer_tutor_id,
            student_id: student.id,
            exam_subject_id: foundExamSubjectId,
            marks: {
              marks: mark,
            },
          }

          const saved = await ExamMarksService.saveExamMarks(markData)
          if (saved) {
            result.success++
          } else {
            result.failed++
            result.errors.push(`Failed to save marks for "${studentName}"`)
          }
        }
      }

      setImportResult(result)
      setShowResult(true)
      onImportComplete()

    } catch (error) {
      console.error('Error importing marks:', error)
      toast.error('Error importing marks. Please check the file format and try again.')
    } finally {
      setIsImporting(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleClose = () => {
    setSelectedSubjectId('')
    setImportResult(null)
    setShowResult(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
      <ModalHeader onClose={handleClose}>
        <ModalTitle>Import Marks from Excel</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          {/* Subject Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Subject
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isImporting}
            >
              <option value="">-- Select a subject --</option>
              {availableSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.subject_name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Select the subject to import marks for
            </p>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Excel File
            </label>
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isImporting || !selectedSubjectId}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting || !selectedSubjectId}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                {isImporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Choose Excel File</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              The file must contain &quot;StudentName&quot; and &quot;Consolidated Mark&quot; (or &quot;Consolidted Mark&quot;) columns
            </p>
          </div>

          {/* Import Result */}
          {showResult && importResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Import Results</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Successfully imported:</span>
                  <span className="font-medium text-green-600">{importResult.success}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Failed:</span>
                  <span className="font-medium text-red-600">{importResult.failed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Skipped:</span>
                  <span className="font-medium text-yellow-600">{importResult.skipped}</span>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="mt-3 max-h-32 overflow-y-auto">
                  <p className="text-xs font-medium text-gray-700 mb-1">Errors:</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {importResult.errors.slice(0, 10).map((error, idx) => (
                      <li key={idx} className="truncate">• {error}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li className="text-gray-500">... and {importResult.errors.length - 10} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={handleClose} disabled={isImporting}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  )
}

