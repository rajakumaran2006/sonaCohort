'use client'

import React, { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import StudentProtectedRoute from '@/components/auth/StudentProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { useStudentAttendanceData } from '@/lib/hooks/useStudentDashboardData'
import { StudentService } from '@/lib/services/studentService'
import { useQuery } from '@tanstack/react-query'
import {
  EmptyState,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui'
import { Search, BookOpen } from 'lucide-react'
import { format } from 'date-fns'
import { AttendanceHistoryRecord } from '@/lib/services/attendanceService'

export default function StudentClassesPage() {
  return (
    <StudentProtectedRoute>
      <StudentClassesContent />
    </StudentProtectedRoute>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-lg ${className ?? ''}`}
      style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite linear' }}
    />
  )
}

function ClassesTableSkeleton() {
  return (
    <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-6 py-5 flex gap-6">
        <SkeletonPulse className="h-3 w-16 rounded-full" />
        <SkeletonPulse className="h-3 w-32 rounded-full" />
        <SkeletonPulse className="h-3 w-16 rounded-full ml-auto" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="px-6 py-5 border-b border-gray-50 last:border-0 flex items-center gap-6"
          style={{ opacity: 1 - i * 0.12 }}
        >
          <SkeletonPulse className="h-4 w-24 rounded-full shrink-0" />
          <div className="flex flex-col gap-2 flex-1">
            <SkeletonPulse className="h-4 w-48 rounded-full" />
            <SkeletonPulse className="h-3 w-64 rounded-full" />
          </div>
          <SkeletonPulse className="h-6 w-20 rounded-full" />
          <SkeletonPulse className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function ControlsBarSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex flex-1 w-full sm:w-auto gap-3">
        <SkeletonPulse className="h-10 flex-1 max-w-md rounded-xl" />
        <SkeletonPulse className="h-10 w-36 rounded-xl" />
        <SkeletonPulse className="h-10 w-36 rounded-xl" />
      </div>
      <SkeletonPulse className="h-9 w-36 rounded-xl" />
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

type ClassTypeFilter = 'all' | 'regular' | 'additional'

function StudentClassesContent() {
  const { user } = useAuth()
  const [isSidebarCollapsed] = useSidebarCollapsed()

  const [searchTerm, setSearchTerm] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [filterType, setFilterType] = useState<ClassTypeFilter>('all')

  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ['studentProfile', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await StudentService.getStudentWithPeerTutorByEmail(user.email)
    },
    enabled: !!user?.email,
  })

  const { data: attendanceData, isLoading: attendanceLoading, refetch } =
    useStudentAttendanceData(student?.id)

  const loading = studentLoading || attendanceLoading

  // ── filtered records ──────────────────────────────────────────────────────
  const filteredRecords = React.useMemo(() => {
    if (!attendanceData?.records) return []

    return attendanceData.records.filter((record: AttendanceHistoryRecord) => {
      const isAdditional = !record.scheduled_class_id
      const subjectName = record.classes?.subject_name || ''
      const topics =
        record.scheduled_classes?.topics || record.classes?.topics || ''

      // search
      const searchMatch =
        subjectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        topics.toLowerCase().includes(searchTerm.toLowerCase())

      // subject filter
      const subjectMatch = filterSubject ? subjectName === filterSubject : true

      // type filter
      const typeMatch =
        filterType === 'all'
          ? true
          : filterType === 'additional'
          ? isAdditional
          : !isAdditional

      return searchMatch && subjectMatch && typeMatch
    })
  }, [attendanceData?.records, searchTerm, filterSubject, filterType])

  // unique subjects
  const uniqueSubjects = React.useMemo(() => {
    if (!attendanceData?.records) return []
    const s = new Set<string>()
    attendanceData.records.forEach((r: AttendanceHistoryRecord) => {
      if (r.classes?.subject_name) s.add(r.classes.subject_name)
    })
    return Array.from(s).sort()
  }, [attendanceData?.records])

  const selectCls =
    'block w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-gray-900 focus:border-gray-900 appearance-none font-medium text-gray-700 transition-all cursor-pointer'

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      <div
        className={`transition-all duration-300 ${
          isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        } min-h-screen flex flex-col`}
      >
        <PageHeader
          title="MY CLASSES"
          tagline="Attendance & Topics History"
          onRefresh={async () => { await refetch() }}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="flex-1 p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            {/* ── Controls ── */}
            {loading ? (
              <ControlsBarSkeleton />
            ) : (
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex flex-wrap flex-1 gap-3 w-full">

                  {/* Search */}
                  <div className="relative flex-1 min-w-[160px] max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search subjects or topics..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                    />
                  </div>

                  {/* Subject filter */}
                  <div className="relative">
                    <select
                      value={filterSubject}
                      onChange={e => setFilterSubject(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">All Subjects</option>
                      {uniqueSubjects.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-gray-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>

                  {/* Type filter */}
                  <div className="relative">
                    <select
                      value={filterType}
                      onChange={e => setFilterType(e.target.value as ClassTypeFilter)}
                      className={selectCls}
                    >
                      <option value="all">All Types</option>
                      <option value="regular">Regular</option>
                      <option value="additional">Additional</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-gray-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>

                {/* Count pill */}
                <div className="shrink-0 px-4 py-2 bg-gray-900 rounded-xl flex items-center gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {filteredRecords.length} Records found
                  </span>
                </div>
              </div>
            )}

            {/* ── Table / Cards ── */}
            {loading ? (
              <ClassesTableSkeleton />
            ) : (
              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                {filteredRecords.length > 0 ? (
                  <>
                    {/* ── Mobile card list (hidden on md+) ── */}
                    <div className="md:hidden divide-y divide-gray-100">
                      {filteredRecords.map((record: AttendanceHistoryRecord) => {
                        const isAdditional = !record.scheduled_class_id
                        const isPresent = record.status === 'present'
                        const subjectName = record.classes?.subject_name || '—'
                        const topics = isAdditional
                          ? record.classes?.topics || '—'
                          : record.scheduled_classes?.topics || record.classes?.topics || '—'
                        const rawDate = isAdditional
                          ? record.classes?.created_at || record.created_at
                          : record.scheduled_classes?.scheduled_date ||
                            record.classes?.created_at ||
                            record.created_at
                        const formattedDate = rawDate
                          ? format(new Date(rawDate), 'MMM d, yyyy')
                          : '—'

                        return (
                          <div
                            key={record.id}
                            className="px-5 py-4 flex flex-col gap-2 hover:bg-gray-50/60 transition-colors"
                          >
                            {/* Date row + badges */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-xs font-bold text-gray-500">{formattedDate}</span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider text-white ${
                                    isAdditional ? 'bg-violet-700' : 'bg-gray-800'
                                  }`}
                                >
                                  {isAdditional ? 'Additional' : 'Regular'}
                                </span>
                                <span
                                  className={`inline-flex items-center text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider text-white ${
                                    isPresent ? 'bg-emerald-600' : 'bg-red-600'
                                  }`}
                                >
                                  {isPresent ? 'Attended' : 'Absent'}
                                </span>
                              </div>
                            </div>
                            {/* Subject & full topic */}
                            <div>
                              <p className="text-sm font-bold text-gray-900 leading-tight">{subjectName}</p>
                              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{topics}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* ── Desktop table (md+) ── */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50 border-b border-gray-100">
                            <TableHead className="py-4 px-6 whitespace-nowrap">
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</span>
                            </TableHead>
                            <TableHead className="py-4 px-6">
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subject &amp; Topic</span>
                            </TableHead>
                            <TableHead className="py-4 px-6">
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</span>
                            </TableHead>
                            <TableHead className="py-4 px-6">
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</span>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRecords.map((record: AttendanceHistoryRecord) => {
                            const isAdditional = !record.scheduled_class_id
                            const isPresent = record.status === 'present'
                            const subjectName = record.classes?.subject_name || '—'
                            const topics = isAdditional
                              ? record.classes?.topics || '—'
                              : record.scheduled_classes?.topics || record.classes?.topics || '—'
                            const rawDate = isAdditional
                              ? record.classes?.created_at || record.created_at
                              : record.scheduled_classes?.scheduled_date ||
                                record.classes?.created_at ||
                                record.created_at
                            const formattedDate = rawDate
                              ? format(new Date(rawDate), 'MMM d, yyyy')
                              : '—'

                            return (
                              <TableRow
                                key={record.id}
                                className="hover:bg-gray-50/60 transition-colors border-b border-gray-50 last:border-0"
                              >
                                {/* Date */}
                                <TableCell className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-bold text-gray-900">{formattedDate}</span>
                                </TableCell>

                                {/* Subject & Topic */}
                                <TableCell className="px-6 py-4">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-bold text-gray-900 mb-0.5 leading-tight">{subjectName}</span>
                                    <span className="text-xs text-gray-500 line-clamp-2">{topics}</span>
                                  </div>
                                </TableCell>

                                {/* Type badge */}
                                <TableCell className="px-6 py-4">
                                  <span
                                    className={`inline-flex items-center text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider text-white ${
                                      isAdditional ? 'bg-violet-700' : 'bg-gray-800'
                                    }`}
                                  >
                                    {isAdditional ? 'Additional' : 'Regular'}
                                  </span>
                                </TableCell>

                                {/* Status badge */}
                                <TableCell className="px-6 py-4">
                                  <span
                                    className={`inline-flex items-center text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider text-white ${
                                      isPresent ? 'bg-emerald-600' : 'bg-red-600'
                                    }`}
                                  >
                                    {isPresent ? 'Attended' : 'Absent'}
                                  </span>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <div className="py-16">
                    <EmptyState
                      title="No Classes Found"
                      description={
                        searchTerm || filterSubject || filterType !== 'all'
                          ? 'No classes match your current filters.'
                          : 'You have no recorded class attendance history.'
                      }
                      icon={<BookOpen className="w-12 h-12 text-gray-300" />}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
