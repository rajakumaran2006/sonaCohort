'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { peertutorservice, peertutors } from '@/lib/services/peerTutorService'
import { StudentService, Student } from '@/lib/services/studentService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { X, Upload, AlertCircle, Users } from 'lucide-react'
import { MicrosoftGraphService } from '@/lib/auth/microsoftGraph'
import { MicrosoftUser } from '@/lib/types'
import { useAuth } from '@/lib/auth/AuthContext'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

interface AssignmentImportModalProps {
  dept: string
  year: string
  section: string
  onClose: () => void
  onSuccess: () => void
}

interface ImportRow {
  peertutorsName?: string
  peertutorsEmail?: string
  studentName?: string
  studentEmail?: string
  year?: string
  section?: string
}

interface ProcessedAssignment {
  peertutors: peertutors | null
  microsoftpeertutors?: MicrosoftUser
  peertutorsName: string
  peertutorsEmail?: string
  peertutorsFoundIn?: 'local' | 'microsoft' | 'not_found'
  student: Student | null
  microsoftStudent?: MicrosoftUser
  studentName: string
  studentEmail?: string
  studentFoundIn?: 'local' | 'microsoft' | 'not_found'
  status: 'existing' | 'new' | 'missing_tutor' | 'missing_student' | 'missing_both'
  isAlreadyAssigned: boolean
  year?: string
  section?: string
}

interface GroupedAssignment {
  peertutors: peertutors | null
  microsoftpeertutors?: MicrosoftUser
  peertutorsName: string
  peertutorsEmail?: string
  peertutorsFoundIn?: 'local' | 'microsoft' | 'not_found'
  students: Array<{
    student: Student | null
    microsoftStudent?: MicrosoftUser
    studentName: string
    studentEmail?: string
    studentFoundIn?: 'local' | 'microsoft' | 'not_found'
    status: 'existing' | 'new' | 'missing'
    isAlreadyAssigned: boolean
    year?: string
    section?: string
  }>
  status: 'valid' | 'missing'
  tutorAlreadyExists: boolean
  year?: string
  section?: string
}

