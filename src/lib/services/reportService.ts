import * as XLSX from 'xlsx'
import { Student, StudentService } from '@/lib/services/studentService'
import { peertutors, peertutorservice } from '@/lib/services/peerTutorService'
import { ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { logger } from '@/lib/logger'
import { createClient } from '@/lib/supabase/client'

// Define types for mapping report
export interface PeerTutorWithStudents {
  peertutors: peertutors
  students: Student[]
}

export interface YearSectionGroup {
  year: string
  section: string
  peerTutorWithStudents: PeerTutorWithStudents[]
}

export class ReportService {
  /**
   * Fetch Mapping Data (Logic refactored from PeerTutorMappingExport)
   */
  static async fetchMappingData(dept: string): Promise<YearSectionGroup[]> {
    try {
      // Get all students for the department
      const allStudents = await StudentService.getAllStudents()
      const departmentStudents = allStudents.filter(s => s.dept === dept && !s.peer_tutor)
      
      // Get all peer tutors for the department
      const allpeerTutor = await peertutorservice.getAllpeerTutor()
      const departmentpeerTutor = allpeerTutor.filter(pt => pt.dept === dept)
      
      if (departmentStudents.length === 0 && departmentpeerTutor.length === 0) {
        return []
      }
      
      // Get unique year/section combinations
      const yearSectionSet = new Set<string>()
      
      departmentStudents.forEach(student => {
        yearSectionSet.add(`${student.year}|${student.section}`)
      })
      
      departmentpeerTutor.forEach(peertutors => {
        yearSectionSet.add(`${peertutors.year}|${peertutors.section}`)
      })
      
      const yearSectionGroups: YearSectionGroup[] = []
      
      for (const key of yearSectionSet) {
        const [yearValue, sectionValue] = key.split('|')
        
        const sectionStudents = departmentStudents.filter(s => 
          s.year === yearValue && s.section === sectionValue
        )
        
        const sectionpeerTutor = departmentpeerTutor.filter(pt => 
          pt.year === yearValue && pt.section === sectionValue
        )
        
        const peerTutorWithStudents: PeerTutorWithStudents[] = []
        
        for (const peertutors of sectionpeerTutor) {
          const assignedStudents = sectionStudents.filter(student => 
            student.assigned_peer_tutor_id === peertutors.id
          )
          
          peerTutorWithStudents.push({
            peertutors,
            students: assignedStudents
          })
        }
        
        // Unassigned peer tutors
        const peertutorsIdsWithStudents = new Set(peerTutorWithStudents.map(pts => pts.peertutors.id))
        const unassignedpeerTutor = sectionpeerTutor.filter(pt => 
          !peertutorsIdsWithStudents.has(pt.id)
        )
        
        for (const peertutors of unassignedpeerTutor) {
          peerTutorWithStudents.push({
            peertutors,
            students: []
          })
        }
        
        if (peerTutorWithStudents.length > 0) {
          yearSectionGroups.push({
            year: yearValue,
            section: sectionValue,
            peerTutorWithStudents
          })
        }
      }
      
      // Sort
      yearSectionGroups.sort((a, b) => {
        if (a.year !== b.year) return a.year.localeCompare(b.year)
        return a.section.localeCompare(b.section)
      })
      
      return yearSectionGroups
    } catch (error) {
      logger.error('Error fetching mapping data:', error)
      return []
    }
  }

  /**
   * Helper to convert a workbook to a File object
   */
  private static workbookToFile(wb: XLSX.WorkBook, filename: string): File {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    return new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  }

  /**
   * Helper to append a worksheet to a workbook with styling
   */
  private static appendSheet(wb: XLSX.WorkBook, data: (string | number | undefined | null)[][], sheetName: string, headerMerges: XLSX.Range[] = []) {
    const ws = XLSX.utils.aoa_to_sheet(data)
    
    // Apply merges
    if (headerMerges.length > 0) {
      ws['!merges'] = headerMerges
    }

    // Basic styling for headers (first row is usually title, next few are metadata)
    // Note: xlsx basic version doesn't support advanced styling like colors without Pro version or additional libraries
    // We strictly use basic features here.
    
    // Auto-adjust column widths based on content length (simple estimation)
    const colWidths = data[0]?.map((_, i) => {
        let maxLen = 10
        data.forEach(row => {
            const cellVal = row[i] ? String(row[i]) : ''
            if (cellVal.length > maxLen) maxLen = cellVal.length
        })
        return { wch: Math.min(maxLen + 2, 50) } // Cap at 50 chars
    })
    ws['!cols'] = colWidths

    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  /**
   * Generate Student Report
   */
  static async generateStudentReport(students: Student[], dept: string): Promise<File> {
    const wb = XLSX.utils.book_new()
    
    // Format data: S.No, Name, Email, Year, Section, Assigned Tutor
    const data: (string | number)[][] = [
      ['STUDENT LIST REPORT'],
      [`Department: ${dept}`],
      [`Generated: ${new Date().toLocaleDateString()}`],
      [],
      ['S.No', 'Name', 'Email', 'Year', 'Section', 'Assigned Peer Tutor', 'Manual Entry']
    ]

    students.forEach((s, index) => {
      data.push([
        index + 1,
        s.name,
        s.email || 'N/A',
        s.year,
        s.section,
        s.assigned_peer_tutor_id ? 'Yes' : 'No', // We don't have tutor name readily available in simple Student object unless verified
        s.is_manual_entry ? 'Yes' : 'No'
      ])
    })

    const merges = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Title merge
        { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }
    ]

    this.appendSheet(wb, data, 'Students', merges)
    return this.workbookToFile(wb, `Student_Report_${dept}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  /**
   * Generate Peer Tutor Report
   */
  static async generatePeerTutorReport(tutors: peertutors[], dept: string): Promise<File> {
    const wb = XLSX.utils.book_new()
    
    // Format data
    const data: (string | number)[][] = [
        ['PEER TUTOR LIST REPORT'],
        [`Department: ${dept}`],
        [`Generated: ${new Date().toLocaleDateString()}`],
        [],
        ['S.No', 'Name', 'Email', 'Year', 'Section']
    ]

    tutors.forEach((t, index) => {
        data.push([
            index + 1,
            t.name,
            t.email,
            t.year,
            t.section
        ])
    })
    
    const merges = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }
    ]

    this.appendSheet(wb, data, 'Peer Tutors', merges)
    return this.workbookToFile(wb, `Peer_Tutor_Report_${dept}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  /**
   * Generate Scheduled Classes Report
   */
  static async generateClassReport(classes: ScheduledClassWithDetails[], dept: string): Promise<File> {
    const wb = XLSX.utils.book_new()

    const data: (string | number)[][] = [
        ['SCHEDULED CLASSES REPORT'],
        [`Department: ${dept}`],
        [`Generated: ${new Date().toLocaleDateString()}`],
        [],
        ['S.No', 'Date', 'Year', 'Section', 'Subject', 'Peer Tutor', 'Topics', 'Status', 'Time']
    ]

    classes.forEach((c, index) => {
        data.push([
            index + 1,
            c.scheduled_date,
            c.year,
            c.section,
            c.class?.subject_name || 'N/A',
            c.peer_tutor?.name || 'Unassigned',
            c.topics || 'N/A',
            c.completion_status || 'not_started',
            `${c.start_time || ''} - ${c.end_time || ''}`
        ])
    })

    const merges = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }
    ]

    this.appendSheet(wb, data, 'Scheduled Classes', merges)
    return this.workbookToFile(wb, `Class_Report_${dept}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  /**
   * Generate Mapping Report (Reusing logic from PeerTutorMappingExport.tsx)
   */
  static async generateMappingReport(groups: YearSectionGroup[], dept: string): Promise<File> {
    const wb = XLSX.utils.book_new()
    
    // Common Header Info
    const headerInfo = {
        collegeName: 'SONA COLLEGE OF TECHNOLOGY (Autonomous)',
        department: `DEPARTMENT OF ${dept.toUpperCase()}`, // Approximation
        documentTitle: 'PEER TUTORS - SLOW LEARNERS MAPPING LIST',
        academicYear: `ACADEMIC YEAR ${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
        date: new Date().toLocaleDateString('en-GB').replace(/\//g, '.')
    }

    if (groups.length === 0) {
        // Create an empty sheet if no data
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No Data Available']]), 'No Data')
    }

    for (const group of groups) {
         const data: (string | number | undefined | null)[][] = []
         
         // Rows 1-4: Headers
         data.push([headerInfo.collegeName])
         data.push([headerInfo.department])
         data.push([headerInfo.documentTitle])
         data.push([headerInfo.academicYear])
         data.push([]) 
         data.push([`Year: ${group.year}`, '', '', '', 'SEMESTER: --']) // We don't have semester readily available
         data.push(['', '', '', '', `Date: ${headerInfo.date}`])
         data.push([])

         // Table Header
         data.push(['S NO', 'Name of the tutor', 'Year/Sec', 'Count', 'Name of Slow Learners'])

         let serialNumber = 1
         
         group.peerTutorWithStudents.forEach(({ peertutors, students }) => {
             if (students.length === 0) {
                 data.push([
                     serialNumber,
                     peertutors.name,
                     `${peertutors.year}/${peertutors.section}`,
                     0,
                     'No students assigned'
                 ])
                 serialNumber++
             } else {
                 // First student on same row
                 data.push([
                     serialNumber,
                     peertutors.name,
                     `${peertutors.year}/${peertutors.section}`,
                     students.length,
                     students[0].name
                 ])
                 // Remaining students
                 for (let i = 1; i < students.length; i++) {
                     data.push(['', '', '', '', students[i].name])
                 }
                 serialNumber++
             }
         })

         // Merges for this sheet
         const sheetMerges = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
            { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } }
         ]

         // Add sheet
         this.appendSheet(wb, data, `Year ${group.year} - Sec ${group.section}`, sheetMerges)
    }

    return this.workbookToFile(wb, `Mapping_Report_${dept}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  /**
   * Get all subjects assigned to a peer tutor (based on scheduled classes)
   */
  static async getPeerTutorSubjects(peerTutorId: string): Promise<{ subject_name: string }[]> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('scheduled_classes')
        .select('class:classes!inner(subject_name)')
        .eq('peer_tutor_id', peerTutorId)
      
      if (error) {
        logger.error('Error getting peer tutor subjects:', error)
        return []
      }
      
      // Extract unique subject names
      const uniqueSubjects = new Set<string>()
      
      interface ScheduledClassResult {
        class: {
          subject_name: string
        } | null | undefined
      }

      (data as unknown as ScheduledClassResult[])?.forEach((item) => {
        if (item.class?.subject_name) {
          uniqueSubjects.add(item.class.subject_name)
        }
      })
      
      return Array.from(uniqueSubjects).map(name => ({ subject_name: name }))
    } catch (error) {
      logger.error('Error in getPeerTutorSubjects:', error)
      return []
    }
  }

  /**
   * Get scheduled classes for a specific subject and peer tutor
   */
  static async getSubjectScheduledClasses(peerTutorId: string, subjectName: string): Promise<ScheduledClassWithDetails[]> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes!inner(subject_name),
          peer_tutor:peer_tutors!peer_tutor_id(*)
        `)
        .eq('peer_tutor_id', peerTutorId)
        .eq('class.subject_name', subjectName)
        .order('scheduled_date', { ascending: false })

      if (error) {
        logger.error('Error getting subject scheduled classes:', error)
        return []
      }

      return (data as unknown as ScheduledClassWithDetails[]) || []
    } catch (error) {
      logger.error('Error in getSubjectScheduledClasses:', error)
      return []
    }
  }

  /**
   * Get attendance report for a specific scheduled class
   */
  static async getClassAttendanceReport(scheduledClassId: string): Promise<ClassAttendanceReport | null> {
    try {
      const supabase = createClient()
      
      // Get class details
      const { data: classData, error: classError } = await supabase
        .from('scheduled_classes')
        .select(`
          *,
          class:classes(subject_name)
        `)
        .eq('id', scheduledClassId)
        .single()
        
      if (classError || !classData) {
        logger.error('Error getting class details:', classError)
        return null
      }

      // Get attendance records with student details
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select(`
          *,
          student:peer_students(id, name, email)
        `)
        .eq('scheduled_class_id', scheduledClassId)

      if (attendanceError) {
        logger.error('Error getting attendance records:', attendanceError)
        return null
      }

      interface AttendanceRecord {
        student_id: string | null;
        student_name?: string | null;
        student: {
          name: string;
          email: string;
        } | null;
        status: string;
      }

      const records = ((attendanceData as unknown as AttendanceRecord[]) || []).map((record) => ({
        student_id: record.student_id || '',
        student_name: record.student?.name || record.student_name || 'Removed Student',
        student_email: record.student?.email || '',
        status: (['present', 'p'].includes((record.status || '').toLowerCase()) ? 'present' : 'absent') as 'present' | 'absent'
      }))

      const presentCount = records.filter(r => r.status === 'present').length
      const absentCount = records.length - presentCount

      return {
        subject_name: classData.class?.subject_name || 'Unknown',
        scheduled_date: classData.scheduled_date,
        topics: classData.topics,
        link: classData.link,
        start_time: classData.start_time,
        end_time: classData.end_time,
        present_count: presentCount,
        absent_count: absentCount,
        attendance_records: records
      }
    } catch (error) {
      logger.error('Error in getClassAttendanceReport:', error)
      return null
    }
  }

  /**
   * Get comprehensive reports for all peer tutors assigned to a faculty
   */
  static async getAllpeertutorsReports(facultyId: string): Promise<peertutorsReportData[]> {
    try {
      const supabase = createClient()
      
      // Get all peer tutors assigned by this faculty
      // Note: In a real app, you might want to filter by faculty_id if that column exists/is used
      // For now, based on previous code, we might just get all or filter by dept
      // But the call site passes user.id, so let's try to filter by assigned_by or faculty_id
      
      // Re-using getAllpeerTutor but we need to know if we should filter by facultyId
      // The previous code in peertutor/page.tsx just passed user.id
      
      const { data: tutors, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('*')
        // We might need to filter by faculty_id if the schema supports it
        // based on peertutorservice.getAllpeerTutor it does
        .eq('faculty_id', facultyId) 
        .order('name')

      if (tutorError) {
        logger.error('Error getting peer tutors:', tutorError)
        return []
      }

      if (!tutors || tutors.length === 0) return []

      const reports: peertutorsReportData[] = []

      for (const tutor of tutors) {

        // Get additional classes
        const { data: additionalClasses, error: additionalError } = await supabase
          .from('additional_classes')
          .select('id, subject_name')
          .eq('peer_tutor_id', tutor.id)

        if (additionalError) {
          logger.error(`Error getting additional classes for tutor ${tutor.id}:`, additionalError)
          continue
        }

        // Get scheduled classes with subject info
         const { data: classesWithSubject, error: classesSubjectError } = await supabase
          .from('scheduled_classes')
          .select(`
            id, 
            completion_status, 
            attendance_completed, 
            topics_completed,
            class:classes(id, subject_name)
          `)
          .eq('peer_tutor_id', tutor.id)

        if (classesSubjectError) {
             logger.error(`Error getting classes with subject for tutor ${tutor.id}:`, classesSubjectError)
             continue
        }
        
        const subjectStats = new Map<string, {
            subject_name: string
            class_id: string
            total_classes: number
            completed_classes: number
            pending_classes: number
            additional_classes: number
        }>()

        interface ScheduledClassWithSubject {
          id: string
          completion_status: string
          attendance_completed: boolean
          topics_completed: boolean
          class: {
            id: string
            subject_name: string
          } | null
        }

        // Process scheduled classes
        ((classesWithSubject as unknown as ScheduledClassWithSubject[]) || [])?.forEach((cls) => {
            const subjectName = cls.class?.subject_name || 'Unknown Subject'
            const classId = cls.class?.id || ''
            
            if (!subjectStats.has(subjectName)) {
                subjectStats.set(subjectName, {
                    subject_name: subjectName,
                    class_id: classId,
                    total_classes: 0,
                    completed_classes: 0,
                    pending_classes: 0,
                    additional_classes: 0
                })
            }
            
            const stats = subjectStats.get(subjectName)!
            // If we found a valid class ID and didn't have one before (e.g. from dummy init), update it
            if (classId && !stats.class_id) {
                stats.class_id = classId
            }
            
            stats.total_classes++
            
            const isCompleted = cls.completion_status === 'completed' || 
                              (cls.attendance_completed && cls.topics_completed)
            
            if (isCompleted) {
                stats.completed_classes++
            } else {
                stats.pending_classes++
            }
        })

        interface AdditionalClassResult {
          id: string
          subject_name: string
        }

        // Process additional classes
        ((additionalClasses as unknown as AdditionalClassResult[]) || [])?.forEach((cls) => {
            const subjectName = cls.subject_name || 'Unknown Subject'
             if (!subjectStats.has(subjectName)) {
                subjectStats.set(subjectName, {
                    subject_name: subjectName,
                    class_id: '', // Additional classes might not link to 'classes' table directly in this context
                    total_classes: 0,
                    completed_classes: 0, // Additional classes are usually considered completed/extra
                    pending_classes: 0,
                    additional_classes: 0
                })
            }
            const stats = subjectStats.get(subjectName)!
            stats.additional_classes++
        })

        reports.push({
            peer_tutor_id: tutor.id,
            peer_tutor_name: tutor.name,
            peer_tutor_email: tutor.email,
            dept: tutor.dept,
            year: tutor.year,
            section: tutor.section,
            subjects: Array.from(subjectStats.values())
        })
      }

      return reports

    } catch (error) {
      logger.error('Error in getAllpeertutorsReports:', error)
      return []
    }
  }

  /**
   * Get comprehensive report for a single peer tutor
   */
  static async getpeertutorsReportData(peerTutorId: string): Promise<peertutorsReportData | null> {
    try {
      const supabase = createClient()
      
      const { data: tutor, error: tutorError } = await supabase
        .from('peer_tutors')
        .select('*')
        .eq('id', peerTutorId)
        .single()

      if (tutorError || !tutor) {
        logger.error('Error getting peer tutor:', tutorError)
        return null
      }

      // Get additional classes
      const { data: additionalClasses, error: additionalError } = await supabase
        .from('additional_classes')
        .select('id, subject_name')
        .eq('peer_tutor_id', tutor.id)

      if (additionalError) {
        logger.error(`Error getting additional classes for tutor ${tutor.id}:`, additionalError)
        return null
      }

      // Get scheduled classes with subject info
      const { data: classesWithSubject, error: classesSubjectError } = await supabase
        .from('scheduled_classes')
        .select(`
          id, 
          completion_status, 
          attendance_completed, 
          topics_completed,
          class:classes(id, subject_name)
        `)
        .eq('peer_tutor_id', tutor.id)

      if (classesSubjectError) {
            logger.error(`Error getting classes with subject for tutor ${tutor.id}:`, classesSubjectError)
            return null
      }
      
      const subjectStats = new Map<string, {
          subject_name: string
          class_id: string
          total_classes: number
          completed_classes: number
          pending_classes: number
          additional_classes: number
      }>()

      interface ScheduledClassWithSubject {
        id: string
        completion_status: string
        attendance_completed: boolean
        topics_completed: boolean
        class: {
          id: string
          subject_name: string
        } | null
      }

      // Process scheduled classes
      ((classesWithSubject as unknown as ScheduledClassWithSubject[]) || [])?.forEach((cls) => {
          const subjectName = cls.class?.subject_name || 'Unknown Subject'
          const classId = cls.class?.id || ''
          
          if (!subjectStats.has(subjectName)) {
              subjectStats.set(subjectName, {
                  subject_name: subjectName,
                  class_id: classId,
                  total_classes: 0,
                  completed_classes: 0,
                  pending_classes: 0,
                  additional_classes: 0
              })
          }
          
          const stats = subjectStats.get(subjectName)!
          if (classId && !stats.class_id) {
              stats.class_id = classId
          }
          
          stats.total_classes++
          
          const isCompleted = cls.completion_status === 'completed' || 
                            (cls.attendance_completed && cls.topics_completed)
          
          if (isCompleted) {
              stats.completed_classes++
          } else {
              stats.pending_classes++
          }
      })

      interface AdditionalClassResult {
        id: string
        subject_name: string
      }

      // Process additional classes
      ((additionalClasses as unknown as AdditionalClassResult[]) || [])?.forEach((cls) => {
          const subjectName = cls.subject_name || 'Unknown Subject'
            if (!subjectStats.has(subjectName)) {
              subjectStats.set(subjectName, {
                  subject_name: subjectName,
                  class_id: '',
                  total_classes: 0,
                  completed_classes: 0,
                  pending_classes: 0,
                  additional_classes: 0
              })
          }
          const stats = subjectStats.get(subjectName)!
          stats.additional_classes++
      })

      return {
          peer_tutor_id: tutor.id,
          peer_tutor_name: tutor.name,
          peer_tutor_email: tutor.email,
          dept: tutor.dept,
          year: tutor.year,
          section: tutor.section,
          subjects: Array.from(subjectStats.values())
      }

    } catch (error) {
      logger.error('Error in getpeertutorsReportData:', error)
      return null
    }
  }

  /**
   * Get full class attendance matrix report
   */
  static async getSubjectFullClassReport(peerTutorId: string, subjectName: string): Promise<FullClassReport | null> {
    try {
      const supabase = createClient()
      
      // Get all scheduled classes for this subject
      const { data: classes, error: classesError } = await supabase
        .from('scheduled_classes')
        .select('*, class:classes!inner(subject_name)')
        .eq('peer_tutor_id', peerTutorId)
        .eq('class.subject_name', subjectName)
        .order('scheduled_date', { ascending: true })

      if (classesError) {
        logger.error('Error getting classes:', classesError)
        return null
      }

      if (!classes || classes.length === 0) {
        return { subject_name: subjectName, columns: [], rows: [] }
      }

      // Get all students for this peer tutor
      const { data: students, error: studentsError } = await supabase
        .from('peer_students')
        .select('*')
        .eq('assigned_peer_tutor_id', peerTutorId)
        .order('name')

      if (studentsError) {
        logger.error('Error getting students:', studentsError)
        return null
      }

      // Get all attendance records for these classes
      const classIds = classes.map(c => c.id)
      const { data: attendance, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .in('scheduled_class_id', classIds)

      if (attendanceError) {
        logger.error('Error getting attendance:', attendanceError)
        return null
      }

      // Build Columns
      const columns = classes.map(cls => ({
        id: cls.id,
        date: cls.scheduled_date,
        time: new Date(cls.scheduled_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        is_additional: false // logic for additional classes needs to be clarified, likely checking strict match with 'additional_classes' table or flag
      }))

      // Build Rows — include both currently assigned students AND removed students with attendance history
      const rows = (students || []).map(student => {
        const studentAttendance: Record<string, 'present' | 'absent' | 'on_duty' | 'upcoming' | 'unknown'> = {}
        let presentCount = 0
        let totalScorable = 0

        columns.forEach(col => {
          // Find attendance record
          const record = attendance?.find(a => a.scheduled_class_id === col.id && a.student_id === student.id)
          
          let status: 'present' | 'absent' | 'on_duty' | 'upcoming' | 'unknown' = 'unknown'
          
          if (record) {
             const s = (record.status || '').toLowerCase()
             if (s === 'present' || s === 'p') status = 'present'
             else if (s === 'absent' || s === 'a') status = 'absent'
             else if (s === 'on_duty' || s === 'od') status = 'on_duty'
          } else {
             // Check if class is future
             if (new Date(col.date) > new Date()) {
                 status = 'upcoming'
             } else {
                 const cls = classes.find(c => c.id === col.id)
                 if (cls && !cls.attendance_completed) {
                     status = 'upcoming'
                 }
             }
          }

          studentAttendance[col.id] = status

          if (status === 'present' || status === 'on_duty') {
              presentCount++
          }
          if (status === 'present' || status === 'absent' || status === 'on_duty') {
              totalScorable++
          }
        })

        return {
          student_id: student.id,
          student_name: student.name,
          attendance: studentAttendance,
          stats: {
            present: presentCount,
            percentage: totalScorable > 0 ? Math.round((presentCount / totalScorable) * 100) : 0
          }
        }
      })

      // Also include unassigned students (still exist in DB but no longer assigned to this tutor)
      // AND removed students (student_id is NULL but student_name is preserved)
      const existingStudentIds = new Set((students || []).map(s => s.id))
      
      // Find student_ids in attendance that are NOT in the currently assigned list
      const unassignedStudentIds = new Set<string>()
      for (const a of (attendance || [])) {
        if (a.student_id && !existingStudentIds.has(a.student_id)) {
          unassignedStudentIds.add(a.student_id)
        }
      }

      // Fetch info for unassigned students
      if (unassignedStudentIds.size > 0) {
        const { data: unassignedStudents } = await supabase
          .from('peer_students')
          .select('id, name')
          .in('id', Array.from(unassignedStudentIds))

        for (const student of (unassignedStudents || [])) {
          const studentAttendance: Record<string, 'present' | 'absent' | 'on_duty' | 'upcoming' | 'unknown'> = {}
          let presentCount = 0
          let totalScorable = 0

          columns.forEach(col => {
            const record = attendance?.find(a => a.scheduled_class_id === col.id && a.student_id === student.id)
            let status: 'present' | 'absent' | 'on_duty' | 'upcoming' | 'unknown' = 'unknown'
            if (record) {
              const s = (record.status || '').toLowerCase()
              if (s === 'present' || s === 'p') status = 'present'
              else if (s === 'absent' || s === 'a') status = 'absent'
              else if (s === 'on_duty' || s === 'od') status = 'on_duty'
            }
            studentAttendance[col.id] = status
            if (status === 'present' || status === 'on_duty') presentCount++
            if (status === 'present' || status === 'absent' || status === 'on_duty') totalScorable++
          })

          rows.push({
            student_id: student.id,
            student_name: `${student.name} (Unassigned)`,
            attendance: studentAttendance,
            stats: {
              present: presentCount,
              percentage: totalScorable > 0 ? Math.round((presentCount / totalScorable) * 100) : 0
            }
          })
        }
      }

      // Handle removed students (student_id is NULL but student_name is preserved in attendance)
      const removedStudentRecords = (attendance || []).filter(
        a => a.student_id === null && a.student_name
      )
      const removedStudentNames = new Set(removedStudentRecords.map(r => r.student_name as string))
      for (const removedName of removedStudentNames) {
        const studentAttendance: Record<string, 'present' | 'absent' | 'on_duty' | 'upcoming' | 'unknown'> = {}
        let presentCount = 0
        let totalScorable = 0

        columns.forEach(col => {
          const record = removedStudentRecords.find(
            a => a.scheduled_class_id === col.id && a.student_name === removedName
          )
          let status: 'present' | 'absent' | 'on_duty' | 'upcoming' | 'unknown' = 'unknown'
          if (record) {
            const s = (record.status || '').toLowerCase()
            if (s === 'present' || s === 'p') status = 'present'
            else if (s === 'absent' || s === 'a') status = 'absent'
            else if (s === 'on_duty' || s === 'od') status = 'on_duty'
          }
          studentAttendance[col.id] = status
          if (status === 'present' || status === 'on_duty') presentCount++
          if (status === 'present' || status === 'absent' || status === 'on_duty') totalScorable++
        })

        rows.push({
          student_id: '',
          student_name: `${removedName} (Removed)`,
          attendance: studentAttendance,
          stats: {
            present: presentCount,
            percentage: totalScorable > 0 ? Math.round((presentCount / totalScorable) * 100) : 0
          }
        })
      }

      return {
        subject_name: subjectName,
        columns,
        rows
      }

    } catch (error) {
      logger.error('Error in getSubjectFullClassReport:', error)
      return null
    }
  }

  /**
   * Get attendance sheet data for all subjects of a peer tutor.
   * Returns an array of FullClassReport, one per subject.
   */
  static async getAttendanceSheetData(peerTutorId: string): Promise<FullClassReport[]> {
    try {
      const supabase = createClient()

      // Get all distinct subjects for this peer tutor via their scheduled classes
      const { data: classes, error: classesError } = await supabase
        .from('scheduled_classes')
        .select('class:classes!inner(subject_name)')
        .eq('peer_tutor_id', peerTutorId)

      if (classesError || !classes) {
        logger.error('Error getting classes for attendance sheet:', classesError)
        return []
      }

      // Extract unique subject names from scheduled classes
      interface ClassJoin { class: { subject_name: string } | null }
      const subjectNamesSet = new Set(
        (classes as unknown as ClassJoin[])
          .map(c => c.class?.subject_name)
          .filter((name): name is string => !!name)
      )

      // Also get additional classes for this peer tutor to find more subjects
      const { data: additionalClasses, error: acError } = await supabase
        .from('additional_classes')
        .select('id, subject_name, class_date, start_time, end_time')
        .eq('peer_tutor_id', peerTutorId)
        .order('class_date', { ascending: true })

      if (!acError && additionalClasses) {
        for (const ac of additionalClasses) {
          if (ac.subject_name) subjectNamesSet.add(ac.subject_name)
        }
      }

      const subjectNames = [...subjectNamesSet]

      // Build a FullClassReport for each subject
      const reports: FullClassReport[] = []
      for (const subjectName of subjectNames) {
        const report = await this.getSubjectFullClassReport(peerTutorId, subjectName)
        if (!report) continue

        // Now merge additional classes for this subject
        const subjectAdditionalClasses = (additionalClasses || []).filter(
          ac => ac.subject_name === subjectName
        )

        if (subjectAdditionalClasses.length > 0) {
          // Get attendance records for these additional classes
          const acIds = subjectAdditionalClasses.map(ac => ac.id)
          const { data: acAttendance, error: acaError } = await supabase
            .from('additional_class_attendance')
            .select('*')
            .in('additional_class_id', acIds)

          if (acaError) {
            logger.error('Error getting additional class attendance:', acaError)
          }

          // Add additional class columns
          for (const ac of subjectAdditionalClasses) {
            const colId = `ac_${ac.id}`
            report.columns.push({
              id: colId,
              date: ac.class_date,
              time: ac.start_time && ac.end_time
                ? `${ac.start_time} - ${ac.end_time}`
                : ac.start_time || '',
              is_additional: true
            })

            // Add attendance status for each student row
            for (const row of report.rows) {
              const record = (acAttendance || []).find(
                a => a.additional_class_id === ac.id && a.student_id === row.student_id
              )

              let status: 'present' | 'absent' | 'on_duty' | 'upcoming' | 'unknown' = 'unknown'
              if (record) {
                const s = (record.status || '').toLowerCase()
                if (s === 'present' || s === 'p') status = 'present'
                else if (s === 'absent' || s === 'a') status = 'absent'
                else if (s === 'on_duty' || s === 'od') status = 'on_duty'
              }

              row.attendance[colId] = status

              // Update stats
              if (status === 'present' || status === 'on_duty') {
                row.stats.present++
              }
            }
          }

          // Sort all columns by date
          report.columns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

          // Recalculate percentages after adding additional class data
          for (const row of report.rows) {
            let totalScorable = 0
            for (const col of report.columns) {
              const s = row.attendance[col.id]
              if (s === 'present' || s === 'absent' || s === 'on_duty') {
                totalScorable++
              }
            }
            row.stats.percentage = totalScorable > 0
              ? Math.round((row.stats.present / totalScorable) * 100)
              : 0
          }
        }

        reports.push(report)
      }

      return reports
    } catch (error) {
      logger.error('Error in getAttendanceSheetData:', error)
      return []
    }
  }

  /**
   * Get topic sheet data for all subjects of a peer tutor.
   * Returns an array of TopicSheetData, one per subject.
   */
  static async getTopicSheetData(peerTutorId: string): Promise<TopicSheetData[]> {
    try {
      const supabase = createClient()

      // Get all scheduled classes with subject info, topics, and times
      const { data: scheduledClasses, error: scError } = await supabase
        .from('scheduled_classes')
        .select(`
          id,
          scheduled_date,
          start_time,
          end_time,
          topics,
          topics_completed,
          completion_status,
          class:classes!inner(subject_name)
        `)
        .eq('peer_tutor_id', peerTutorId)
        .order('scheduled_date', { ascending: true })

      if (scError) {
        logger.error('Error getting scheduled classes for topic sheet:', scError)
        return []
      }

      // Get additional classes
      const { data: additionalClasses, error: acError } = await supabase
        .from('additional_classes')
        .select('id, subject_name, class_date, start_time, end_time, topic')
        .eq('peer_tutor_id', peerTutorId)
        .order('class_date', { ascending: true })

      if (acError) {
        logger.error('Error getting additional classes for topic sheet:', acError)
        // continue without additional classes
      }

      // Group by subject
      interface ScWithSubject {
        id: string
        scheduled_date: string
        start_time: string | null
        end_time: string | null
        topics: string | null
        topics_completed: boolean
        completion_status: string
        class: { subject_name: string } | null
      }

      const subjectMap = new Map<string, TopicSheetClass[]>()

      // Process scheduled classes
      for (const cls of (scheduledClasses as unknown as ScWithSubject[]) || []) {
        const subjectName = cls.class?.subject_name || 'Unknown Subject'
        if (!subjectMap.has(subjectName)) {
          subjectMap.set(subjectName, [])
        }

        const hour = cls.start_time && cls.end_time
          ? `${cls.start_time} - ${cls.end_time}`
          : cls.start_time || ''

        subjectMap.get(subjectName)!.push({
          id: cls.id,
          date: cls.scheduled_date,
          hour,
          topic: cls.topics || '',
          is_additional: false
        })
      }

      // Process additional classes
      interface AdditionalClassData {
        id: string
        subject_name: string
        class_date: string
        start_time: string | null
        end_time: string | null
        topic: string | null
      }
      
      for (const cls of (additionalClasses as unknown as AdditionalClassData[]) || []) {
        const subjectName = cls.subject_name || 'Unknown Subject'
        if (!subjectMap.has(subjectName)) {
          subjectMap.set(subjectName, [])
        }

        const hour = cls.start_time && cls.end_time
          ? `${cls.start_time} - ${cls.end_time}`
          : cls.start_time || ''

        subjectMap.get(subjectName)!.push({
          id: cls.id,
          date: cls.class_date,
          hour,
          topic: cls.topic || '',
          is_additional: true
        })
      }

      // Build result, sorting classes by date within each subject
      const result: TopicSheetData[] = []
      for (const [subjectName, classes] of subjectMap.entries()) {
        classes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        result.push({ subject_name: subjectName, classes })
      }

      return result
    } catch (error) {
      logger.error('Error in getTopicSheetData:', error)
      return []
    }
  }
}

export interface ClassAttendanceReport {
  subject_name: string
  scheduled_date: string
  present_count: number
  absent_count: number
  topics?: string
  link?: string
  start_time?: string
  end_time?: string
  attendance_records: {
    student_id: string
    student_name: string
    student_email: string
    status: 'present' | 'absent'
  }[]
}

export interface FullClassReport {
  subject_name: string
  columns: {
    id: string
    date: string
    time: string
    is_additional: boolean
  }[]
  rows: {
    student_id: string
    student_name: string
    attendance: Record<string, 'present' | 'absent' | 'on_duty' | 'upcoming' | 'unknown'>
    stats: {
      present: number
      percentage: number
    }
  }[]
}



export interface peertutorsReportData {
  peer_tutor_id: string
  peer_tutor_name: string
  peer_tutor_email: string
  dept: string
  year: string
  section: string
  subjects: {
    subject_name: string
    class_id: string
    total_classes: number
    completed_classes: number
    pending_classes: number
    additional_classes?: number
  }[]
}

export interface TopicSheetClass {
  id: string
  date: string
  hour: string
  topic: string
  is_additional: boolean
}

export interface TopicSheetData {
  subject_name: string
  classes: TopicSheetClass[]
}
