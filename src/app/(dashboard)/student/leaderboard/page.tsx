'use client'

import React, { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import StudentProtectedRoute from '@/components/auth/StudentProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { useStudentLeaderboard } from '@/lib/hooks/useStudentDashboardData'
import { StudentService } from '@/lib/services/studentService'
import { useQuery } from '@tanstack/react-query'
import PeerLeaderboard from '@/components/dashboard/PeerLeaderboard'

export default function StudentLeaderboardPage() {
  return (
    <StudentProtectedRoute>
      <StudentLeaderboardContent />
    </StudentProtectedRoute>
  )
}

function StudentLeaderboardContent() {
  const { user } = useAuth()
  const [isSidebarCollapsed] = useSidebarCollapsed()
  const [selectedYear, setSelectedYear] = useState<string>('all')
  
  // Fetch student profile
  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ['studentProfile', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      // Use efficient fetching instead of getAll
      return await StudentService.getStudentWithPeerTutorByEmail(user.email)
    },
    enabled: !!user?.email
  })

  // Fetch full leaderboard
  const { data: leaderboardData, isLoading: leaderboardLoading, refetch } = useStudentLeaderboard(student, selectedYear)

  const handleRefresh = async () => {
    await refetch()
  }

  const loading = studentLoading || leaderboardLoading

  // Get available years for filtering if available
  const availableYears = ['1', '2', '3', '4']

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col w-full lg:w-auto`}>
        <PageHeader
          title="LEADERBOARD"
          tagline="Top performing tutors based on weighted scores"
          onRefresh={handleRefresh}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <div className="max-w-[800px] mx-auto space-y-6 mt-4">
            {/* Year Filter */}
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-50 flex items-center justify-between">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Filter by Year</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedYear('all')}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-all ${selectedYear === 'all' ? 'bg-[#0F172A] text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  ALL
                </button>
                {availableYears.map(year => (
                  <button 
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-all ${selectedYear === year ? 'bg-[#0F172A] text-white' : 'bg-gray-100 text-gray-400'}`}
                  >
                    YEAR {year}
                  </button>
                ))}
              </div>
            </div>

            <PeerLeaderboard 
               data={leaderboardData} 
               loading={loading} 
               currentUserId={student?.id} 
            />
          </div>
        </main>
      </div>
    </div>
  )
}
