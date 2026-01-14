'use client'
import React, { useState } from 'react'
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from 'xlsx'
import { peertutorsReportData } from '@/lib/services/reportService'
import { ReportService } from '@/lib/services/reportService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import ExcelPreviewModal from '../modals/ExcelPreviewModal'
import { toast } from 'sonner'

interface ExcelExportModalProps {
  isOpen: boolean
  onClose: () => void
  peertutorsInfo: { id: string; name: string } | null
  reportData: peertutorsReportData | null
}

export default function ExcelExportModal({ isOpen, onClose, peertutorsInfo, reportData }: ExcelExportModalProps) {
  const [numHeaders, setNumHeaders] = useState<number>(1)
  const [extraHeaders, setExtraHeaders] = useState<string[]>([''])
  const [exporting, setExporting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  if (!isOpen) return null

  const handleExtraHeaderChange = (index: number, value: string) => {
    const newHeaders = [...extraHeaders]
    newHeaders[index] = value
    setExtraHeaders(newHeaders)
  }

  const addExtraHeader = () => {
    setExtraHeaders([...extraHeaders, ''])
  }

  const removeExtraHeader = (index: number) => {
    const newHeaders = extraHeaders.filter((_, i) => i !== index)
    setExtraHeaders(newHeaders)
  }

  const handleExport = async () => {
    if (!reportData || !peertutorsInfo) return

    setExporting(true)
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new()

      // Prepare data array
      const data: string[][] = []

      // Add header rows based on user input
      for (let i = 0; i < numHeaders; i++) {
        const headerRow = new Array(5).fill('') // 5 columns: Subject, Topic, Date, Present Students, Notes
        if (i === 0) {
          headerRow[0] = 'SONA COLLEGE OF TECHNOLOGY (AUTONOMOUS), SALEM -5'
        } else if (i === 1) {
          headerRow[0] = 'DEPARTMENT OF INFORMATION TECHNOLOGY'
        } else if (i === 2) {
          headerRow[0] = 'B.Tech - AI&DS'
        } else if (i === 3) {
          headerRow[0] = 'PEER TEACHING ATTENDANCE SHEET'
        } else if (i === 4) {
          headerRow[0] = '2025-2026 (ODD Semester)'
        }
        data.push(headerRow)
      }

      // Add extra headers
      extraHeaders.forEach(header => {
        if (header.trim()) {
          const extraHeaderRow = new Array(5).fill('')
          extraHeaderRow[0] = header.trim()
          data.push(extraHeaderRow)
        }
      })

      // Add empty row for spacing
      data.push(new Array(5).fill(''))

      // Add peer tutor information row
      const peertutorsRow = new Array(5).fill('')
      peertutorsRow[0] = `Peer Tutor Name: ${peertutorsInfo.name}`
      peertutorsRow[3] = `Dept/Year: ${reportData.dept}/${reportData.year}`
      data.push(peertutorsRow)

      // Add another empty row for spacing
      data.push(new Array(5).fill(''))

      // Get all additional classes first
      const additionalClasses = await AdditionalClassService.getAdditionalClassesBypeertutors(peertutorsInfo.id)
      
      // Group additional classes by subject
      const additionalClassesBySubject = additionalClasses.reduce((acc, additionalClass) => {
        if (!acc[additionalClass.subject_name]) {
          acc[additionalClass.subject_name] = []
        }
        acc[additionalClass.subject_name].push(additionalClass)
        return acc
      }, {} as Record<string, typeof additionalClasses>)

      // Track totals across all subjects
      let totalAllocatedClassesTaken = 0
      let totalAllocatedClassesScheduled = 0
      let totalAdditionalClassesTaken = 0
      let totalClassesTaken = 0

      // Process each subject
      for (const subject of reportData.subjects) {
        // Get scheduled classes for this subject
        const scheduledClasses = await ReportService.getSubjectScheduledClasses(peertutorsInfo.id, subject.subject_name)
        
        // Get additional classes for this subject
        const subjectAdditionalClasses = additionalClassesBySubject[subject.subject_name] || []
        
        // Combine and sort all classes (scheduled + additional) by date
        const allClasses = [
          ...scheduledClasses.map(sc => ({ ...sc, type: 'scheduled' as const })),
          ...subjectAdditionalClasses.map(ac => ({ ...ac, type: 'additional' as const, scheduled_date: ac.class_date }))
        ].sort((a, b) => 
          new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
        )

        let topicSerialNumber = 1
        let totalPresentCount = 0
        let totalClassesCount = 0
        const subjectClassRows: string[][] = [] // Collect classes for this subject

        // Process each class (scheduled or additional) - ONLY if attendance was taken
        for (const classItem of allClasses) {
          if (classItem.type === 'scheduled') {
            // Handle scheduled class - only include if attendance was taken
            const classReport = await ReportService.getClassAttendanceReport(classItem.id)
            
            // Only include classes that have attendance records (classes that were actually taken)
            if (classReport && classReport.attendance_records && classReport.attendance_records.length > 0) {
              const topic = classReport.topics || 'No topic recorded'
              const date = new Date(classItem.scheduled_date).toLocaleDateString()
              const presentStudents = classReport.attendance_records
                .filter(record => record.status === 'present')
                .map((record: { student_name: string }) => record.student_name)
              
              const presentCount = presentStudents.length
              totalPresentCount += presentCount
              totalClassesCount += 1
              totalAllocatedClassesTaken += 1 // Track allocated classes taken
              
              subjectClassRows.push([
                '', // Empty for subject column
                `${topicSerialNumber}. ${topic}`, // Serial number + topic
                date,
                presentStudents.join(', ') || 'No students present',
                `Present: ${presentCount}` // Present count in notes column
              ])
              
              topicSerialNumber++
            }
            // Skip scheduled classes without attendance records
          } else {
            // Handle additional class - only include if attendance was taken
            const additionalClassAttendance = await AdditionalClassService.getAttendanceForAdditionalClass(classItem.id)
            
            // Only include additional classes that have attendance records
            if (additionalClassAttendance && additionalClassAttendance.length > 0) {
              const presentStudents = additionalClassAttendance
                .filter(record => record.status === 'present')
                .map(record => record.student_name)
              
              const presentCount = presentStudents.length
              totalPresentCount += presentCount
              totalClassesCount += 1
              totalAdditionalClassesTaken += 1 // Track additional classes taken
              
              subjectClassRows.push([
                '', // Empty for subject column
                `${topicSerialNumber}. ${classItem.topic} (Additional Class)`, // Serial number + topic + label
                new Date(classItem.class_date).toLocaleDateString(),
                presentStudents.join(', ') || 'No students present',
                `Present: ${presentCount}` // Present count in notes column
              ])
              
              topicSerialNumber++
            }
            // Skip additional classes without attendance records
          }
        }

        // Only add subject header, classes, and summary if classes were actually taken
        if (totalClassesCount > 0) {
          // Track scheduled classes for this subject
          totalAllocatedClassesScheduled += subject.total_classes
          totalClassesTaken += totalClassesCount
          
          // Add subject header
          data.push([`SUBJECT: ${subject.subject_name}`, '', '', '', ''])
          
          // Add all classes for this subject
          data.push(...subjectClassRows)

          // Add subject summary row
          const attendancePercentage = totalClassesCount > 0 ? Math.round((totalPresentCount / totalClassesCount) * 100) : 0
          data.push([
            '', // Empty for subject column
            `TOTAL FOR ${subject.subject_name.toUpperCase()}`,
            '',
            '',
            `Total Present: ${totalPresentCount} | Percentage: ${attendancePercentage}%`
          ])

          // Add empty row between subjects
          data.push(new Array(5).fill(''))
        }
        // Skip subjects with no classes taken (don't add anything)
      }

      // Add final summary row after all subjects
      if (totalClassesTaken > 0) {
        // Add empty row before final summary
        data.push(new Array(5).fill(''))
        
        // Add final summary row
        data.push([
          '', // Empty for subject column
          'GRAND TOTAL',
          '',
          '',
          `Total Classes Taken: ${totalClassesTaken} | Allocated Classes: ${totalAllocatedClassesTaken}/${totalAllocatedClassesScheduled} | Additional Classes: ${totalAdditionalClassesTaken}`
        ])
      }

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(data)

      // Set column widths
      worksheet['!cols'] = [
        { wch: 20 }, // Subject
        { wch: 30 }, // Topic
        { wch: 15 }, // Date
        { wch: 40 }, // Present Students
        { wch: 20 }  // Notes
      ]

      // Apply Times New Roman font and center alignment to headers
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
      
      // Format institutional headers (first 5 rows)
      for (let row = 0; row < Math.min(5, numHeaders); row++) {
        for (let col = 0; col < 5; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
          if (worksheet[cellAddress]) {
            ;(worksheet[cellAddress] as any).s = {
              font: { name: 'Times New Roman', sz: 12, bold: true },
              alignment: { horizontal: 'center', vertical: 'center' }
            }
          }
        }
      }

      // Format extra headers
      const extraHeaderStartRow = numHeaders
      const extraHeaderEndRow = numHeaders + extraHeaders.filter(h => h.trim()).length
      for (let row = extraHeaderStartRow; row < extraHeaderEndRow; row++) {
        for (let col = 0; col < 5; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
          if (worksheet[cellAddress]) {
            ;(worksheet[cellAddress] as any).s = {
              font: { name: 'Times New Roman', sz: 12, bold: true },
              alignment: { horizontal: 'center', vertical: 'center' }
            }
          }
        }
      }

      // Format peer tutor info row (left align for name, right align for dept/year)
      const peertutorsRowIndex = numHeaders + extraHeaders.filter(h => h.trim()).length + 2
      if (worksheet[XLSX.utils.encode_cell({ r: peertutorsRowIndex, c: 0 })]) {
        ;(worksheet[XLSX.utils.encode_cell({ r: peertutorsRowIndex, c: 0 })] as any).s = {
          font: { name: 'Times New Roman', sz: 11, bold: true },
          alignment: { horizontal: 'left', vertical: 'center' }
        }
      }
      if (worksheet[XLSX.utils.encode_cell({ r: peertutorsRowIndex, c: 3 })]) {
        ;(worksheet[XLSX.utils.encode_cell({ r: peertutorsRowIndex, c: 3 })] as any).s = {
          font: { name: 'Times New Roman', sz: 11, bold: true },
          alignment: { horizontal: 'right', vertical: 'center' }
        }
      }

      // Apply Times New Roman font to all data and format subject totals
      for (let row = 0; row <= range.e.r; row++) {
        for (let col = 0; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
          if (worksheet[cellAddress]) {
            if (!(worksheet[cellAddress] as any).s) {
              ;(worksheet[cellAddress] as any).s = {}
            }
            ;(worksheet[cellAddress] as any).s.font = { name: 'Times New Roman', sz: 11 }
            
            // Format subject total rows (rows containing "TOTAL FOR")
            if (worksheet[cellAddress].v && typeof worksheet[cellAddress].v === 'string' && 
                worksheet[cellAddress].v.includes('TOTAL FOR')) {
              ;(worksheet[cellAddress] as any).s.font = { name: 'Times New Roman', sz: 11, bold: true }
              ;(worksheet[cellAddress] as any).s.fill = { fgColor: { rgb: 'FFFF99' } } // Light yellow background
            }
            
            // Format grand total row (rows containing "GRAND TOTAL")
            if (worksheet[cellAddress].v && typeof worksheet[cellAddress].v === 'string' && 
                worksheet[cellAddress].v.includes('GRAND TOTAL')) {
              ;(worksheet[cellAddress] as any).s.font = { name: 'Times New Roman', sz: 11, bold: true }
              ;(worksheet[cellAddress] as any).s.fill = { fgColor: { rgb: 'CCE5FF' } } // Light blue background
            }
          }
        }
      }

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Peer Tutor Report')

      // Generate filename
      const fileName = `Peer_Tutor_Report_${peertutorsInfo.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`

      // Save file
      XLSX.writeFile(workbook, fileName)

      // Close modal
      onClose()
    } catch (error) {
      console.error('Error exporting Excel:', error)
      toast.error('Error exporting Excel file. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Export Excel Report</h3>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Number of Header Rows */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Number of Header Rows
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={numHeaders}
              onChange={(e) => setNumHeaders(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Extra Headers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Extra Headers
            </label>
            <div className="space-y-2">
              {extraHeaders.map((header, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={header}
                    onChange={(e) => handleExtraHeaderChange(index, e.target.value)}
                    placeholder="Enter header text"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {extraHeaders.length > 1 && (
                    <button
                      onClick={() => removeExtraHeader(index)}
                      className="p-2 text-red-600 hover:text-red-800"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addExtraHeader}
                className="text-blue-600 hover:text-blue-800 text-sm flex items-center space-x-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Add Header</span>
              </button>
            </div>
          </div>

          {/* Preview Info */}
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Export Preview:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• {numHeaders} header row(s)</li>
              <li>• {extraHeaders.filter(h => h.trim()).length} extra header(s)</li>
              <li>• {reportData?.subjects.length || 0} subject(s)</li>
              <li>• Times New Roman font, centered headers</li>
              <li>• Single Excel file with all data</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
          <button
            onClick={() => setShowPreview(true)}
            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Preview</span>
          </button>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={exporting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 flex items-center space-x-2"
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Export Excel</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <ExcelPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        numHeaders={numHeaders}
        extraHeaders={extraHeaders}
      />
    </div>
  )
}