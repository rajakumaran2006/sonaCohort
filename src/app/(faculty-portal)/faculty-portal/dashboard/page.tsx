'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import PageHeader from '@/components/layout/PageHeader'
import { BookOpen, Users, ArrowRight, Calendar } from 'lucide-react'

export default function FacultyPortalDashboard() {
  const { user } = useAuth()
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { data: assignments, isLoading, refetch } = useQuery({
    queryKey: ['faculty-assignments', user?.email],
    queryFn: async () => {
      if (!user?.email) return []
      return await FacultyService.getDashboardStats(user.email)
    },
    enabled: !!user?.email
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetch()
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const handleSubjectClick = (assignmentId: string) => {
    router.push(`/faculty-portal/subject/${assignmentId}`)
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      <PageHeader
        title="MY SUBJECTS"
        tagline="Manage your assigned classes & peer tutors"
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        showRefresh={true}
      />

      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto w-full">

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-48 bg-gray-200 animate-pulse rounded-2xl"></div>
                    ))}
                </div>
            ) : assignments && assignments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {assignments.map((assignment) => (
                        <div 
                            key={assignment.id}
                            onClick={() => handleSubjectClick(assignment.id)}
                            className="bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 cursor-pointer group relative overflow-hidden"
                        >
                             <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-[4rem] -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                             
                             <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-12 h-12 rounded-2xl bg-black flex items-center justify-center text-white group-hover:bg-black group-hover:text-white transition-colors">
                                        <BookOpen className="w-6 h-6" />
                                    </div>
                                    <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                                        {assignment.dept}
                                    </span>
                                </div>
                                
                                <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-2 group-hover:text-emerald-700 transition-colors h-14">
                                    {assignment.subject_name}
                                </h3>
                                
                                <div className="flex items-center gap-4 text-xs font-medium text-gray-500 mb-4">
                                    <span className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5" />
                                        Year {assignment.year}
                                    </span>
                                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                    <span className="flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5" />
                                        Section {assignment.section}
                                    </span>
                                </div>

                                {/* New Stats Section */}
                                <div className="mb-6 space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-500 font-medium flex items-center gap-1.5">
                                            <Users className="w-3.5 h-3.5 text-emerald-600" />
                                            Peer Tutors Assigned
                                        </span>
                                        <span className="font-bold text-gray-900 bg-emerald-50 px-2 py-0.5 rounded-md text-emerald-700">
                                            {assignment.peerTutorsCount || 0}
                                        </span>
                                    </div>
                                    
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-xs items-end">
                                            <span className="font-medium text-gray-500">Completion</span>
                                            <span className="font-bold text-gray-900">{assignment.completionPercentage || 0}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                                style={{ width: `${assignment.completionPercentage || 0}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-50">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-emerald-600 transition-colors">
                                        View Dashboard
                                    </span>
                                    <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                        <ArrowRight className="w-4 h-4" />
                                    </div>
                                </div>
                             </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border border-dashed border-gray-200">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <BookOpen className="w-8 h-8 text-gray-300" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">No Assigned Subjects</h3>
                    <p className="text-gray-500 text-sm max-w-sm text-center">
                        You don&apos;t have any subjects assigned to you yet. Please contact your department head.
                    </p>
                </div>
            )}
        </div>
      </main>
    </div>
  )
}
