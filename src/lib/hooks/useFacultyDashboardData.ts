import { useQuery } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { StudentService } from '@/lib/services/studentService'

export interface RecentClassStats {
  subject_name: string
  year: string
  total: number
  completed: number
  scheduled_date: string
  percentage: number
}

interface GroupedClassStats {
  subject_name: string
  year: string
  total: number
  completed: number
  scheduled_date: string
}

export interface DashboardStats {
  totalClasses: number
  completedClasses: number
  inProgressClasses: number
  attendanceRate: number
  weeklyActivity: { day: string; classes: number }[]
  yearStats: { year: string; count: number; percentage: number }[]
  attendanceBreakdown: { name: string; value: number; color: string }[]
  recentClasses: RecentClassStats[]
  currentWeekTotal: number
  weeklyChange: number
  additionalClassesByYear: { year: string; count: number }[]
  totalAdditionalClasses: number
  totalpeerTutor: number
  totalStudents: number
  departmentName: string | undefined
  departmentId: string | undefined
}

export function useFacultyDashboardData(userEmail: string | undefined | null) {
  return useQuery({
    queryKey: ['faculty-dashboard', userEmail],
    queryFn: async (): Promise<DashboardStats> => {
      if (!userEmail) throw new Error('User email not found')

      // 1. Get Department
      const dept = await FacultyService.verifyFacultyAccess(userEmail)
      
      if (!dept) {
        throw new Error('Faculty department not found')
      }

      // 2. Get All Classes for Department
      const { completed, pending } = await ScheduledClassService.getAllClassesForDepartment(dept.name)
      const allClasses = [...completed, ...pending].sort((a, b) => 
        new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
      )

      // 3. Process Stats
      const totalClasses = allClasses.length
      
      // Count specific statuses
      const completedCount = completed.length
      
      // Filter pending array for "pending" status (In Progress) vs "not_started" (Pending)
      const inProgressCount = pending.filter(c => c.completion_status === 'pending').length
      
      // Calculate Rates
      const attendanceRate = totalClasses > 0 ? Math.round((completedCount / totalClasses) * 100) : 0
      
      // 4. Get Additional Classes Stats (For Department)
      const additionalClasses = await AdditionalClassService.getAllAdditionalClassesForDepartment(dept.name)
      const totalAdditionalClasses = additionalClasses.length
      
      const addClassCounts: Record<string, number> = { '2': 0, '3': 0, '4': 0 }
      
      additionalClasses.forEach(cls => {
           // Normalize year
           let y = cls.year ? cls.year.toString() : ''
           if (y.includes('2')) y = '2'
           else if (y.includes('3')) y = '3'
           else if (y.includes('4')) y = '4'
           
           if (addClassCounts[y] !== undefined) addClassCounts[y]++
      })
      
      const additionalClassesByYear = [
        { year: '2', count: addClassCounts['2'] },
        { year: '3', count: addClassCounts['3'] },
        { year: '4', count: addClassCounts['4'] }
      ]

      // 5. Get Tutor/Student Counts for Department
      const allpeerTutor = await peertutorservice.getpeerTutorByDepartment(dept.name)
      const totalpeerTutor = allpeerTutor.length

      const allStudents = await StudentService.getStudentsByDepartment(dept.name)
      const totalStudents = allStudents.length

      // Weekly Activity & Comparison Logic
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      // Calculate start of this week (Sunday)
      const startOfThisWeek = new Date(today)
      startOfThisWeek.setDate(today.getDate() - today.getDay())
      startOfThisWeek.setHours(0, 0, 0, 0)
      
      // Calculate start of last week
      const startOfLastWeek = new Date(startOfThisWeek)
      startOfLastWeek.setDate(startOfLastWeek.getDate() - 7)
      const endOfLastWeek = new Date(startOfThisWeek)
      endOfLastWeek.setDate(endOfLastWeek.getDate() - 1)
      endOfLastWeek.setHours(23, 59, 59, 999)

      // Count for this week (grouped by day)
      const weeklyActivityMap = new Array(7).fill(0)
      let currentWeekTotal = 0
      let lastWeekTotal = 0

      const completedThisWeek = new Set<string>()
      const completedLastWeek = new Set<string>()

      // Filter only completed classes for the stats
      const completedClassesList = completed.filter(c => 
         c.completion_status === 'completed' || 
         (c.attendance_completed && c.topics_completed)
      )

      completedClassesList.forEach(cls => {
        const d = new Date(cls.scheduled_date)
        d.setHours(0, 0, 0, 0)
        
        // Check if in this week
        // We use startOfThisWeek and the end of the week (start + 7 days)
        const endOfThisWeek = new Date(startOfThisWeek)
        endOfThisWeek.setDate(endOfThisWeek.getDate() + 7)
        
        if (d.getTime() >= startOfThisWeek.getTime() && d.getTime() < endOfThisWeek.getTime()) {
           if (!completedThisWeek.has(cls.id)) {
              completedThisWeek.add(cls.id)
              weeklyActivityMap[d.getDay()]++
              currentWeekTotal++
           }
        }

        // Check if in last week
        if (d.getTime() >= startOfLastWeek.getTime() && d.getTime() <= endOfLastWeek.getTime()) {
           if (!completedLastWeek.has(cls.id)) {
              completedLastWeek.add(cls.id)
              lastWeekTotal++
           }
        }
      })
      
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const weeklyActivity = days.map((day, idx) => ({
        day,
        classes: weeklyActivityMap[idx]
      }))

      // Calculate Percentage Change
      let weeklyChange = 0
      if (lastWeekTotal > 0) {
        weeklyChange = Math.round(((currentWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
      } else if (currentWeekTotal > 0) {
        weeklyChange = 0 
      } else {
        weeklyChange = 0
      }

      // Year Stats
      const yearCounts: Record<string, number> = { '2': 0, '3': 0, '4': 0 }
      allClasses.forEach(cls => {
        if (yearCounts[cls.year] !== undefined) yearCounts[cls.year]++
      })
      const maxYearCount = Math.max(...Object.values(yearCounts), 1) // Avoid div by 0
      const yearStats = [
        { year: '2', count: yearCounts['2'], percentage: (yearCounts['2'] / maxYearCount) * 100 },
        { year: '3', count: yearCounts['3'], percentage: (yearCounts['3'] / maxYearCount) * 100 },
        { year: '4', count: yearCounts['4'], percentage: (yearCounts['4'] / maxYearCount) * 100 },
      ]

      // Attendance Breakdown (Mock breakdown based on status)
      const completedPct = attendanceRate
      const pendingPct = 100 - attendanceRate
      const attendanceBreakdown = [
        { name: 'Completed', value: completedPct, color: '#10B981' }, // Green
        { name: 'Pending', value: pendingPct, color: '#F59E0B' },   // Amber
        { name: 'Cancelled', value: 0, color: '#EF4444' }            // Red
      ].filter(i => i.value > 0)

      // Recent Classes
      const recentClassesRaw = allClasses

      // Group by Subject + Year
      const groupedClasses: Record<string, GroupedClassStats> = {}
      
      recentClassesRaw.forEach(cls => {
        const key = `${cls.class?.subject_name}-${cls.year}`
        if (!groupedClasses[key]) {
          groupedClasses[key] = {
            subject_name: cls.class?.subject_name,
            year: cls.year,
            total: 0,
            completed: 0,
            scheduled_date: cls.scheduled_date // Keep latest date for sorting
          }
        }
        
        groupedClasses[key].total++
        
        // Check completion
        if (cls.completion_status === 'completed') {
          groupedClasses[key].completed += 1
        } else {
           // Partial completion logic (0.5 for attendance, 0.5 for topics)
           if (cls.attendance_completed) groupedClasses[key].completed += 0.5
           if (cls.topics_completed) groupedClasses[key].completed += 0.5
        }
        
        // Update date if this one is more recent
        if (new Date(cls.scheduled_date) > new Date(groupedClasses[key].scheduled_date)) {
          groupedClasses[key].scheduled_date = cls.scheduled_date
        }
      })

      // Convert to array and calculate percentage
      const recentClasses = Object.values(groupedClasses).map(group => ({
        ...group,
        percentage: Math.round((group.completed / group.total) * 100)
      })).sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())

      return {
        totalClasses,
        completedClasses: completedCount,
        inProgressClasses: inProgressCount,
        attendanceRate,
        currentWeekTotal,
        weeklyChange,
        yearStats,
        weeklyActivity,
        attendanceBreakdown,
        recentClasses,
        additionalClassesByYear,
        totalAdditionalClasses,
        totalpeerTutor,
        totalStudents,
        departmentName: dept.name,
        departmentId: dept.id
      }
    },
    enabled: !!userEmail,
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  })
}
