import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { RenumerationService } from '@/lib/services/renumerationService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { AdditionalClassService, AdditionalClassWithAttendance } from '@/lib/services/additionalClassService'
import { AttendanceService } from '@/lib/services/attendanceService'
import { FeedbackService } from '@/lib/services/feedbackService'
import { Student } from '@/lib/services/studentService'
// unused imports removed
import { logger } from '@/lib/logger'

// 1. Peer Tutor Info Hook
export function usePeerTutorInfo(email: string | null | undefined) {
  return useQuery({
    queryKey: ['peertutors', email],
    queryFn: async () => {
      if (!email) {
        logger.debug('usePeerTutorInfo: No email provided')
        return null
      }
      logger.debug('usePeerTutorInfo: Fetching peer tutor data for email:', email)
      const result = await peertutorsAuthService.getpeertutorsByEmail(email)
      logger.debug('usePeerTutorInfo: Result:', result ? 'Found' : 'Not found')
      return result
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
      if (!peertutorsId) return { completedClasses: 0, totalClasses: 0, additionalClassesCount: 0 }
      
      const [classStats, additionalClasses] = await Promise.all([
        ScheduledClassService.getpeertutorsClassStats(peertutorsId),
        AdditionalClassService.getAdditionalClassesBypeertutors(peertutorsId)
      ])

      return {
        ...classStats,
        additionalClassesCount: additionalClasses?.length || 0
      }
    },
    enabled: !!peertutorsId,
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
              attendancePercentage,
              is_manual_entry: student.is_manual_entry
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

// 8. Leaderboard Hook (RPC Version)
export function usePeerLeaderboard(peertutorsInfo: { id?: string, dept?: string, year?: string } | null | undefined, selectedYear?: string) {
  return useQuery({
    queryKey: ['peerLeaderboard', peertutorsInfo?.dept, peertutorsInfo?.year, selectedYear],
    queryFn: async () => {
      if (!peertutorsInfo?.dept || !peertutorsInfo?.year || !peertutorsInfo?.id) return null

      // Use selected year or fallback to user's year, unless 'all' is selected
      // If 'all' is selected, we pass null to the RPC to get all years
      const targetYear = selectedYear === 'all' ? null : (selectedYear || peertutorsInfo.year)
      const targetDept = peertutorsInfo.dept

      interface RPCTutor {
        id: string
        name: string
        year: string
        dept: string
        score: number
        rank: number
      }

      const supabase = createClient()

      const { data: rankedTutors, error } = await supabase
        .rpc('get_peer_leaderboard', { 
          target_dept: targetDept, 
          target_year: targetYear 
        })

      if (error) {
        logger.error('Error fetching peer leaderboard:', error.message, error.details, error.hint)
        return null
      }

      // Map RPC result to expected format
      // RPC returns: id, name, year, dept, score, rank
      // Component expects: totalScore (we map score -> totalScore)
      const formattedTutors = (rankedTutors as unknown as RPCTutor[] || []).map((tutor) => ({
        id: tutor.id,
        name: tutor.name,
        year: tutor.year,
        // The RPC returns 'score' (completed classes view), map it to totalScore for compatibility
        totalScore: Number(tutor.score),
        rank: Number(tutor.rank)
      }))

      // Find current user's data from the returned list
      const myData = formattedTutors.find((t) => t.id === peertutorsInfo.id) || null
      
      return {
        allTutors: formattedTutors,
        myRank: myData?.rank || 0,
        myData,
        totalPeers: formattedTutors.length
      }
    },
    enabled: !!peertutorsInfo?.dept && !!peertutorsInfo?.year && !!peertutorsInfo?.id,
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
}
