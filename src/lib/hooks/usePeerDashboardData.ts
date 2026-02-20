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

// 8. Leaderboard Config Hook
export function useLeaderboardConfig(department: string | undefined) {
  return useQuery({
    queryKey: ['leaderboardConfig', department],
    queryFn: async () => {
      if (!department) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('leaderboard_scoring_config')
        .select('*')
        .eq('department', department)
        .single()

      if (error || !data) {
        // Return defaults
        return {
          department,
          scheduled_classes_weight: 100,
          additional_classes_weight: 0,
          exam_weight: 0,
          exam_config: [],
        }
      }
      return {
        ...data,
        exam_config: data.exam_config || [],
      }
    },
    enabled: !!department,
    staleTime: 5 * 60 * 1000,
  })
}

// 9. Leaderboard Hook (RPC Version with configurable scoring)
export function usePeerLeaderboard(peertutorsInfo: { id?: string, dept?: string, year?: string } | null | undefined, selectedYear?: string) {
  // Fetch leaderboard config for the department
  const { data: scoringConfig } = useLeaderboardConfig(peertutorsInfo?.dept)

  return useQuery({
    queryKey: ['peerLeaderboard', peertutorsInfo?.dept, peertutorsInfo?.year, selectedYear, scoringConfig],
    queryFn: async () => {
      if (!peertutorsInfo?.dept || !peertutorsInfo?.year || !peertutorsInfo?.id) return null

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

      const rpcTutors = (rankedTutors as unknown as RPCTutor[] || [])

      // Check if we need custom scoring (non-default config)
      const isDefaultConfig = !scoringConfig || 
        (scoringConfig.scheduled_classes_weight === 100 && 
         scoringConfig.additional_classes_weight === 0 && 
         scoringConfig.exam_weight === 0)

      let formattedTutors

      if (isDefaultConfig) {
        // Use RPC results directly (backward compatible — RPC returns completed class count)
        formattedTutors = rpcTutors.map((tutor) => ({
          id: tutor.id,
          name: tutor.name,
          year: tutor.year,
          totalScore: Number(tutor.score),
          rank: Number(tutor.rank)
        }))
      } else {
        // Custom scoring: fetch stats and calculate using the same formula as faculty page

        // If exam weight > 0, fetch exam summaries for included exams
        const includedExams = (scoringConfig.exam_config || []).filter((e: { included: boolean }) => e.included)
        const examSummariesMap: Record<string, Array<{ exam_id: string; peer_tutor_id: string; ascend_score: number }>> = {}

        if (scoringConfig.exam_weight > 0 && includedExams.length > 0) {
          await Promise.all(
            includedExams.map(async (examCfg: { exam_id: string }) => {
              const { data: summaries } = await supabase
                .from('exam_peer_tutor_summary')
                .select('exam_id, peer_tutor_id, ascend_score')
                .eq('exam_id', examCfg.exam_id)
              examSummariesMap[examCfg.exam_id] = summaries || []
            })
          )
        }

        const tutorsWithScores = await Promise.all(
          rpcTutors.map(async (tutor) => {
            try {
              // Fetch class stats
              const { data: classData } = await supabase
                .from('scheduled_classes')
                .select('id, completion_status')
                .eq('peer_tutor_id', tutor.id)

              const { data: additionalData } = await supabase
                .from('additional_classes')
                .select('id')
                .eq('peer_tutor_id', tutor.id)

              const totalClasses = classData?.length || 0
              const completedClasses = classData?.filter(c => c.completion_status === 'completed').length || 0
              const additionalClassesCount = additionalData?.length || 0

              // Gather exam summaries for this tutor
              const tutorExamSummaries = Object.entries(examSummariesMap).flatMap(
                ([examId, summaries]) => summaries
                  .filter(s => s.peer_tutor_id === tutor.id)
                  .map(s => ({ exam_id: examId, peer_tutor_id: s.peer_tutor_id, ascend_score: s.ascend_score }))
              )

              // Calculate scheduled score (0-100)
              const scheduledScore = totalClasses > 0 ? (completedClasses / totalClasses) * 100 : 0
              // Calculate additional score (0-100, capped)
              const additionalScore = Math.min(additionalClassesCount * 10, 100)
              // Calculate exam score
              let examScore = 0
              if (scoringConfig.exam_weight > 0 && includedExams.length > 0) {
                for (const examCfg of includedExams) {
                  const summary = tutorExamSummaries.find((s: { exam_id: string }) => s.exam_id === examCfg.exam_id)
                  const normalizedScore = summary ? (summary.ascend_score / 10) * 100 : 0
                  examScore += normalizedScore * (examCfg.weight / 100)
                }
              }

              const score =
                (scheduledScore * scoringConfig.scheduled_classes_weight / 100) +
                (additionalScore * scoringConfig.additional_classes_weight / 100) +
                (examScore * scoringConfig.exam_weight / 100)

              return {
                id: tutor.id,
                name: tutor.name,
                year: tutor.year,
                totalScore: Math.round(score * 10) / 10,
                rank: 0
              }
            } catch {
              return {
                id: tutor.id,
                name: tutor.name,
                year: tutor.year,
                totalScore: Number(tutor.score),
                rank: 0
              }
            }
          })
        )

        // Sort by score DESC and assign ranks
        tutorsWithScores.sort((a, b) => b.totalScore - a.totalScore)
        tutorsWithScores.forEach((t, idx) => { t.rank = idx + 1 })

        formattedTutors = tutorsWithScores
      }

      // Find current user's data
      const myData = formattedTutors.find((t) => t.id === peertutorsInfo.id) || null
      
      return {
        allTutors: formattedTutors,
        myRank: myData?.rank || 0,
        myData,
        totalPeers: formattedTutors.length
      }
    },
    enabled: !!peertutorsInfo?.dept && !!peertutorsInfo?.year && !!peertutorsInfo?.id,
    staleTime: 5 * 60 * 1000
  })
}
