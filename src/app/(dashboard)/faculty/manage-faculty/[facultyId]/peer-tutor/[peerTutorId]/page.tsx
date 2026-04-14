'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, Mail, Clock, Loader2 } from 'lucide-react'
import { logger } from '@/lib/logger'
import { peertutorservice, peertutors } from '@/lib/services/peerTutorService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { AdditionalClassService } from '@/lib/services/additionalClassService'
import PageHeader from '@/components/layout/PageHeader'
import FacultySidebar from '@/components/layout/FacultySidebar'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { cn } from '@/lib/utils'

interface CombinedClass {
  id: string
  date: string
  topic: string
  startTime: string | null
  endTime: string | null
  type: 'Regular' | 'Additional'
  status: 'Pending' | 'Completed' | 'Upcoming'
}

export default function PeerTutorClassesPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  // const facultyEmail = decodeURIComponent(params.facultyId as string) // Unused variable removed
  const peerTutorId = params.peerTutorId as string
  const subjectName = searchParams.get('subject') || ''
  const dept = searchParams.get('dept') || ''
  const year = searchParams.get('year') || ''
  const section = searchParams.get('section') || ''

  const [loading, setLoading] = useState(true)
  const [peerTutor, setPeerTutor] = useState<peertutors | null>(null)
  const [combinedClasses, setCombinedClasses] = useState<CombinedClass[]>([])
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed] = useSidebarCollapsed()

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      // Fetch Peer Tutor Details
      const tutorData = await peertutorservice.getpeertutorsById(peerTutorId)
      if (tutorData) {
        setPeerTutor(tutorData)
      }

      // Fetch Scheduled Classes
      const scheduledClasses = await ScheduledClassService.getScheduledClassesByDate(dept, year, section, peerTutorId)
      
      // Filter scheduled classes for the specific subject
      const subjectScheduledClasses = scheduledClasses.filter((cls) => {
        const classData = Array.isArray(cls.class) ? cls.class[0] : cls.class
        return classData?.subject_name === subjectName
      })

      // Fetch Additional Classes
      const allAdditionalClasses = await AdditionalClassService.getAdditionalClassesBypeertutors(peerTutorId)
      
      // Filter additional classes for the specific subject
      const subjectAdditionalClasses = allAdditionalClasses.filter((cls) => cls.subject_name === subjectName)

      // Combine and format
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]

      const formattedScheduled: CombinedClass[] = subjectScheduledClasses.map((cls) => {
        let status: CombinedClass['status'] = 'Pending'
        const scheduledDate = cls.scheduled_date || ''
        
        if (cls.completion_status === 'completed' || (cls.attendance_completed && cls.topics_completed)) {
          status = 'Completed'
        } else if (scheduledDate <= todayStr) {
          status = 'Pending'
        } else {
          status = 'Upcoming'
        }

        return {
          id: cls.id,
          date: cls.scheduled_date,
          topic: cls.topics || 'Not specified',
          startTime: cls.start_time || null,
          endTime: cls.end_time || null,
          type: 'Regular',
          status
        }
      })

      const formattedAdditional: CombinedClass[] = subjectAdditionalClasses.map((cls) => {
        let status: CombinedClass['status'] = 'Pending'
        const classDate = cls.class_date || ''
        
        // Additional classes are usually considered completed once they happen, but let's base it on date for simplicity if no explicit status exists
        if (classDate < todayStr) {
          status = 'Completed' // Assuming past additional classes are completed
        } else if (classDate === todayStr) {
          status = 'Pending'
        } else {
          status = 'Upcoming'
        }

        return {
          id: cls.id,
          date: cls.class_date,
          topic: cls.topic || 'Not specified',
          startTime: cls.start_time || null,
          endTime: cls.end_time || null,
          type: 'Additional',
          status
        }
      })

      const allCombined = [...formattedScheduled, ...formattedAdditional]
      
      // Sort chronologically ascending
      allCombined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      setCombinedClasses(allCombined)
    } catch (error) {
      logger.error('Error loading peer tutor classes:', error)
    } finally {
      setLoading(false)
    }
  }, [peerTutorId, subjectName, dept, year, section])

  useEffect(() => {
    if (peerTutorId && subjectName && dept && year && section) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [peerTutorId, subjectName, dept, year, section, loadData])

  const formatTime = (time: string | null) => {
    if (!time) return 'N/A'
    // Assume time is in HH:mm:ss format
    const [hours, minutes] = time.split(':')
    const date = new Date()
    date.setHours(parseInt(hours, 10))
    date.setMinutes(parseInt(minutes, 10))
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <FacultySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div
        className={cn(
          "transition-all duration-300 min-h-screen flex flex-col overflow-hidden w-full lg:w-auto",
          isSidebarCollapsed ? "lg:ml-20" : "lg:ml-64"
        )}
      >
        <PageHeader
          title="PEER TUTOR CLASSES"
          tagline={`${subjectName} Details`}
          onBack={() => router.back()}
          lastRefresh={lastRefresh}
          onRefresh={async () => {
            setIsRefreshing(true)
            await loadData()
            setLastRefresh(new Date())
            setIsRefreshing(false)
          }}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="flex-1 overflow-y-auto">
          <div className={cn("max-w-full mx-auto py-8", isSidebarCollapsed ? "px-4 sm:px-6 lg:pr-8 lg:pl-6" : "px-4 sm:px-6 lg:px-8")}>
            
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <>
                {/* Profile Section */}
                {peerTutor && (
                  <div className="bg-white rounded-xl border border-gray-200 p-8 mb-8 shadow-sm">
                    <div className="flex items-start gap-6">
                      <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold shrink-0">
                        {peerTutor.name[0]}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">Peer Tutor</p>
                        <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
                          {peerTutor.name}
                        </h2>
                        <div className="flex items-center gap-2 text-gray-500">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium">{peerTutor.email}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 mt-6">
                           <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                             <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Dept</span>
                             <span className="text-sm font-semibold text-gray-900">{dept}</span>
                           </div>
                           <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                             <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Year</span>
                             <span className="text-sm font-semibold text-gray-900">{year}</span>
                           </div>
                           <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                             <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Section</span>
                             <span className="text-sm font-semibold text-gray-900">{section}</span>
                           </div>
                           <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                             <BookOpen className="w-4 h-4 text-blue-600" />
                             <span className="text-sm font-bold text-blue-900">{subjectName}</span>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Classes Table */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <h3 className="text-sm font-bold uppercase text-gray-700 tracking-wider flex items-center gap-2">
                      Class Schedule
                    </h3>
                    <div className="flex gap-4">
                       <div className="flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                         <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Regular</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                         <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Additional</span>
                       </div>
                    </div>
                  </div>

                  {combinedClasses.length === 0 ? (
                    <div className="text-center py-16">
                      <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-gray-900 mb-1">No Classes Found</h3>
                      <p className="text-gray-500 text-sm">This peer tutor has no scheduled or additional classes for this subject.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 bg-white">
                            <th className="pl-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                            <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Topic</th>
                            <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Timings</th>
                            <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Type</th>
                            <th className="pr-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 border-t border-gray-100">
                          {combinedClasses.map((cls, idx) => (
                            <tr key={`${cls.id}-${idx}`} className="hover:bg-gray-50 transition-colors">
                              <td className="py-4 pl-6">
                                <span className="text-sm font-bold text-gray-900">{formatDate(cls.date)}</span>
                              </td>
                              <td className="py-4 px-4">
                                <span className="text-sm text-gray-700 font-medium line-clamp-2">{cls.topic}</span>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100/50 px-2 py-1 rounded">
                                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                                  <span>{formatTime(cls.startTime)} - {formatTime(cls.endTime)}</span>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-center">
                                <span className={cn(
                                  "inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border",
                                  cls.type === 'Regular' 
                                    ? "bg-blue-500 text-white border-blue-200" 
                                    : "bg-purple-500 text-white border-purple-200"
                                )}>
                                  {cls.type === 'Regular' ? 'Regular' : 'Additional'}
                                </span>
                              </td>
                              <td className="py-4 pr-6 text-center">
                                <span className={cn(
                                  "inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border",
                                  cls.status === 'Completed' ? "bg-emerald-500 text-white border-emerald-200" :
                                  cls.status === 'Pending' ? "bg-amber-500 text-white border-amber-200" :
                                  "bg-gray-500 text-white border-gray-200"
                                )}>
                                  {cls.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
