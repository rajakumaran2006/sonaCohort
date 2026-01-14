'use client'

import { useState, useRef } from 'react'
import { ClassService } from '@/lib/services/classService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { X, Upload, AlertCircle, Calendar } from 'lucide-react'

interface ClassImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  dept: string
  year: string
  section: string
  faculty_id: string
}

interface ImportRow {
  subject: string
  scheduledDate: string
  isValid: boolean
  validationMessage: string
  rowNumber: number
}

export default function ClassImportModal({
  isOpen,
  onClose,
  onSuccess,
  dept,
  year,
  section,
  faculty_id
}: ClassImportModalProps) {
  const [, setFile] = useState<File | null>(null)
  const [importData, setImportData] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDownloadTemplate = async () => {
    try {
      setLoading(true)
      
      // Fetch existing data
      const [classes, scheduledClasses] = await Promise.all([
        ClassService.getClassesByYearSection(dept, year, section),
        ScheduledClassService.getScheduledClassesByYearSection(dept, year, section)
      ])

      let templateData: Array<{ Subject: string; 'Scheduled Date': string }> = []

      if (classes.length > 0) {
        // Map class IDs to names for easy lookup
        const classMap = new Map(classes.map(c => [c.id, c.subject_name]))
        
        // Track which classes have at least one schedule
        const scheduledClassIds = new Set<string>()

        // Add rows for existing schedules
        scheduledClasses.forEach(sc => {
          const subjectName = classMap.get(sc.class_id)
          if (subjectName) {
            templateData.push({
              Subject: subjectName,
              'Scheduled Date': sc.scheduled_date
            })
            scheduledClassIds.add(sc.class_id)
          }
        })

        // Add rows for unscheduled classes (with empty date)
        classes.forEach(c => {
          if (!scheduledClassIds.has(c.id)) {
            templateData.push({
              Subject: c.subject_name,
              'Scheduled Date': ''
            })
          }
        })
        
        // Sort by Subject then Date
        templateData.sort((a, b) => {
          if (a.Subject === b.Subject) {
            return (a['Scheduled Date'] || '').localeCompare(b['Scheduled Date'] || '')
          }
          return a.Subject.localeCompare(b.Subject)
        })
      } else {
        // Fallback to sample data if no classes exist
        templateData = [
          { Subject: 'Mathematics', 'Scheduled Date': '2026-01-15' },
          { Subject: 'Physics', 'Scheduled Date': '2026-01-16' },
          { Subject: 'Chemistry', 'Scheduled Date': '2026-01-17' }
        ]
      }

      const ws = XLSX.utils.json_to_sheet(templateData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Class Schedule Template')
      
      // Add column widths for better readability
      ws['!cols'] = [
        { wch: 30 }, // Subject column
        { wch: 20 }  // Scheduled Date column
      ]

      XLSX.writeFile(wb, `class_schedule_template_${dept}_${year}_${section}.xlsx`)
      toast.success('Template downloaded successfully!')
    } catch (error) {
      console.error('Error downloading template:', error)
      toast.error('Failed to generate template')
    } finally {
      setLoading(false)
    }
  }

  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null
    
    const dateString = String(dateStr).trim()
    if (!dateString) return null

    // 1. Try Excel serial date number first (high confidence)
    if (!isNaN(Number(dateString)) && Number(dateString) > 30000) {
      const excelEpoch = new Date(1899, 11, 30)
      const days = Number(dateString)
      const date = new Date(excelEpoch.getTime() + days * 86400000)
      if (!isNaN(date.getTime())) {
        // Normalize to local midnight
        return new Date(date.getFullYear(), date.getMonth(), date.getDate())
      }
    }
    
    // 2. Try YYYY-MM-DD (ISO)
    let match = dateString.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
    if (match) {
      const year = parseInt(match[1])
      const month = parseInt(match[2]) - 1
      const day = parseInt(match[3])
      const date = new Date(year, month, day)
      return isNaN(date.getTime()) ? null : date
    }
    
    // 3. Try DD-MM-YYYY or DD/MM/YYYY
    match = dateString.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (match) {
      const day = parseInt(match[1])
      const month = parseInt(match[2]) - 1
      const year = parseInt(match[3])
      const date = new Date(year, month, day)
      return isNaN(date.getTime()) ? null : date
    }

    // 4. Try MM-DD-YYYY or MM/DD/YYYY (if DD is <= 12, this is ambiguous, 
    // but usually DD/MM/YYYY is preferred in most locales besides US)
    // We already checked DD/MM/YYYY above. If month > 12, it might be MM/DD/YYYY.
    // Let's try a generic new Date() as a last resort but it's risky
    const fallbackDate = new Date(dateString)
    if (!isNaN(fallbackDate.getTime())) {
      // Normalize to local midnight to avoid timezone shifts
      return new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), fallbackDate.getDate())
    }
    
    return null
  }

  const ALL_SECTIONS = ['A', 'B', 'C']

  const validateRow = (subject: string, scheduledDate: string, existingSchedules: Map<string, { section: string, subject: string }[]>): { isValid: boolean; message: string; sectionStatuses: Record<string, 'ready' | 'conflict' | 'exists'> } => {
    const statuses: Record<string, 'ready' | 'conflict' | 'exists'> = {
        'A': 'ready', 'B': 'ready', 'C': 'ready'
    }
    
    // Check if subject is provided
    if (!subject || subject.trim() === '') {
      return { isValid: false, message: 'Subject is required', sectionStatuses: statuses }
    }

    // Validate date format
    const parsedDate = parseDate(scheduledDate)
    if (!parsedDate) {
      return { isValid: false, message: 'Invalid date format', sectionStatuses: statuses }
    }

    const formattedDate = parsedDate.toISOString().split('T')[0]
    
    // Check conflicts per section
    if (existingSchedules.has(formattedDate)) {
      const conflicts = existingSchedules.get(formattedDate) || []
      
      conflicts.forEach(c => {
          if (c.subject.toLowerCase() !== subject.toLowerCase()) {
              statuses[c.section] = 'conflict'
          } else {
              statuses[c.section] = 'exists'
          }
      })
    }
    
    // Determine overall validity
    // Valid if at least one section is 'ready'
    // Actually, 'exists' is also valid (idempotent), just nothing to do.
    // So distinct from 'conflict'.
    
    // Past date check
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // A date is only considered past if it is strictly before today
    // Jan 10 < Jan 10 is false (Today is not past)
    // Jan 11 < Jan 10 is false (Future is not past)
    // Jan 9 < Jan 10 is true (Yesterday is past)
    const isPast = parsedDate.getTime() < today.getTime()
    const pastSuffix = isPast ? ' (Past)' : ''
    
    const readySections = Object.entries(statuses).filter(([, s]) => s === 'ready').map(([k]) => k)
    const conflictSections = Object.entries(statuses).filter(([, s]) => s === 'conflict').map(([k]) => k)
    
    if (conflictSections.length === ALL_SECTIONS.length) {
        return { isValid: false, message: 'Conflict in All Sections', sectionStatuses: statuses }
    }
    
    if (readySections.length === 0 && conflictSections.length === 0) {
        // All 'exists'
         return { isValid: false, message: `Already in DB${pastSuffix}`, sectionStatuses: statuses }
    }
    
    if (conflictSections.length > 0) {
        return { isValid: true, message: `Partial Conflict (Skip ${conflictSections.join(',')})${pastSuffix}`, sectionStatuses: statuses }
    }

    return { isValid: true, message: `Valid${pastSuffix}`, sectionStatuses: statuses }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    // Validate file type
    const fileExt = selectedFile.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls'].includes(fileExt || '')) {
      toast.error('Please upload a valid Excel file (.xlsx or .xls)')
      return
    }

    setFile(selectedFile)
    setLoading(true)
    setImportData([])

    try {
      // Fetch existing schedules from ALL SECTIONS for validation
      const sectionPromises = ALL_SECTIONS.map(s => 
        ScheduledClassService.getScheduledClassesByYearSection(dept, year, s)
            .then(classes => ({ section: s, classes }))
      )
      
      const allSectionsData = await Promise.all(sectionPromises)
      
      // Map: Date -> Array of { section, subject }
      const existingSchedulesMap = new Map<string, { section: string, subject: string }[]>()
      
      allSectionsData.forEach(({ section, classes }) => {
        classes.forEach(sc => {
            if (sc.scheduled_date) {
                const current = existingSchedulesMap.get(sc.scheduled_date) || []
                current.push({ section, subject: sc.class.subject_name })
                existingSchedulesMap.set(sc.scheduled_date, current)
            }
        })
      })

      const arrayBuffer = await selectedFile.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length < 2) {
        toast.error('Excel file is empty or has no data rows')
        setLoading(false)
        return
      }

      // Get headers (first row)
      const headers = jsonData[0] as string[]
      const subjectColIndex = headers.findIndex(h => h?.toLowerCase().includes('subject'))
      const dateColIndex = headers.findIndex(h => h?.toLowerCase().includes('date'))

      if (subjectColIndex === -1 || dateColIndex === -1) {
        toast.error('Excel file must contain "Subject" and "Scheduled Date" columns')
        setLoading(false)
        return
      }

      // Parse data rows
      const rows: ImportRow[] = []
      // Use a Set to track dates within the import file itself to prevent duplicates in the same upload
      const importDates = new Set<string>()

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as (string | number | null)[]
        const subject = String(row[subjectColIndex] || '').trim()
        const scheduledDate = String(row[dateColIndex] || '').trim()

        if (!subject && !scheduledDate) continue // Skip empty rows

        const validation = validateRow(subject, scheduledDate, existingSchedulesMap)
        
        // Also check for duplicates within the current file
        let finalValidation = validation
        const parsedDate = parseDate(scheduledDate)
        if (parsedDate) {
            const formattedDate = parsedDate.toISOString().split('T')[0]
            if (importDates.has(formattedDate)) {
                // If ID check fails, we can just mark invalid
                finalValidation = { ...validation, isValid: false, message: 'Duplicate date in file' }
            } else {
                importDates.add(formattedDate)
            }
        }

        rows.push({
          subject,
          scheduledDate,
          isValid: finalValidation.isValid,
          validationMessage: finalValidation.message,
          rowNumber: i + 1,
        })
      }

      setImportData(rows)
      setShowPreview(true)
      toast.success(`Parsed ${rows.length} rows from Excel file`)
    } catch (error) {
      console.error('Error parsing Excel file:', error)
      toast.error('Failed to parse Excel file')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    const validRows = importData.filter(row => row.isValid)
    
    if (validRows.length === 0) {
      toast.error('No valid rows to import')
      return
    }

    setImporting(true)

    try {
      let rowsScheduled = 0
      let totalSectionSuccess = 0
      let failCount = 0
      const errors: string[] = []

      for (const row of validRows) {
        let rowSectionSuccess = 0
        try {
          for (const currentSection of ALL_SECTIONS) {
              const parsedDate = parseDate(row.scheduledDate)
              if (!parsedDate) continue
              const formattedDate = parsedDate.toISOString().split('T')[0]

              // Check if date occupied in this section
              const isAvailable = await ScheduledClassService.isDateAvailable(formattedDate, dept, year, currentSection)
              
              if (!isAvailable) {
                  const existingClasses = await ScheduledClassService.getScheduledClassesByDate(dept, year, currentSection)
                  const existingOnDate = existingClasses.find(sc => sc.scheduled_date === formattedDate)
                  
                  if (existingOnDate && existingOnDate.class.subject_name.toLowerCase() !== row.subject.toLowerCase()) {
                      errors.push(`Row ${row.rowNumber} (Sec ${currentSection}): Skipped due to conflict with "${existingOnDate.class.subject_name}"`)
                      continue
                  }
                  
                  // Same subject - treat as success (idempotent) or skip? 
                  // User wants "success based on creation". If it already exists, we didn't create it.
                  // But usually "success" in idempotent ops includes "already there".
                  // However, "3 section success" implies we actually did the work. 
                  // Let's count it only if we actually did something? 
                  // Or count it if the desired state is achieved?
                  // Let's count ONLY if we created it, or maybe user counts "it is there" as success.
                  // Given "based on the creation", I will count only NEW creations.
                  continue
              }

              // Ensure class exists
              let classExists = await ClassService.classExists(dept, year, currentSection, row.subject)
              
              if (!classExists) {
                const created = await ClassService.createClass({
                  subject_name: row.subject,
                  dept,
                  year,
                  section: currentSection,
                  faculty_id
                })
                
                if (!created) {
                  errors.push(`Row ${row.rowNumber} (Sec ${currentSection}): Failed to create subject`)
                  continue
                }
              }

              // Get class ID
              const classes = await ClassService.getClassesByYearSection(dept, year, currentSection)
              const targetClass = classes.find(c => c.subject_name === row.subject)
              
              if (!targetClass) {
                errors.push(`Row ${row.rowNumber} (Sec ${currentSection}): Could not find subject after creation`)
                continue
              }

              // Create Schedule
              const scheduled = await ScheduledClassService.createScheduledClass({
                class_id: targetClass.id,
                scheduled_date: formattedDate,
                dept,
                year,
                section: currentSection,
                faculty_id
              })

              if (!scheduled) {
                errors.push(`Row ${row.rowNumber} (Sec ${currentSection}): Failed to schedule class`)
              } else {
                rowSectionSuccess++
                totalSectionSuccess++
              }
          }
          
          if (rowSectionSuccess > 0) {
            rowsScheduled++
          }

        } catch (error) {
          failCount++
          errors.push(`Row ${row.rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      // Show results
      if (rowsScheduled > 0) {
        toast.success(`${rowsScheduled} Class Scheduled. ${totalSectionSuccess} Section Success`)
        onSuccess()
        onClose()
      } else if (failCount > 0 || errors.length > 0) {
        // Only show error toast if NOTHING succeeded
        toast.error(`Failed to import. ${failCount} row errors. ${errors.length} section issues.`)
        console.error('Import errors:', errors)
      } else {
        toast.info('No changes made (possibly already scheduled).')
        onClose() 
      }

    } catch (error) {
      console.error('Error importing classes:', error)
      toast.error('An error occurred during import')
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setImportData([])
    setShowPreview(false)
    onClose()
  }

  if (!isOpen) return null

  const validCount = importData.filter(r => r.isValid).length
  const invalidCount = importData.filter(r => !r.isValid).length
  const pastCount = importData.filter(r => r.isValid && r.validationMessage.toLowerCase().includes('past')).length

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-gray-900">IMPORT CLASSES</h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={loading || importing}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {!showPreview ? (
            <div className="space-y-6">
              {/* EXCEL FORMAT PREVIEW */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-200 border-2 border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-green-900">EXCEL FORMAT PREVIEW</h4>
                </div>
              
                <div className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden shadow-md">
                  <div className="grid grid-cols-2 bg-gray-600 text-white">
                    <div className="px-4 py-3 border-r uppercase border-gray-300 font-bold text-xs text-white">
                      Subject
                    </div>
                    <div className="px-4 py-3 uppercase font-bold text-xs text-white">
                      Scheduled Date
                    </div>
                  </div>
                  
                  {/* Sample Data Rows */}
                  <div className="grid grid-cols-2 border-b border-gray-200 bg-white hover:bg-gray-50 transition-colors">
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">Mathematics</div>
                    <div className="px-4 py-2.5 text-sm text-gray-700">2026-01-15</div>
                  </div>
                  
                  <div className="grid grid-cols-2 bg-white hover:bg-gray-50 transition-colors">
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">Physics</div>
                    <div className="px-4 py-2.5 text-sm text-gray-700">2026-01-16</div>
                  </div>
                </div>
              </div>

              {/* UPLOAD SECTION */}
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-gray-900 mb-2">UPLOAD EXCEL FILE</h4>
                <p className="text-sm text-gray-600 mb-8">Click to select or drag and drop</p>
                
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={handleDownloadTemplate}
                    disabled={loading}
                    className="h-12 px-6 bg-[#00a651] hover:bg-[#008f45] text-white rounded-lg font-bold text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    EXPORT TEMPLATE
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="h-12 px-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {loading ? 'PROCESSING...' : 'SELECT FILE'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats Cards - Redesigned 4-Column Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Rows */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Records</p>
                      <h4 className="text-3xl font-black text-gray-900 leading-none">{importData.length}</h4>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5">
                    <p className="text-[11px] font-bold text-gray-500">FROM FILE</p>
                  </div>
                </div>

                {/* Valid Rows */}
                <div className="bg-white rounded-2xl p-5 border border-emerald-50 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Valid Rows</p>
                      <h4 className="text-3xl font-black text-gray-600 leading-none">{validCount}</h4>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5">
                    <p className="text-[11px] font-bold text-emerald-600">READY</p>
                  </div>
                </div>

                {/* Invalid Rows */}
                <div className="bg-white rounded-2xl p-5 border border-red-50 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">ERROR FOUND</p>
                      <h4 className="text-3xl font-black text-gray-600 leading-none">{invalidCount}</h4>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5">
                    <p className="text-[11px] font-bold text-red-600">{invalidCount > 0 ? 'ACTION REQUIRED' : 'NO ERROR'}</p>
                  </div>
                </div>

                {/* Past Classes */}
                <div className="bg-white rounded-2xl p-5 border border-amber-50 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Past Classes</p>
                      <h4 className="text-3xl font-black text-gray-600 leading-none">{pastCount}</h4>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5">
                    <p className="text-[11px] font-bold text-amber-600">EXPIRED</p>
                  </div>
                </div>
              </div>

              {invalidCount > 0 && (
                <div className="flex items-start gap-3 bg-red-50/50 border border-red-100 rounded-2xl p-4">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="flex-1 text-xs text-red-800">
                    <p className="font-black uppercase tracking-wider mb-0.5">Validation Failure</p>
                    <p className="font-bold opacity-80"><strong>{invalidCount} row(s) have critical errors.</strong> These rows will be skipped during import. Please verify dates and subject names.</p>
                  </div>
                </div>
              )}

              {/* Data Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Row</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Subject</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Scheduled Date</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {importData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.rowNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{row.subject || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{row.scheduledDate || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {row.isValid ? (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              row.validationMessage.toLowerCase().includes('past') || row.validationMessage.toLowerCase().includes('conflict')
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {row.validationMessage}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              {row.validationMessage}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {showPreview && (
          <div className="px-8 py-6 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={importing}
              className="h-12 px-6 bg-gray-500 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-all"
            >
              CANCEL
            </button>
            <button
              onClick={handleImport}
              disabled={importing || validCount === 0}
              className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              {importing ? 'IMPORTING...' : 'IMPORT CLASSES'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
