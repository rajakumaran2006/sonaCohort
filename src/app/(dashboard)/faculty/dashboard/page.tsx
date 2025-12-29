'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import FacultyProtectedRoute from '@/components/auth/FacultyProtectedRoute'
import FacultySidebar from '@/components/layout/FacultySidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { FacultyService } from '@/lib/services/facultyService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import { PeerTutorService } from '@/lib/services/peerTutorService'
import { StudentService } from '@/lib/services/studentService'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { FacultyDashboardSkeleton } from '@/components/skeletons/FacultyDashboardSkeleton'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { 
  MoreHorizontal, 
  ArrowUpRight, 
  ArrowDownRight,
  ChevronRight,
  GraduationCap
} from 'lucide-react'

// --- Types ---

interface DashboardStats {
  totalClasses: number
  completedClasses: number
  inProgressClasses: number
  attendanceRate: number
  weeklyActivity: { day: string; classes: number }[]
  yearStats: { year: string; count: number; percentage: number }[]
  attendanceBreakdown: { name: string; value: number; color: string }[]
  recentClasses: any[]
  currentWeekTotal: number
  weeklyChange: number
  additionalClassesByYear: { year: string; count: number }[]
  totalAdditionalClasses: number
  totalPeerTutors: number
  totalStudents: number
  todaysClasses: any[]
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
  totalPeerTutors: 0,
  totalStudents: 0,
  todaysClasses: []
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed')
      if (saved !== null) {
        return JSON.parse(saved)
      }
    }
    return false
  })

  // Listen for sidebar collapse state changes
  useEffect(() => {
    const checkSidebarState = () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved !== null) {
          setIsSidebarCollapsed(JSON.parse(saved))
        } else {
          const sidebar = document.querySelector('[data-sidebar-collapsed]')
          if (sidebar) {
            setIsSidebarCollapsed(sidebar.getAttribute('data-sidebar-collapsed') === 'true')
          }
        }
      }
    }
    const timer = setTimeout(checkSidebarState, 0)
    const handleSidebarToggle = () => setTimeout(checkSidebarState, 0)
    window.addEventListener('sidebar-toggle', handleSidebarToggle)
    window.addEventListener('storage', checkSidebarState)
    window.addEventListener('resize', () => {
       if (window.innerWidth <= 1024) setIsSidebarCollapsed(true)
    })
    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle)
      window.removeEventListener('storage', checkSidebarState)
    }
  }, [])
  
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
    queryKey: ['dashboardStats', department?.name],
    queryFn: async () => {
      if (!department?.name) return initialStats

      // Fetch all data in parallel
      const [
        { completed, pending },
        additionalClasses,
        allPeerTutors,
        allStudents
      ] = await Promise.all([
        ScheduledClassService.getAllClassesForDepartment(department.name),
        AdditionalClassService.getAllAdditionalClassesForDepartment(department.name),
        PeerTutorService.getPeerTutorsByDepartment(department.name),
        StudentService.getStudentsByDepartment(department.name)
      ])

      const allClasses = [...completed, ...pending].sort((a, b) => 
        new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
      )

      // --- Process Stats ---
      const totalClasses = allClasses.length
      const completedCount = completed.length
      
      const inProgressCount = pending.filter(c => c.completion_status === 'pending').length
      
      const attendanceRate = totalClasses > 0 ? Math.round((completedCount / totalClasses) * 100) : 0
      const inProgressRate = totalClasses > 0 ? Math.round((inProgressCount / totalClasses) * 100) : 0
      const pendingRate = totalClasses > 0 ? 100 - attendanceRate - inProgressRate : 0

      // Additional Classes Logic
      const totalAdditionalClasses = additionalClasses.length
      const addClassCounts: Record<string, number> = { '2': 0, '3': 0, '4': 0 }
      additionalClasses.forEach(cls => {
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

      // Tutor/Student Counts
      const totalPeerTutors = allPeerTutors.length
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
      const completedThisWeek = new Set<string>()
      const completedLastWeek = new Set<string>()

      const completedClassesList = completed.filter(c => 
         c.completion_status === 'completed' || (c.attendance_completed && c.topics_completed)
      )

      completedClassesList.forEach(cls => {
        const d = new Date(cls.scheduled_date)
        d.setHours(0, 0, 0, 0)
        const endOfThisWeek = new Date(startOfThisWeek)
        endOfThisWeek.setDate(endOfThisWeek.getDate() + 7)
        
        if (d.getTime() >= startOfThisWeek.getTime() && d.getTime() < endOfThisWeek.getTime()) {
           if (!completedThisWeek.has(cls.id)) {
              completedThisWeek.add(cls.id)
              weeklyActivityMap[d.getDay()]++
              currentWeekTotal++
           }
        }
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

      let weeklyChange = 0
      if (lastWeekTotal > 0) {
        weeklyChange = Math.round(((currentWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
      }

      // Year Stats - Calculate based on total scheduled classes with completion percentage
      const yearCounts: Record<string, { total: number; completed: number }> = { 
        '2': { total: 0, completed: 0 }, 
        '3': { total: 0, completed: 0 }, 
        '4': { total: 0, completed: 0 } 
      }
      
      allClasses.forEach(cls => {
        if (yearCounts[cls.year] !== undefined) {
          yearCounts[cls.year].total++
          if (cls.completion_status === 'completed' || (cls.attendance_completed && cls.topics_completed)) {
            yearCounts[cls.year].completed++
          }
        }
      })
      
      const yearStats = [
        { 
          year: '2', 
          count: yearCounts['2'].total, 
          percentage: yearCounts['2'].total > 0 ? (yearCounts['2'].completed / yearCounts['2'].total) * 100 : 0 
        },
        { 
          year: '3', 
          count: yearCounts['3'].total, 
          percentage: yearCounts['3'].total > 0 ? (yearCounts['3'].completed / yearCounts['3'].total) * 100 : 0 
        },
        { 
          year: '4', 
          count: yearCounts['4'].total, 
          percentage: yearCounts['4'].total > 0 ? (yearCounts['4'].completed / yearCounts['4'].total) * 100 : 0 
        },
      ]

      // Recent Classes - Filter to show only last 2 previous sessions (excluding today)
      const todayDate = new Date()
      todayDate.setHours(0, 0, 0, 0)
      
      const groupedClasses: Record<string, any> = {}
      allClasses.forEach(cls => {
        const classDate = new Date(cls.scheduled_date)
        classDate.setHours(0, 0, 0, 0)
        
        // Only include classes from before today
        if (classDate.getTime() < todayDate.getTime()) {
          const key = `${cls.class?.subject_name}-${cls.year}`
          if (!groupedClasses[key]) {
            groupedClasses[key] = {
              subject_name: cls.class?.subject_name,
              year: cls.year,
              total: 0,
              completed: 0,
              scheduled_date: cls.scheduled_date
            }
          }
          groupedClasses[key].total++
          if (cls.completion_status === 'completed') {
            groupedClasses[key].completed += 1
          } else {
             if (cls.attendance_completed) groupedClasses[key].completed += 0.5
             if (cls.topics_completed) groupedClasses[key].completed += 0.5
          }
          if (new Date(cls.scheduled_date) > new Date(groupedClasses[key].scheduled_date)) {
            groupedClasses[key].scheduled_date = cls.scheduled_date
          }
        }
      })

      const recentClasses = Object.values(groupedClasses)
        .map(group => ({
          ...group,
          percentage: Math.round((group.completed / group.total) * 100)
        }))
        .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())
        .slice(0, 2) // Only show last 2 sessions

      const attendanceBreakdown = [
        { name: 'Completed', value: attendanceRate, color: '#10B981' },
        { name: 'Pending', value: 100 - attendanceRate, color: '#F59E0B' },
        { name: 'Cancelled', value: 0, color: '#EF4444' }
      ].filter(i => i.value > 0)

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
        totalPeerTutors,
        totalStudents,
        todaysClasses: (() => {
          const todayClasses = allClasses.filter(c => {
            const d = new Date(c.scheduled_date)
            d.setHours(0,0,0,0)
            const t = new Date()
            t.setHours(0,0,0,0)
            return d.getTime() === t.getTime()
          })
          
          // Calculate total and completed count
          let totalCount = todayClasses.length
          let completedCount = 0
          
          todayClasses.forEach(cls => {
            if (cls.completion_status === 'completed' || (cls.attendance_completed && cls.topics_completed)) {
              completedCount++
            }
          })
          
          return {
            classes: todayClasses,
            total: totalCount,
            completed: completedCount,
            percentage: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
          }
        })()
      }
    },
    enabled: !!department?.name
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

  // --- UI ---

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Sidebar - Always Rendered */}
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Content Container */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col`}>
        {isLoading ? (
             <FacultyDashboardSkeleton />
        ) : (
          <>
            {/* Header */}
            <PageHeader
              title="DASHBOARD"
              lastRefresh={lastRefresh}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              onToggleSidebar={() => setIsSidebarOpen(true)}
              isSidebarCollapsed={isSidebarCollapsed}
            />

            {/* Dashboard Content */}
            <main className="flex-1 p-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
                  
                  {/* --- LEFT COLUMN --- */}
                  <div className="lg:col-span-4 md:contents lg:block space-y-6">
                    
                    {/* Update Card */}
                    <div className="bg-[#1C2434] text-white rounded-2xl p-6 relative overflow-hidden shadow-lg md:col-span-2 lg:col-span-auto">
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                          <span className="text-sm font-medium text-gray-300">UPDATE</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">
                          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <h3 className="text-2xl font-semibold mb-2">
                         DEPT ALLOCATED<br/>
                          <span className="text-[#10B981]">{department?.name}</span>
                        </h3>
                      </div>
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-10 -mt-10"></div>
                      <div className="absolute bottom-0 right-10 w-24 h-24 bg-[#10B981] opacity-10 rounded-full blur-xl"></div>
                    </div>
                    
                    {/* Stats Row */}
                    <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:col-span-auto">
                      <Card className="rounded-2xl shadow-sm border-none p-4">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm text-gray-500 font-medium">TUTORS / STUDENTS</span>
                          <MoreHorizontal className="w-4 h-4 text-gray-300" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">{stats.totalPeerTutors} / {stats.totalStudents}</div>
                        <div className="flex items-center text-xs text-green-500 font-medium"><ArrowUpRight className="w-3 h-3 mr-1" /><span>ALLOCATED</span></div>
                      </Card>

                      <Card className="rounded-2xl shadow-sm border-none p-4">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm text-gray-500 font-medium">ADDITIONAL CLASSES</span>
                          <MoreHorizontal className="w-4 h-4 text-gray-300" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">{stats.totalAdditionalClasses}</div>
                        <div className="flex items-center text-xs text-blue-500 font-medium"><ArrowUpRight className="w-3 h-3 mr-1" /><span>TOTAL CLASSES</span></div>
                      </Card>
                    </div>


                    {/* Weekly Activity */}
                    <Card className="rounded-2xl shadow-sm border-none md:col-span-1 lg:col-span-auto">
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div>
                          <CardTitle className="text-lg font-semibold">WEEKLY ACTIVITY</CardTitle>
                          <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#1C2434]"></span><span className="text-xs text-gray-500">ClASSES</span></div>
                          </div>
                        </div>
                        <div className="text-right">
                           <p className="text-xl font-bold text-gray-900">{stats.currentWeekTotal}</p>
                           <span className={`text-xs flex justify-end items-center ${stats.weeklyChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                             {stats.weeklyChange >= 0 ? <ArrowUpRight size={12} className="mr-1"/> : <ArrowDownRight size={12} className="mr-1"/>} 
                             {stats.weeklyChange > 0 ? '+' : ''}{stats.weeklyChange}%
                           </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[200px] w-full mt-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.weeklyActivity} barSize={12}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9CA3AF'}} dy={10} />
                              <RechartsTooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                              <Bar dataKey="classes" fill="#1C2434" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                  </div>

                  {/* --- MIDDLE COLUMN --- */}
                  <div className="lg:col-span-5 md:contents lg:block space-y-6">
                                        {/* Year Overview */}
                    <Card className="rounded-2xl shadow-sm border-none md:col-span-2 lg:col-span-auto">
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg font-semibold">YEAR OVERVIEW</CardTitle>
                        <MoreHorizontal className="w-5 h-5 text-gray-400 cursor-pointer" />
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-6 mt-2">
                          {stats.yearStats.map((yearStat) => (
                            <div key={yearStat.year} className="group cursor-pointer" onClick={() => handleYearClick(yearStat.year)}>
                               <div className="flex justify-between items-center mb-1">
                                 <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">Year {yearStat.year}</span>
                                 <span className="text-xs text-gray-500">{yearStat.count} Classes</span>
                               </div>
                               <div className="relative w-full h-3">
                                 <svg width="100%" height="100%" viewBox="0 0 100 10" preserveAspectRatio="none" className="overflow-visible">
                                   <path d="M0 5 Q 12.5 0, 25 5 T 50 5 T 75 5 T 100 5" fill="none" stroke="#F1F5F9" strokeWidth="6" strokeLinecap="round" />
                                   <path d="M0 5 Q 12.5 0, 25 5 T 50 5 T 75 5 T 100 5" fill="none" stroke="#84CC16" strokeWidth="6" strokeLinecap="round"
                                     pathLength="100" strokeDasharray="100" strokeDashoffset={100 - Math.max(yearStat.percentage, 0)}
                                     className="transition-all duration-1000 ease-out group-hover:stroke-blue-500" />
                                 </svg>
                               </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    
                    {/* Recent Sessions */}
                    <Card className="rounded-2xl shadow-sm border-none overflow-hidden md:col-span-2 lg:col-span-auto">
                      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-gray-50">
                        <CardTitle className="text-xl font-semibold text-gray-900">RECENT SESSIONS</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="divide-y divide-gray-50">
                          {stats.recentClasses.length > 0 ? (
                            stats.recentClasses.map((cls, i) => {
                              let color = '#EF4444' // Red
                              if (cls.percentage === 100) color = '#10B981' // Green
                              else if (cls.percentage >= 50) color = '#F59E0B' // Yellow
                              const radius = 18
                              const circumference = 2 * Math.PI * radius
                              const offset = circumference - (cls.percentage / 100) * circumference

                              return (
                                <div key={i} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors duration-150">
                                  <div className="flex items-center gap-4">
                                    <div className="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
                                      <svg className="transform -rotate-90 w-12 h-12">
                                        <circle cx="24" cy="24" r={radius} stroke="#F3F4F6" strokeWidth="4" fill="transparent" />
                                        <circle cx="24" cy="24" r={radius} stroke={color} strokeWidth="4" fill="transparent"
                                          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
                                          className="transition-all duration-1000 ease-out" />
                                      </svg>
                                      <span className="absolute text-[10px] font-bold text-gray-700">{cls.percentage}%</span>
                                    </div>
                                    <div>
                                      <h4 className="text-sm font-semibold text-gray-900 leading-none mb-1.5">{cls.subject_name}</h4>
                                      <p className="text-xs text-gray-500 font-medium flex items-center"><span className="opacity-70 mr-1">YEAR - {cls.year}</span></p>
                                    </div>
                                  </div>
                                  <div className="text-xs font-medium text-gray-400">
                                    {new Date(cls.scheduled_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                                  </div>
                                </div>
                              )
                            })
                          ) : (
                            <div className="p-8 text-center text-sm text-gray-500">No previous sessions available</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Additional Classes */}
                    <Card className="rounded-2xl shadow-sm border-none overflow-hidden md:col-span-2 lg:col-span-auto">
                       <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-gray-100">
                          <CardTitle className="text-lg font-semibold">Additional Classes</CardTitle>
                          <MoreHorizontal className="w-5 h-5 text-gray-400 cursor-pointer" />
                       </CardHeader>
                       <CardContent className="pt-6">
                          <div className="flex flex-row items-end justify-between">
                            <div className="flex flex-col justify-end">
                              <span className="text-5xl font-bold text-[#1C2434] italic leading-none mb-1">
                                {stats.totalAdditionalClasses < 10 ? `0${stats.totalAdditionalClasses}` : stats.totalAdditionalClasses}
                              </span>
                            </div>
                            <div className="flex flex-row items-end justify-end gap-3 sm:gap-6 h-[70px] pb-1">
                               {stats.additionalClassesByYear.map((item, index) => {
                                 const maxCount = Math.max(...stats.additionalClassesByYear.map(i => i.count), 1);
                                 const heightPx = (item.count / maxCount) * 50;
                                 return (
                                   <div key={index} className="flex flex-col items-center gap-2 group min-w-[30px]">
                                      <div className="w-5 sm:w-6 bg-[#8B5CF6] rounded-t-full transition-all duration-500 group-hover:bg-[#7C3AED]" style={{ height: `${Math.max(heightPx, 4)}px` }}></div>
                                      <div className="text-center leading-none">
                                        <span className="text-xs text-gray-900 font-bold block mb-1">{item.count}</span>
                                        <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Year {item.year}</span>
                                      </div>
                                   </div>
                                 )
                               })}
                            </div>
                          </div>
                       </CardContent>
                    </Card>

                  </div>


                  {/* --- RIGHT COLUMN --- */}
                  <div className="lg:col-span-3 md:contents lg:block space-y-6">
                    
                    {/* Class Status */}
                    <Card className="rounded-2xl shadow-sm border-none md:col-span-1 lg:col-span-auto flex flex-col">
                      <CardHeader className="pb-2 border-b border-gray-100 mb-0 relative z-10 bg-white rounded-t-2xl">
                        <CardTitle className="text-lg font-semibold text-left">CLASS STATUS </CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 flex flex-col items-center justify-start pb-6 pt-0">
                        <div className="relative w-full h-[180px] -mt-12">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart margin={{ top: 0, left: 0, right: 0, bottom: 0 }}>
                              <defs>
                                 <pattern id="stripePattern" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                                   <rect width="3" height="6" transform="translate(0,0)" fill="#9CA3AF" opacity="0.4" />
                                 </pattern>
                              </defs>
                              <Pie data={[{ value: 100 }]} cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius="65%" outerRadius="90%" paddingAngle={0} dataKey="value" stroke="none" isAnimationActive={false}>
                                 <Cell fill="url(#stripePattern)" />
                              </Pie>
                              <Pie data={[{ value: stats.attendanceRate + (stats.inProgressClasses > 0 ? (stats.inProgressClasses / stats.totalClasses * 100) : 0) }, { value: 100 - (stats.attendanceRate + (stats.inProgressClasses > 0 ? (stats.inProgressClasses / stats.totalClasses * 100) : 0)) }]} cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius="65%" outerRadius="90%" paddingAngle={0} dataKey="value" stroke="none" cornerRadius={10}>
                                <Cell fill="#14532d" />
                                <Cell fill="transparent" />
                              </Pie>
                              <Pie data={[{ value: stats.attendanceRate }, { value: 100 - stats.attendanceRate }]} cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius="65%" outerRadius="90%" paddingAngle={0} dataKey="value" stroke="none" cornerRadius={10}>
                                <Cell fill="#15803d" />
                                <Cell fill="transparent" />
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end">
                            <span className="text-3xl font-bold text-gray-900 tracking-tight">{stats.attendanceRate}%</span>
                            <span className="text-xs text-gray-500 font-medium mt-1">CLASSES</span>
                          </div>
                        </div>
                        <div className="w-full mt-6 flex justify-center items-center gap-6 text-xs">
                           <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#15803d]"></span><span className="text-gray-700 font-medium">Completed</span></div>
                           <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-gray-300 bg-opacity-50 border border-gray-300 overflow-hidden relative">
                                 <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iMiIgaGVpZ2h0PSI0IiBmaWxsPSIjOUNBM0FGIiBvcGFjaXR5PSIwLjMiLz4KPC9zdmc+')]"></div>
                              </span>
                              <span className="text-gray-400">Pending</span>
                           </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Guides */}
                    <Card className="rounded-2xl shadow-sm border-none md:col-span-1 lg:col-span-auto">
                       <CardContent className="pt-6">
                          <Button variant="outline" className="w-full justify-between group hover:border-blue-500 hover:text-blue-600" onClick={() => router.push('/faculty/renumeration')}>
                            Renumeration <ChevronRight size={16} className="text-gray-400 group-hover:text-blue-600" />
                          </Button>
                          <Button variant="outline" className="w-full justify-between mt-3 group hover:border-blue-500 hover:text-blue-600" onClick={() => router.push('/faculty/analytics')}>
                            Analytics & Reports <ChevronRight size={16} className="text-gray-400 group-hover:text-blue-600" />
                          </Button>
                       </CardContent>
                    </Card>

                    {/* Today's Classes */}
                    <Card className="rounded-2xl shadow-sm border-none md:col-span-1 lg:col-span-auto flex flex-col overflow-hidden">
                       <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-gray-100">
                          <CardTitle className="text-lg font-semibold">TODAY'S CLASSES</CardTitle>
                          <div className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {new Date().toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                          </div>
                       </CardHeader>
                       <CardContent className="pt-6">
                          {stats.todaysClasses.total > 0 ? (
                            <div className="flex flex-row items-end justify-between">
                              <div className="flex flex-col justify-end">
                                <span className="text-5xl font-bold text-[#1C2434] italic leading-none mb-1">
                                  {stats.todaysClasses.total < 10 ? `0${stats.todaysClasses.total}` : stats.todaysClasses.total}
                                </span>
                                <span className="text-xs text-gray-500 font-medium">Total Classes</span>
                              </div>
                              <div className="flex flex-col items-end justify-end gap-2 h-[70px] pb-1">
                                <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
                                  <svg className="transform -rotate-90 w-16 h-16">
                                    <circle cx="32" cy="32" r="24" stroke="#F3F4F6" strokeWidth="5" fill="transparent" />
                                    <circle cx="32" cy="32" r="24" stroke="#10B981" strokeWidth="5" fill="transparent"
                                      strokeDasharray={2 * Math.PI * 24} 
                                      strokeDashoffset={2 * Math.PI * 24 * (1 - stats.todaysClasses.percentage / 100)} 
                                      strokeLinecap="round"
                                      className="transition-all duration-1000 ease-out" />
                                  </svg>
                                  <span className="absolute text-xs font-bold text-gray-700">{stats.todaysClasses.percentage}%</span>
                                </div>
                                <span className="text-xs text-gray-400 font-medium">Completed</span>
                              </div>
                            </div>
                          ) : (
                            <div className="h-[70px] flex flex-col items-center justify-center text-center">
                               <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-2">
                                 <GraduationCap className="text-gray-300 w-6 h-6" />
                               </div>
                               <p className="text-sm font-medium text-gray-900">No Classes Today</p>
                               <p className="text-xs text-gray-500 mt-1 max-w-[150px]">Relax! There are no peer tutor sessions scheduled for today.</p>
                            </div>
                          )}
                       </CardContent>
                    </Card>

                  </div>
                </div>
            </main>
          </>
        )}
      </div>
    </div>
  )
}
