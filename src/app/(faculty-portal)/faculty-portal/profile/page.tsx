'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FacultyService } from '@/lib/services/facultyService'
import PageHeader from '@/components/layout/PageHeader'
import ChangePassword from '@/components/profile/ChangePassword'
import { BookOpen, User, Users, Calendar } from 'lucide-react'

export default function FacultyPortalProfile() {
  const { user } = useAuth()
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

  // Calculate unique departments and subjects
  const uniqueDepartments = Array.from(new Set(assignments?.map(a => a.dept) || []))
  const uniqueSubjects = Array.from(new Set(assignments?.map(a => a.subject_name) || []))

  // Helper to get initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || 'Faculty Member'
  const userInitials = getInitials(userName)

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      <PageHeader
        title="MY PROFILE"
        tagline="Manage your account settings & overview"
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        showRefresh={true}
      />

      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full space-y-8">
          
          {/* Profile Overview Section */}
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 hover:shadow-md transition-all">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
              {/* Profile Picture */}
              <div className="flex-shrink-0">
                <div className="relative">
                  <div className="h-32 w-32 rounded-full bg-[#1e293b] flex items-center justify-center ring-4 ring-emerald-400 shadow-lg">
                    <span className="text-4xl font-bold text-white tracking-widest">
                      {userInitials}
                    </span>
                  </div>
                  <div className="absolute bottom-2 right-2 h-6 w-6 rounded-full bg-emerald-400 shadow-sm border-2 border-white"></div>
                </div>
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center md:text-left flex flex-col pt-2">
                <h2 className="text-3xl font-black text-gray-900 mb-2">
                  {userName}
                </h2>
                <div className="flex items-center justify-center md:justify-start gap-2 text-sm text-gray-500 mb-4">
                  <div className="p-1 bg-gray-100 rounded-lg">
                    <User className="w-3.5 h-3.5 text-gray-500" />
                  </div>
                  {user?.email}
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-auto pt-4 border-t border-gray-50">
                   {uniqueDepartments.map(dept => (
                      <span key={dept} className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold bg-black text-white uppercase tracking-wider">
                         {dept}
                      </span>
                   ))}
                   {uniqueDepartments.length === 0 && !isLoading && (
                      <span className="text-xs text-gray-400 italic">No departments assigned</span>
                   )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-4 mt-4 md:mt-2">
                <ChangePassword />
              </div>
            </div>
          </div>

          {/* Detailed Stats / Assignments Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Subjects Card */}
             <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
               <div className="flex justify-between items-start mb-6">
                 <div>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Subjects Handled</p>
                   <p className="text-2xl font-black text-gray-900">{uniqueSubjects.length}</p>
                 </div>
                 <div className="p-3 bg-gray-50 rounded-2xl">
                   <BookOpen className="w-5 h-5 text-gray-400" />
                 </div>
               </div>
               
               <div className="space-y-3 mt-4 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                  {isLoading ? (
                    <div className="animate-pulse space-y-2">
                       <div className="h-8 bg-gray-100 rounded-lg w-full"></div>
                       <div className="h-8 bg-gray-100 rounded-lg w-3/4"></div>
                    </div>
                  ) : uniqueSubjects.length > 0 ? (
                    uniqueSubjects.map((sub, idx) => (
                       <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/80 border border-gray-100/50">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                          <span className="text-xs font-bold text-gray-700">{sub}</span>
                       </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-gray-400 text-xs font-medium bg-gray-50 rounded-xl border border-dashed border-gray-200">
                       No subjects assigned
                    </div>
                  )}
               </div>
             </div>

             {/* Classes Overview Card */}
             <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex flex-col">
               <div className="flex justify-between items-start mb-6">
                 <div>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Classes</p>
                   <p className="text-2xl font-black text-gray-900">{assignments?.length || 0}</p>
                 </div>
                 <div className="p-3 bg-gray-50 rounded-2xl">
                   <Calendar className="w-5 h-5 text-gray-400" />
                 </div>
               </div>
               
               {/* Compute total peer tutors indirectly from assignments */}
               {(() => {
                  const totalPeerTutors = assignments?.reduce((acc, curr) => acc + (curr.peerTutorsCount || 0), 0) || 0;
                  return (
                    <div className="mt-auto bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                      <div className="flex items-center gap-3 mb-1">
                        <Users className="w-4 h-4 text-emerald-600" />
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Assigned Peer Tutors</span>
                      </div>
                      <p className="text-xl font-black text-emerald-900">{totalPeerTutors}</p>
                    </div>
                  )
               })()}
             </div>
          </div>
        </div>
      </main>
    </div>
  )
}
