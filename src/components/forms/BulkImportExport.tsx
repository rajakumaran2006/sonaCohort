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
    status: 'valid'
    reason: string
  }>
  invalidAssignments: Array<{
    peerTutorEmail: string
    peerTutorName: string
    studentEmail: string
    studentName: string
    status: 'invalid'
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


  const handleExportData = async () => {
    try {
      setIsExporting(true)
      
      // Get existing assignments
      const assignments = await AssignmentService.getAssignmentsBySection(dept, year, section)
      
      // Get peer tutors and students data
      const peerTutors = await PeerTutorService.getPeerTutorsBySection(dept, year, section)
      const students = await StudentService.getStudentsBySection(dept, year, section)
      
      // Create data array - only emails as requested
      const exportData = [
        ['Peer Tutor Email', 'Student Email']
      ]
      
      // Add existing assignments
      assignments.forEach(assignment => {
        const peerTutor = peerTutors.find(pt => pt.id === assignment.peer_tutor_id)
        const student = students.find(s => s.id === assignment.student_id)
        
        if (peerTutor && student) {
          exportData.push([
            peerTutor.email,
            student.email
          ])
        }
      })
      
      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(exportData)
      
      // Set column widths
      ws['!cols'] = [
        { wch: 30 }, // Peer Tutor Email
        { wch: 30 }  // Student Email
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
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][]
      
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
    const invalidAssignments: ImportPreview['invalidAssignments'] = []
    
    if (!user?.id) {
      console.error('No user ID available for validation')
      return { validAssignments, invalidAssignments }
    }
    
    // Get existing peer tutors and students
    const existingPeerTutors = await PeerTutorService.getPeerTutorsBySection(dept, year, section)
    const existingStudents = await StudentService.getStudentsBySection(dept, year, section)
    
    for (const row of rows) {
      if (row.length < 2) continue
      
      const [peerTutorEmail, studentEmail] = row
      
      if (!peerTutorEmail || !studentEmail) continue
      
      let peerTutor: PeerTutor | undefined = existingPeerTutors.find(pt => pt.email.toLowerCase() === peerTutorEmail.toLowerCase())
      let student: Student | undefined = existingStudents.find(s => s.email.toLowerCase() === studentEmail.toLowerCase())
      
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
        invalidAssignments.push({
          peerTutorEmail,
          peerTutorName: 'Unknown',
          studentEmail,
          studentName: 'Unknown',
          status: 'invalid',
          reason: 'Peer tutor not found in Microsoft Graph or this section'
        })
        continue
      }
      
      // Check if student was found or created
      if (!student) {
        invalidAssignments.push({
          peerTutorEmail,
          peerTutorName: peerTutor.name,
          studentEmail,
          studentName: 'Unknown',
          status: 'invalid',
          reason: 'Student not found in Microsoft Graph or this section'
        })
        continue
      }
      
      // Check if peer tutor is also a student (conflict)
      const isPeerTutorAlsoStudent = await StudentService.isStudent(peerTutorEmail)
      if (isPeerTutorAlsoStudent) {
        invalidAssignments.push({
          peerTutorEmail,
          peerTutorName: peerTutor.name,
          studentEmail,
          studentName: student.name,
          status: 'invalid',
          reason: 'Peer tutor is also a student in another class - cannot be assigned as peer tutor'
        })
        continue
      }
      
      // Check if student is also a peer tutor (conflict)
      const isStudentAlsoPeerTutor = await PeerTutorService.isAlreadyPeerTutor(studentEmail)
      if (isStudentAlsoPeerTutor) {
        invalidAssignments.push({
          peerTutorEmail,
          peerTutorName: peerTutor.name,
          studentEmail,
          studentName: student.name,
          status: 'invalid',
          reason: 'Student is already a peer tutor - cannot be assigned as student'
        })
        continue
      }
      
      // Check if already assigned
      const existingAssignment = await AssignmentService.getAssignmentByStudentAndTutor(student.id, peerTutor.id)
      if (existingAssignment) {
        invalidAssignments.push({
          peerTutorEmail,
          peerTutorName: peerTutor.name,
          studentEmail,
          studentName: student.name,
          status: 'invalid',
          reason: 'Student already assigned to a peer tutor'
        })
        continue
      }
      
      validAssignments.push({
        peerTutorEmail,
        peerTutorName: peerTutor.name,
        studentEmail,
        studentName: student.name,
        status: 'valid',
        reason: ''
      })
    }
    
    return {
      validAssignments,
      invalidAssignments
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
        ...importPreview.invalidAssignments.map(a => `${a.studentEmail} - ${a.reason}`)
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
              onClick={handleExportData}
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
          Peer Tutor Email | Student Email
        </div>
        <div className="mt-3 p-3 bg-white rounded border border-gray-200">
          <p className="text-xs text-gray-900 font-medium mb-1">Auto-Import Feature</p>
          <p className="text-xs text-gray-700">
            The system will automatically check Microsoft Graph and add users if they exist there. 
            You don&apos;t need to manually add peer tutors and students before importing assignments!
          </p>
        </div>
      </div>

      {/* Import Preview Modal */}
      {showImportPreview && importPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Import Preview</h3>
              </div>
              <button
                onClick={closeImportPreview}
                className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-2 hover:bg-gray-100 rounded-lg"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center p-6 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-center mb-3">
                    <div className="p-3 bg-blue-600 rounded-full">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-blue-700 mb-1">{importPreview.validAssignments.length}</div>
                  <div className="text-sm font-medium text-gray-700">Valid Assignments</div>
                  <div className="text-xs text-gray-600 mt-1">Ready to import</div>
                </div>
                <div className="text-center p-6 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-center mb-3">
                    <div className="p-3 bg-gray-500 rounded-full">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-gray-800 mb-1">{importPreview.invalidAssignments.length}</div>
                  <div className="text-sm font-medium text-gray-700">Invalid Assignments</div>
                  <div className="text-xs text-gray-600 mt-1">Will be skipped</div>
                </div>
              </div>

              {/* Combined Preview Table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900">Assignment Preview</h4>
                  <p className="text-sm text-gray-600 mt-1">Review all assignments before importing</p>
                </div>
                
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Peer Tutor Email</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Email</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* Valid Assignments First */}
                      {importPreview.validAssignments.map((assignment, index) => (
                        <tr key={`valid-${index}`} className="hover:bg-gray-50 transition-colors duration-150">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Valid
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {assignment.peerTutorEmail}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {assignment.studentEmail}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            Ready to import
                          </td>
                        </tr>
                      ))}
                      
                      {/* Invalid Assignments */}
                      {importPreview.invalidAssignments.map((assignment, index) => (
                        <tr key={`invalid-${index}`} className="hover:bg-gray-50 transition-colors duration-150">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-800">
                              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                              Invalid
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {assignment.peerTutorEmail}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {assignment.studentEmail}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {assignment.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end space-x-4">
              <button
                onClick={closeImportPreview}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importPreview.validAssignments.length === 0}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Confirm Import ({importPreview.validAssignments.length} assignments)</span>
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