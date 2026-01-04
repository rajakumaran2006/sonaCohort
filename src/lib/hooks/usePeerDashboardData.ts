import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import { AssignmentService } from '@/lib/services/assignmentService'
import { RenumerationService } from '@/lib/services/renumerationService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { AdditionalClassService, AdditionalClassWithAttendance } from '@/lib/services/additionalClassService'
import { AttendanceService } from '@/lib/services/attendanceService'
import { FeedbackService } from '@/lib/services/feedbackService'

// 1. Peer Tutor Info Hook
export function usePeerTutorInfo(email: string | null | undefined) {
  return useQuery({
    queryKey: ['peerTutor', email],
    queryFn: async () => {
      if (!email) return null
      return await PeerTutorAuthService.getPeerTutorByEmail(email)
    },
    enabled: !!email,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}

// 2. Assigned Students Hook
export function useAssignedStudents(peerTutorId: string | undefined) {
  return useQuery({
    queryKey: ['assignedStudents', peerTutorId],
    queryFn: async () => {
      if (!peerTutorId) return []
      return await AssignmentService.getStudentsByPeerTutor(peerTutorId)
    },
    enabled: !!peerTutorId,
    staleTime: 5 * 60 * 1000,
  })
}

// 3. Renumerations Hook
export function useRenumerations(peerTutorId: string | undefined) {
  return useQuery({
    queryKey: ['renumerations', peerTutorId],
    queryFn: async () => {
      if (!peerTutorId) return []
      return await RenumerationService.getPeerTutorRenumeration(peerTutorId)
    },
    enabled: !!peerTutorId,
    staleTime: 5 * 60 * 1000,
  })
}

// 4. Class Stats Hook
export function useClassStats(peerTutorId: string | undefined) {
  return useQuery({
    queryKey: ['classStats', peerTutorId],
    queryFn: async () => {
      if (!peerTutorId) return { completedClasses: 0, totalClasses: 0 }
      return await ScheduledClassService.getPeerTutorClassStats(peerTutorId)
    },
    enabled: !!peerTutorId,
    initialData: { completedClasses: 0, totalClasses: 0 },
    staleTime: 5 * 60 * 1000,
  })
}

// 5. Student Attendance Stats Hook (Complex)
export function useStudentAttendanceStats(students: any[] | undefined, peerTutorId: string | undefined) {
  return useQuery({
    queryKey: ['studentAttendance', peerTutorId, students?.length],
    queryFn: async () => {
      if (!students || !peerTutorId) return []
      
      const studentsWithStats = await Promise.all(
        students.map(async (student) => {
          try {
            const attendanceRecords = await AttendanceService.getStudentAttendanceHistory(student.id, peerTutorId)
            
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
            console.error(`Error loading attendance for student ${student.id}:`, error)
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
    enabled: !!peerTutorId && !!students && students.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

// 6. Feedback Forms Hook
export function useActiveFeedbackForms(peerTutorId: string | undefined) {
    return useQuery({
        queryKey: ['activeFeedbackForms', peerTutorId],
        queryFn: async () => {
            if (!peerTutorId) return []
            const feedbackForms = await FeedbackService.getActiveFeedbackForms()
            const formsWithStatus = await Promise.all(feedbackForms.map(async (form) => {
                const hasSubmitted = await FeedbackService.hasStudentSubmittedFeedback(form.id, peerTutorId)
                return { ...form, hasSubmitted }
            }))
            return formsWithStatus.filter(f => !f.hasSubmitted)
        },
        enabled: !!peerTutorId,
        staleTime: 5 * 60 * 1000
    })
}

// 7. Pending Class Alert Hook (Logic Extracted)
export function usePendingClassAlert(peerTutorInfo: { id?: string, dept?: string, year?: string, section?: string } | null | undefined) {
    return useQuery({
        queryKey: ['pendingClassAlert', peerTutorInfo?.id, peerTutorInfo?.dept, peerTutorInfo?.year, peerTutorInfo?.section],
        queryFn: async () => {
             if (!peerTutorInfo?.id || !peerTutorInfo?.dept || !peerTutorInfo?.year || !peerTutorInfo?.section) {
                 return { showPendingAlert: false, consecutivePendingCount: 0 }
             }

             // Fetch scheduled classes
             const scheduledPromise = ScheduledClassService.getScheduledClassesByDate(
                peerTutorInfo.dept,
                peerTutorInfo.year,
                peerTutorInfo.section
             )
             
             // Fetch additional classes (these count as completed classes)
             const additionalPromise = AdditionalClassService.getAdditionalClassesByPeerTutor(peerTutorInfo.id)

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
        enabled: !!peerTutorInfo?.id && !!peerTutorInfo?.dept,
        staleTime: 5 * 60 * 1000,
    })
}
