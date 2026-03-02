import { useQuery } from '@tanstack/react-query'
import { StudentWithpeertutors } from '@/lib/services/studentService'
import { AttendanceService } from '@/lib/services/attendanceService'
import { logger } from '@/lib/logger'
import { getLeaderboardAction } from '@/app/actions/leaderboard'

// 1. Student Attendance Stats Hook
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
        const attendancePercentage = totalClasses > 0 
          ? Math.round((presentCount / totalClasses) * 100) 
          : 0

        return {
          present: presentCount,
          absent: absentCount,
          total: totalClasses,
          percentage: attendancePercentage,
          records
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

// 2. Student Leaderboard Hook
export function useStudentLeaderboard(studentInfo: StudentWithpeertutors | null | undefined, selectedYear?: string) {
  return useQuery({
    queryKey: ['studentLeaderboard', studentInfo?.faculty_id, studentInfo?.year, selectedYear],
    queryFn: async () => {
      if (!studentInfo?.faculty_id || !studentInfo?.id) return null

      // Fetch the weighted leaderboard for the department
      const rankedTutors = await getLeaderboardAction(studentInfo.faculty_id)
      
      if (!rankedTutors) {
        return null
      }

      // Format for the UI component (PeerLeaderboard)
      // PeerLeaderboard expects totalScore and id/name/rank
      const formattedTutors = rankedTutors.map((tutor) => ({
        id: tutor.id,
        name: tutor.name,
        year: tutor.year,
        totalScore: tutor.totalPoints,
        rank: 0 
      }))

      // Filtering by year if requested
      let filteredTutors = formattedTutors
      if (selectedYear && selectedYear !== 'all') {
        filteredTutors = formattedTutors.filter(t => t.year === selectedYear)
      }

      // Assign actual ranks based on points in the filtered list
      filteredTutors = filteredTutors.map((t, index) => ({
        ...t,
        rank: index + 1
      }))

      // Find current user's data
      const myData = filteredTutors.find((s) => s.id === studentInfo.id) || null
      
      return {
        allTutors: filteredTutors,
        myRank: myData?.rank || 0,
        myData,
        totalPeers: filteredTutors.length
      }
    },
    enabled: !!studentInfo?.faculty_id && !!studentInfo?.id,
    staleTime: 5 * 60 * 1000
  })
}
