'use client'

import { useState, useRef } from 'react'
import { ClassService } from '@/lib/services/classService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { useAuth } from '@/lib/auth/AuthContext'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

interface ClassesImportExportProps {
  dept: string
  year: string
  section: string
  facultyId: string
  onImportComplete: () => void
}

interface ImportPreview {
  validClasses: Array<{
    subject_name: string
    scheduled_date: string
    topics?: string
    action?: string
    isValid: boolean
    validationMessage?: string
  }>
  invalidClasses: Array<{
    subject_name: string
    scheduled_date: string
    topics?: string
    reason: string
  }>
}

interface ImportResult {
  success: boolean
  added: number
  updated: number
  skipped: string[]
  errors: string[]
}

export default function ClassesImportExport({ 
  dept, 
  year, 
  section, 
  facultyId, 
  onImportComplete 
}: ClassesImportExportProps) {
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
      
      // Get existing classes and scheduled classes
      const classes = await ClassService.getClassesByYearSection(dept, year, section)
      const scheduledClasses = await ScheduledClassService.getScheduledClassesByYearSection(dept, year, section)
      
      const today = new Date().toISOString().split('T')[0]
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dayAfter = new Date()
      dayAfter.setDate(dayAfter.getDate() + 2)
      
      // Create comprehensive export data
      const exportData = [
        // Header section
        ['CLASSES IMPORT/EXPORT TEMPLATE'],
        [`Department: ${dept}`],
        [`Year: ${year}`],
        [`Section: ${section}`],
        [`Generated on: ${new Date().toLocaleDateString('en-US')}`],
        [`Minimum Date: ${today} (Today)`],
        [],
        
        // Instructions
        ['INSTRUCTIONS:'],
        ['1. Subject Name: Enter the subject name (required)'],
        ['2. Scheduled Date: Use YYYY-MM-DD format, must be today or future'],
        ['3. Topics: Optional description of class topics'],
        ['4. Action: UPDATE (modify existing) or CREATE (new subject)'],
        ['5. UPDATE: Add new schedule to existing subject'],
        ['6. CREATE: Create new subject and schedule it'],
        [],
        
        // Data headers
        ['Subject Name', 'Scheduled Date (YYYY-MM-DD)', 'Topics (Optional)', 'Action (UPDATE/CREATE)'],
        []
      ]
      
      // Add existing classes with UPDATE action
      classes.forEach(classItem => {
        const scheduledForClass = scheduledClasses.filter(sc => sc.class_id === classItem.id)
        if (scheduledForClass.length > 0) {
          scheduledForClass.forEach(scheduled => {
            exportData.push([
              classItem.subject_name,
              scheduled.scheduled_date,
              scheduled.topics || '',
              'UPDATE'
            ])
          })
        } else {
          // Add unscheduled classes with UPDATE action
          exportData.push([
            classItem.subject_name,
            '', // No date for unscheduled
            '',
            'UPDATE'
          ])
        }
      })
      
      // Add template rows for new classes
      exportData.push([])
      exportData.push(['--- NEW CLASSES TEMPLATE ---'])
      exportData.push(['Mathematics', tomorrow.toISOString().split('T')[0], 'Algebra and Calculus', 'CREATE'])
      exportData.push(['Physics', dayAfter.toISOString().split('T')[0], 'Mechanics and Thermodynamics', 'CREATE'])
      exportData.push(['Chemistry', new Date(dayAfter.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], 'Organic Chemistry', 'CREATE'])
      
      // Create workbook with multiple sheets
      const wb = XLSX.utils.book_new()
      
      // Main data sheet
      const ws = XLSX.utils.aoa_to_sheet(exportData)
      
      // Set column widths and formatting
      ws['!cols'] = [
        { wch: 25 }, // Subject Name
        { wch: 20 }, // Scheduled Date
        { wch: 35 }, // Topics
        { wch: 15 }  // Action
      ]
      
      // Add validation sheet
      const validationData = [
        ['VALIDATION RULES'],
        ['1. Date Format: Must be YYYY-MM-DD'],
        ['2. Date Range: Today or future dates only'],
        ['3. Subject Names: Cannot be empty'],
        ['4. Action: Must be UPDATE or CREATE'],
        ['5. UPDATE: Subject must already exist'],
        ['6. CREATE: Subject must not exist'],
        ['7. Date Uniqueness: No duplicate dates for same section'],
        [],
        ['EXAMPLES:'],
        ['UPDATE: Add new schedule to existing Mathematics class'],
        ['CREATE: Create new Biology class with schedule'],
        ['Date: 2024-12-25 (valid if today or future)'],
        ['Date: 2024-12-20 (invalid if in the past)']
      ]
      const validationWs = XLSX.utils.aoa_to_sheet(validationData)
      
      XLSX.utils.book_append_sheet(wb, ws, 'Classes Data')
      XLSX.utils.book_append_sheet(wb, validationWs, 'Validation Rules')
      
      // Export file
      XLSX.writeFile(wb, `classes_export_${dept}_${year}_${section}_${today}.xlsx`)
      
    } catch (error) {
      logger.error('Error exporting data:', error)
      toast.error('Error exporting data. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.warning('Please select an Excel file (.xlsx or .xls).')
      return
    }

    try {
      setIsImporting(true)
      
      // Read Excel file
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
      
      // Find the data section (skip headers and template info)
      let dataStartIndex = 0
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as string[]
        if (row && row.length >= 4 && row[0] === 'Subject Name' && row[1] === 'Scheduled Date (YYYY-MM-DD)' && row[3] === 'Action (UPDATE/CREATE)') {
          dataStartIndex = i + 1
          break
        }
      }
      
      // Extract data rows
      const rows = jsonData.slice(dataStartIndex) as string[][]
      
      // Validate and preview data
      const preview = await validateImportData(rows)
      setImportPreview(preview)
      setShowImportPreview(true)
      
    } catch (error) {
      logger.error('Error reading Excel file:', error)
      toast.error('Error reading Excel file. Please check the file format and try again.')
    } finally {
      setIsImporting(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const validateImportData = async (rows: string[][]): Promise<ImportPreview> => {
    const validClasses: ImportPreview['validClasses'] = []
    const invalidClasses: ImportPreview['invalidClasses'] = []
    
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Set to start of day for comparison
    
    // Get existing classes for action validation
    const existingClasses = await ClassService.getClassesByYearSection(dept, year, section)
    const existingSubjects = new Set(existingClasses.map(c => c.subject_name.toLowerCase()))
    
    for (const row of rows) {
      if (row.length < 4) continue
      
      const [subjectName, scheduledDate, topics, action] = row
      
      // Basic validation
      if (!subjectName?.trim()) {
        invalidClasses.push({
          subject_name: 'Unknown',
          scheduled_date: scheduledDate || 'Unknown',
          topics: topics || '',
          reason: 'Subject name is required'
        })
        continue
      }
      
      if (!scheduledDate?.trim()) {
        invalidClasses.push({
          subject_name: subjectName,
          scheduled_date: 'Unknown',
          topics: topics || '',
          reason: 'Scheduled date is required'
        })
        continue
      }
      
      // Validate action
      const validAction = action?.toUpperCase() === 'UPDATE' || action?.toUpperCase() === 'CREATE'
      if (!validAction) {
        invalidClasses.push({
          subject_name: subjectName,
          scheduled_date: scheduledDate,
          topics: topics || '',
          reason: 'Action must be UPDATE or CREATE'
        })
        continue
      }
      
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(scheduledDate)) {
        invalidClasses.push({
          subject_name: subjectName,
          scheduled_date: scheduledDate,
          topics: topics || '',
          reason: 'Invalid date format. Use YYYY-MM-DD format'
        })
        continue
      }
      
      // Validate date is not in past
      const classDate = new Date(scheduledDate)
      classDate.setHours(0, 0, 0, 0)
      
      if (classDate < today) {
        invalidClasses.push({
          subject_name: subjectName,
          scheduled_date: scheduledDate,
          topics: topics || '',
          reason: 'Cannot schedule classes for past dates. Only future dates are allowed.'
        })
        continue
      }
      
      // Validate action constraints
      const isUpdate = action?.toUpperCase() === 'UPDATE'
      const isCreate = action?.toUpperCase() === 'CREATE'
      const subjectExists = existingSubjects.has(subjectName.toLowerCase())
      
      if (isUpdate && !subjectExists) {
        invalidClasses.push({
          subject_name: subjectName,
          scheduled_date: scheduledDate,
          topics: topics || '',
          reason: 'UPDATE action requires existing subject. Subject not found.'
        })
        continue
      }
      
      if (isCreate && subjectExists) {
        invalidClasses.push({
          subject_name: subjectName,
          scheduled_date: scheduledDate,
          topics: topics || '',
          reason: 'CREATE action requires new subject. Subject already exists.'
        })
        continue
      }
      
      // Check date availability for new schedules
      const isDateAvailable = await ScheduledClassService.isDateAvailable(scheduledDate, dept, year, section)
      if (!isDateAvailable) {
        invalidClasses.push({
          subject_name: subjectName,
          scheduled_date: scheduledDate,
          topics: topics || '',
          reason: 'This date is already occupied by another class'
        })
        continue
      }
      
      validClasses.push({
        subject_name: subjectName.trim(),
        scheduled_date: scheduledDate,
        topics: topics?.trim() || '',
        action: action?.toUpperCase(),
        isValid: true
      })
    }
    
    return {
      validClasses,
      invalidClasses
    }
  }

  const handleConfirmImport = async () => {
    if (!importPreview || !user?.id) return
    
    try {
      setIsImporting(true)
      
      const results: ImportResult = {
        success: true,
        added: 0,
        updated: 0,
        skipped: [],
        errors: []
      }
      
      // Validate section is not 'ALL' before processing
      if (!section || section.trim().toUpperCase() === 'ALL') {
        toast.warning('Cannot import classes with section "ALL". Please navigate to a specific section page.')
        setIsImporting(false)
        return
      }

      // Process valid classes
      for (const classData of importPreview.validClasses) {
        try {
          if (classData.action === 'CREATE') {
            // Create new class
            const classCreated = await ClassService.createClass({
              subject_name: classData.subject_name,
              dept,
              year,
              section,
              faculty_id: facultyId
            })
            
            if (!classCreated) {
              results.errors.push(`Failed to create class: ${classData.subject_name}`)
              continue
            }
            
            // Get the created class
            const classes = await ClassService.getClassesByYearSection(dept, year, section)
            const createdClass = classes.find(cls => 
              cls.subject_name === classData.subject_name && 
              cls.dept === dept && 
              cls.year === year && 
              cls.section === section
            )
            
            if (!createdClass) {
              results.errors.push(`Could not find created class: ${classData.subject_name}`)
              continue
            }
            
            // Create scheduled class (will create for all peer tutors in section if peer_tutor_id not provided)
            const scheduledClassCreated = await ScheduledClassService.createScheduledClass({
              class_id: createdClass.id,
              scheduled_date: classData.scheduled_date,
              dept,
              year,
              section,
              faculty_id: facultyId,
              topics: classData.topics
            })
            
            if (scheduledClassCreated) {
              results.added++
            } else {
              results.errors.push(`Failed to schedule new class: ${classData.subject_name}`)
            }
          } else if (classData.action === 'UPDATE') {
            // Update existing class - add new scheduled date
            const classes = await ClassService.getClassesByYearSection(dept, year, section)
            const existingClass = classes.find(cls => 
              cls.subject_name.toLowerCase() === classData.subject_name.toLowerCase()
            )
            
            if (!existingClass) {
              results.errors.push(`Could not find existing class: ${classData.subject_name}`)
              continue
            }
            
            // Create scheduled class (will create for all peer tutors in section if peer_tutor_id not provided)
            const scheduledClassCreated = await ScheduledClassService.createScheduledClass({
              class_id: existingClass.id,
              scheduled_date: classData.scheduled_date,
              dept,
              year,
              section,
              faculty_id: facultyId,
              topics: classData.topics
            })
            
            if (scheduledClassCreated) {
              results.updated++
            } else {
              results.errors.push(`Failed to schedule existing class: ${classData.subject_name}`)
            }
          }
        } catch (error) {
          results.errors.push(`Failed to process class ${classData.subject_name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
      
      // Add skipped items
      results.skipped = importPreview.invalidClasses.map(cls => 
        `${cls.subject_name} (${cls.scheduled_date}) - ${cls.reason}`
      )
      
      setImportResult(results)
      setShowImportResult(true)
      setShowImportPreview(false)
      
      if (results.added > 0 || results.updated > 0) {
        onImportComplete() // Refresh the classes
      }
      
    } catch (error) {
      logger.error('Error importing classes:', error)
      toast.error('Error importing classes. Please try again.')
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
      <h3 className="text-lg font-medium text-gray-900 mb-4">Import/Export Classes</h3>
      
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
                  <span>Export Classes</span>
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
                  <span>Import Classes</span>
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
          Subject Name | Scheduled Date (YYYY-MM-DD) | Topics (Optional) | Action (UPDATE/CREATE)
        </div>
        <div className="mt-3 p-3 bg-white rounded border border-gray-200">
          <p className="text-xs text-gray-900 font-medium mb-1">Action Types</p>
          <p className="text-xs text-gray-700">
            • <strong>UPDATE:</strong> Add new schedule to existing subject<br/>
            • <strong>CREATE:</strong> Create new subject and schedule it<br/>
            • UPDATE requires existing subject, CREATE requires new subject
          </p>
        </div>
        <div className="mt-3 p-3 bg-white rounded border border-gray-200">
          <p className="text-xs text-gray-900 font-medium mb-1">Date Validation</p>
          <p className="text-xs text-gray-700">
            • Only today or future dates are allowed (no past dates)<br/>
            • Date format must be YYYY-MM-DD<br/>
            • Each date can only be used once per section
          </p>
        </div>
        <div className="mt-3 p-3 bg-white rounded border border-gray-200">
          <p className="text-xs text-gray-900 font-medium mb-1">Import Preview</p>
          <p className="text-xs text-gray-700">
            You will see a preview of all classes before importing with action types. You can review and remove invalid assignments.
          </p>
        </div>
      </div>

      {/* Import Preview Modal */}
      {showImportPreview && importPreview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[80vh] overflow-y-auto">
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
                  <div className="text-2xl font-bold text-green-600">{importPreview.validClasses.length}</div>
                  <div className="text-sm text-green-700">Valid Classes</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{importPreview.invalidClasses.length}</div>
                  <div className="text-sm text-red-700">Invalid Classes</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{importPreview.validClasses.length + importPreview.invalidClasses.length}</div>
                  <div className="text-sm text-blue-700">Total Classes</div>
                </div>
              </div>

              {/* Valid Classes Preview */}
              {importPreview.validClasses.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Valid Classes (will be imported)</h4>
                  <div className="max-h-64 overflow-y-auto border rounded">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Action</th>
                          <th className="px-3 py-2 text-left">Subject</th>
                          <th className="px-3 py-2 text-left">Scheduled Date</th>
                          <th className="px-3 py-2 text-left">Topics</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.validClasses.map((classItem, index) => (
                          <tr key={index} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                classItem.action === 'CREATE' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {classItem.action}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-medium">{classItem.subject_name}</td>
                            <td className="px-3 py-2">{classItem.scheduled_date}</td>
                            <td className="px-3 py-2">{classItem.topics || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Invalid Classes */}
              {importPreview.invalidClasses.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Invalid Classes (will be skipped)</h4>
                  <div className="max-h-64 overflow-y-auto">
                    {importPreview.invalidClasses.map((classItem, index) => (
                      <div key={index} className="text-sm text-red-700 bg-red-50 p-3 rounded mb-2 border border-red-200">
                        <div className="font-medium">{classItem.subject_name}</div>
                        <div className="text-xs text-red-600 mt-1">
                          Date: {classItem.scheduled_date} | Reason: {classItem.reason}
                        </div>
                        {classItem.topics && (
                          <div className="text-xs text-gray-600 mt-1">Topics: {classItem.topics}</div>
                        )}
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
                disabled={importPreview.validClasses.length === 0}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Confirm Import ({importPreview.validClasses.length} classes)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Result Modal */}
      {showImportResult && importResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
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
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{importResult.added}</div>
                  <div className="text-sm text-green-700">Created</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{importResult.updated}</div>
                  <div className="text-sm text-blue-700">Updated</div>
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
