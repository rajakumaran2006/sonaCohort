'use client'

import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { StudentService, Student } from '@/lib/services/studentService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { X, Upload, AlertCircle, CheckCircle, UserPlus, Users } from 'lucide-react'
import { MicrosoftGraphService } from '@/lib/auth/microsoftGraph'
import { useAuth } from '@/lib/auth/AuthContext'

interface AssignmentImportModalProps {
  dept: string
  year: string
  section: string
  onClose: () => void
  onSuccess: () => void
}

interface ImportRow {
  peerTutorName?: string
  peerTutorEmail?: string
  studentName?: string
  studentEmail?: string
}

interface ProcessedAssignment {
  peerTutor: PeerTutor | null
  peerTutorName: string
  peerTutorEmail?: string
  peerTutorFoundIn?: 'local' | 'microsoft' | 'not_found'
  student: Student | null
  studentName: string
  studentEmail?: string
  studentFoundIn?: 'local' | 'microsoft' | 'not_found'
  status: 'existing' | 'new' | 'missing_tutor' | 'missing_student' | 'missing_both'
  isAlreadyAssigned: boolean
}

interface GroupedAssignment {
  peerTutor: PeerTutor | null
  peerTutorName: string
  peerTutorEmail?: string
  peerTutorFoundIn?: 'local' | 'microsoft' | 'not_found'
  students: Array<{
    student: Student | null
    studentName: string
    studentEmail?: string
    studentFoundIn?: 'local' | 'microsoft' | 'not_found'
    status: 'existing' | 'new' | 'missing'
    isAlreadyAssigned: boolean
  }>
  status: 'valid' | 'missing'
  tutorAlreadyExists: boolean
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
  const [importData, setImportData] = useState<ImportRow[]>([])
  const [processedData, setProcessedData] = useState<GroupedAssignment[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [existingPeerTutors, setExistingPeerTutors] = useState<PeerTutor[]>([])
  const [existingStudents, setExistingStudents] = useState<Student[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Prevent background scrolling when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setIsProcessing(true)

      // Read Excel file
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet)

      // Parse rows - now supports email-only entries and merged cells (fill-down)
      const rawRows = jsonData as any[]
      const rows: ImportRow[] = []
      let lastPeerTutorName: string | undefined
      let lastPeerTutorEmail: string | undefined

      for (const row of rawRows) {
        let peerTutorName = row['Peer Tutor Name']?.toString().trim() || undefined
        let peerTutorEmail = row['Peer Tutor Email']?.toString().trim() || undefined
        const studentName = row['Student Name']?.toString().trim() || undefined
        const studentEmail = row['Student Email']?.toString().trim() || undefined

        // Handle merged cells (fill down)
        // If peer tutor info is missing but we have student info, use the last seen peer tutor
        if (!peerTutorName && !peerTutorEmail && (studentName || studentEmail) && (lastPeerTutorName || lastPeerTutorEmail)) {
          peerTutorName = lastPeerTutorName
          peerTutorEmail = lastPeerTutorEmail
        }

        // Update last seen (only if current row has info)
        if (peerTutorName || peerTutorEmail) {
          lastPeerTutorName = peerTutorName
          lastPeerTutorEmail = peerTutorEmail
        }

        if ((peerTutorName || peerTutorEmail) && (studentName || studentEmail)) {
           rows.push({
             peerTutorName,
             peerTutorEmail,
             studentName,
             studentEmail
           })
        }
      }

      if (rows.length === 0) {
        alert('No valid data found in the file. Please check the format.')
        setIsProcessing(false)
        return
      }

      setImportData(rows)

      // Fetch existing data
      const [tutors, students] = await Promise.all([
        PeerTutorService.getAllPeerTutors(),
        StudentService.getAllStudents()
      ])

      setExistingPeerTutors(tutors)
      setExistingStudents(students.filter(s => !s.peer_tutor))

      // Process data
      await processImportData(rows, tutors, students.filter(s => !s.peer_tutor))

    } catch (error) {
      console.error('Error processing file:', error)
      alert('Error processing file. Please check the format and try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const findPeerTutor = async (
    name?: string, 
    email?: string, 
    tutors: PeerTutor[]
  ): Promise<{ tutor: PeerTutor | null, foundIn: 'local' | 'microsoft' | 'not_found' }> => {
    // Must have at least one identifier
    if (!name && !email) {
      console.log(`❌ Peer Tutor: No identifiers provided`)
      return { tutor: null, foundIn: 'not_found' }
    }

    // Priority 1: Try exact name match first (case-insensitive) if name is provided
    if (name) {
      const normalizedName = name.toLowerCase().trim()
      const match = tutors.find(pt => pt.name.toLowerCase().trim() === normalizedName)
      
      if (match) {
        console.log(`✅ Peer Tutor found LOCALLY by NAME: "${name}" → ${match.name} (${match.email})`)
        return { tutor: match, foundIn: 'local' }
      }
    }
    
    // Priority 2: Try email match (either as fallback or primary if no name)
    if (email) {
      const normalizedEmail = email.toLowerCase().trim()
      const match = tutors.find(pt => pt.email.toLowerCase().trim() === normalizedEmail)
      
      if (match) {
        console.log(`✅ Peer Tutor found LOCALLY by EMAIL: "${email}" → ${match.name} (${match.email})`)
        return { tutor: match, foundIn: 'local' }
      }
    }
    
    // Priority 3: Search Microsoft Graph by Email
    if (email && user?.id) {
      console.log(`🔍 Searching Microsoft Graph for peer tutor by EMAIL: "${email}"`)
      const microsoftUser = await MicrosoftGraphService.getUserByEmail(email)
      
      if (microsoftUser) {
        console.log(`✨ Peer Tutor found in MICROSOFT: "${email}" → Creating locally...`)
        const newTutor = await PeerTutorService.createFromMicrosoftUser(
          microsoftUser,
          user.id,
          dept,
          year,
          section
        )
        
        if (newTutor) {
          console.log(`✅ Peer Tutor created from MICROSOFT: ${newTutor.name} (${newTutor.email})`)
          return { tutor: newTutor, foundIn: 'microsoft' }
        }
      }
    }

    // Priority 4: Search Microsoft Graph by Name (Exact Match)
    if (name && user?.id) {
      console.log(`🔍 Searching Microsoft Graph for peer tutor by NAME: "${name}"`)
      const microsoftUsers = await MicrosoftGraphService.searchUsers(name)
      
      const exactMatch = microsoftUsers.find(u => u.displayName.toLowerCase().trim() === name.toLowerCase().trim())
      
      if (exactMatch) {
        console.log(`✨ Peer Tutor found in MICROSOFT by NAME: "${name}" → ${exactMatch.mail}`)
        const newTutor = await PeerTutorService.createFromMicrosoftUser(
          exactMatch,
          user.id,
          dept,
          year,
          section
        )
        
        if (newTutor) {
          console.log(`✅ Peer Tutor created from MICROSOFT: ${newTutor.name} (${newTutor.email})`)
          return { tutor: newTutor, foundIn: 'microsoft' }
        }
      }
    }
    
    // Not found anywhere
    console.log(`❌ Peer Tutor NOT FOUND: ${name ? `Name="${name}"` : ''}${name && email ? ', ' : ''}${email ? `Email="${email}"` : ''}`)
    return { tutor: null, foundIn: 'not_found' }
  }

  const findStudent = async (
    name?: string, 
    email?: string, 
    students: Student[]
  ): Promise<{ student: Student | null, foundIn: 'local' | 'microsoft' | 'not_found' }> => {
    // Must have at least one identifier
    if (!name && !email) {
      console.log(`❌ Student: No identifiers provided`)
      return { student: null, foundIn: 'not_found' }
    }

    // Priority 1: Try exact name match first (case-insensitive) if name is provided
    if (name) {
      const normalizedName = name.toLowerCase().trim()
      const match = students.find(s => s.name.toLowerCase().trim() === normalizedName)
      
      if (match) {
        console.log(`✅ Student found LOCALLY by NAME: "${name}" → ${match.name} (${match.email})`)
        return { student: match, foundIn: 'local' }
      }
    }
    
    // Priority 2: Try email match (either as fallback or primary if no name)
    if (email) {
      const normalizedEmail = email.toLowerCase().trim()
      const match = students.find(s => s.email.toLowerCase().trim() === normalizedEmail)
      
      if (match) {
        console.log(`✅ Student found LOCALLY by EMAIL: "${email}" → ${match.name} (${match.email})`)
        return { student: match, foundIn: 'local' }
      }
    }
    
    // Priority 3: Search Microsoft Graph by Email
    if (email && user?.id) {
      console.log(`🔍 Searching Microsoft Graph for student by EMAIL: "${email}"`)
      const microsoftUser = await MicrosoftGraphService.getUserByEmail(email)
      
      if (microsoftUser) {
        console.log(`✨ Student found in MICROSOFT: "${email}" → Creating locally...`)
        const newStudent = await StudentService.createFromMicrosoftUser(
          microsoftUser,
          user.id,
          dept,
          year,
          section
        )
        
        if (newStudent) {
          console.log(`✅ Student created from MICROSOFT: ${newStudent.name} (${newStudent.email})`)
          return { student: newStudent, foundIn: 'microsoft' }
        }
      }
    }

    // Priority 4: Search Microsoft Graph by Name (Exact Match)
    if (name && user?.id) {
      console.log(`🔍 Searching Microsoft Graph for student by NAME: "${name}"`)
      const microsoftUsers = await MicrosoftGraphService.searchUsers(name)
      
      const exactMatch = microsoftUsers.find(u => u.displayName.toLowerCase().trim() === name.toLowerCase().trim())
      
      if (exactMatch) {
        console.log(`✨ Student found in MICROSOFT by NAME: "${name}" → ${exactMatch.mail}`)
        const newStudent = await StudentService.createFromMicrosoftUser(
          exactMatch,
          user.id,
          dept,
          year,
          section
        )
        
        if (newStudent) {
          console.log(`✅ Student created from MICROSOFT: ${newStudent.name} (${newStudent.email})`)
          return { student: newStudent, foundIn: 'microsoft' }
        }
      }
    }
    
    // Not found anywhere
    console.log(`❌ Student NOT FOUND: ${name ? `Name="${name}"` : ''}${name && email ? ', ' : ''}${email ? `Email="${email}"` : ''}`)
    return { student: null, foundIn: 'not_found' }
  }

  const processImportData = async (rows: ImportRow[], tutors: PeerTutor[], students: Student[]) => {
    const processed: ProcessedAssignment[] = []

    for (const row of rows) {
      const peerTutorResult = await findPeerTutor(row.peerTutorName, row.peerTutorEmail, tutors)
      const studentResult = await findStudent(row.studentName, row.studentEmail, students)

      // Determine display names (use actual data if found, otherwise use provided data)
      const peerTutorDisplayName = peerTutorResult.tutor?.name || row.peerTutorName || row.peerTutorEmail || 'Unknown'
      const studentDisplayName = studentResult.student?.name || row.studentName || row.studentEmail || 'Unknown'

      const isAlreadyAssigned = studentResult.student && peerTutorResult.tutor 
        ? studentResult.student.assigned_peer_tutor_id === peerTutorResult.tutor.id
        : false

      let status: ProcessedAssignment['status']
      if (!peerTutorResult.tutor && !studentResult.student) status = 'missing_both'
      else if (!peerTutorResult.tutor) status = 'missing_tutor'
      else if (!studentResult.student) status = 'missing_student'
      else if (isAlreadyAssigned) status = 'existing'
      else status = 'new'

      processed.push({
        peerTutor: peerTutorResult.tutor,
        peerTutorName: peerTutorDisplayName,
        peerTutorEmail: row.peerTutorEmail || peerTutorResult.tutor?.email,
        peerTutorFoundIn: peerTutorResult.foundIn,
        student: studentResult.student,
        studentName: studentDisplayName,
        studentEmail: row.studentEmail || studentResult.student?.email,
        studentFoundIn: studentResult.foundIn,
        status,
        isAlreadyAssigned
      })
    }

    // Group by peer tutor
    const grouped = new Map<string, GroupedAssignment>()

    for (const item of processed) {
      const key = (item.peerTutorEmail || item.peerTutorName).toLowerCase()
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          peerTutor: item.peerTutor,
          peerTutorName: item.peerTutorName,
          peerTutorEmail: item.peerTutorEmail,
          peerTutorFoundIn: item.peerTutorFoundIn,
          students: [],
          status: item.peerTutor ? 'valid' : 'missing',
          tutorAlreadyExists: !!item.peerTutor
        })
      }

