import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { StudentWithpeertutors } from '@/lib/services/studentService'
import { AttendanceService } from '@/lib/services/attendanceService'
import { ScheduledClassService, ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { logger } from '@/lib/logger'
import { getLeaderboardAction } from '@/app/actions/leaderboard'

// ─── 1. Student Attendance Stats Hook ────────────────────────────────────────
export function useStudentAttendanceData(studentId: string | undefined) {
  return useQuery({
    queryKey: ['studentDashboardAttendance', studentId],
    queryFn: async () => {
      if (!studentId) return { present: 0, absent: 0, total: 0, percentage: 0, records: [] }

      try {
        const records = await AttendanceService.getStudentAttendanceHistory(studentId)

        const presentCount = records.filter(record => record.status === 'present').length
        const absentCount = records.filter(record => record.status === 'absent').length
        const totalClasses = presentCount + absentCount
        const attendancePercentage =
          totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0

        return {
          present: presentCount,
          absent: absentCount,
          total: totalClasses,
          percentage: attendancePercentage,
          records,
        }
      } catch (error) {
        logger.error(`Error loading attendance for student ${studentId}:`, error)
        return { present: 0, absent: 0, total: 0, percentage: 0, records: [] }
      }
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  })
}

// ─── 2. Student Leaderboard Hook ──────────────────────────────────────────────
// The leaderboard action needs a departments.id, but peer_students.faculty_id
// stores a peer_tutors.faculty_id (different value). We resolve the real
// departments.id by matching the student's dept name.
export function useStudentLeaderboard(
  studentInfo: StudentWithpeertutors | null | undefined,
  _selectedYear?: string
) {
  const studentYear = studentInfo?.year?.toString()
  const studentDept = studentInfo?.dept

  return useQuery({
    queryKey: ['studentLeaderboard', studentDept, studentYear],
    queryFn: async () => {
      if (!studentDept || !studentInfo?.id) return null

      try {
        // Resolve the actual departments.id from the dept name
        const supabase = createClient()
        const { data: deptRow, error: deptErr } = await supabase
          .from('departments')
          .select('id')
          .ilike('name', studentDept)
          .limit(1)
          .maybeSingle()

        if (deptErr || !deptRow) {
          logger.error('Could not resolve department ID for leaderboard:', studentDept, deptErr)
          return null
        }

        const rankedTutors = await getLeaderboardAction(deptRow.id)
        if (!rankedTutors || rankedTutors.length === 0) return null

        const formattedTutors = rankedTutors.map(tutor => ({
          id: tutor.id,
          name: tutor.name,
          year: tutor.year,
          section: tutor.section,
          totalScore: tutor.totalPoints,
          rank: 0,
        }))

        // Filter to the student's own year only
        let filteredTutors = studentYear
          ? formattedTutors.filter(t => t.year === studentYear)
          : formattedTutors

        // Assign ranks within filtered list (sorted by score desc already)
        filteredTutors = filteredTutors.map((t, index) => ({
          ...t,
          rank: index + 1,
        }))

        // Find the student's own assigned peer tutor in the list
        const myData =
          filteredTutors.find(s => s.id === studentInfo.assigned_peer_tutor_id) || null

        return {
          allTutors: filteredTutors,
          myRank: myData?.rank || 0,
          myData,
          totalPeers: filteredTutors.length,
        }
      } catch (error) {
        logger.error('Error loading leaderboard for student:', error)
        return null
      }
    },
    enabled: !!studentDept && !!studentInfo?.id,
    staleTime: 5 * 60 * 1000,
  })
}

// ─── 3. Upcoming / Recent Classes Hook ───────────────────────────────────────
// Shows next 3 upcoming classes (today or future). If none, shows the 3 most
// recent past classes so the card is never empty.
export function useStudentUpcomingClasses(
  dept: string | undefined,
  year: string | undefined,
  section: string | undefined
) {
  return useQuery({
    queryKey: ['studentUpcomingClasses', dept, year, section],
    queryFn: async (): Promise<{ classes: ScheduledClassWithDetails[]; isPast: boolean }> => {
      if (!dept || !year || !section) return { classes: [], isPast: false }

      try {
        const todayStr = new Date().toISOString().split('T')[0]

        // Fetch all scheduled classes for this section
        const allClasses = await ScheduledClassService.getScheduledClassesByYearSection(
          dept,
          year,
          section
        )

        // Deduplicate: per unique (class_id, scheduled_date) keep only one row
        const seen = new Set<string>()
        const dedupedClasses = allClasses.filter(c => {
          const key = `${c.class_id}__${c.scheduled_date}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })

        // Try upcoming first
        const upcoming = dedupedClasses
          .filter(c => c.scheduled_date >= todayStr && c.completion_status !== 'completed')
          .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
          .slice(0, 3)

        if (upcoming.length > 0) {
          return { classes: upcoming, isPast: false }
        }

        // Fall back to 3 most recent past classes
        const recent = dedupedClasses
          .filter(c => c.scheduled_date < todayStr)
          .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))
          .slice(0, 3)
          .reverse() // show chronologically

        return { classes: recent, isPast: true }
      } catch (error) {
        logger.error('Error loading upcoming classes:', error)
        return { classes: [], isPast: false }
      }
    },
    enabled: !!dept && !!year && !!section,
    staleTime: 5 * 60 * 1000,
  })
}
