'use client'

import { useState, useEffect, useRef } from 'react'
import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { createClient } from '@/utils/supabase/client'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { ExamMarksService, ExamTypeData } from '@/lib/services/examMarksService'
import { ClassService } from '@/lib/services/classService'
import * as XLSX from 'xlsx'

export default function PeerExamsPage() {
  return (
    <PeerProtectedRoute>
      <PeerExamsContent />
    </PeerProtectedRoute>
  )
}

interface Student {
  id: string
  name: string
  email: string
}

function PeerExamsContent() {
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [peerTutorInfo, setPeerTutorInfo] = useState<any>(null)
  const [assignedStudents, setAssignedStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]) // Subjects from classes table
  const [examTypes, setExamTypes] = useState<ExamTypeData[]>([])
  const [studentMarks, setStudentMarks] = useState<{ [key: string]: string }>({})
  const [saving, setSaving] = useState(false)
  const [editingExam, setEditingExam] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importExamType, setImportExamType] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState<string>('')
  const [peerTutorsInSection, setPeerTutorsInSection] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [selectedPeerTutorId, setSelectedPeerTutorId] = useState<string>('')
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [previewRows, setPreviewRows] = useState<Array<{ index: number; name: string; mark: number; matched: boolean; matchedStudent?: Student; selected: boolean }>>([])
  const [pendingImportContext, setPendingImportContext] = useState<{ examType: string; peerTutorId: string; subject: string } | null>(null)


  useEffect(() => {
    loadPeerTutorData()
  }, [])

  const loadPeerTutorData = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // Get peer tutor information
      const tutorInfo = await PeerTutorAuthService.getPeerTutorByEmail(user.email)
      if (tutorInfo) {
        setPeerTutorInfo(tutorInfo)
        
        // Get assigned students
        const students = await AssignmentService.getStudentsByPeerTutor(tutorInfo.id)
        setAssignedStudents(students)
        
        // Load subjects from classes table for this year and section
        await loadSubjectsForYearSection(tutorInfo.dept, tutorInfo.year, tutorInfo.section)
        
        // Load peer tutors for this section for optional import targeting
        await loadPeerTutorsForSection(tutorInfo.dept, tutorInfo.year, tutorInfo.section, tutorInfo.id)

        // Load existing exam types from database
        await loadExamTypes(tutorInfo.id, students)
      }
    } catch (error) {
      console.error('Error loading peer tutor data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSubjectsForYearSection = async (dept: string, year: string, section: string) => {
    try {
      const classes = await ClassService.getClassesByYearSection(dept, year, section)
      const subjectNames = classes.map(cls => cls.subject_name)
      // Remove duplicates while preserving order
      const uniqueSubjects = [...new Set(subjectNames)]
      setAvailableSubjects(uniqueSubjects)
      console.log('Loaded classes:', classes)
      console.log('All subject names:', subjectNames)
      console.log('Unique subjects for year/section:', uniqueSubjects)
    } catch (error) {
      console.error('Error loading subjects:', error)
      setAvailableSubjects([])
    }
  }

  const loadPeerTutorsForSection = async (dept: string, year: string, section: string, currentTutorId: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('peer_tutors')
        .select('id, name, email')
        .eq('dept', dept)
        .eq('year', year)
        .eq('section', section)
        .order('name', { ascending: true })
      if (error) {
        console.error('Error loading peer tutors for section:', error)
        setPeerTutorsInSection([])
        setSelectedPeerTutorId(currentTutorId)
        return
      }
      setPeerTutorsInSection(data || [])
      setSelectedPeerTutorId(currentTutorId)
    } catch (err) {
      console.error('Exception loading peer tutors for section:', err)
      setPeerTutorsInSection([])
      setSelectedPeerTutorId(currentTutorId)
    }
  }

  const loadExamTypes = async (peerTutorId: string, students: Student[]) => {
    try {
      const examTypesData = await ExamMarksService.getExamTypes(peerTutorId)
      
      // Populate students with their marks for each exam type
      const populatedExamTypes = await Promise.all(examTypesData.map(async (examType) => {
        // Get all marks for this exam type
        const marks = await ExamMarksService.getMarks(examType.exam_type, peerTutorId)
        
        // Create a map of student marks from the database
        const studentMarksMap: { [studentId: string]: { [subject: string]: string } } = {}
        marks.forEach((mark) => {
          if (!studentMarksMap[mark.student_id]) {
            studentMarksMap[mark.student_id] = {}
          }
          studentMarksMap[mark.student_id][mark.subject_name] = mark.marks.toString()
        })
        
        return {
          ...examType,
          students: students.map(student => ({
            ...student,
            marks: studentMarksMap[student.id] || {}
          }))
        }
      }))
      
      setExamTypes(populatedExamTypes)
    } catch (error) {
      console.error('Error loading exam types:', error)
    }
  }


  const handleMarkChange = (examType: string, studentId: string, subject: string, mark: string) => {
    setStudentMarks(prev => ({
      ...prev,
      [`${examType}_${studentId}_${subject}`]: mark
    }))
  }

  const handleSaveMarks = async (examType: string) => {
    if (!peerTutorInfo) return

    setSaving(true)
    try {
      // Get the exam type data
      const examTypeData = examTypes.find(exam => exam.exam_type === examType)
      if (!examTypeData) return

      // Prepare marks to save
      const marksToSave = []
      for (const student of examTypeData.students) {
        for (const subject of examTypeData.subjects) {
          const markKey = `${examType}_${student.id}_${subject}`
          const markValue = studentMarks[markKey] || student.marks[subject] || '0'
          
          marksToSave.push({
            peer_tutor_id: peerTutorInfo.id,
            student_id: student.id,
            subject_name: subject,
            marks: parseInt(markValue) || 0
          })
        }
      }

      const success = await ExamMarksService.saveMarks(examType, marksToSave)
      if (success) {
        // Reload exam types to get updated data
        await loadExamTypes(peerTutorInfo.id, assignedStudents)
        setStudentMarks({})
        setEditingExam(null)
        alert('Marks saved successfully!')
      } else {
        alert('Failed to save marks. Please try again.')
      }
    } catch (error) {
      console.error('Error saving marks:', error)
      alert('An error occurred while saving marks.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteExam = async (examType: string, examName: string) => {
    if (!peerTutorInfo) return

    // Show confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete the "${examName}" exam?\n\nThis will permanently delete all marks for this exam type. This action cannot be undone.`
    )

    if (!confirmed) return

    setSaving(true)
    try {
      const success = await ExamMarksService.deleteExamType(examType, peerTutorInfo.id)
      if (success) {
        // Reload exam types to reflect the deletion
        await loadExamTypes(peerTutorInfo.id, assignedStudents)
        setStudentMarks({})
        alert(`"${examName}" exam deleted successfully!`)
      } else {
        alert('Failed to delete exam. Please try again.')
      }
    } catch (error) {
      console.error('Error deleting exam:', error)
      alert('An error occurred while deleting the exam.')
    } finally {
      setSaving(false)
    }
  }

  const handleEditExam = (examType: string) => {
    setEditingExam(examType)
    // Pre-populate studentMarks with current saved marks for editing
    const examTypeData = examTypes.find(exam => exam.exam_type === examType)
    if (examTypeData) {
      const marksToEdit: { [key: string]: string } = {}
      examTypeData.students.forEach(student => {
        examTypeData.subjects.forEach(subject => {
          const markKey = `${examType}_${student.id}_${subject}`
          marksToEdit[markKey] = student.marks[subject] || ''
        })
      })
      setStudentMarks(marksToEdit)
    }
  }

  const handleCancelEdit = (examType: string) => {
    setEditingExam(null)
    setStudentMarks({})
  }

  const handleClickImport = (examType: string) => {
    setImportExamType(examType)
    // For CIE, ask for subject before file selection
    if (examType.toLowerCase().includes('cie')) {
      setShowSubjectModal(true)
      return
    }
    fileInputRef.current?.click()
  }

  const confirmSubjectAndProceed = () => {
    if (!selectedSubject || !selectedPeerTutorId) return
    setShowSubjectModal(false)
    // small delay so modal unmounts before file dialog
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  const normalizeName = (name: string) =>
    (name || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}+/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ') // remove punctuation
      .replace(/\s+/g, ' ')
      .trim()

  const normalizeHeader = (header: string) =>
    (header || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}+/gu, '')
      .replace(/\u00A0/g, ' ') // NBSP to space
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ') // remove punctuation
      .replace(/\s+/g, ' ')
      .trim()

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !peerTutorInfo || !importExamType) return

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Please select an Excel file (.xlsx or .xls).')
      event.target.value = ''
      return
    }

    try {
      setImporting(true)

      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, raw: false, blankrows: false, defval: '' }) as string[][]

      if (!jsonData || jsonData.length < 2) {
        alert('No data found in the Excel file.')
        return
      }

      const rawHeadersRow = (jsonData[0] || []).map(h => (h || '').toString())
      let headerRowIndex = 0
      let headers = rawHeadersRow

      // Detect header row within first 10 rows for CIE templates that have title rows
      if (importExamType.toLowerCase().includes('cie')) {
        const isStudentNameHeader = (h: string) => {
          const n = normalizeHeader(h)
          return n.includes('student name') || n.includes('studentname') || n.includes('name of the student') || (/\bstudent\b/.test(n) && /\bname\b/.test(n))
        }
        const isConsolidatedHeader = (h: string) => {
          const n = normalizeHeader(h)
          // accept common misspellings and variants: consolidated, consolidted, consolited, consoldated, total mark
          return n.includes('consolidated mark') || n.includes('consolidatedmark') ||
                 n.includes('consolidted mark') || n.includes('consolidtedmark') ||
                 n.includes('consolitated mark') || n.includes('consolitatedmark') ||
                 n.includes('consoliddted mark') || n.includes('consoliddtedmark') ||
                 (/\bconsolida?ted\b/.test(n) && n.includes('mark')) ||
                 (n.includes('consol') && n.includes('mark')) ||
                 n.includes('total mark') || n === 'total'
        }

        // Scan first 30 rows to detect columns even if headers are on different rows or merged
        let candidateNameRow = -1
        let candidateNameCol = -1
        let candidateConsRow = -1
        let candidateConsCol = -1

        const maxScan = Math.min(100, jsonData.length)
        for (let i = 0; i < maxScan; i++) {
          const row = (jsonData[i] || []).map(cell => (cell ?? '').toString())
          for (let c = 0; c < row.length; c++) {
            const cell = row[c]
            if (cell == null) continue
            if (candidateNameCol === -1 && isStudentNameHeader(cell)) {
              candidateNameRow = i
              candidateNameCol = c
            }
            if (candidateConsCol === -1 && isConsolidatedHeader(cell)) {
              candidateConsRow = i
              candidateConsCol = c
            }
          }
          if (candidateNameCol !== -1 && candidateConsCol !== -1) break
        }

        if (candidateNameCol !== -1 || candidateConsCol !== -1) {
          headerRowIndex = Math.min(candidateNameRow === -1 ? candidateConsRow : candidateNameRow, candidateConsRow === -1 ? candidateNameRow : candidateConsRow)
          headers = (jsonData[headerRowIndex] || []).map(h => (h ?? '').toString())
        }
      }

      const isCIE = importExamType.toLowerCase().includes('cie')
      const marksToSave: Array<{ peer_tutor_id: string; student_id: string; subject_name: string; marks: number }> = []

      if (isCIE) {
        // Expect "StudentName" and "Consolidated Mark" columns
        // Try to detect indices from headers; if not present, scan nearby rows
        let nameColIndex = headers.findIndex(h => {
          const n = normalizeHeader(h)
          return n.includes('student name') || n.includes('studentname') || n.includes('name of the student') || (/\bstudent\b/.test(n) && /\bname\b/.test(n))
        })
        let consMarkColIndex = headers.findIndex(h => {
          const n = normalizeHeader(h)
          return n.includes('consolidated mark') || n.includes('consolidatedmark') ||
                 n.includes('consolidted mark') || n.includes('consolidtedmark') ||
                 n.includes('consolitated mark') || n.includes('consolitatedmark') ||
                 n.includes('consoliddted mark') || n.includes('consoliddtedmark') ||
                 (/\bconsolida?ted\b/.test(n) && n.includes('mark')) ||
                 (n.includes('consol') && n.includes('mark')) ||
                 n.includes('total mark') || n === 'total'
        })

        // Fallback: scan next 5 rows after header row for labels if not found
        if (nameColIndex === -1 || consMarkColIndex === -1) {
          for (let i = headerRowIndex; i < Math.min(headerRowIndex + 5, jsonData.length); i++) {
            const row = (jsonData[i] || []).map(cell => (cell ?? '').toString())
            if (nameColIndex === -1) {
              nameColIndex = row.findIndex(isVal => {
                const n = normalizeHeader(isVal)
                return n.includes('student name') || n.includes('studentname') || (/\bstudent\b/.test(n) && /\bname\b/.test(n))
              })
            }
            if (consMarkColIndex === -1) {
              consMarkColIndex = row.findIndex(isVal => {
                const n = normalizeHeader(isVal)
                return n.includes('consolidated mark') || n.includes('consolidatedmark') ||
                       n.includes('consolidted mark') || n.includes('consolidtedmark') ||
                       n.includes('consolitated mark') || n.includes('consolitatedmark') ||
                       n.includes('consoliddted mark') || n.includes('consoliddtedmark') ||
                       (/\bconsolida?ted\b/.test(n) && n.includes('mark')) ||
                       (n.includes('consol') && n.includes('mark')) ||
                       n.includes('total mark') || n === 'total'
              })
            }
            if (nameColIndex !== -1 && consMarkColIndex !== -1) break
          }
        }

        // Final fallback for consolidated: use "test mark" if available
        if (consMarkColIndex === -1) {
          consMarkColIndex = headers.findIndex(h => normalizeHeader(h).includes('test mark'))
        }

        // Heuristic fallback if headers still not found: infer columns by scanning first 50 rows
        if (nameColIndex === -1 || consMarkColIndex === -1) {
          let inferredNameCol = -1
          let inferredMarkCol = -1
          const limitRows = Math.min(100, jsonData.length)
          const limitCols = Math.max(...jsonData.slice(0, limitRows).map(r => r.length))
          let bestScore = -1
          for (let c1 = 0; c1 < limitCols; c1++) {
            for (let c2 = 0; c2 < limitCols; c2++) {
              if (c1 === c2) continue
              let score = 0
              for (let r = headerRowIndex + 1; r < limitRows; r++) {
                const nameVal = ((jsonData[r] || [])[c1] ?? '').toString()
                const markVal = ((jsonData[r] || [])[c2] ?? '').toString()
                const nameOk = /[A-Za-z]/.test(nameVal)
                const num = parseInt(markVal)
                const markOk = Number.isFinite(num) && num >= 0 && num <= 100
                if (nameOk && markOk) score++
              }
              if (score > bestScore) {
                bestScore = score
                inferredNameCol = c1
                inferredMarkCol = c2
              }
            }
          }
          if (bestScore > 0) {
            nameColIndex = nameColIndex === -1 ? inferredNameCol : nameColIndex
            consMarkColIndex = consMarkColIndex === -1 ? inferredMarkCol : consMarkColIndex
          }
        }

        if (nameColIndex === -1 || consMarkColIndex === -1) {
          alert('Could not find required columns: StudentName and Consolidated/Test Mark. Ensure the sheet has those headers or a clear name column and numeric mark column.')
          return
        }

        if (!selectedSubject) {
          alert('Please select a subject before importing.')
          return
        }

        // Build student lookup for the selected peer tutor (not necessarily current user)
        let studentsForSelected: Student[] = assignedStudents
        if (selectedPeerTutorId && selectedPeerTutorId !== peerTutorInfo.id) {
          try {
            const fetched = await AssignmentService.getStudentsByPeerTutor(selectedPeerTutorId)
            studentsForSelected = fetched as Student[]
          } catch (e) {
            console.error('Failed to fetch students for selected peer tutor, falling back to current tutor students', e)
          }
        }

        const nameToStudent = new Map<string, Student>()
        studentsForSelected.forEach(s => {
          const key = normalizeName(s.name || '')
          if (key) nameToStudent.set(key, s)
        })

        const skipped: string[] = []
        const tryFuzzyMatch = (sheetName: string): Student | undefined => {
          const sheetNorm = normalizeName(sheetName)
          const sheetTokens = sheetNorm.split(' ').filter(Boolean)
          if (sheetTokens.length === 0) return undefined
          const sheetFirst = sheetTokens[0]
          const sheetLast = sheetTokens[sheetTokens.length - 1]

          let best: { student: Student; score: number } | null = null
          for (const s of assignedStudents) {
            const stuNorm = normalizeName(s.name || '')
            const stuTokens = stuNorm.split(' ').filter(Boolean)
            if (stuTokens.length === 0) continue
            const stuFirst = stuTokens[0]
            const stuLast = stuTokens[stuTokens.length - 1]

            // Heuristics:
            // 1) Last token must match exactly if present
            if (sheetLast && stuLast && sheetLast !== stuLast) continue

            // 2) First token similarity: allow off-by-one character (prefix/substring)
            const firstSimilar = sheetFirst === stuFirst ||
              sheetFirst.startsWith(stuFirst) ||
              stuFirst.startsWith(sheetFirst) ||
              Math.abs(sheetFirst.length - stuFirst.length) <= 1 && (sheetFirst.includes(stuFirst) || stuFirst.includes(sheetFirst))

            if (!firstSimilar) continue

            // 3) Token overlap score as tie-breaker
            const sheetSet = new Set(sheetTokens)
            const stuSet = new Set(stuTokens)
            let common = 0
            stuSet.forEach(t => { if (sheetSet.has(t)) common++ })
            const score = common / Math.max(1, stuSet.size)
            if (!best || score > best.score) best = { student: s, score }
          }
          return best ? best.student : undefined
        }

        const parsed: Array<{ index: number; name: string; mark: number; matched: boolean; matchedStudent?: Student }> = []
        for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
          const row = jsonData[r] || []
          const nameRaw = (row[nameColIndex] ?? '').toString()
          const markRaw = (row[consMarkColIndex] ?? '').toString()
          const key = normalizeName(nameRaw)
          // stop if long empty gap encountered
          if (!key && !markRaw) continue
          if (!key) continue
          let student = nameToStudent.get(key)
          if (!student) {
            // attempt fuzzy token match
            const fuzzy = tryFuzzyMatch(nameRaw)
            if (!fuzzy) {
              parsed.push({ index: r, name: nameRaw, mark: Number.parseInt(markRaw) || 0, matched: false })
              continue
            }
            student = fuzzy
          }
          const numeric = parseInt(markRaw)
          const marksNum = Number.isFinite(numeric) ? numeric : 0
          parsed.push({ index: r, name: nameRaw, mark: marksNum, matched: true, matchedStudent: student })
        }

        // Build preview rows and show preview modal instead of immediate save
        const rowsForPreview = parsed.map(p => ({
          index: p.index,
          name: p.name,
          mark: p.mark,
          matched: p.matched,
          matchedStudent: p.matchedStudent,
          selected: p.matched // pre-select only matched rows
        }))
        setPreviewRows(rowsForPreview)
        setPendingImportContext({ examType: importExamType, peerTutorId: selectedPeerTutorId || peerTutorInfo.id, subject: selectedSubject })
        setShowImportPreview(true)
        return
      }

      // Default import path (non-CIE): require Student Email + per-subject columns
      const emailColIndex = headers.findIndex(h => h.toLowerCase().includes('email'))
      if (emailColIndex === -1) {
        alert('Could not find a Student Email column in the first row.')
        return
      }

      const subjectColMap: Record<string, number> = {}
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i]
        const matchedSubject = availableSubjects.find(s => s.toLowerCase() === header.toLowerCase())
        if (matchedSubject) subjectColMap[matchedSubject] = i
      }

      const matchedSubjects = Object.keys(subjectColMap)
      if (matchedSubjects.length === 0) {
        alert('No subject columns matched your section subjects. Ensure headers match subject names exactly.')
        return
      }

      const emailToStudent = new Map<string, Student>()
      assignedStudents.forEach(s => {
        if (s.email) emailToStudent.set(s.email.toLowerCase(), s)
      })

      let unmatchedEmails: string[] = []
      for (let r = 1; r < jsonData.length; r++) {
        const row = jsonData[r] || []
        const emailRaw = (row[emailColIndex] || '').toString().trim().toLowerCase()
        if (!emailRaw) continue
        const student = emailToStudent.get(emailRaw)
        if (!student) { unmatchedEmails.push(emailRaw); continue }
        for (const subject of matchedSubjects) {
          const colIndex = subjectColMap[subject]
          const cellVal = row[colIndex]
          const valueStr = (cellVal ?? '').toString().trim()
          const numeric = parseInt(valueStr)
          const marksNum = Number.isFinite(numeric) ? numeric : 0
          marksToSave.push({
            peer_tutor_id: peerTutorInfo.id,
            student_id: student.id,
            subject_name: subject,
            marks: marksNum
          })
        }
      }

      if (marksToSave.length === 0) {
        alert('No valid rows found to import.')
        return
      }

      const ok = await ExamMarksService.saveMarks(importExamType, marksToSave)
      if (ok) {
        await loadExamTypes(peerTutorInfo.id, assignedStudents)
        setStudentMarks({})
        setEditingExam(null)
        if (unmatchedEmails.length > 0) {
          alert(`Import completed. Saved ${marksToSave.length} marks. Unmatched emails: ${unmatchedEmails.slice(0, 5).join(', ')}${unmatchedEmails.length > 5 ? ' ...' : ''}`)
        } else {
          alert(`Import completed. Saved ${marksToSave.length} marks.`)
        }
      } else {
        alert('Failed to import marks. Please try again.')
      }
    } catch (error) {
      console.error('Error importing marks:', error)
      alert('Error importing marks. Please check the file format.')
    } finally {
      setImporting(false)
      setImportExamType(null)
      if (event.target) event.target.value = ''
    }
  }

  const commitImportFromPreview = async () => {
    if (!pendingImportContext) { setShowImportPreview(false); return }
    const { examType, peerTutorId, subject } = pendingImportContext
    const rows = previewRows.filter(r => r.selected && r.matched && r.matchedStudent)
    if (rows.length === 0) { alert('No selected valid rows to import.'); return }
    try {
      setImporting(true)
      const marksToSave = rows.map(r => ({
        peer_tutor_id: peerTutorId,
        student_id: (r.matchedStudent as Student).id,
        subject_name: subject,
        marks: r.mark
      }))
      const ok = await ExamMarksService.saveMarks(examType, marksToSave)
      if (ok) {
        await loadExamTypes(peerTutorInfo!.id, assignedStudents)
        setStudentMarks({})
        setEditingExam(null)
        setShowImportPreview(false)
        setPreviewRows([])
        setPendingImportContext(null)
        alert(`Import completed. Saved ${marksToSave.length} mark(s).`) 
      } else {
        alert('Failed to import marks. Please try again.')
      }
    } catch (e) {
      console.error('Error committing import from preview:', e)
      alert('Error saving marks. Please try again.')
    } finally {
      setImporting(false)
    }
  }


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your exams...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <PeerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64 overflow-y-auto">
        {/* Header */}
        <header className="bg-white shadow flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 lg:hidden"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  <div className="ml-4">
                    <h1 className="text-2xl font-bold text-gray-900">Exams for {peerTutorInfo?.year} - Section {peerTutorInfo?.section} in {peerTutorInfo?.dept}</h1>
                    <p className="text-sm text-gray-600 mt-1">
                      View and manage exam marks for your assigned students
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">

          {/* Exam Types */}
          <div className="space-y-6">
            {examTypes.length > 0 ? (
              examTypes.map((examType) => (
                <div key={examType.id} className="bg-white rounded-xl shadow-lg border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">{examType.name}</h3>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleClickImport(examType.exam_type)}
                          disabled={saving || importing}
                          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          {importing && importExamType === examType.exam_type ? 'Importing...' : 'Import'}
                        </button>
                        {editingExam === examType.exam_type ? (
                          <>
                            <button
                              onClick={() => handleSaveMarks(examType.exam_type)}
                              disabled={saving}
                              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                            >
                              {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                              onClick={() => handleCancelEdit(examType.exam_type)}
                              disabled={saving}
                              className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleEditExam(examType.exam_type)}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Student Name
                          </th>
                          {availableSubjects.map((subject) => (
                            <th key={subject} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {subject}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {examType.students.map((student) => (
                          <tr key={student.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                                  <span className="text-sm font-medium text-blue-600">
                                    {(student.name || 'Unknown').split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {student.name || 'Unknown Student'}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {student.email || 'No email'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            {availableSubjects.map((subject) => {
                              const isCIE = examType.exam_type.toLowerCase().includes('cie')
                              const isSEM = examType.exam_type.toLowerCase().includes('sem')
                              
                              // Check if user has made changes to this specific field
                              const markKey = `${examType.exam_type}_${student.id}_${subject}`
                              const hasUserChanges = markKey in studentMarks
                              const isInEditMode = editingExam === examType.exam_type
                              
                              // Show user changes if they exist, otherwise show saved marks
                              const currentValue = hasUserChanges 
                                ? studentMarks[markKey] 
                                : (student.marks[subject] || '')
                              
                              const hasSavedMarks = student.marks[subject] && student.marks[subject] !== '' && student.marks[subject] !== '0'
                              const isCurrentlyEditing = hasUserChanges || isInEditMode
                              const isPending = !hasSavedMarks && !hasUserChanges
                              
                              return (
                                <td key={subject} className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center space-x-2">
                                    {!isInEditMode && isPending ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                        Pending
                                      </span>
                                    ) : isCIE ? (
                                      <input
                                        type="number"
                                        min="0"
                                        max="50"
                                        placeholder="0"
                                        value={currentValue}
                                        onChange={(e) => handleMarkChange(examType.exam_type, student.id, subject, e.target.value)}
                                        disabled={!isInEditMode}
                                        className={`w-20 px-2 py-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                                          !isInEditMode 
                                            ? 'bg-gray-100 cursor-not-allowed' 
                                            : hasSavedMarks && !isCurrentlyEditing 
                                            ? 'border-green-300 bg-green-50' 
                                            : isCurrentlyEditing 
                                            ? 'border-blue-300 bg-blue-50' 
                                            : 'border-gray-300'
                                        }`}
                                      />
                                    ) : isSEM ? (
                                      <select
                                        value={currentValue}
                                        onChange={(e) => handleMarkChange(examType.exam_type, student.id, subject, e.target.value)}
                                        disabled={!isInEditMode}
                                        className={`w-24 px-2 py-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                                          !isInEditMode 
                                            ? 'bg-gray-100 cursor-not-allowed' 
                                            : hasSavedMarks && !isCurrentlyEditing 
                                            ? 'border-green-300 bg-green-50' 
                                            : isCurrentlyEditing 
                                            ? 'border-blue-300 bg-blue-50' 
                                            : 'border-gray-300'
                                        }`}
                                      >
                                        <option value="">Select</option>
                                        <option value="retest">Retest</option>
                                        <option value="absent">Absent</option>
                                        <option value="pass">Pass</option>
                                        <option value="fail">Fail</option>
                                        <option value="exempt">Exempt</option>
                                      </select>
                                    ) : (
                                      <input
                                        type="text"
                                        placeholder="Enter marks"
                                        value={currentValue}
                                        onChange={(e) => handleMarkChange(examType.exam_type, student.id, subject, e.target.value)}
                                        disabled={!isInEditMode}
                                        className={`w-24 px-2 py-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                                          !isInEditMode 
                                            ? 'bg-gray-100 cursor-not-allowed' 
                                            : hasSavedMarks && !isCurrentlyEditing 
                                            ? 'border-green-300 bg-green-50' 
                                            : isCurrentlyEditing 
                                            ? 'border-blue-300 bg-blue-50' 
                                            : 'border-gray-300'
                                        }`}
                                      />
                                    )}
                                    {hasSavedMarks && !isCurrentlyEditing && (
                                      <div className="flex items-center" title="Marks saved">
                                        <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                    )}
                                    {isCurrentlyEditing && (
                                      <div className="flex items-center" title="Unsaved changes">
                                        <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No exams assigned yet</h3>
                  <p className="text-gray-500">Faculty will send exam types to this section. Check back later for exam assignments.</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleImportFileChange}
        className="hidden"
      />

      {/* Subject selection modal for CIE import */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Select Subject for CIE Import</h3>
              <button onClick={() => { setShowSubjectModal(false); setSelectedSubject('') }} className="text-gray-400 hover:text-gray-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select subject</option>
              {availableSubjects.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Peer Tutor</label>
              <select
                value={selectedPeerTutorId}
                onChange={(e) => setSelectedPeerTutorId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {peerTutorsInSection.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Marks will be imported for the selected peer tutor's assigned students.</p>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => { setShowSubjectModal(false); setSelectedSubject('') }} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium">Cancel</button>
              <button onClick={confirmSubjectAndProceed} disabled={!selectedSubject || !selectedPeerTutorId} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium">Continue</button>
            </div>
          </div>
        </div>
      )}

      {showImportPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Import Preview</h3>
              <button onClick={() => setShowImportPreview(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 overflow-auto max-h-[60vh]">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Consolidated Mark</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Match</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewRows.map((row) => (
                    <tr key={row.index} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => setPreviewRows(prev => prev.map(r => r.index === row.index ? { ...r, selected: e.target.checked } : r))}
                        />
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-900">{row.name}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{row.mark}</td>
                      <td className="px-3 py-2">
                        {row.matched ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800" title={row.matchedStudent?.email || ''}>
                            Matched
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Not Found
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewRows.length === 0 && (
                <div className="text-center text-sm text-gray-500 py-6">No rows parsed from the file.</div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Selected: {previewRows.filter(r => r.selected).length} / {previewRows.length}
              </div>
              <div className="space-x-3">
                <button onClick={() => setShowImportPreview(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                <button onClick={commitImportFromPreview} disabled={importing || previewRows.filter(r => r.selected && r.matched).length === 0} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400">
                  {importing ? 'Importing...' : 'Import Selected'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

