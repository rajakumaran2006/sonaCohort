'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Class } from '@/lib/services/classService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

interface ClassesExportModalProps {
  filteredClasses: Class[]
  onClose: () => void
}

interface ExportHeader {
  collegeName: string
  department: string
  documentTitle: string
  date: string
}

export default function ClassesExportModal({ 
  filteredClasses,
  onClose 
}: ClassesExportModalProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [header, setHeader] = useState<ExportHeader>({
    collegeName: 'SONA COLLEGE OF TECHNOLOGY (Autonomous)',
    department: 'DEPARTMENT OF INFORMATION TECHNOLOGY',
    documentTitle: 'SCHEDULED CLASSES REPORT',
    date: new Date().toLocaleDateString('en-GB').replace(/\//g, '.')
  })

  const getDepartmentFromClasses = () => {
    if (filteredClasses.length === 0) return ''
    const dept = filteredClasses[0].dept
    return `DEPARTMENT OF ${dept.toUpperCase()}`
  }

  const handleExport = async () => {
    try {
      setIsExporting(true)

      if (filteredClasses.length === 0) {
        toast.warning('No classes to export.')
        setIsExporting(false)
        return
      }

      // Create workbook
      const wb = XLSX.utils.book_new()
      
      const { data: worksheetData, merges: dynamicMerges } = await createWorksheetData()
      
      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(worksheetData as unknown[][])
      
      // Apply styling and formatting (conceptually, sheetjs styling support in pure JS is limited in open source, 
      // but we can set column widths and merges)
      ws['!cols'] = [
        { wch: 8 },  // S NO
        { wch: 25 }, // Subject Name
        { wch: 12 }, // Dept
        { wch: 12 }, // Year
        { wch: 10 }, // Section
        { wch: 15 }, // Scheduled Date
        { wch: 30 }  // Topics
      ]

      ws['!merges'] = dynamicMerges as XLSX.Range[]
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Scheduled Classes')
      
      // Generate filename
      const filename = `Scheduled_Classes_${new Date().toISOString().split('T')[0]}.xlsx`
      
      // Export file
      XLSX.writeFile(wb, filename)
      
      onClose()
    } catch (error) {
      logger.error('Error exporting classes:', error)
      toast.error('Error exporting data. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const createWorksheetData = async (): Promise<{ data: unknown[][], merges: XLSX.Range[] }> => {
    const data: unknown[][] = []
    const merges: XLSX.Range[] = []
    
    // Auto-detect department if not set manually
    const deptHeader = header.department === 'DEPARTMENT OF INFORMATION TECHNOLOGY' && filteredClasses.length > 0 
      ? getDepartmentFromClasses() 
      : header.department

    // Add header rows
    data.push([header.collegeName]) // Row 1
    data.push([deptHeader]) // Row 2
    data.push([header.documentTitle]) // Row 3
    data.push([`Date: ${header.date}`]) // Row 4
    data.push([]) // Row 5 - empty
    
    // Header merges
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }) // College Name
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }) // Dept
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 6 } }) // Title
    merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 6 } }) // Date

    // Table Headers (Row 6)
    data.push(['S NO', 'Subject Name', 'Department', 'Year', 'Section', 'Scheduled Date', 'Topics'])

    let serialNumber = 1
    let currentRowIndex = 6 // Data starts at row 7 (index 6)

    // Process each class
    for (const classItem of filteredClasses) {
      // Fetch scheduled classes for this subject
      const scheduledClasses = await ScheduledClassService.getAllScheduledClassesByClassId(classItem.id)
      
      const rowCount = Math.max(scheduledClasses.length, 1) // At least one row per subject

      if (rowCount > 1) {
        // Merge columns 0-4 (Metadata) for the subject rows
        // S NO
        merges.push({ s: { r: currentRowIndex, c: 0 }, e: { r: currentRowIndex + rowCount - 1, c: 0 } })
        // Subject Name
        merges.push({ s: { r: currentRowIndex, c: 1 }, e: { r: currentRowIndex + rowCount - 1, c: 1 } })
        // Department
        merges.push({ s: { r: currentRowIndex, c: 2 }, e: { r: currentRowIndex + rowCount - 1, c: 2 } })
        // Year
        merges.push({ s: { r: currentRowIndex, c: 3 }, e: { r: currentRowIndex + rowCount - 1, c: 3 } })
        // Section
        merges.push({ s: { r: currentRowIndex, c: 4 }, e: { r: currentRowIndex + rowCount - 1, c: 4 } })
      }

      if (scheduledClasses.length === 0) {
        // No schedule, just show subject details
        data.push([
          serialNumber,
          classItem.subject_name,
          classItem.dept,
          classItem.year,
          classItem.section,
          'Not Scheduled',
          '-'
        ])
      } else {
        // First row with full details
        const firstSchedule = scheduledClasses[0]
        data.push([
          serialNumber,
          classItem.subject_name,
          classItem.dept,
          classItem.year,
          classItem.section,
          firstSchedule.scheduled_date,
          firstSchedule.topics || '-'
        ])

        // Subsequent rows (only schedule details, others will be covered by merge)
        for (let i = 1; i < scheduledClasses.length; i++) {
          const schedule = scheduledClasses[i]
          data.push([
            '', // Merged
            '', // Merged
            '', // Merged
            '', // Merged
            '', // Merged
            schedule.scheduled_date,
            schedule.topics || '-'
          ])
        }
      }

      serialNumber++
      currentRowIndex += rowCount
    }
    
    return { data, merges }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Export Scheduled Classes</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Exporting {filteredClasses.length} subjects and their scheduled classes.
              Subjects with multiple scheduled dates will have merged cells in the report.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                College Name
              </label>
              <input
                type="text"
                value={header.collegeName}
                onChange={(e) => setHeader(prev => ({ ...prev, collegeName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Department Header
              </label>
              <input
                type="text"
                value={header.department}
                onChange={(e) => setHeader(prev => ({ ...prev, department: e.target.value }))}
                placeholder={getDepartmentFromClasses()}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                {isExporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Generating Excel...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export to Excel
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
