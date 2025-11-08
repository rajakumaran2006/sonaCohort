'use client'

import PeerProtectedRoute from '@/components/auth/PeerProtectedRoute'
import PeerSidebar from '@/components/layout/PeerSidebar'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/auth/AuthContext'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import { ExamService, Exam } from '@/lib/services/examService'
import { Card, CardHeader, CardTitle, CardContent, LoadingOverlay } from '@/components/ui'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { FileText, Calendar } from 'lucide-react'

export default function PeerExamsPage() {
  return (
    <PeerProtectedRoute>
      <PeerExamsContent />
    </PeerProtectedRoute>
  )
}

function PeerExamsContent() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [peerTutorYear, setPeerTutorYear] = useState<string | null>(null)

  const [isSidebarCollapsed] = useSidebarCollapsed()

  // Fetch peer tutor info
  const { data: peerTutorInfo, isLoading: isTutorLoading } = useQuery({
    queryKey: ['peer-tutor-info', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await PeerTutorAuthService.getPeerTutorByEmail(user.email)
    },
    enabled: !!user?.email,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (peerTutorInfo?.year) {
      setPeerTutorYear(peerTutorInfo.year)
    }
  }, [peerTutorInfo])

  // Fetch exams for peer tutor's year
  const { data: exams, isLoading: isExamsLoading, refetch: refetchExams } = useQuery({
    queryKey: ['peer-exams', peerTutorYear],
    queryFn: async () => {
      if (!peerTutorYear) return []
      return await ExamService.getExamsByYear(peerTutorYear)
    },
    enabled: !!peerTutorYear,
    staleTime: 5 * 60 * 1000,
  })

  const loading = isTutorLoading || isExamsLoading

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['peer-tutor-info', user?.email] }),
        queryClient.invalidateQueries({ queryKey: ['peer-exams', peerTutorYear] }),
      ])
      setLastRefresh(new Date())
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <PeerSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="transition-all duration-300 lg:ml-64 min-h-screen flex flex-col overflow-hidden">
        {/* Top Header */}
        <PageHeader
          title="EXAMS"
          lastRefresh={lastRefresh}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {loading ? (
            <LoadingOverlay className="h-96" size="xl">
              Loading exams...
            </LoadingOverlay>
          ) : (
            <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
              {exams && exams.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {exams.map((exam) => (
                    <Card
                      key={exam.id}
                      className="hover:shadow-lg transition-shadow duration-200 cursor-pointer"
                      onClick={() => router.push(`/peer/exams/${exam.id}`)}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-4">
                          <div className="flex-shrink-0">
                            <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                              <FileText className="h-6 w-6 text-blue-600" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2 truncate">
                              {exam.name}
                            </h3>
                            <div className="flex items-center text-sm text-gray-500 mb-3">
                              <Calendar className="h-4 w-4 mr-1.5" />
                              <span>{formatDate(exam.created_at)}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {peerTutorYear === '2' ? '2nd Year' : peerTutorYear === '3' ? '3rd Year' : peerTutorYear === '4' ? '4th Year' : peerTutorYear}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12">
                    <div className="text-center">
                      <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Exams Available</h3>
                      <p className="text-sm text-gray-500">
                        There are no exams assigned to your year at this time.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