export default function AssignmentImportModal({
  dept,
  year,
  section,
  onClose,
  onSuccess
}: AssignmentImportModalProps) {
  const { user } = useAuth()
  const [isProcessing, setIsProcessing] = useState(false)
  const [processedData, setProcessedData] = useState<GroupedAssignment[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [totalFromExcel, setTotalFromExcel] = useState({ peerTutor: 0, students: 0 })
  const [emailValidationSuffix, setEmailValidationSuffix] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setIsProcessing(true)

      // Read Excel file
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet)

      // Helper for case-insensitive column lookup
      const getValue = (row: Record<string, unknown>, targetKey: string) => {
        const key = Object.keys(row).find(k => k.toLowerCase().trim() === targetKey.toLowerCase().trim())
        return key ? row[key] : undefined
      }

      const rows: ImportRow[] = []
      let lastpeertutorsName: string | undefined
      let lastpeertutorsEmail: string | undefined

      for (const row of jsonData) {
        let peertutorsName = (getValue(row, 'Peer Tutor Name') as string | undefined)?.toString().trim() || undefined
        let peertutorsEmail = (getValue(row, 'Peer Tutor Email') as string | undefined)?.toString().trim() || undefined
        const studentName = (getValue(row, 'Student Name') as string | undefined)?.toString().trim() || undefined
        const studentEmail = (getValue(row, 'Student Email') as string | undefined)?.toString().trim() || undefined
        const rowYear = (getValue(row, 'Year') as string | number | undefined)?.toString().trim() || undefined
        const rowSection = (getValue(row, 'Section') as string | undefined)?.toString().trim() || undefined

        // Handle merged cells (fill down)
        // If peer tutor info is missing but we have student info, use the last seen peer tutor
        if (!peertutorsName && !peertutorsEmail && (studentName || studentEmail) && (lastpeertutorsName || lastpeertutorsEmail)) {
          peertutorsName = lastpeertutorsName
          peertutorsEmail = lastpeertutorsEmail
        }

        // Update last seen (only if current row has info)
        if (peertutorsName || peertutorsEmail) {
          // If we have same name but no email, inherit from last
          if (peertutorsName && lastpeertutorsName &&
            peertutorsName.toLowerCase() === lastpeertutorsName.toLowerCase() &&
            !peertutorsEmail && lastpeertutorsEmail) {
            peertutorsEmail = lastpeertutorsEmail
          }

          lastpeertutorsName = peertutorsName
          lastpeertutorsEmail = peertutorsEmail
        }

        if ((peertutorsName || peertutorsEmail) && (studentName || studentEmail)) {
          rows.push({
            peertutorsName,
            peertutorsEmail,
            studentName,
            studentEmail,
            year: rowYear,
            section: rowSection
          })
        }
      }

      if (rows.length === 0) {
        toast.warning('No valid data found in the file. Please check the format.')
        setIsProcessing(false)
        return
      }

      // Fetch existing data
      const [tutors, students] = await Promise.all([
        peertutorservice.getAllpeerTutor(),
        StudentService.getAllStudents()
      ])

      // Process data with totals
      const uniquepeerTutor = new Set(rows.map(r => (r.peertutorsEmail || r.peertutorsName || '').toLowerCase())).size
      const uniqueStudents = new Set(rows.map(r => (r.studentEmail || r.studentName || '').toLowerCase())).size
      setTotalFromExcel({ peerTutor: uniquepeerTutor, students: uniqueStudents })

      await processImportData(rows, tutors, students.filter(s => !s.peer_tutor))

    } catch (error) {
      logger.error('Error processing file:', error)
      toast.error('Error processing file. Please check the format and try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const findpeertutors = async (
    tutors: peertutors[],
    name?: string,
    email?: string,
    targetYear?: string,
    targetSection?: string
  ): Promise<{ tutor: peertutors | null, microsoftUser?: MicrosoftUser, foundIn: 'local' | 'microsoft' | 'not_found' }> => {
    // Must have at least one identifier
    if (!name && !email) {
      logger.info(`❌ Peer Tutor: No identifiers provided`)
      return { tutor: null, foundIn: 'not_found' }
    }

    const checkSuffix = (mail: string | undefined | null) => {
      if (!emailValidationSuffix || !mail) return true
      return mail.toLowerCase().trim().endsWith(emailValidationSuffix.toLowerCase().trim())
    }

    // Priority 1: Try exact name match first (case-insensitive) if name is provided
    if (name) {
      const normalizedName = name.toLowerCase().trim()
      const match = tutors.find(pt =>
        pt.name.toLowerCase().trim() === normalizedName &&
        (!targetYear || pt.year === targetYear) &&
        (!targetSection || pt.section === targetSection) &&
        checkSuffix(pt.email)
      )

      if (match) {
        logger.info(`✅ Peer Tutor found LOCALLY by NAME: "${name}" → ${match.name} (${match.email})`)
        return { tutor: match, foundIn: 'local' }
      }
    }

    // Priority 2: Try email match (either as fallback or primary if no name)
    if (email) {
      // If the provided email itself doesn't match the suffix, we shouldn't even search if we are strictly enforcing?
      // But maybe the provided email is "incomplete" or finding by name resulted in a valid email.
      // However, if searching by email, the email MUST match.

      const normalizedEmail = email.toLowerCase().trim()
      const match = tutors.find(pt =>
        pt.email.toLowerCase().trim() === normalizedEmail &&
        (!targetYear || pt.year === targetYear) &&
        (!targetSection || pt.section === targetSection) &&
        checkSuffix(pt.email)
      )

      if (match) {
        logger.info(`✅ Peer Tutor found LOCALLY by EMAIL: "${email}" → ${match.name} (${match.email})`)
        return { tutor: match, foundIn: 'local' }
      }
    }

    // Priority 3: Search Microsoft Graph by Email
    if (email && user?.id) {
      // If we are validating, the input email must match the suffix to even be valid for search, 
      // OR the result must match. If input "john@gmail.com" and suffix "@sona.ac.in", it shouldn't match.
      if (checkSuffix(email)) {
        logger.info(`🔍 Searching Microsoft Graph for peer tutor by EMAIL: "${email}"`)
        const microsoftUser = await MicrosoftGraphService.getUserByEmail(email)

        if (microsoftUser && checkSuffix(microsoftUser.mail)) {
          logger.info(`✨ Peer Tutor found in MICROSOFT: "${email}"`)
          // Defer creation - return the microsoft user object
          return { tutor: null, microsoftUser, foundIn: 'microsoft' }
        }
      }
    }

    // Priority 4: Search Microsoft Graph by Name (Exact Match)
    if (name && user?.id) {
      logger.info(`🔍 Searching Microsoft Graph for peer tutor by NAME: "${name}"`)
      const microsoftUsers = await MicrosoftGraphService.searchUsers(name)

      const exactMatch = microsoftUsers.find(u =>
        u.displayName.toLowerCase().trim() === name.toLowerCase().trim() &&
        checkSuffix(u.mail)
      )

      if (exactMatch) {
        logger.info(`✨ Peer Tutor found in MICROSOFT by NAME: "${name}" → ${exactMatch.mail}`)
        // Defer creation
        return { tutor: null, microsoftUser: exactMatch, foundIn: 'microsoft' }
      }
    }

    // Not found anywhere
    logger.info(`❌ Peer Tutor NOT FOUND: ${name ? `Name="${name}"` : ''}${name && email ? ', ' : ''}${email ? `Email="${email}"` : ''}`)
    return { tutor: null, foundIn: 'not_found' }
  }

  const findStudent = async (
    students: Student[],
    name?: string,
    email?: string,
    targetYear?: string,
    targetSection?: string
  ): Promise<{ student: Student | null, microsoftUser?: MicrosoftUser, foundIn: 'local' | 'microsoft' | 'not_found' }> => {
    // Must have at least one identifier
    if (!name && !email) {
      logger.info(`❌ Student: No identifiers provided`)
      return { student: null, foundIn: 'not_found' }
    }

    const checkSuffix = (mail: string | undefined | null) => {
      if (!emailValidationSuffix || !mail) return true
      return mail.toLowerCase().trim().endsWith(emailValidationSuffix.toLowerCase().trim())
    }

    // Priority 1: Try exact name match first (case-insensitive) if name is provided
    if (name) {
      const normalizedName = name.toLowerCase().trim()
      const match = students.find(s =>
        s.name.toLowerCase().trim() === normalizedName &&
        (!targetYear || s.year === targetYear) &&
        (!targetSection || s.section === targetSection) &&
        checkSuffix(s.email)
      )

      if (match) {
        logger.info(`✅ Student found LOCALLY by NAME: "${name}" → ${match.name} (${match.email})`)
        return { student: match, foundIn: 'local' }
      }
    }

    // Priority 2: Try email match (either as fallback or primary if no name)
    if (email) {
      const normalizedEmail = email.toLowerCase().trim()
      const match = students.find(s =>
        s.email?.toLowerCase().trim() === normalizedEmail &&
        (!targetYear || s.year === targetYear) &&
        (!targetSection || s.section === targetSection) &&
        checkSuffix(s.email)
      )

      if (match) {
        logger.info(`✅ Student found LOCALLY by EMAIL: "${email}" → ${match.name} (${match.email})`)
        return { student: match, foundIn: 'local' }
      }
    }

    // Priority 3: Search Microsoft Graph by Email
    if (email && user?.id) {
      if (checkSuffix(email)) {
        logger.info(`🔍 Searching Microsoft Graph for student by EMAIL: "${email}"`)
        const microsoftUser = await MicrosoftGraphService.getUserByEmail(email)

        if (microsoftUser && checkSuffix(microsoftUser.mail)) {
          logger.info(`✨ Student found in MICROSOFT: "${email}"`)
          // Defer creation
          return { student: null, microsoftUser, foundIn: 'microsoft' }
        }
      }
    }

    // Priority 4: Search Microsoft Graph by Name (Exact Match)
    if (name && user?.id) {
      logger.info(`🔍 Searching Microsoft Graph for student by NAME: "${name}"`)
      const microsoftUsers = await MicrosoftGraphService.searchUsers(name)

      const exactMatch = microsoftUsers.find(u =>
        u.displayName.toLowerCase().trim() === name.toLowerCase().trim() &&
        checkSuffix(u.mail)
      )

      if (exactMatch) {
        logger.info(`✨ Student found in MICROSOFT by NAME: "${name}" → ${exactMatch.mail}`)
        // Defer creation
        return { student: null, microsoftUser: exactMatch, foundIn: 'microsoft' }
      }
    }

    // Not found anywhere
    logger.info(`❌ Student NOT FOUND: ${name ? `Name="${name}"` : ''}${name && email ? ', ' : ''}${email ? `Email="${email}"` : ''}`)
    return { student: null, foundIn: 'not_found' }
  }

  const processImportData = async (rows: ImportRow[], tutors: peertutors[], students: Student[]) => {
    const processed: ProcessedAssignment[] = []

    for (const row of rows) {
      const peertutorsResult = await findpeertutors(tutors, row.peertutorsName, row.peertutorsEmail, row.year, row.section)
      const studentResult = await findStudent(students, row.studentName, row.studentEmail, row.year, row.section)

      // Determine display names (use actual data if found, otherwise use provided data)
      const peertutorsDisplayName = peertutorsResult.tutor?.name || row.peertutorsName || row.peertutorsEmail || 'Unknown'
      const studentDisplayName = studentResult.student?.name || row.studentName || row.studentEmail || 'Unknown'

      const isAlreadyAssigned = studentResult.student && peertutorsResult.tutor
        ? studentResult.student.assigned_peer_tutor_id === peertutorsResult.tutor.id
        : false

      let status: ProcessedAssignment['status']
      if (!peertutorsResult.tutor && !studentResult.student) status = 'missing_both'
      else if (!peertutorsResult.tutor) status = 'missing_tutor'
      else if (!studentResult.student) status = 'missing_student'
      else if (isAlreadyAssigned) status = 'existing'
      else status = 'new'

      processed.push({
        peertutors: peertutorsResult.tutor,
        microsoftpeertutors: peertutorsResult.microsoftUser,
        peertutorsName: peertutorsDisplayName,
        peertutorsEmail: row.peertutorsEmail || peertutorsResult.tutor?.email || peertutorsResult.microsoftUser?.mail,
        peertutorsFoundIn: peertutorsResult.foundIn,
        student: studentResult.student,
        microsoftStudent: studentResult.microsoftUser,
        studentName: studentDisplayName,
        studentEmail: row.studentEmail || studentResult.student?.email || studentResult.microsoftUser?.mail,
        studentFoundIn: studentResult.foundIn,
        status,
        isAlreadyAssigned,
        year: row.year,
        section: row.section
      })
    }

    // Group by peer tutor
    const grouped = new Map<string, GroupedAssignment>()


    for (const item of processed) {
      // Priority for grouping: 
      // 1. Peer Tutor ID (if resolved)
      // 2. Email (if available)
      // 3. Name (fallback)
      const key = item.peertutors?.id
        ? item.peertutors.id
        : (item.peertutorsEmail || item.peertutorsName).toLowerCase()


      if (!grouped.has(key)) {
        grouped.set(key, {
          peertutors: item.peertutors,
          microsoftpeertutors: item.microsoftpeertutors,
          peertutorsName: item.peertutorsName,
          peertutorsEmail: item.peertutorsEmail,
          peertutorsFoundIn: item.peertutorsFoundIn,
          students: [],
          status: (item.peertutors || item.microsoftpeertutors) ? 'valid' : 'missing',
          tutorAlreadyExists: !!item.peertutors,
          year: item.year,
          section: item.section
        })
      }

      const group = grouped.get(key)!

      // Determine student status
      const studentStatus: 'existing' | 'new' | 'missing' =
        (!item.student && !item.microsoftStudent) ? 'missing' :
          item.isAlreadyAssigned ? 'existing' :
            'new'

      group.students.push({
        student: item.student,
        microsoftStudent: item.microsoftStudent,
        studentName: item.studentName,
        studentEmail: item.studentEmail,
        studentFoundIn: item.studentFoundIn,
        status: studentStatus,
        isAlreadyAssigned: item.isAlreadyAssigned,
        year: item.year,
        section: item.section
      })
    }

    setProcessedData(Array.from(grouped.values()))
    setShowPreview(true)
  }

  const handleExportNotFound = () => {
    try {
      const exportData: Array<Record<string, string>> = []

      processedData.forEach(group => {
        group.students.forEach(studentData => {
          // Only export if peer tutor OR student is not found
          if (group.status === 'missing' || studentData.status === 'missing') {
            const row: Record<string, string> = {
              'Peer Tutor Name': group.peertutorsName,
              'Peer Tutor Email': group.status === 'missing' ? '' : (group.peertutorsEmail || ''),
              'Student Name': studentData.studentName,
              'Student Email': studentData.status === 'missing' ? '' : (studentData.studentEmail || ''),
              'Year': studentData.year || '',
              'Section': studentData.section || ''
            }
            exportData.push(row)
          }
        })
      })

      if (exportData.length === 0) {
        toast.warning('No missing entities to export.')
        return
      }

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(exportData)

      // Set column widths
      ws['!cols'] = [
        { wch: 25 }, // Peer Tutor Name
        { wch: 35 }, // Peer Tutor Email
        { wch: 25 }, // Student Name
        { wch: 35 }, // Student Email
        { wch: 10 }, // Year
        { wch: 10 }  // Section
      ]

      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Not Found Entities')

      // Generate Excel file and trigger download
      XLSX.writeFile(wb, 'not_found_entities.xlsx')

    } catch (error) {
      logger.error('Error exporting not found entities:', error)
      toast.error('Error exporting not found entities.')
    }
  }

  const handleImportAssignments = async () => {
    try {
      setIsProcessing(true)

      if (!user?.id) {
        toast.error('Session error: User ID not found. Please refresh the page.')
        setIsProcessing(false)
        return
      }

      let successCount = 0
      let skipCount = 0

      for (const group of processedData) {
        if (group.status !== 'valid') continue

        let currentpeertutors = group.peertutors

        // Create Peer Tutor if needed (from Microsoft)
        if (!currentpeertutors && group.microsoftpeertutors && user?.id) {
          try {
            currentpeertutors = await peertutorservice.createFromMicrosoftUser(
              group.microsoftpeertutors,
              user.id,
              dept,
              group.year || year, // Use group year or default to current import context
              group.section || section // Use group section or default to current import context
            )
          } catch (err) {
            logger.error(`Failed to create peer tutor ${group.peertutorsName}:`, err)
            continue // Skip this group if critical creation fails
          }
        }

        if (!currentpeertutors) continue // Should not happen if validation works

        for (const studentData of group.students) {
          // Skip if student already assigned or missing
          if (studentData.isAlreadyAssigned) {
            skipCount++
            continue
          }

          if (studentData.status === 'missing') continue

          let currentStudent = studentData.student

          // Create Student if needed (from Microsoft)
          if (!currentStudent && studentData.microsoftStudent && user?.id) {
            try {
              currentStudent = await StudentService.createFromMicrosoftUser(
                studentData.microsoftStudent,
                user.id,
                dept,
                studentData.year || year, // Use row year/sem or default
                studentData.section || section
              )
            } catch (err) {
              logger.error(`Failed to create student ${studentData.studentName}:`, err)
              continue
            }
          }

          if (currentStudent) {
            await AssignmentService.assignStudent(currentStudent.id, currentpeertutors.id)
            successCount++
          }
        }
      }

      toast.success(`Successfully assigned ${successCount} student(s). Skipped ${skipCount} existing assignment(s).`)
      onSuccess()
      onClose()

    } catch (error) {
      logger.error('Error importing assignments:', error)
      toast.error('Error importing assignments. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const hasNewAssignments = processedData.some(g =>
    g.status === 'valid' && g.students.some(s => s.status === 'new')
  )

  const handleDownloadTemplate = () => {
    // Define headers and sample data
    const headers = ['Peer Tutor Name', 'Peer Tutor Email', 'Student Name', 'Student Email', 'Year', 'Section']
    const sampleData = [
      ['Example Peer Tutor', 'peer.example@sonatech.ac.in', 'Example Student', 'student.example@sonatech.ac.in', '2', 'A'],
      ['RAM A', 'ram.23ads@sonatech.ac.in', 'RAGUL K', 'ragul.23ads@sonatech.ac.in', '2', 'B']
    ]

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData])

    // Set column widths
    ws['!cols'] = [
      { wch: 25 }, // Peer Tutor Name
      { wch: 35 }, // Peer Tutor Email
      { wch: 25 }, // Student Name
      { wch: 35 }, // Student Email
      { wch: 10 }, // Year
      { wch: 10 }  // Section
    ]

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Assignments Template')

    // Generate Excel file and trigger download
    XLSX.writeFile(wb, 'peer_tutor_assignments_template.xlsx')
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-gray-900">IMPORT ASSIGNMENTS</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={isProcessing}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {!showPreview ? (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-gray-50 to-gray-200 border-2 border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-green-900">EXCEL FORMAT PREVIEW</h4>
                </div>


                <div className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden shadow-md">
                  <div className="grid grid-cols-[1.5fr_2fr_1.5fr_2fr_0.6fr_0.6fr] bg-gray-600 text-white">
                    <div className="px-4 py-3 border-r uppercase border-gray-300 font-bold text-xs text-white">
                      Peer Tutor Name
                    </div>
                    <div className="px-4 py-3 border-r uppercase border-gray-300 font-bold text-xs text-white">
                      Peer Tutor Email
                    </div>
                    <div className="px-4 py-3 border-r uppercase border-gray-300 font-bold text-xs text-white">Student Name</div>
                    <div className="px-4 py-3 border-r uppercase border-gray-300 font-bold text-xs text-white">Student Email</div>
                    <div className="px-4 py-3 border-r uppercase border-gray-300 font-bold text-xs text-white">Year</div>
                    <div className="px-4 py-3 uppercase font-bold text-xs text-white">Section</div>
                  </div>

                  {/* Sample Data Rows */}
                  <div className="grid grid-cols-[1.5fr_2fr_1.5fr_2fr_0.6fr_0.6fr] border-b border-gray-200 bg-white hover:bg-gray-50 transition-colors">
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">RAM A</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-600">ram.23ads@sonatech.ac.in</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">RAGUL K</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-600">ragul.23ads@sonatech.ac.in</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">2</div>
                    <div className="px-4 py-2.5 text-sm text-gray-700">A</div>
                  </div>


                  <div className="grid grid-cols-[1.5fr_2fr_1.5fr_2fr_0.6fr_0.6fr] bg-white hover:bg-gray-50 transition-colors">
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">PRIYA M</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-600">priya.23ads@sonatech.ac.in</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">KISHORE R</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-600">kishore.23ads@sonatech.ac.in</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">2</div>
                    <div className="px-4 py-2.5 text-sm text-gray-700">B</div>
                  </div>
                </div>
              </div>

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
                <p className="text-sm text-gray-600 mb-6">Click to select or drag and drop</p>

                <div className="max-w-md mx-auto mb-8">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 text-sm font-medium">@</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Validation Mail (e.g. .24ads@sonatech.ac.in)"
                      value={emailValidationSuffix}
                      onChange={(e) => setEmailValidationSuffix(e.target.value)}
                      className="block w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-left px-1">
                    * If specified, only emails ending with this domain will be processed.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={handleDownloadTemplate}
                    className="h-12 px-6 bg-[#00a651] hover:bg-[#008f45] text-white rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    EXPORT TEMPLATE
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="h-12 px-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? 'PROCESSING...' : 'SELECT FILE'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 font-medium mb-2 uppercase tracking-wide">Total</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">
                      {processedData.filter(g => g.peertutorsFoundIn === 'microsoft').length +
                        processedData.reduce((sum, g) => sum + g.students.filter(s => s.studentFoundIn === 'microsoft').length, 0)}
                    </div>
                    <div className="text-xs text-orange-500 uppercase">To Be Added</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-600 font-medium mb-2 uppercase tracking-wide">Peer Tutor</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">
                      {processedData.filter(g => g.status === 'valid').length}/{totalFromExcel.peerTutor}
                    </div>
                    <div className="text-xs text-green-600 uppercase">Found / Total</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 font-medium mb-2 uppercase tracking-wide">Student</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">
                      {processedData.reduce((sum, g) => sum + g.students.filter(s => s.status !== 'missing').length, 0)}/{totalFromExcel.students}
                    </div>
                    <div className="text-xs text-purple-600 uppercase">Found / Total</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-600 font-medium mb-2 uppercase tracking-wide">Added Count</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">
                      {processedData.reduce((sum, g) => sum + g.students.filter(s => s.status === 'new').length, 0)}
                    </div>
                    <div className="text-xs text-blue-600 uppercase">Assignments</div>
                  </div>
                </div>
                {(processedData.some(g => g.status === 'missing') || processedData.some(g => g.students.some(s => s.status === 'missing'))) && (
                  <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 text-xs text-red-800">
                      <strong>
                        {processedData.filter(g => g.status === 'missing').length +
                          processedData.reduce((sum, g) => sum + g.students.filter(s => s.status === 'missing').length, 0)} student(s) or peer tutor(s) not found
                      </strong>
                      {' '}in the system. Add them first before importing assignments.
                    </div>
                    <button
                      onClick={handleExportNotFound}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors flex items-center gap-1 whitespace-nowrap"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export
                    </button>
                  </div>
                )}
              </div>

              {/* Grouped Assignments */}
              <div className="space-y-3">
                {processedData.map((group, idx) => (
                  <div key={idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    {/* Peer Tutor Header */}
                    <div className={`px-6 py-4 ${group.status === 'missing' ? 'bg-red-50' :
                        group.tutorAlreadyExists ? 'bg-gray-50' : 'bg-blue-50'
                      }`}>
                      <div className="flex items-center gap-3">
                        {/* Peer Tutor PFP - Gray bg, Black text */}
                        <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-900 font-semibold text-sm">
                          {group.peertutorsName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-semibold text-gray-900">{group.peertutorsName}</span>
                            {group.status === 'missing' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-red-800 border border-red-200">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                NOT FOUND IN MICROSOFT
                              </span>
                            ) : group.peertutorsFoundIn === 'microsoft' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-purple-800 border border-purple-200">
                                FROM MICROSOFT
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-black-100 text-gray-800 border border-gray-200">
                                FOUND LOCALLY
                              </span>
                            )}
                          </div>
                          {group.peertutorsEmail && (
                            <div className="text-sm text-gray-600 mt-0.5">{group.peertutorsEmail}</div>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {group.students.length} student(s)
                        </div>
                      </div>
                    </div>

                    {/* Students List */}
                    <div className="divide-y divide-gray-100">
                      {group.students.map((studentData, sIdx) => (
                        <div key={sIdx} className="px-6 py-3 flex items-center gap-3">
                          {/* Student PFP - Black bg, Gray text */}
                          <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-gray-300 font-medium text-xs">
                            {studentData.studentName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{studentData.studentName}</span>
                              {(studentData.year || studentData.section) && (
                                <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                  {studentData.year ? `Year ${studentData.year}` : ''}
                                  {studentData.year && studentData.section ? ' - ' : ''}
                                  {studentData.section ? `Sec ${studentData.section}` : ''}
                                </span>
                              )}
                            </div>
                            {studentData.studentEmail && (
                              <div className="text-xs text-gray-500">{studentData.studentEmail}</div>
                            )}
                          </div>
                          {studentData.isAlreadyAssigned ? (
                            <span className="text-xs uppercase text-gray-600 bg-gray-100 px-2 py-1 rounded">
                              Existing
                            </span>
                          ) : studentData.status === 'new' ? (
                            <span className="text-xs uppercase text-blue-700 bg-gray-100 px-2 py-1 rounded font-medium">
                              New
                            </span>
                          ) : (
                            <span className="text-xs text-red-700 bg-gray-100 px-2 py-1 rounded font-medium">
                              Not Found
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {showPreview && (
          <div className="px-8 py-6 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="h-12 px-6 bg-gray-500 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-all"
            >
              CANCEL
            </button>
            {hasNewAssignments && (
              <button
                onClick={handleImportAssignments}
                disabled={isProcessing}
                className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                {isProcessing ? 'IMPORTING...' : 'IMPORT ASSIGNMENTS'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
