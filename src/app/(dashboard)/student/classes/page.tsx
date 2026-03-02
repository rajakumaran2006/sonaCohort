'use client'

import React, { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import StudentProtectedRoute from '@/components/auth/StudentProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { useStudentAttendanceData } from '@/lib/hooks/useStudentDashboardData'
import { StudentService } from '@/lib/services/studentService'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, StatusBadge } from '@/components/ui'
import { Calendar, Search, Filter, Beaker, BookOpen } from 'lucide-react'
import { format } from 'date-fns'
import { AttendanceHistoryRecord } from '@/lib/services/attendanceService'

export default function StudentClassesPage() {
  return (
    <StudentProtectedRoute>
      <StudentClassesContent />
    </StudentProtectedRoute>
  )
}

function StudentClassesContent() {
  const { user } = useAuth()
  const [isSidebarCollapsed] = useSidebarCollapsed()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSubject, setFilterSubject] = useState('')

  // Fetch student profile
  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ['studentProfile', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await StudentService.getStudentWithPeerTutorByEmail(user.email)
    },
    enabled: !!user?.email
  })

  // Fetch full attendance history
  const { data: attendanceData, isLoading: attendanceLoading, refetch } = useStudentAttendanceData(student?.id)

  const handleRefresh = async () => {
    await refetch()
  }

  const loading = studentLoading || attendanceLoading

  // Filter records
  const filteredRecords = React.useMemo(() => {
    if (!attendanceData?.records) return []
    
    return attendanceData.records.filter((record: AttendanceHistoryRecord) => {
      const className = record.classes?.subject_name || 'Class Session'
      const topics = record.scheduled_classes?.topics || record.classes?.topics || ''
      const searchMatch = 
        className.toLowerCase().includes(searchTerm.toLowerCase()) ||
        topics.toLowerCase().includes(searchTerm.toLowerCase())
        
      const subjectMatch = filterSubject ? className === filterSubject : true
      
      return searchMatch && subjectMatch
    })
  }, [attendanceData?.records, searchTerm, filterSubject])

  // Get unique subjects for filter
  const uniqueSubjects = React.useMemo(() => {
    if (!attendanceData?.records) return []
    const subjects = new Set<string>()
    attendanceData.records.forEach((record: AttendanceHistoryRecord) => {
      if (record.classes?.subject_name) {
        subjects.add(record.classes.subject_name)
      }
    })
    return Array.from(subjects).sort()
  }, [attendanceData?.records])

  if (loading) {
    return (
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen bg-[#F8F9FA] flex flex-col justify-center items-center`}>
         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
         <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading Classes...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
        <PageHeader
          title="MY CLASSES"
          tagline="Attendance & Topics History"
          onRefresh={handleRefresh}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto space-y-6">
            
            {/* Controls Row */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
               <div className="flex flex-1 w-full sm:w-auto gap-4">
                 {/* Search Box */}
                 <div className="relative flex-1 max-w-md">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                     <Search className="h-4 w-4 text-gray-400" />
                   </div>
                   <input
                     type="text"
                     placeholder="Search subjects or topics..."
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-xl leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
                   />
                 </div>
                 
                 {/* Filter Dropdown */}
                 <div className="relative">
                    <select
                      value={filterSubject}
                      onChange={(e) => setFilterSubject(e.target.value)}
                      className="block w-full pl-3 pr-10 py-2 text-sm border border-gray-200 rounded-xl leading-5 bg-gray-50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none font-medium text-gray-700 transition-all cursor-pointer"
                    >
                      <option value="">All Subjects</option>
                      {uniqueSubjects.map(subject => (
                         <option key={subject} value={subject}>{subject}</option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                       <Filter className="h-4 w-4 text-gray-400" />
                    </div>
                 </div>
               </div>
               
               <div className="flex items-center gap-2">
                 <div className="px-4 py-2 bg-blue-600 rounded-xl border border-blue-100 flex gap-2 items-center">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                       {filteredRecords.length} Records found
                    </span>
                 </div>
               </div>
            </div>

            {/* Classes Table */}
            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
               {filteredRecords.length > 0 ? (
                 <div className="overflow-x-auto">
                   <Table>
                     <TableHeader>
                       <TableRow className="bg-gray-50 border-b border-gray-100">
                         <TableHead className="py-5 px-6 whitespace-nowrap"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</span></TableHead>
                         <TableHead className="py-5 px-6"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subject & Topic</span></TableHead>
                         <TableHead className="py-5 px-6"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</span></TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                        {filteredRecords.map((record: AttendanceHistoryRecord) => {
                          const className = record.classes?.subject_name || 'Class Session'
                         const topics = record.scheduled_classes?.topics || record.classes?.topics || 'No topic specified'
                         const date = record.scheduled_classes?.scheduled_date || record.classes?.created_at || record.created_at
                         const formattedDate = date ? format(new Date(date), 'MMM d, yyyy') : 'Unknown Date'
                         const isAdditional = !record.scheduled_classes
                         
                         return (
                           <TableRow key={record.id} className="hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0">
                             <TableCell className="px-6 py-4">
                               <div className="flex items-center gap-3">
                                 <div className={`p-2 rounded-xl flex items-center justify-center ${isAdditional ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                                    {isAdditional ? <Beaker className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                                 </div>
                                 <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{formattedDate}</span>
                               </div>
                             </TableCell>
                             <TableCell className="px-6 py-4">
                               <div className="flex flex-col">
                                 <span className="text-sm font-bold text-gray-900 mb-1 leading-tight">{className}</span>
                                 <span className="text-xs font-medium text-gray-500 line-clamp-2">{topics}</span>
                                 {isAdditional && (
                                   <span className="inline-block mt-2 text-[9px] font-bold px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md uppercase tracking-wider w-fit">
                                     Additional Session
                                   </span>
                                 )}
                               </div>
                             </TableCell>
                             <TableCell className="px-6 py-4">
                               <StatusBadge status={record.status === 'present' ? 'approved' : 'pending'}>
                                 {record.status === 'present' ? 'Attended' : 'Absent'}
                               </StatusBadge>
                             </TableCell>
                           </TableRow>
                         )
                       })}
                     </TableBody>
                   </Table>
                 </div>
               ) : (
                 <div className="py-12">
                   <EmptyState
                     title="No Classes Found"
                     description={searchTerm || filterSubject ? "No classes match your current filters." : "You have no recorded class attendance history."}
                     icon={<BookOpen className="w-12 h-12 text-gray-300" />}
                   />
                 </div>
               )}
            </div>

          </div>
        </main>
      </div>
    </div>
  )
}
