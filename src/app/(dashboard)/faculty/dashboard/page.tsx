'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { useAuth } from '@/lib/auth/AuthContext'
import { FacultyService } from '@/lib/services/facultyService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { AdditionalClassService, AdditionalClass } from '@/lib/services/additionalClassService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { StudentService } from '@/lib/services/studentService'
import { FeedbackService } from '@/lib/services/feedbackService'
import { RenumerationService } from '@/lib/services/renumerationService'
import { Card } from '@/components/ui'
import { FacultyDashboardSkeleton } from '@/components/skeletons/FacultyDashboardSkeleton'
import {
  BarChart, Bar, XAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import {
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  GraduationCap,
  Users,
  Banknote,
  MessageSquare,
  Clock
} from 'lucide-react'

interface RecentClass {
  subject_name: string
  year: string
  scheduled_date: string
  percentage: number
}

interface TodayClassSummary {
  year: string
  subject_name: string
  totalClasses: number
  completedClasses: number
  percentage: number
  completion_status: 'completed' | 'pending'
}

interface TodaysClassesStats {
  classes: TodayClassSummary[]
  total: number
  completed: number
  percentage: number
}

interface DashboardStats {
  totalClasses: number
  completedClasses: number
  inProgressClasses: number
  attendanceRate: number
  weeklyActivity: { day: string; classes: number }[]
  yearStats: { year: string; count: number; percentage: number }[]
  attendanceBreakdown: { name: string; value: number; color: string }[]
  recentClasses: RecentClass[]
  currentWeekTotal: number
  weeklyChange: number
  additionalClassesByYear: { year: string; count: number }[]
  totalAdditionalClasses: number
  totalpeerTutor: number
  totalStudents: number
  todaysClasses: TodaysClassesStats
  newFeedbackCount: number
  newRenumerationCount: number
}

// Default empty stats to use while loading or on error
const initialStats: DashboardStats = {
  totalClasses: 0,
  completedClasses: 0,
  inProgressClasses: 0,
  attendanceRate: 0,
  weeklyActivity: [],
  yearStats: [],
  attendanceBreakdown: [],
  recentClasses: [],
  currentWeekTotal: 0,
  weeklyChange: 0,
  additionalClassesByYear: [],
  totalAdditionalClasses: 0,
  totalpeerTutor: 0,
  totalStudents: 0,
  todaysClasses: { classes: [], total: 0, completed: 0, percentage: 0 },
  newFeedbackCount: 0,
  newRenumerationCount: 0
}

export default function FacultyDashboardPage() {
  return (
    <FacultyProtectedRoute>
      <FacultyDashboardContent />
    </FacultyProtectedRoute>
  )
}

function FacultyDashboardContent() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Sidebar collapsed state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useSidebarCollapsed()

  // Auto-collapse on mobile resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1024) setIsSidebarCollapsed(true)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setIsSidebarCollapsed])

  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 1. Department Query
  const { data: department, isLoading: isDepartmentLoading } = useQuery({
    queryKey: ['department', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return FacultyService.verifyFacultyAccess(user.email)
    },
    enabled: !!user?.email
  })

  // 2. Main Dashboard Data Query
  const { data: stats = initialStats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['dashboardStats', department?.name, user?.id],
    queryFn: async () => {
      if (!department?.name || !user?.id) return initialStats

      // Fetch all data in parallel
      const [
        { completed, pending },
        additionalClasses,
        allpeerTutor,
        allStudents,
        feedbackForms,
        renumerationSubmissions
      ] = await Promise.all([
        ScheduledClassService.getAllClassesForDepartment(department.name),
        AdditionalClassService.getAllAdditionalClassesForDepartment(department.name),
        peertutorservice.getpeerTutorByDepartment(department.name),
        StudentService.getStudentsByDepartment(department.name),
        FeedbackService.getFeedbackFormsByFaculty(user.id),
        RenumerationService.getRenumerationSubmissions(user.id)
      ])

      const allClasses = [...completed, ...pending].sort((a, b) =>
        new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
      )

      // --- New Submissions Logic ---
      const lastVisitedFeedback = parseInt(localStorage.getItem('last_visited_feedback') || '0')
      const lastVisitedRenumeration = parseInt(localStorage.getItem('last_visited_renumeration') || '0')

      let newFeedbackCount = 0
      // For feedback, we need to check responses for each form
      const feedbackResponsesPromises = feedbackForms.map(form => FeedbackService.getFeedbackResponses(form.id))
      const allFeedbackResponses = await Promise.all(feedbackResponsesPromises)

      allFeedbackResponses.flat().forEach(resp => {
        if (new Date(resp.submitted_at).getTime() > lastVisitedFeedback) {
          newFeedbackCount++
        }
      })

      let newRenumerationCount = 0
      renumerationSubmissions.forEach(sub => {
        if (sub.submitted_at && new Date(sub.submitted_at).getTime() > lastVisitedRenumeration) {
          newRenumerationCount++
        }
      })

      // --- Process Stats ---
      const totalScheduled = allClasses.length
      const completedScheduled = completed.length
      const totalAdditional = additionalClasses.length

      // Total Taken (Completed Scheduled + All Additional)
      const totalTaken = completedScheduled + totalAdditional

      // Total Allocated (Scheduled Classes Only)
      const totalAllocated = totalScheduled

      // Total Cumulative (Scheduled + Additional)
      const totalCumulativeClasses = totalScheduled + totalAdditional

      const attendanceRate = totalAllocated > 0 ? Math.round((totalTaken / totalAllocated) * 100) : 0

      // Additional Classes Logic

      const addClassCounts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0 }
      additionalClasses.forEach((cls: AdditionalClass & { peer_tutors?: { year: string } }) => {
        let y = cls.year || (cls.peer_tutors ? cls.peer_tutors.year : '')
        y = y.toString()
        if (y.includes('1')) y = '1'
        else if (y.includes('2')) y = '2'
        else if (y.includes('3')) y = '3'
        else if (y.includes('4')) y = '4'
        if (addClassCounts[y] !== undefined) addClassCounts[y]++
      })
      const additionalClassesByYear = [
        { year: '1', count: addClassCounts['1'] },
        { year: '2', count: addClassCounts['2'] },
        { year: '3', count: addClassCounts['3'] },
        { year: '4', count: addClassCounts['4'] }
      ]

      // Tutor/Student Counts
      const totalpeerTutor = allpeerTutor.length
      const totalStudents = allStudents.length

      // Weekly Activity & Comparison
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const startOfThisWeek = new Date(today)
      startOfThisWeek.setDate(today.getDate() - today.getDay())
      startOfThisWeek.setHours(0, 0, 0, 0)

      const startOfLastWeek = new Date(startOfThisWeek)
      startOfLastWeek.setDate(startOfLastWeek.getDate() - 7)
      const endOfLastWeek = new Date(startOfThisWeek)
      endOfLastWeek.setDate(endOfLastWeek.getDate() - 1)
      endOfLastWeek.setHours(23, 59, 59, 999)

      const weeklyActivityMap = new Array(7).fill(0)
      let currentWeekTotal = 0
      let lastWeekTotal = 0

      // Combine scheduled and additional classes for weekly activity
      const allCompletedClasses = [
        ...completed.filter(c => c.completion_status === 'completed' || (c.attendance_completed && c.topics_completed)),
        ...additionalClasses
      ]

      allCompletedClasses.forEach(cls => {
        const dateStr = 'scheduled_date' in cls ? cls.scheduled_date : cls.class_date
        const d = new Date(dateStr)
        d.setHours(0, 0, 0, 0)
        const endOfThisWeek = new Date(startOfThisWeek)
        endOfThisWeek.setDate(endOfThisWeek.getDate() + 7)

        if (d.getTime() >= startOfThisWeek.getTime() && d.getTime() < endOfThisWeek.getTime()) {
          weeklyActivityMap[d.getDay()]++
          currentWeekTotal++
        }
        if (d.getTime() >= startOfLastWeek.getTime() && d.getTime() <= endOfLastWeek.getTime()) {
          lastWeekTotal++
        }
      })

      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const weeklyActivity = days.map((day, idx) => ({
        day,
        classes: weeklyActivityMap[idx]
      }))

      let weeklyChange = 0
      if (lastWeekTotal > 0) {
        weeklyChange = Math.round(((currentWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
      }

      // Year Stats - Calculate based on total scheduled classes with completion percentage
      const yearCounts: Record<string, { allocated: number; cumulative: number; completed: number }> = {
        '1': { allocated: 0, cumulative: 0, completed: 0 },
        '2': { allocated: 0, cumulative: 0, completed: 0 },
        '3': { allocated: 0, cumulative: 0, completed: 0 },
        '4': { allocated: 0, cumulative: 0, completed: 0 }
      }

      allClasses.forEach(cls => {
        const yStr = cls.year?.toString() || ''
        let normalizedYear = ''
        if (yStr.includes('1')) normalizedYear = '1'
        else if (yStr.includes('2')) normalizedYear = '2'
        else if (yStr.includes('3')) normalizedYear = '3'
        else if (yStr.includes('4')) normalizedYear = '4'

        if (normalizedYear && yearCounts[normalizedYear] !== undefined) {
          yearCounts[normalizedYear].allocated++
          yearCounts[normalizedYear].cumulative++
          if (cls.completion_status === 'completed' || (cls.attendance_completed && cls.topics_completed)) {
            yearCounts[normalizedYear].completed++
          }
        }
      })

      // Include additional classes in the 'completed' count for each year
      additionalClasses.forEach((cls: AdditionalClass & { peer_tutors?: { year: string } }) => {
        let y = cls.year || (cls.peer_tutors ? cls.peer_tutors.year : '')
        y = y.toString()
        let normalizedYear = ''
        if (y.includes('1')) normalizedYear = '1'
        else if (y.includes('2')) normalizedYear = '2'
        else if (y.includes('3')) normalizedYear = '3'
        else if (y.includes('4')) normalizedYear = '4'

        if (normalizedYear && yearCounts[normalizedYear] !== undefined) {
          yearCounts[normalizedYear].cumulative++
          yearCounts[normalizedYear].completed++
        }
      })

      const yearStats = [
        {
          year: '1',
          count: yearCounts['1'].cumulative,
          percentage: yearCounts['1'].allocated > 0 ? (yearCounts['1'].completed / yearCounts['1'].allocated) * 100 : 0
        },
        {
          year: '2',
          count: yearCounts['2'].cumulative,
          percentage: yearCounts['2'].allocated > 0 ? (yearCounts['2'].completed / yearCounts['2'].allocated) * 100 : 0
        },
        {
          year: '3',
          count: yearCounts['3'].cumulative,
          percentage: yearCounts['3'].allocated > 0 ? (yearCounts['3'].completed / yearCounts['3'].allocated) * 100 : 0
        },
        {
          year: '4',
          count: yearCounts['4'].cumulative,
          percentage: yearCounts['4'].allocated > 0 ? (yearCounts['4'].completed / yearCounts['4'].allocated) * 100 : 0
        },
      ]

      // Recent Classes - group by year and date, showing combined completion percentage
      const todayDate = new Date()
      todayDate.setHours(0, 0, 0, 0)

      const pastClasses = allClasses
        .filter(cls => {
          const d = new Date(cls.scheduled_date)
          d.setHours(0, 0, 0, 0)
          return d.getTime() < todayDate.getTime()
        })

      // Group by year + date
      const groupedByYearDate: Record<string, {
        year: string,
        scheduled_date: string,
        subject_names: Set<string>,
        totalClasses: number,
        completedClasses: number
      }> = {}

      pastClasses.forEach(cls => {
        const dateKey = new Date(cls.scheduled_date).toISOString().split('T')[0]
        const yearStr = cls.year?.toString() || ''
        let normalizedYear = ''
        if (yearStr.includes('1')) normalizedYear = '1'
        else if (yearStr.includes('2')) normalizedYear = '2'
        else if (yearStr.includes('3')) normalizedYear = '3'
        else if (yearStr.includes('4')) normalizedYear = '4'

        const groupKey = `${normalizedYear}-${dateKey}`

        if (!groupedByYearDate[groupKey]) {
          groupedByYearDate[groupKey] = {
            year: normalizedYear,
            scheduled_date: cls.scheduled_date,
            subject_names: new Set(),
            totalClasses: 0,
            completedClasses: 0
          }
        }

        groupedByYearDate[groupKey].subject_names.add(cls.class?.subject_name || 'Session')
        groupedByYearDate[groupKey].totalClasses++
        if (cls.completion_status === 'completed' || (cls.attendance_completed && cls.topics_completed)) {
          groupedByYearDate[groupKey].completedClasses++
        }
      })

      // Convert to array and sort by date (most recent first)
      const recentClasses = Object.values(groupedByYearDate)
        .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())
        .slice(0, 3)
        .map(group => ({
          subject_name: Array.from(group.subject_names).join(', '),
          year: group.year,
          scheduled_date: group.scheduled_date,
          percentage: group.totalClasses > 0 ? Math.round((group.completedClasses / group.totalClasses) * 100) : 0
        }))

      const attendanceBreakdown = [
        { name: 'Completed', value: Math.min(100, attendanceRate), color: '#10B981' },
        { name: 'Pending', value: Math.max(0, 100 - attendanceRate), color: '#F59E0B' },
        { name: 'Cancelled', value: 0, color: '#EF4444' }
      ].filter(i => i.value > 0)

      return {
        totalClasses: totalCumulativeClasses,
        completedClasses: totalTaken,
        inProgressClasses: pending.length,
        attendanceRate,
        currentWeekTotal,
        weeklyChange,
        yearStats,
        weeklyActivity,
        attendanceBreakdown,
        recentClasses,
        additionalClassesByYear,
        totalAdditionalClasses: totalAdditional,
        totalpeerTutor,
        totalStudents,
        newFeedbackCount,
        newRenumerationCount,
        todaysClasses: (() => {
          const todayClasses = allClasses.filter(c => {
            const d = new Date(c.scheduled_date)
            d.setHours(0, 0, 0, 0)
            const t = new Date()
            t.setHours(0, 0, 0, 0)
            return d.getTime() === t.getTime()
          })

          const totalCount = todayClasses.length
          let completedCount = 0

          // Group by year for display
          const groupedByYear: Record<string, {
            year: string,
            subject_names: Set<string>,
            totalClasses: number,
            completedClasses: number
          }> = {}

          todayClasses.forEach(cls => {
            if (cls.completion_status === 'completed' || (cls.attendance_completed && cls.topics_completed)) {
              completedCount++
            }

            const yearStr = cls.year?.toString() || ''
            let normalizedYear = ''
            if (yearStr.includes('1')) normalizedYear = '1'
            else if (yearStr.includes('2')) normalizedYear = '2'
            else if (yearStr.includes('3')) normalizedYear = '3'
            else if (yearStr.includes('4')) normalizedYear = '4'

            if (!groupedByYear[normalizedYear]) {
              groupedByYear[normalizedYear] = {
                year: normalizedYear,
                subject_names: new Set(),
                totalClasses: 0,
                completedClasses: 0
              }
            }

            groupedByYear[normalizedYear].subject_names.add(cls.class?.subject_name || 'Session')
            groupedByYear[normalizedYear].totalClasses++
            if (cls.completion_status === 'completed' || (cls.attendance_completed && cls.topics_completed)) {
              groupedByYear[normalizedYear].completedClasses++
            }
          })

          // Convert to array and calculate percentage per group
          const groupedClasses = Object.values(groupedByYear)
            .sort((a, b) => parseInt(a.year) - parseInt(b.year))
            .map(group => ({
              year: group.year,
              subject_name: Array.from(group.subject_names).join(', '),
              totalClasses: group.totalClasses,
              completedClasses: group.completedClasses,
              percentage: group.totalClasses > 0 ? Math.round((group.completedClasses / group.totalClasses) * 100) : 0,
              completion_status: group.completedClasses === group.totalClasses ? 'completed' : 'pending'
            }))

          return {
            classes: groupedClasses,
            total: totalCount,
            completed: completedCount,
            percentage: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
          }
        })()
      }
    },
    enabled: !!department?.name && !!user?.id
  })

  // Combined Loading State
  const isLoading = isDepartmentLoading || isStatsLoading

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
    setLastRefresh(new Date())
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const handleYearClick = (yearId: string) => {
    if (department?.id) {
      router.push(`/faculty/department/${department.id}/year/${yearId}`)
    }
  }

  const handleNav = (path: string, type?: 'feedback' | 'renumeration') => {
    if (type === 'feedback') {
      localStorage.setItem('last_visited_feedback', Date.now().toString())
    } else if (type === 'renumeration') {
      localStorage.setItem('last_visited_renumeration', Date.now().toString())
    }
    router.push(path)
  }

  // --- UI ---

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Sidebar - Always Rendered */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Content Container */}
      <div
        suppressHydrationWarning
        className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
        {isLoading ? (
          <FacultyDashboardSkeleton />
        ) : (
          <>
            {/* Header */}
            <PageHeader
              title="DASHBOARD"
              tagline="Department Overview & Performance Metrics"
              lastRefresh={lastRefresh}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              onToggleSidebar={() => setIsSidebarOpen(true)}
              isSidebarCollapsed={isSidebarCollapsed}
            />

            {/* Dashboard Content */}
            <main className="flex-1 p-6 overflow-y-auto bg-gray-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto w-full">

                {/* --- LEFT COLUMN --- */}
                <div className="lg:col-span-4 flex flex-col gap-6">

                  {/* Update Card */}
                  <div className="bg-gradient-to-br from-[#1C2434] to-[#2D3748] text-white rounded-[2rem] p-8 relative overflow-hidden shadow-2xl border border-white/10 group">
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-6">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10B981]"></span>
                        <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">Department Overview</span>
                      </div>
                      <p className="text-sm text-gray-400 font-medium mb-1">
                        {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                      <h3 className="text-3xl font-bold tracking-tight mb-4 leading-tight">
                        DEPT OVERVIEW<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">{department?.name}</span>
                      </h3>
                      <div className="flex items-center gap-4 mt-8">
                        <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/5">
                          <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Total Classes</p>
                          <p className="text-xl font-bold">{stats.totalClasses}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/5">
                          <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Attendance</p>
                          <p className="text-xl font-bold">{stats.attendanceRate}%</p>
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-emerald-500/20 transition-all duration-700"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl -ml-20 -mb-20 transition-all duration-700"></div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-2 gap-6">
                    <Card className="rounded-[2rem] shadow-sm border-none p-7 bg-white hover:shadow-md transition-all duration-300">
                      <div className="flex justify-between items-start mb-6">
                        <div className="text-[10px] text-gray-400 uppercase font-black tracking-[0.15em]">Tutors / Students</div>
                        <div className="p-1.5 bg-gray-50 rounded-lg">
                          <Users className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                      </div>
                      <div className="text-4xl font-black text-gray-900 mb-6 tracking-tight">{stats.totalpeerTutor} / {stats.totalStudents}</div>
                      <div className="flex items-center text-[10px] text-black font-black tracking-widest bg-gray-100 w-fit px-3 py-1.5 rounded-xl border border-gray-100/50">
                        <span>ALLOCATED</span>
                      </div>
                    </Card>

                    <Card className="rounded-[2rem] shadow-sm border-none p-7 bg-white hover:shadow-md transition-all duration-300">
                      <div className="flex justify-between items-start mb-6">
                        <div className="text-[10px] text-gray-400 uppercase font-black tracking-[0.15em]">Additional Classes</div>
                        <div className="p-1.5 bg-gray-50 rounded-lg">
                          <GraduationCap className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                      </div>
                      <div className="text-4xl font-black text-gray-900 mb-6 tracking-tight">{stats.totalAdditionalClasses}</div>
                      <div className="flex items-center text-[10px] text-black- font-black tracking-widest bg-gray-100 w-fit px-3 py-1.5 rounded-xl border border-gray-100/50">
                        <span>CUMULATIVE</span>
                      </div>
                    </Card>
                  </div>


                  {/* Weekly Activity */}
                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7">
                    <div className="flex flex-row items-center justify-between mb-8">
                      <div>
                        <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest leading-none mb-2">Weekly Activity</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-gray-900">{stats.currentWeekTotal}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center ${stats.weeklyChange >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-600 text-white'}`}>
                            {stats.weeklyChange >= 0 ? <ArrowUpRight size={10} className="mr-0.5" /> : <ArrowDownRight size={10} className="mr-0.5" />}
                            {Math.abs(stats.weeklyChange)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#1C2434]"></span><span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">Classes Taken</span></div>
                    </div>
                    <div className="w-full h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.weeklyActivity} barSize={16}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 600 }} dy={10} />
                          <RechartsTooltip cursor={{ fill: '#F8FAFC', radius: 4 }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '8px 12px' }} itemStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                          <Bar dataKey="classes" fill="#1C2434" radius={[4, 4, 4, 4]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  {/* Spacer for alignment */}
                  <div className="flex-1 min-h-[1px]"></div>
                </div>

                {/* --- MIDDLE COLUMN --- */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  {/* Year Overview */}
                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 overflow-hidden relative">
                    <div className="flex flex-row items-center justify-between mb-8 relative z-10">
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Year Overview</h4>
                      <MoreHorizontal className="w-5 h-5 text-gray-400 cursor-pointer" />
                    </div>
                    <div className="space-y-8 mt-2 relative z-10">
                      {stats.yearStats.map((yearStat) => (
                        <div key={yearStat.year} className="group cursor-pointer" onClick={() => handleYearClick(yearStat.year)}>
                          <div className="flex justify-between items-end mb-0">
                            <div>
                              <span className="text-base font-bold text-gray-800 group-hover:text-blue-600 transition-colors">YEAR {yearStat.year}</span>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{yearStat.count} Total Classes</p>
                            </div>
                            <span className="text-sm font-bold text-gray-900">{Math.round(yearStat.percentage)}%</span>
                          </div>
                          <div className="relative w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-1000 ease-out group-hover:from-blue-400 group-hover:to-blue-500 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                              style={{ width: `${Math.min(100, yearStat.percentage)}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-gray-50 rounded-full opacity-50"></div>
                  </Card>


                  {/* Recent Sessions */}
                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 overflow-hidden">
                    <div className="flex flex-row items-center justify-between pb-4 border-b border-gray-50">
                      <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest">Recent Sessions</h4>
                      <span className="text-[10px] font-black text-black-400 px-2.5 py-1 bg-gray-50 rounded-lg uppercase tracking-widest border border-gray-100">Last 3</span>
                    </div>
                    <div className="space-y-4">
                      {stats.recentClasses.length > 0 ? (
                        stats.recentClasses.map((cls, i) => {
                          let statusColor = 'bg-emerald-500'
                          let statusText = 'Completed'
                          const bgColor = 'bg-gray-100' // Changed to gray
                          if (cls.percentage < 100) {
                            statusColor = 'bg-amber-500'
                            statusText = 'In Progress'
                          }
                          if (cls.percentage === 0) {
                            statusColor = 'bg-red-500'
                            statusText = 'Pending'
                          }

                          return (
                            <div key={i} className="flex items-center justify-between p-4 rounded-2xl hover:bg-gray-50/80 transition-all duration-200 border border-transparent hover:border-gray-100 group">
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 flex-shrink-0 rounded-xl ${bgColor} flex items-center justify-center font-bold text-black relative`}>
                                  {cls.year}
                                  <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${statusColor}`}></div>
                                </div>
                                <div>
                                  <h5 className="text-sm font-bold text-gray-900 mb-0.5 group-hover:text-blue-600 transition-colors uppercase tracking-tight" title={cls.subject_name}>
                                    {cls.subject_name.split(' ').slice(0, 3).join(' ')}{cls.subject_name.split(' ').length > 3 ? '...' : ''}
                                  </h5>
                                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                    {new Date(cls.scheduled_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-black text-gray-900 mb-0.5">{cls.percentage}%</p>
                                <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">{statusText}</p>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                          <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center mb-4">
                            <Clock className="text-gray-300 w-8 h-8" />
                          </div>
                          <p className="text-sm font-black text-gray-900 uppercase tracking-tight">No Sessions</p>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Additional Classes by Year */}
                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7">
                    <div className="flex flex-row items-center justify-between mb-8">
                      <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest">Additional Classes</h4>
                      <span className="text-[10px] font-bold text-black-400 bg-gray-50 px-2 py-0.5 rounded-full uppercase">By Year</span>
                    </div>
                    <div className="w-full h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.additionalClassesByYear} barSize={20}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis
                            dataKey="year"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 600 }}
                            dy={10}
                            tickFormatter={(value) => `Year ${value}`}
                          />
                          <RechartsTooltip
                            cursor={{ fill: '#F8FAFC', radius: 4 }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '8px 12px' }}
                            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                          />
                          <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 4, 4]} name="Additional Classes" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  {/* Spacer for alignment */}
                  <div className="flex-1 min-h-[1px]"></div>
                </div>


                {/* --- RIGHT COLUMN --- */}
                <div className="lg:col-span-4 flex flex-col gap-6">

                  {/* Class Status Chart Card */}
                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 relative overflow-hidden group">
                    <div className="flex flex-row items-center justify-between mb-8 border-b border-gray-50 pb-4">
                      <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest">Performance</h4>
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-200"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-200"></div>
                      </div>
                    </div>

                    <div className="relative flex flex-col items-center justify-center py-2">
                      <div className="relative w-full h-[160px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[{ value: 100 }]}
                              cx="50%" cy="80%" startAngle={180} endAngle={0}
                              innerRadius="50%" outerRadius="90%" paddingAngle={0}
                              dataKey="value" stroke="none" isAnimationActive={false}
                            >
                              <Cell fill="#e5e5e5" />
                            </Pie>
                            <Pie
                              data={[{ value: stats.attendanceRate }, { value: 100 - stats.attendanceRate }]}
                              cx="50%" cy="80%" startAngle={180} endAngle={0}
                              innerRadius="50%" outerRadius="90%" paddingAngle={0}
                              dataKey="value" stroke="none" cornerRadius={10}
                              className="drop-shadow-xl"
                            >
                              <Cell fill="#10B981" />
                              <Cell fill="transparent" />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-x-0 bottom-2 flex flex-col items-center justify-center">
                          <span className="text-4xl font-black text-gray-900 tracking-tighter leading-none">{stats.attendanceRate}%</span>
                          <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">Overall Progress</span>
                        </div>
                      </div>
                      <div className="w-full mt-4 flex justify-center items-center gap-8">
                        <div className="flex flex-col items-center">
                          <div className="flex items-center gap-1.5 mb-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"></span><span className="text-xs font-bold text-gray-800">DONE</span></div>
                          <span className="text-[10px] text-gray-400 font-bold uppercase">{stats.completedClasses} Classes</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="flex items-center gap-1.5 mb-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-200"></span><span className="text-xs font-bold text-gray-400">TODO</span></div>
                          <span className="text-[10px] text-gray-400 font-bold uppercase">{stats.totalClasses - stats.completedClasses} Classes</span>
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Renumeration & Feedback Link Card */}
                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 overflow-hidden">
                    <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6 border-b border-gray-50 pb-4">Reports & Feedback</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        className="bg-gray-50/80 hover:bg-white p-5 rounded-2xl flex flex-col items-start justify-between group transition-all duration-300 border border-transparent hover:border-emerald-100 hover:shadow-lg hover:shadow-emerald-500/5 h-[110px]"
                        onClick={() => handleNav('/faculty/peer-tutor?tab=renumeration', 'renumeration')}
                      >
                        <div className="text-left w-full">
                          <p className="text-sm font-black text-gray-900 mb-1 leading-tight  uppercase transition-colors">Renumeration</p>
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Payments</p>
                        </div>
                        <div className="flex items-center justify-between w-full">
                          {stats.newRenumerationCount > 0 ? (
                            <span className="bg-emerald-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full">
                              {stats.newRenumerationCount} NEW
                            </span>
                          ) : (
                            <div className="w-6 h-6 rounded-lg bg-white shadow-sm flex items-center justify-center">
                              <Banknote className="w-3 h-3 text-gray-400" />
                            </div>
                          )}
                          <ChevronRight size={14} className="text-gray-300 group-hover:text-emerald-500 transform group-hover:translate-x-1 transition-all" />
                        </div>
                      </button>

                      <button
                        className="bg-gray-50/80 hover:bg-white p-5 rounded-2xl flex flex-col items-start justify-between group transition-all duration-300 border border-transparent hover:border-blue-100 hover:shadow-lg hover:shadow-blue-500/5 h-[110px]"
                        onClick={() => handleNav('/faculty/peer-tutor?tab=feedback', 'feedback')}
                      >
                        <div className="text-left w-full">
                          <p className="text-sm font-black text-gray-900 mb-1 leading-tight  uppercase transition-colors">Feedback</p>
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Insights</p>
                        </div>
                        <div className="flex items-center justify-between w-full">
                          {stats.newFeedbackCount > 0 ? (
                            <span className="bg-blue-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full">
                              {stats.newFeedbackCount} NEW
                            </span>
                          ) : (
                            <div className="w-6 h-6 rounded-lg bg-white shadow-sm flex items-center justify-center">
                              <MessageSquare className="w-3 h-3 text-gray-400" />
                            </div>
                          )}
                          <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" />
                        </div>
                      </button>

                      <button
                        className="bg-[#1C2434] hover:bg-black px-4 py-0.5 rounded-2xl flex flex-col items-center justify-center group transition-all duration-300 shadow-xl shadow-gray-900/10 h-[36px] col-span-2 relative overflow-hidden text-center"
                        onClick={() => router.push('/faculty/analytics')}
                      >
                        <div className="relative z-10 w-full flex flex-col items-center justify-center leading-none">
                          <p className="text-[10px] font-black text-white uppercase leading-none">Analytics & Reports</p>
                          <div className="flex items-center justify-center gap-0.5 mt-0.5">
                            <p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest leading-none">Performance Monitoring</p>
                            <ArrowUpRight size={8} className="text-gray-400 group-hover:text-white transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                          </div>
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all duration-700"></div>
                      </button>
                    </div>
                  </Card>

                  {/* Today's Classes Scrollable List */}
                  <Card className="rounded-[2rem] shadow-sm border-none bg-white p-7 flex flex-col overflow-hidden max-h-[380px]">
                    <div className="flex flex-row items-center justify-between mb-6 border-b border-gray-50 pb-4">
                      <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest leading-none">Today&apos;s Timeline</h4>
                      <span className="bg-gray-100 text-black text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest shadow-sm">
                        {new Date().toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3">
                      {stats.todaysClasses.total > 0 ? (
                        stats.todaysClasses.classes.map((cls: { year: string; subject_name: string; totalClasses: number; completedClasses: number; percentage: number; completion_status: string }, i: number) => (
                          <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-blue-100 hover:bg-white transition-all duration-300 group">
                            <div className={`w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center font-bold relative ${cls.completion_status === 'completed' ? 'text-emerald-600' : 'text-gray-700'} group-hover:scale-110 transition-transform`}>
                              {cls.year}
                              <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${cls.completion_status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                            </div>
                            <div className="flex-1">
                              <h6 className="text-[12px] font-black text-gray-900 uppercase leading-tight mb-0.5">Year {cls.year}</h6>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-500 font-bold">{cls.completedClasses}/{cls.totalClasses} Classes</span>
                                <div className={`w-1.5 h-1.5 rounded-full ${cls.completion_status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-gray-900 mb-0.5">{cls.percentage}%</p>
                              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">{cls.completion_status === 'completed' ? 'Complete' : 'Pending'}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                          <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center mb-4 transition-all duration-700 hover:rotate-12">
                            <GraduationCap className="text-gray-300 w-8 h-8" />
                          </div>
                          <p className="text-sm font-black text-gray-900 uppercase tracking-tight">No Classes Today</p>
                          <p className="text-xs text-gray-400 mt-2 max-w-[180px] font-medium leading-relaxed">Relax! There are no peer tutor sessions scheduled for today.</p>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Spacer for alignment */}
                  <div className="flex-1 min-h-[1px]"></div>
                </div>
              </div>
            </main>

            <style jsx global>{`
              .custom-scrollbar::-webkit-scrollbar {
                width: 4px;
              }
              .custom-scrollbar::-webkit-scrollbar-track {
                background: transparent;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb {
                background: #E2E8F0;
                border-radius: 10px;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                background: #CBD5E1;
              }
            `}</style>
          </>
        )}
      </div>
    </div>
  )
}

