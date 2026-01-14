import * as XLSX from 'xlsx'
import { ScheduledClassService } from './scheduledClassService'
import { AttendanceService } from './attendanceService'
import { peertutorservice } from './peerTutorService'
import { StudentService } from './studentService'
import { ExamService } from './examService'
import { ExamMarksService } from './examMarksService'


export interface ExportFile {
  filename: string
  buffer: Buffer
  mimeType: string
}

export class ExportGenerationService {
  /**
   * Generate all requested exports and return as file buffers
   */
  static async generateExports(
    exportIds: string[],
    facultyEmail: string,
    department: string
  ): Promise<ExportFile[]> {
    const files: ExportFile[] = []

    for (const exportId of exportIds) {
      try {
        const file = await this.generateSingleExport(exportId, facultyEmail, department)
        if (file) {
          files.push(file)
        }
      } catch (error) {
        console.error(`Error generating export ${exportId}:`, error)
        // Continue with other exports even if one fails
      }
    }

    return files
  }

  /**
   * Generate a single export based on export ID
   */
  private static async generateSingleExport(
    exportId: string,
    facultyEmail: string,
    department: string
  ): Promise<ExportFile | null> {
    switch (exportId) {
      case 'attendance-report':
        return this.generateAttendanceReport(department)
      
      case 'peer-tutors-list':
        return this.generatepeerTutorList(department)
      
      case 'classes-export':
        return this.generateClassesSchedule(department)
      
      case 'all-exams':
      case 'exam-details': // For now, treat individual exam details same as all exams for bulk export
        return this.generateAllExamsData(department)

      case 'peer-tutor-marks':
        return this.generatepeertutorsMarks(department)
        
      case 'peer-tutor-reports':
        return this.generatepeertutorsReports(department)
        
      default:
        console.warn(`Unknown export ID: ${exportId}`)
        return null
    }
  }

