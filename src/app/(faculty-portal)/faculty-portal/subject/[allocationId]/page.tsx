'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import PageHeader from '@/components/layout/PageHeader'
import { Card } from '@/components/ui'
import { Users, Calendar, CheckCircle, Clock, BookOpen, User, ArrowLeft, BarChart3 } from 'lucide-react'
import Link from 'next/link'

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable } from '@/components/ui'

export default function SubjectDetailView() {
  const params = useParams()
  const router = useRouter()
  const allocationId = params.allocationId as string
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedTutorId, setSelectedTutorId] = useState<string | null>(null)

  // 1. Fetch Allocation Details
  const { data: allocation, isLoading: isAllocationLoading } = useQuery({
    queryKey: ['faculty-allocation', allocationId],
    queryFn: async () => FacultyService.getFacultyAllocationById(allocationId),
    enabled: !!allocationId
  })

  // 2. Fetch Peer Tutors for this Section
  const { data: peerTutors, isLoading: isTutorsLoading } = useQuery({
    queryKey: ['peer-tutors-section', allocation?.dept, allocation?.year, allocation?.section],
    queryFn: async () => {
      if (!allocation) return []
      return await peertutorservice.getpeerTutorBySection(allocation.dept, allocation.year, allocation.section)
    },
    enabled: !!allocation
  })

  // 3. Fetch Scheduled Classes (filtered by subject)
  const { data: classes, isLoading: isClassesLoading } = useQuery({
      queryKey: ['scheduled-classes-subject', allocation?.dept, allocation?.year, allocation?.section, allocation?.subject_name],
      queryFn: async () => {
          if (!allocation) return []
          // Fetch all classes for section, then filter by subject
          const allClasses = await ScheduledClassService.getScheduledClassesByYearSection(
              allocation.dept, 
              allocation.year, 
              allocation.section
          )
          
          // Filter logic: Check if the class's subject_name matches the allocation's subject_name
          return allClasses.filter(c => c.class?.subject_name === allocation.subject_name)
      },
      enabled: !!allocation
  })

  // 4. Fetch Additional Classes (filtered by subject & section)
  const { data: additionalClasses, isLoading: isAdditionalLoading } = useQuery({
      queryKey: ['additional-classes-subject', allocation?.dept, allocation?.year, allocation?.section, allocation?.subject_name],
      queryFn: async () => {
          if (!allocation) return []
          // Fetch all additional classes for department
          const allDeptClasses = await AdditionalClassService.getAllAdditionalClassesForDepartment(allocation.dept)
          
          // Filter by year, section, and subject
          // Filter by year, section, and subject
          return allDeptClasses.filter(ac => {
            const pt = (ac as any).peer_tutors
            return (
              pt?.year === allocation.year &&
              pt?.section === allocation.section &&
              ac.subject_name === allocation.subject_name
            )
          })
      },
      enabled: !!allocation
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    // Invalidate queries or refetch relevant data
    // For simplicity, we just reload the page or let RQ handle cache invalidation
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const isLoading = isAllocationLoading || isTutorsLoading || isClassesLoading || isAdditionalLoading

  // Merge and Filter Classes
  const allLogs = [
    ...(classes || []).map(c => ({ ...c, type: 'scheduled' as const, date: new Date(c.scheduled_date) })),
    ...(additionalClasses || []).map(c => ({ ...c, type: 'additional' as const, date: new Date(c.class_date) }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime())

  const filteredLogs = selectedTutorId 
    ? allLogs.filter(c => 
        c.type === 'scheduled' 
          ? (c as any).peer_tutor?.id === selectedTutorId
          : (c as any).peer_tutor_id === selectedTutorId
      )
    : allLogs

  if (isLoading) {
      return (
          <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          </div>
      )
  }

  if (!allocation) {
      return (
          <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4">
              <h2 className="text-xl font-bold text-gray-900">Subject Not Found</h2>
              <button onClick={() => router.back()} className="mt-4 text-emerald-600 hover:underline">
                  Go Back
              </button>
          </div>
      )
  }

  // Calculate Stats
  const totalClasses = (classes?.length || 0) + (additionalClasses?.length || 0)
  const completedScheduled = classes?.filter(c => c.completion_status === 'completed' || (c.attendance_completed && c.topics_completed))?.length || 0
  const totalCompleted = completedScheduled + (additionalClasses?.length || 0) // Additional classes are always "completed"
  const completionRate = totalClasses > 0 ? Math.round((totalCompleted / totalClasses) * 100) : 0

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      <PageHeader
        title={allocation.subject_name}
        context={`${allocation.dept} • Year ${allocation.year} • Sec ${allocation.section}`}
        tagline="Peer Tutor Dashboard"
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        showRefresh={true}
      >
        <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors mr-4"
        >
            <ArrowLeft className="w-4 h-4" />
            BACK
        </button>
      </PageHeader>

      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto w-full space-y-8">
            
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
                            <BookOpen className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Completion</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-gray-900">{completionRate}%</span>
                        <span className="text-sm font-medium text-gray-500">syllabus covered</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full mt-4 overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${completionRate}%` }}></div>
                    </div>
                </Card>

                <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                            <Users className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Peer Tutors</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-gray-900">{peerTutors?.length || 0}</span>
                        <span className="text-sm font-medium text-gray-500">active tutors</span>
                    </div>
                    <div className="flex -space-x-2 mt-4">
                        {peerTutors?.slice(0, 5).map((tutor) => (
                            <div key={tutor.id} title={tutor.name} className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-xs font-bold text-gray-600">
                                {tutor.name.charAt(0)}
                            </div>
                        ))}
                    </div>
                </Card>

                <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
                            <Clock className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Classes</span>
                    </div>

                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-gray-900">{totalCompleted}</span>
                        <span className="text-sm font-medium text-gray-500">/ {totalClasses} classes done</span>
                    </div>
                    <div className="mt-4 text-xs font-bold text-purple-600 uppercase tracking-wide">
                        See detailed logs &rarr;
                    </div>
                </Card>
            </div>

            {/* Peer Tutors Table */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 overflow-hidden">
                <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <User className="w-5 h-5 text-gray-400" />
                    Assigned Peer Tutors
                </h3>
                
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50">
                        <TableHead>Peer Tutor</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-center">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {peerTutors && peerTutors.length > 0 ? (
                        peerTutors.map((tutor) => (
                          <TableRow 
                            key={tutor.id} 
                            className={`cursor-pointer transition-colors ${selectedTutorId === tutor.id ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
                            onClick={() => setSelectedTutorId(selectedTutorId === tutor.id ? null : tutor.id)}
                          >
                            <TableCell className="font-medium text-gray-900">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                  {tutor.name.charAt(0)}
                                </div>
                                {tutor.name}
                              </div>
                            </TableCell>
                            <TableCell className="text-gray-500">{tutor.email}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                {tutor.dept}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                               {selectedTutorId === tutor.id ? (
                                 <span className="text-blue-600 text-xs font-bold uppercase tracking-wider">Viewing Logs</span>
                               ) : (
                                 <span className="text-gray-400 text-xs font-bold uppercase tracking-wider group-hover:text-gray-600">View Logs</span>
                               )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <EmptyTable title="No Peer Tutors" description="No peer tutors assigned to this section yet." />
                      )}
                    </TableBody>
                  </Table>
                </div>
            </div>

            {/* Class Logs (Cards) */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-400" />
                        {selectedTutorId ? 'Filtered Class Logs' : 'All Class Logs'}
                        <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded-lg text-xs ml-2">
                          {filteredLogs?.length || 0}
                        </span>
                    </h3>
                    
                    {selectedTutorId && (
                      <button 
                        onClick={() => setSelectedTutorId(null)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wide bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Clear Filter
                      </button>
                    )}
                </div>
                
                {filteredLogs && filteredLogs.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredLogs.map((cls) => {
                           const isScheduled = cls.type === 'scheduled'
                           const isCompleted = isScheduled 
                              ? (cls as any).completion_status === 'completed' || ((cls as any).attendance_completed && (cls as any).topics_completed)
                              : true // Additional classes always completed
                           
                           const dateObj = isScheduled ? new Date((cls as any).scheduled_date) : new Date((cls as any).class_date)
                           const topics = isScheduled ? (cls as any).topics : (cls as any).topic
                           const peerTutorName = isScheduled ? (cls as any).peer_tutor?.name : (peerTutors?.find(p => p.id === (cls as any).peer_tutor_id)?.name || 'Unknown')

                           return (
                           <div 
                               key={`${cls.type}-${cls.id}`}
                               className="bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group relative overflow-hidden"
                           >
                                <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-[4rem] -mr-6 -mt-6 transition-transform group-hover:scale-110 ${
                                    isCompleted
                                    ? (isScheduled ? 'bg-emerald-50' : 'bg-purple-50')
                                    : 'bg-orange-50'
                                }`}></div>
                                
                                <div className="relative z-10">
                                   <div className="flex justify-between items-start mb-4">
                                       <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${
                                            isCompleted
                                            ? (isScheduled ? 'bg-emerald-500' : 'bg-purple-500')
                                            : 'bg-orange-400'
                                       }`}>
                                           {dateObj.getDate()}
                                       </div>
                                       <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                                            isCompleted
                                            ? (isScheduled ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700')
                                            : 'bg-orange-50 text-orange-700'
                                       }`}>
                                           {isScheduled 
                                              ? (isCompleted ? 'Completed' : 'Pending')
                                              : 'Additional'}
                                       </span>
                                   </div>
                                   
                                   <div className="mb-6">
                                       <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                                           {dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', year: 'numeric' })}
                                       </p>
                                       <h4 className="text-base font-bold text-gray-900 line-clamp-2 min-h-[3rem]">
                                           {topics || 'No topics recorded'}
                                       </h4>
                                   </div>

                                   {(peerTutorName) && (
                                     <div className="flex items-center gap-3 pt-4 border-t border-gray-50">
                                         <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                                             {peerTutorName.charAt(0)}
                                         </div>
                                         <div className="flex flex-col">
                                             <span className="text-xs font-bold text-gray-900">{peerTutorName}</span>
                                             <span className="text-[10px] text-gray-500">Peer Tutor</span>
                                         </div>
                                     </div>
                                   )}
                                </div>
                           </div>
                        )})}
                    </div>
                ) : (
                    <div className="bg-white rounded-[2rem] p-12 text-center border border-dashed border-gray-200">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                            <Calendar className="w-8 h-8" />
                        </div>
                        <h3 className="text-gray-900 font-bold text-lg mb-1">No Classes Found</h3>
                        <p className="text-gray-500 text-sm">
                            {selectedTutorId 
                                ? "This peer tutor hasn't conducted any classes for this subject yet." 
                                : "No classes have been scheduled for this section yet."}
                        </p>
                        {selectedTutorId && (
                           <button 
                               onClick={() => setSelectedTutorId(null)}
                               className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-bold"
                           >
                               View All Classes
                           </button>
                        )}
                    </div>
                )}
            </div>

        </div>
      </main>
    </div>
  )
}