      const group = grouped.get(key)!
      
      // Determine student status (no transfer detection)
      const studentStatus: 'existing' | 'new' | 'missing' = 
        !item.student ? 'missing' : 
        item.isAlreadyAssigned ? 'existing' : 
        'new'

      group.students.push({
        student: item.student,
        studentName: item.studentName,
        studentEmail: item.studentEmail,
        studentFoundIn: item.studentFoundIn,
        status: studentStatus,
        isAlreadyAssigned: item.isAlreadyAssigned
      })
    }

    setProcessedData(Array.from(grouped.values()))
    setShowPreview(true)
  }

  const handleAddMissingEntities = async () => {
    try {
      setIsProcessing(true)

      // Add missing peer tutors
      const missingTutors = processedData.filter(g => g.status === 'missing')
      for (const group of missingTutors) {
        await PeerTutorService.addPeerTutor({
          name: group.peerTutorName,
          email: group.peerTutorEmail || `${group.peerTutorName.toLowerCase().replace(/\s+/g, '.')}@temp.com`,
          dept,
          year,
          section
        })
      }

      // Add missing students
      const allMissingStudents = processedData.flatMap(g => 
        g.students.filter(s => s.status === 'missing')
      )
      
      for (const studentData of allMissingStudents) {
        await StudentService.addStudent({
          name: studentData.studentName,
          email: studentData.studentEmail || `${studentData.studentName.toLowerCase().replace(/\s+/g, '.')}@temp.com`,
          dept,
          year,
          section,
          peer_tutor: false
        })
      }

      alert(`Added ${missingTutors.length} peer tutor(s) and ${allMissingStudents.length} student(s)`)

      // Refresh data
      const [tutors, students] = await Promise.all([
        PeerTutorService.getAllPeerTutors(),
        StudentService.getAllStudents()
      ])

      setExistingPeerTutors(tutors)
      setExistingStudents(students.filter(s => !s.peer_tutor))

      // Reprocess
      await processImportData(importData, tutors, students.filter(s => !s.peer_tutor))

    } catch (error) {
      console.error('Error adding missing entities:', error)
      alert('Error adding missing entities. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImportAssignments = async () => {
    try {
      setIsProcessing(true)

      let successCount = 0
      let skipCount = 0

      for (const group of processedData) {
        if (group.status !== 'valid') continue

        for (const studentData of group.students) {
          if (studentData.status === 'new' && studentData.student && group.peerTutor) {
            await AssignmentService.assignStudent(studentData.student.id, group.peerTutor.id)
            successCount++
          } else if (studentData.isAlreadyAssigned) {
            skipCount++
          }
        }
      }

      alert(`Successfully assigned ${successCount} student(s). Skipped ${skipCount} existing assignment(s).`)
      onSuccess()
      onClose()

    } catch (error) {
      console.error('Error importing assignments:', error)
      alert('Error importing assignments. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const hasMissingEntities = processedData.some(g => 
    g.status === 'missing' || g.students.some(s => s.status === 'missing')
  )

  const hasNewAssignments = processedData.some(g => 
    g.status === 'valid' && g.students.some(s => s.status === 'new')
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
                <div className="flex items-center gap-2 mb-4">
                  <h4 className="text-lg font-bold text-green-900">EXCEL FORMAT PREVIEW</h4>
                </div>
              
  
                   <div className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden shadow-md">
                  <div className="grid grid-cols-4 bg-gray-600 text-white">
                    <div className="px-4 py-3 border-r uppercase border-gray-300 font-bold text-xs text-white">
                      Peer Tutor Name
                    </div>
                    <div className="px-4 py-3 border-r uppercase border-gray-300 font-bold text-xs text-white">
                      Peer Tutor Email
                    </div>
                    <div className="px-4 py-3 border-r uppercase border-gray-300 font-bold text-xs text-white">Student Name</div>
                    <div className="px-4 py-3 uppercase font-bold text-xs text-white">Student Email</div>
                  </div>
                  
                  {/* Sample Data Rows */}
                  <div className="grid grid-cols-4 border-b border-gray-200 bg-white hover:bg-gray-50 transition-colors">
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">RAM A</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-600">ram.23ads@sonatech.ac.in</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">RAGUL K</div>
                    <div className="px-4 py-2.5 text-sm text-gray-600">ragul.23ads@sonatech.ac.in</div>
                  </div>
                  
                  
                  <div className="grid grid-cols-4 bg-white hover:bg-gray-50 transition-colors">
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">PRIYA M</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-600">priya.23ads@sonatech.ac.in</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">KISHORE R</div>
                    <div className="px-4 py-2.5 text-sm text-gray-600">kishore.23ads@sonatech.ac.in</div>
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
                <p className="text-sm text-gray-600 mb-4">Click to select or drag and drop</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'PROCESSING...' : 'SELECT FILE'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 font-medium mb-2 uppercase tracking-wide">Peer Tutors</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">{processedData.length}</div>
                    <div className="text-xs text-orange-500 uppercase">total</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-600 font-medium mb-2 uppercase tracking-wide">Found</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">
                      {processedData.filter(g => g.status === 'valid').length}
                    </div>
                    <div className="text-xs text-green-600 uppercase">tutors</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 font-medium mb-2 uppercase tracking-wide">Microsoft</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">
                      {processedData.filter(g => g.peerTutorFoundIn === 'microsoft').length}
                    </div>
                    <div className="text-xs text-purple-600 uppercase">added</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-600 font-medium mb-2 uppercase tracking-wide">Not Found</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">
                      {processedData.filter(g => g.status === 'missing').length}
                    </div>
                    <div className="text-xs text-red-600 uppercase">tutors</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-600 font-medium mb-2 uppercase tracking-wide">New</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">
                      {processedData.reduce((sum, g) => sum + g.students.filter(s => s.status === 'new').length, 0)}
                    </div>
                    <div className="text-xs text-blue-600 uppercase">students</div>
                  </div>
                </div>
                {processedData.some(g => g.students.some(s => s.status === 'missing')) && (
                  <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-red-800">
                      <strong>{processedData.reduce((sum, g) => sum + g.students.filter(s => s.status === 'missing').length, 0)} student(s) not found</strong>
                      {' '}in the system. Add them first before importing assignments.
                    </div>
                  </div>
                )}
              </div>

              {/* Grouped Assignments */}
              <div className="space-y-3">
                {processedData.map((group, idx) => (
                  <div key={idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    {/* Peer Tutor Header */}
                    <div className={`px-6 py-4 ${
                      group.status === 'missing' ? 'bg-red-50' : 
                      group.tutorAlreadyExists ? 'bg-gray-50' : 'bg-blue-50'
                    }`}>
                      <div className="flex items-center gap-3">
                        {/* Peer Tutor PFP - Gray bg, Black text */}
                        <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-900 font-semibold text-sm">
                          {group.peerTutorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-semibold text-gray-900">{group.peerTutorName}</span>
                            {group.status === 'missing' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-red-800 border border-red-200">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                NOT FOUND IN MICROSOFT
                              </span>
                            ) : group.peerTutorFoundIn === 'microsoft' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-purple-800 border border-purple-200">
                                FROM MICROSOFT
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-black-100 text-gray-800 border border-gray-200">
                                FOUND LOCALLY
                              </span>
                            )}
                          </div>
                          {group.peerTutorEmail && (
                            <div className="text-sm text-gray-600 mt-0.5">{group.peerTutorEmail}</div>
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
                            <div className="text-sm font-medium text-gray-900">{studentData.studentName}</div>
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
            {hasMissingEntities && (
              <button
                onClick={handleAddMissingEntities}
                disabled={isProcessing}
                className="h-12 px-6 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                {isProcessing ? 'ADDING...' : 'ADD MISSING ENTITIES'}
              </button>
            )}
            {hasNewAssignments && (
              <button
                onClick={handleImportAssignments}
                disabled={isProcessing || hasMissingEntities}
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
