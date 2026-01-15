import { useQuery } from '@tanstack/react-query'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { RenumerationService } from '@/lib/services/renumerationService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { AdditionalClassService, AdditionalClassWithAttendance } from '@/lib/services/additionalClassService'
import { AttendanceService } from '@/lib/services/attendanceService'
import { FeedbackService } from '@/lib/services/feedbackService'
import { Student } from '@/lib/services/studentService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { ExamService } from '@/lib/services/examService'
import { ExamMarksService } from '@/lib/services/examMarksService'
import { calculatepeertutorsAscendScore } from '@/lib/utils/ascendScore'
import { logger } from '@/lib/logger'

// 1. Peer Tutor Info Hook
export function usePeerTutorInfo(email: string | null | undefined) {
  return useQuery({
    queryKey: ['peertutors', email],
    queryFn: async () => {
      if (!email) return null
      return await peertutorsAuthService.getpeertutorsByEmail(email)
    },
    enabled: !!email,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}

// 2. Assigned Students Hook
export function useAssignedStudents(peertutorsId: string | undefined) {
  return useQuery({
    queryKey: ['assignedStudents', peertutorsId],
    queryFn: async () => {
      if (!peertutorsId) return []
      return await AssignmentService.getStudentsBypeertutors(peertutorsId)
    },
    enabled: !!peertutorsId,
    staleTime: 5 * 60 * 1000,
  })
}

// 3. Renumerations Hook
export function useRenumerations(peertutorsId: string | undefined) {
  return useQuery({
    queryKey: ['renumerations', peertutorsId],
    queryFn: async () => {
      if (!peertutorsId) return []
      return await RenumerationService.getpeertutorsRenumeration(peertutorsId)
    },
    enabled: !!peertutorsId,
    staleTime: 5 * 60 * 1000,
  })
}

// 4. Class Stats Hook
export function useClassStats(peertutorsId: string | undefined) {
  return useQuery({
    queryKey: ['classStats', peertutorsId],
    queryFn: async () => {
      if (!peertutorsId) return { completedClasses: 0, totalClasses: 0 }
      return await ScheduledClassService.getpeertutorsClassStats(peertutorsId)
    },
    enabled: !!peertutorsId,
    initialData: { completedClasses: 0, totalClasses: 0 },
    staleTime: 5 * 60 * 1000,
  })
}

// 5. Student Attendance Stats Hook (Complex)
export function useStudentAttendanceStats(students: Student[] | undefined, peertutorsId: string | undefined) {
  return useQuery({
    queryKey: ['studentAttendance', peertutorsId, students?.length],
    queryFn: async () => {
      if (!students || !peertutorsId) return []
      
      const studentsWithStats = await Promise.all(
        students.map(async (student) => {
          try {
            const attendanceRecords = await AttendanceService.getStudentAttendanceHistory(student.id, peertutorsId)
            
            const presentCount = attendanceRecords.filter(record => record.status === 'present').length
            const absentCount = attendanceRecords.filter(record => record.status === 'absent').length
            const totalClasses = presentCount + absentCount
            const attendancePercentage = totalClasses > 0 
              ? Math.round((presentCount / totalClasses) * 100) 
              : 0

            return {
              id: student.id,
              name: student.name,
              email: student.email,
              dept: student.dept,
              year: student.year,
              section: student.section,
              classesPresent: presentCount,
              classesAbsent: absentCount,
              attendancePercentage
            }
          } catch (error) {
            logger.error(`Error loading attendance for student ${student.id}:`, error)
            return {
              id: student.id,
              name: student.name,
              email: student.email,
              dept: student.dept,
              year: student.year,
              section: student.section,
              classesPresent: 0,
              classesAbsent: 0,
              attendancePercentage: 0
            }
          }
        })
      )
      return studentsWithStats
    },
    enabled: !!peertutorsId && !!students && students.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

// 6. Feedback Forms Hook
export function useActiveFeedbackForms(peertutorsId: string | undefined) {
    return useQuery({
        queryKey: ['activeFeedbackForms', peertutorsId],
        queryFn: async () => {
            if (!peertutorsId) return []
            const feedbackForms = await FeedbackService.getActiveFeedbackForms()
            const formsWithStatus = await Promise.all(feedbackForms.map(async (form) => {
                const hasSubmitted = await FeedbackService.hasStudentSubmittedFeedback(form.id, peertutorsId)
                return { ...form, hasSubmitted }
            }))
            return formsWithStatus.filter(f => !f.hasSubmitted)
        },
        enabled: !!peertutorsId,
        staleTime: 5 * 60 * 1000
    })
}

// 7. Pending Class Alert Hook (Logic Extracted)
export function usePendingClassAlert(peertutorsInfo: { id?: string, dept?: string, year?: string, section?: string } | null | undefined) {
    return useQuery({
        queryKey: ['pendingClassAlert', peertutorsInfo?.id, peertutorsInfo?.dept, peertutorsInfo?.year, peertutorsInfo?.section],
        queryFn: async () => {
             if (!peertutorsInfo?.id || !peertutorsInfo?.dept || !peertutorsInfo?.year || !peertutorsInfo?.section) {
                 return { showPendingAlert: false, consecutivePendingCount: 0 }
             }

             // Fetch scheduled classes
             const scheduledPromise = ScheduledClassService.getScheduledClassesByDate(
                peertutorsInfo.dept,
                peertutorsInfo.year,
                peertutorsInfo.section,
                peertutorsInfo.id
             )
             
             // Fetch additional classes (these count as completed classes)
             const additionalPromise = AdditionalClassService.getAdditionalClassesBypeertutors(peertutorsInfo.id)

             const [scheduledClasses, additionalClasses] = await Promise.all([scheduledPromise, additionalPromise])

             if ((!scheduledClasses || scheduledClasses.length === 0) && (!additionalClasses || additionalClasses.length === 0)) {
                 return { showPendingAlert: false, consecutivePendingCount: 0 }
             }

             const today = new Date()
             today.setHours(0, 0, 0, 0)
             
             // Normalize and merge timelines
             interface TimelineItem {
                 date: Date
                 status: 'completed' | 'pending' | 'not_started'
                 type: 'scheduled' | 'additional'
             }

             const timeline: TimelineItem[] = []

             // Process scheduled classes
             scheduledClasses.forEach((c: ScheduledClassWithDetails) => {
                 const d = new Date(c.scheduled_date)
                 // Only consider past classes for "pending" status, or completed classes from anytime
                 // Actually, if a scheduled class is today and completed, it should count as streak breaker.
                 // If it is today and pending, we usually ignore it for "alert" purposes until tomorrow (grace period).
                 
                 // However, for the timeline sorting, we need everything relevant.
                 if (d < today || c.completion_status === 'completed') {
                      timeline.push({
                          date: d,
                          status: c.completion_status || 'not_started',
                          type: 'scheduled'
                      })
                 }
             })

             // Process additional classes (always completed)
             // We include them if they are past or today
             additionalClasses.forEach((c: AdditionalClassWithAttendance) => {
                 const d = new Date(c.class_date)
                 timeline.push({
                     date: d,
                     status: 'completed',
                     type: 'additional'
                 })
             })

             // Sort by date descending (newest first)
             timeline.sort((a, b) => b.date.getTime() - a.date.getTime())

             let streak = 0
             for (const item of timeline) {
                 // Stop streak if we hit a completed class
                 if (item.status === 'completed') {
                     // Since we sorted descending, the first completed class means 
                     // the "consecutive pending streak" (if any) stops here.
                     // e.g. [Pending, Pending, Pending, Completed, Pending] -> Streak 3.
                     // e.g. [Completed, Pending...] -> Streak 0.
                     break
                 }
                 
                 // If it's a scheduled class that is NOT completed (and we already filtered to strictly past for pending ones)
                 // It counts as a miss.
                 streak++
             }

             // Condition: 3 or more consecutive pending classes
             return {
                 showPendingAlert: streak >= 3,
                 consecutivePendingCount: streak
             }
        },
        enabled: !!peertutorsInfo?.id && !!peertutorsInfo?.dept,
        staleTime: 5 * 60 * 1000,
    })
}

// 8. Leaderboard Hook
export function usePeerLeaderboard(peertutorsInfo: { id?: string, dept?: string, year?: string } | null | undefined) {
  return useQuery({
    queryKey: ['peerLeaderboard', peertutorsInfo?.dept, peertutorsInfo?.year],
    queryFn: async () => {
      if (!peertutorsInfo?.dept || !peertutorsInfo?.year || !peertutorsInfo?.id) return null

      // 1. Get all peer tutors in the same department
      const allTutors = await peertutorservice.getpeerTutorByDepartment(peertutorsInfo.dept)
      
      // 2. Filter by same year
      const sameYearTutors = allTutors.filter(t => t.year === peertutorsInfo.year)

      // 3. Get latest exam (needed for Ascend Score)
      const allExams = await ExamService.getAllExams()
      // Filter exams relevant to this year group and sort by latest
      const examsForYear = allExams
        .filter(e => e.years.includes(peertutorsInfo.year!) || e.years.includes(peertutorsInfo.year! + 'nd Year') || e.years.includes(peertutorsInfo.year! + 'rd Year') || e.years.includes(peertutorsInfo.year! + 'th Year')) // Flexible matching
        .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      
      const latestExam = examsForYear.length > 0 ? examsForYear[0] : null

      // 4. fetch stats/score for each
      const tutorsWithStats = await Promise.all(
        sameYearTutors.map(async (tutor) => {
          try {
            let score = 0
            if (latestExam) {
                 // Fetch marks for Ascend Score
                 const marks = await ExamMarksService.getExamMarksBypeertutorsAndExam(tutor.id, latestExam.id)
                 const students = await AssignmentService.getStudentsBypeertutors(tutor.id)
                 
                 // Construct structure for calculation
                 // allStudentsMarks: Record<string, Record<string, Record<string, number | string>>>
                 // { studentId: { subjectId: { marks: value } } }
                  const allStudentsMarks: Record<string, Record<string, Record<string, number | string>>> = {}

                  students.forEach(student => {
                    allStudentsMarks[student.id] = {}
                    marks.forEach(mark => {
                      if (mark.student_id === student.id && mark.exam_subject_id) {
                         if (!allStudentsMarks[student.id][mark.exam_subject_id]) {
                           allStudentsMarks[student.id][mark.exam_subject_id] = {}
                         }
                         if (mark.marks) {
                           Object.assign(allStudentsMarks[student.id][mark.exam_subject_id], mark.marks)
                         }
                      }
                    })
                  })

                 score = calculatepeertutorsAscendScore(allStudentsMarks, latestExam.max_marks || 100)
            } else {
                 // If no exam, default to 0
                 score = 0
            }

            // Also fetch classes stats for total count if needed (optional)
            const stats = await ScheduledClassService.getpeertutorsClassStats(tutor.id)

            return {
              id: tutor.id,
              name: tutor.name,
              score: score, // Ascend Score
              total: stats.totalClasses
            }
          } catch {
            return { id: tutor.id, name: tutor.name, score: 0, total: 0 }
          }
        })
      )

      // 5. Sort by score (descending)
      tutorsWithStats.sort((a, b) => b.score - a.score)

      // 6. Find current user rank
      const myRankIndex = tutorsWithStats.findIndex(t => t.id === peertutorsInfo.id)
      const myRank = myRankIndex !== -1 ? myRankIndex + 1 : 0
      
      // 7. Return top 3 and my rank info
      return {
        topThree: tutorsWithStats.slice(0, 3),
        myRank,
        myStats: myRankIndex !== -1 ? tutorsWithStats[myRankIndex] : null,
        totalPeers: tutorsWithStats.length
      }
    },
    enabled: !!peertutorsInfo?.dept && !!peertutorsInfo?.year && !!peertutorsInfo?.id,
    staleTime: 10 * 60 * 1000 // 10 minutes
  })
}
