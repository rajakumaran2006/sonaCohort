'use client'

import { useState, useRef } from 'react'
import { AssignmentService } from '@/lib/services/assignmentService'
import { PeerTutorService } from '@/lib/services/peerTutorService'
import { StudentService } from '@/lib/services/studentService'
import { MicrosoftGraphService } from '@/lib/auth/microsoftGraph'
import { useAuth } from '@/lib/auth/AuthContext'
import * as XLSX from 'xlsx'

interface BulkImportExportProps {
  dept: string
  year: string
  section: string
  onImportComplete: () => void
}

interface ImportPreview {
  validAssignments: Array<{
    peerTutorEmail: string
    peerTutorName: string
    studentEmail: string
    studentName: string
  }>
  invalidStudents: Array<{
    studentEmail: string
    studentName: string
    reason: string
  }>
  invalidPeerTutors: Array<{
    peerTutorEmail: string
    peerTutorName: string
    reason: string
  }>
}

interface ImportResult {
  success: boolean
  added: number
  skipped: string[]
  errors: string[]
}

export default function BulkImportExport({ dept, year, section, onImportComplete }: BulkImportExportProps) {
  const { user } = useAuth()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showImportResult, setShowImportResult] = useState(false)
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExportTemplate = async () => {
    try {
      setIsExporting(true)
      
      // Create template with headers
      const templateData = [
        ['Peer Tutor Email', 'Peer Tutor Name', 'Student Email', 'Student Name']
      ]
      
      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(templateData)
      
      // Set column widths
      ws['!cols'] = [
        { wch: 25 }, // Peer Tutor Email
        { wch: 25 }, // Peer Tutor Name
        { wch: 25 }, // Student Email
        { wch: 25 }  // Student Name
      ]
      
      XLSX.utils.book_append_sheet(wb, ws, 'Import Template')
      
      // Export as Excel file
      XLSX.writeFile(wb, `peer_tutor_assignment_template_${dept}_${year}_${section}.xlsx`)
      
    } catch (error) {
      console.error('Error exporting template:', error)
      alert('Error exporting template. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportData = async () => {
    try {
      setIsExporting(true)
      
      // Get existing assignments
      const assignments = await AssignmentService.getAssignmentsBySection(dept, year, section)
      
      // Get peer tutors and students data
      const peerTutors = await PeerTutorService.getPeerTutorsBySection(dept, year, section)
      const students = await StudentService.getStudentsBySection(dept, year, section)
      
      // Create data array
      const exportData = [
        ['Peer Tutor Email', 'Peer Tutor Name', 'Student Email', 'Student Name']
      ]
      
      // Add existing assignments
      assignments.forEach(assignment => {
        const peerTutor = peerTutors.find(pt => pt.id === assignment.peer_tutor_id)
        const student = students.find(s => s.id === assignment.student_id)
        
        if (peerTutor && student) {
          exportData.push([
            peerTutor.email,
            peerTutor.name,
            student.email,
            student.name
          ])
        }
      })
      
      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(exportData)
      
      // Set column widths
      ws['!cols'] = [
        { wch: 25 }, // Peer Tutor Email
        { wch: 25 }, // Peer Tutor Name
        { wch: 25 }, // Student Email
        { wch: 25 }  // Student Name
      ]
      
      XLSX.utils.book_append_sheet(wb, ws, 'Current Assignments')
      
      // Export as Excel file
      XLSX.writeFile(wb, `peer_tutor_assignments_${dept}_${year}_${section}.xlsx`)
      
    } catch (error) {
      console.error('Error exporting data:', error)
      alert('Error exporting data. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Please select an Excel file (.xlsx or .xls).')
      return
    }

    try {
      setIsImporting(true)
      
      // Read Excel file
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
      
      // Skip header row
      const rows = jsonData.slice(1) as string[][]
      
      // Validate and preview data
      const preview = await validateImportData(rows)
      setImportPreview(preview)
      setShowImportPreview(true)
      
    } catch (error) {
      console.error('Error reading Excel file:', error)
      alert('Error reading Excel file. Please check the file format and try again.')
    } finally {
      setIsImporting(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const validateImportData = async (rows: string[][]): Promise<ImportPreview> => {
    const validAssignments: ImportPreview['validAssignments'] = []
    const invalidStudents: ImportPreview['invalidStudents'] = []
    const invalidPeerTutors: ImportPreview['invalidPeerTutors'] = []
    
    if (!user?.id) {
      console.error('No user ID available for validation')
      return { validAssignments, invalidStudents, invalidPeerTutors }
    }
    
    // Get existing peer tutors and students
    const existingPeerTutors = await PeerTutorService.getPeerTutorsBySection(dept, year, section)
    const existingStudents = await StudentService.getStudentsBySection(dept, year, section)
    
    for (const row of rows) {
      if (row.length < 4) continue
      
      const [peerTutorEmail, peerTutorName, studentEmail, studentName] = row
      
      if (!peerTutorEmail || !studentEmail) continue
      
      let peerTutor: any = existingPeerTutors.find(pt => pt.email.toLowerCase() === peerTutorEmail.toLowerCase())
      let student: any = existingStudents.find(s => s.email.toLowerCase() === studentEmail.toLowerCase())
      
      // If peer tutor not found locally, check Microsoft Graph and create if exists
      if (!peerTutor) {
        const microsoftPeerTutor = await MicrosoftGraphService.getUserByEmail(peerTutorEmail)
        if (microsoftPeerTutor) {
          peerTutor = await PeerTutorService.createFromMicrosoftUser(
            microsoftPeerTutor,
            user.id,
            dept,
            year,
            section
          )
          if (peerTutor) {
            console.log(`Auto-created peer tutor: ${peerTutor.name} (${peerTutor.email})`)
          }
        }
      }
      
      // If student not found locally, check Microsoft Graph and create if exists
      if (!student) {
        const microsoftStudent = await MicrosoftGraphService.getUserByEmail(studentEmail)
        if (microsoftStudent) {
          student = await StudentService.createFromMicrosoftUser(
            microsoftStudent,
            user.id,
            dept,
            year,
            section
          )
          if (student) {
            console.log(`Auto-created student: ${student.name} (${student.email})`)
          }
        }
      }
      
      // Check if peer tutor was found or created
      if (!peerTutor) {
        invalidPeerTutors.push({
          peerTutorEmail,
          peerTutorName: peerTutorName || 'Unknown',
          reason: 'Peer tutor not found in Microsoft Graph or this section'
        })
        continue
      }
      
      // Check if student was found or created
      if (!student) {
        invalidStudents.push({
          studentEmail,
          studentName: studentName || 'Unknown',
          reason: 'Student not found in Microsoft Graph or this section'
        })
        continue
      }
      
      // Check if already assigned
      const existingAssignment = await AssignmentService.getAssignmentByStudentAndTutor(student.id, peerTutor.id)
      if (existingAssignment) {
        invalidStudents.push({
          studentEmail,
          studentName: studentName || 'Unknown',
          reason: 'Student already assigned to a peer tutor'
        })
        continue
      }
      
      validAssignments.push({
        peerTutorEmail,
        peerTutorName: peerTutorName || peerTutor.name,
        studentEmail,
        studentName: studentName || student.name
      })
    }
    
    return {
      validAssignments,
      invalidStudents,
      invalidPeerTutors
    }
  }

  const handleConfirmImport = async () => {
    if (!importPreview || !user?.id) return
    
    try {
      setIsImporting(true)
      
      const results: ImportResult = {
        success: true,
        added: 0,
        skipped: [],
        errors: []
      }
      
      // Process valid assignments
      for (const assignment of importPreview.validAssignments) {
        try {
          // Get peer tutor and student IDs (they should exist since validation passed)
          const peerTutors = await PeerTutorService.getPeerTutorsBySection(dept, year, section)
          const students = await StudentService.getStudentsBySection(dept, year, section)
          
          const peerTutor = peerTutors.find(pt => pt.email.toLowerCase() === assignment.peerTutorEmail.toLowerCase())
          const student = students.find(s => s.email.toLowerCase() === assignment.studentEmail.toLowerCase())
          
          if (peerTutor && student) {
            const success = await AssignmentService.createAssignment({
              peer_tutor_id: peerTutor.id,
              student_id: student.id,
              department: dept,
              year: year,
              section: section,
              assigned_date: new Date().toISOString().split('T')[0]
            })
            
            if (success) {
              results.added++
            } else {
              results.errors.push(`Failed to assign ${assignment.studentEmail} to ${assignment.peerTutorEmail}`)
            }
          } else {
            results.errors.push(`Could not find peer tutor or student for assignment: ${assignment.studentEmail} to ${assignment.peerTutorEmail}`)
          }
        } catch (error) {
          results.errors.push(`Failed to assign ${assignment.studentEmail} to ${assignment.peerTutorEmail}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
      
      // Add skipped items
      results.skipped = [
        ...importPreview.invalidStudents.map(s => `${s.studentEmail} - ${s.reason}`),
        ...importPreview.invalidPeerTutors.map(pt => `${pt.peerTutorEmail} - ${pt.reason}`)
      ]
      
      setImportResult(results)
      setShowImportResult(true)
      setShowImportPreview(false)
      
      if (results.added > 0) {
        onImportComplete() // Refresh the assignments
      }
      
    } catch (error) {
      console.error('Error importing assignments:', error)
      alert('Error importing assignments. Please try again.')
    } finally {
      setIsImporting(false)
    }
  }

  const closeImportResult = () => {
    setShowImportResult(false)
    setImportResult(null)
  }

  const closeImportPreview = () => {
    setShowImportPreview(false)
    setImportPreview(null)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Import/Export Peer Tutor Assignments</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Section */}
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-800">Export</h4>
          
          <div className="space-y-3">
            <button
              onClick={handleExportTemplate}
              disabled={isExporting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Export Template</span>
                </>
              )}
            </button>
            
            <button
              onClick={handleExportData}
              disabled={isExporting}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Export Current Data</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Import Section */}
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-800">Import</h4>
          
          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
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
                  <span>Import Excel File</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Excel Format Info */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Excel Format</h4>
        <p className="text-xs text-gray-600 mb-2">
          The Excel file should have the following columns:
        </p>
        <div className="text-xs text-gray-600 font-mono bg-white p-2 rounded border">
          Peer Tutor Email | Peer Tutor Name | Student Email | Student Name
        </div>
        <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
          <p className="text-xs text-blue-800 font-medium mb-1">Auto-Import Feature</p>
          <p className="text-xs text-blue-700">
            The system will automatically check Microsoft Graph and add users if they exist there. 
            You don't need to manually add peer tutors and students before importing assignments!
          </p>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Note: The system will validate all emails, auto-create users from Microsoft Graph, and show a preview before importing.
        </p>
      </div>

      {/* Import Preview Modal */}
      {showImportPreview && importPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Import Preview</h3>
              <button
                onClick={closeImportPreview}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{importPreview.validAssignments.length}</div>
                  <div className="text-sm text-green-700">Valid Assignments</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{importPreview.invalidStudents.length}</div>
                  <div className="text-sm text-red-700">Invalid Students</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{importPreview.invalidPeerTutors.length}</div>
                  <div className="text-sm text-yellow-700">Invalid Peer Tutors</div>
                </div>
              </div>

              {/* Valid Assignments Preview */}
              {importPreview.validAssignments.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Valid Assignments (will be imported)</h4>
                  <div className="max-h-32 overflow-y-auto border rounded">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1 text-left">Peer Tutor</th>
                          <th className="px-2 py-1 text-left">Student</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.validAssignments.map((assignment, index) => (
                          <tr key={index} className="border-t">
                            <td className="px-2 py-1">{assignment.peerTutorName} ({assignment.peerTutorEmail})</td>
                            <td className="px-2 py-1">{assignment.studentName} ({assignment.studentEmail})</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Invalid Students */}
              {importPreview.invalidStudents.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Students that cannot be added</h4>
                  <div className="max-h-32 overflow-y-auto">
                    {importPreview.invalidStudents.map((student, index) => (
                      <div key={index} className="text-sm text-red-700 bg-red-50 p-2 rounded mb-1">
                        <strong>{student.studentName}</strong> ({student.studentEmail}) - {student.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invalid Peer Tutors */}
              {importPreview.invalidPeerTutors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Invalid Peer Tutors</h4>
                  <div className="max-h-32 overflow-y-auto">
                    {importPreview.invalidPeerTutors.map((peerTutor, index) => (
                      <div key={index} className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded mb-1">
                        <strong>{peerTutor.peerTutorName}</strong> ({peerTutor.peerTutorEmail}) - {peerTutor.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={closeImportPreview}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importPreview.validAssignments.length === 0}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Confirm Import ({importPreview.validAssignments.length} assignments)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Result Modal */}
      {showImportResult && importResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Import Results</h3>
              <button
                onClick={closeImportResult}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{importResult.added}</div>
                  <div className="text-sm text-green-700">Added</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{importResult.skipped.length}</div>
                  <div className="text-sm text-yellow-700">Skipped</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{importResult.errors.length}</div>
                  <div className="text-sm text-red-700">Errors</div>
                </div>
              </div>

              {/* Skipped Items */}
              {importResult.skipped.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Skipped Items</h4>
                  <div className="max-h-32 overflow-y-auto">
                    {importResult.skipped.map((item, index) => (
                      <div key={index} className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded mb-1">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {importResult.errors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Errors</h4>
                  <div className="max-h-32 overflow-y-auto">
                    {importResult.errors.map((error, index) => (
                      <div key={index} className="text-sm text-red-700 bg-red-50 p-2 rounded mb-1">
                        {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={closeImportResult}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}