  /**
   * Generate all exams data
   */
  private static async generateAllExamsData(department: string): Promise<ExportFile> {
    const workbook = XLSX.utils.book_new()
    
    // Get all exams
    const exams = await ExamService.getAllExams()
    
    // Prepare data
    const data: (string | number | boolean | Date | null | undefined)[][] = []
    data.push(['Exams Data Export'])
    data.push([`Department: ${department}`])
    data.push([`Generated: ${new Date().toLocaleString()}`])
    data.push([])
    data.push(['Exam Name', 'Created By', 'Max Marks', 'Created At'])

    for (const exam of exams) {
      data.push([
        exam.name,
        exam.created_by || 'N/A',
        exam.max_marks || 100,
        new Date(exam.created_at).toLocaleDateString()
      ])
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'All Exams')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    return {
      filename: `Exams_Data_${department}_${new Date().toISOString().split('T')[0]}.xlsx`,
      buffer: Buffer.from(buffer),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  }

  /**
   * Generate peer tutor marks
   */
  private static async generatepeertutorsMarks(department: string): Promise<ExportFile> {
    const workbook = XLSX.utils.book_new()
    
    // Get all peer tutors in department
    const peerTutor = await peertutorservice.getpeerTutorByDepartment(department)
    const exams = await ExamService.getAllExams()
    
    // Prepare data
    const data: (string | number | boolean | Date | null | undefined)[][] = []
    data.push(['Peer Tutor Marks Export'])
    data.push([`Department: ${department}`])
    data.push([`Generated: ${new Date().toLocaleString()}`])
    data.push([])
    data.push(['Peer Tutor', 'Exam', 'Student ID', 'Marks', 'Date Entered'])

    // This is a simplified export. In a real scenario, we might want to query exam_marks table directly
    // but we don't have a direct service method for "all marks by department".
    // For now, iterate through peer tutors and exams (could be slow for large datasets, but acceptable for MVP)
    
    for (const tutor of peerTutor) {
        // Optimization: In a real app, fetch all marks for department in one query.
        // For now, we'll just list the tutors. 
        // A proper implementation requires dedicated service methods to fetch marks by department.
        // Let's create a placeholder sheet explaining this limitation if we can't fetch easily,
        // OR try to fetch for each tutor/exam combo.
        
        // Let's try to fetch marks for each exam for this tutor
        for (const exam of exams) {
            const marks = await ExamMarksService.getExamMarksBypeertutorsAndExam(tutor.id, exam.id)
            if (marks && marks.length > 0) {
                for (const mark of marks) {
                    data.push([
                        tutor.name,
                        exam.name,
                        mark.student_id,
                        JSON.stringify(mark.marks),
                        new Date(mark.created_at).toLocaleDateString()
                    ])
                }
            }
        }
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Marks')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    return {
      filename: `Peer_Tutor_Marks_${department}_${new Date().toISOString().split('T')[0]}.xlsx`,
      buffer: Buffer.from(buffer),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  }

  /**
   * Generate peer tutor reports
   */
  private static async generatepeertutorsReports(department: string): Promise<ExportFile> {
    const workbook = XLSX.utils.book_new()
    
    // Get peer tutors
    const peerTutor = await peertutorservice.getpeerTutorByDepartment(department)
    
    // Prepare data
    const data: (string | number | boolean | Date | null | undefined)[][] = []
    data.push(['Peer Tutor Reports'])
    data.push([`Department: ${department}`])
    data.push([])
    data.push(['Name', 'Email', 'Year', 'Section', 'Assigned Students'])

    for (const tutor of peerTutor) {
        const students = await StudentService.getStudentsBypeertutors(tutor.id)
        data.push([
            tutor.name,
            tutor.email,
            tutor.year,
            tutor.section,
            students.length
        ])
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reports')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    return {
      filename: `Peer_Tutor_Reports_${department}_${new Date().toISOString().split('T')[0]}.xlsx`,
      buffer: Buffer.from(buffer),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  }

  /**
   * Generate attendance report
   */
  private static async generateAttendanceReport(department: string): Promise<ExportFile> {
    const workbook = XLSX.utils.book_new()
    
    // Get all classes for department
    const classStatus = await ScheduledClassService.getAllClassesForDepartment(department)
    const allClasses = [...classStatus.completed, ...classStatus.pending]

    // Prepare data
    const data: (string | number | boolean | Date | null | undefined)[][] = []
    data.push(['Attendance Report'])
    data.push([`Department: ${department}`])
    data.push([`Generated: ${new Date().toLocaleString()}`])
    data.push([])
    data.push(['Peer Tutor', 'Year', 'Section', 'Subject', 'Date', 'Status', 'Students Present', 'Students Absent'])

    for (const cls of allClasses) {
      const attendance = await AttendanceService.getAttendanceByScheduledClass(cls.id)
      const present = attendance.filter(a => a.status === 'present').length
      const absent = attendance.filter(a => a.status === 'absent').length

      data.push([
        cls.peer_tutor?.name || 'N/A',
        cls.year || 'N/A',
        cls.section || 'N/A',
        cls.class?.subject_name || 'N/A',
        new Date(cls.scheduled_date).toLocaleDateString(),
        cls.completion_status || 'pending',
        present,
        absent
      ])
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    return {
      filename: `Attendance_Report_${department}_${new Date().toISOString().split('T')[0]}.xlsx`,
      buffer: Buffer.from(buffer),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  }

  /**
   * Generate peer tutors list
   */
  private static async generatepeerTutorList(department: string): Promise<ExportFile> {
    const workbook = XLSX.utils.book_new()
    
    // Get all peer tutors
    const peerTutor = await peertutorservice.getpeerTutorByDepartment(department)

    // Prepare data
    const data: (string | number | boolean | Date | null | undefined)[][] = []
    data.push(['Peer Tutors List'])
    data.push([`Department: ${department}`])
    data.push([`Generated: ${new Date().toLocaleString()}`])
    data.push([])
    data.push(['Name', 'Email', 'Year', 'Section', 'Total Students', 'Status'])

    for (const tutor of peerTutor) {
      const students = await StudentService.getStudentsBypeertutors(tutor.id)
      
      data.push([
        tutor.name,
        tutor.email,
        tutor.year || 'N/A',
        tutor.section || 'N/A',
        students.length,
        'Active'
      ])
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Peer Tutors')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    return {
      filename: `Peer_Tutors_${department}_${new Date().toISOString().split('T')[0]}.xlsx`,
      buffer: Buffer.from(buffer),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  }

  /**
   * Generate classes schedule
   */
  private static async generateClassesSchedule(department: string): Promise<ExportFile> {
    const workbook = XLSX.utils.book_new()
    
    // Get all classes
    const classStatus = await ScheduledClassService.getAllClassesForDepartment(department)
    const allClasses = [...classStatus.completed, ...classStatus.pending]

    // Prepare data
    const data: (string | number | boolean | Date | null | undefined)[][] = []
    data.push(['Classes Schedule'])
    data.push([`Department: ${department}`])
    data.push([`Generated: ${new Date().toLocaleString()}`])
    data.push([])
    data.push(['Peer Tutor', 'Year', 'Section', 'Subject', 'Date', 'Time', 'Status'])

    for (const cls of allClasses) {
      data.push([
        cls.peer_tutor?.name || 'N/A',
        cls.year || 'N/A',
        cls.section || 'N/A',
        cls.class?.subject_name || 'N/A',
        new Date(cls.scheduled_date).toLocaleDateString(),
        'N/A',
        cls.completion_status || 'pending'
      ])
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Classes')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    return {
      filename: `Classes_Schedule_${department}_${new Date().toISOString().split('T')[0]}.xlsx`,
      buffer: Buffer.from(buffer),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  }
}
