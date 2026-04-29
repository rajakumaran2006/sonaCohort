'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { FeedbackForm } from '@/lib/services/feedbackService'
import { FeedbackAnalyticsService, ResponseAnalytics, StudentResponseAnalytics } from '@/lib/services/feedbackAnalyticsService'
import { DepartmentService } from '@/lib/services/departmentService'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'
import { Star, Users, Clock, Download, Filter, X, UserX } from 'lucide-react'
import { logger } from '@/lib/logger'

// Helper functions
const formatCompletionTime = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`
  return `${(seconds / 60).toFixed(1)}m`
}



const getSatisfactionColor = (score: number): string => {
  if (score >= 4) return 'text-emerald-500'
  if (score >= 3) return 'text-yellow-500'
  return 'text-red-500'
}

const getStarColor = (rating: number): string => {
  if (rating === 5) return 'bg-emerald-500'
  if (rating === 4) return 'bg-blue-500'
  if (rating === 3) return 'bg-yellow-500'
  if (rating === 2) return 'bg-orange-500'
  return 'bg-red-500'
}

interface FeedbackAnalyticsPageProps {
  form: FeedbackForm
}

// Satisfaction Arc Component
function SatisfactionArc({ score, maxScore = 5 }: { score: number; maxScore?: number }) {
  const percentage = (score / maxScore) * 100
  /* const strokeDasharray = 283 */ // Circumference of circle with r=45
  
  return (
    <div className="relative w-32 h-16 mx-auto">
      <svg viewBox="0 0 100 50" className="w-full h-full">
        {/* Background arc */}
        <path
          d="M 5 50 A 45 45 0 0 1 95 50"
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Foreground arc */}
        <path
          d="M 5 50 A 45 45 0 0 1 95 50"
          fill="none"
          stroke={score >= 4 ? '#10B981' : score >= 3 ? '#F59E0B' : '#EF4444'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="141"
          strokeDashoffset={141 - (141 * percentage) / 100}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-end justify-center pb-1">
        <span className="text-2xl font-bold text-gray-900">{score.toFixed(1)}</span>
        <span className="text-sm text-gray-500 ml-0.5">/5</span>
      </div>
    </div>
  )
}

// Rating Distribution Bar Component
function RatingDistributionBar({ 
  rating, 
  count, 
  total, 
  maxCount 
}: { 
  rating: number
  count: number
  total: number
  maxCount: number
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0
  const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0
  
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 w-16">
        <span className="text-sm font-medium text-gray-700">{rating}</span>
        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
      </div>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-700 ease-out ${getStarColor(rating)}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="w-16 text-right">
        <span className="text-sm font-medium text-gray-900">{count}</span>
        <span className="text-xs text-gray-500 ml-1">({percentage.toFixed(0)}%)</span>
      </div>
    </div>
  )
}

// Mini Trend Chart
function MiniTrendChart({ data }: { data: Array<{ date: string; responses: number }> }) {
  if (data.length === 0) return null
  
  const maxResponses = Math.max(...data.map(d => d.responses), 1)
  const points = data.slice(-14).map((d, i, arr) => {
    const x = (i / Math.max(arr.length - 1, 1)) * 100
    const y = 100 - (d.responses / maxResponses) * 80
    return `${x},${y}`
  }).join(' ')
  
  return (
    <div className="h-12 w-full">
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        {/* Area fill */}
        <polygon
          points={`0,100 ${points} 100,100`}
          fill="url(#gradient)"
          opacity="0.3"
        />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

export default function FeedbackAnalyticsPage({ form }: FeedbackAnalyticsPageProps) {
  const [analytics, setAnalytics] = useState<ResponseAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trends, setTrends] = useState<Array<{ date: string; responses: number }>>([])
  
  // Filter state
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('')
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [selectedSection, setSelectedSection] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)
  const [years, setYears] = useState<Array<{id: string, name: string}>>([])
  const [sections, setSections] = useState<Array<{id: string, name: string}>>([])
  const filterDropdownRef = useRef<HTMLDivElement>(null)
  const [pendingStudents, setPendingStudents] = useState<Array<{
    id: string
    name: string
    email: string
    year: string
    section: string
    register_number?: string
  }>>([])  
  const [loadingPending, setLoadingPending] = useState(false)

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await FeedbackAnalyticsService.getFormAnalytics(form.id, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        questionId: selectedQuestionId || undefined
      })
      setAnalytics(data)
    } catch (err) {
      logger.error('Error loading analytics:', err)
      setError('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }, [form.id, startDate, endDate, selectedQuestionId])

  const loadTrends = useCallback(async () => {
    try {
      const trendData = await FeedbackAnalyticsService.getResponseTrends(form.id, 30)
      setTrends(trendData)
    } catch (err) {
      logger.error('Error loading trends:', err)
    }
  }, [form.id])

  const loadYearsAndSections = useCallback(async () => {
    try {
      const [yearsData, sectionsData] = await Promise.all([
        DepartmentService.getYears(),
        DepartmentService.getSections()
      ])
      setYears(yearsData)
      setSections(sectionsData)
    } catch (err) {
      logger.error('Error loading years and sections:', err)
    }
  }, [])

  const loadPendingStudents = useCallback(async () => {
    try {
      setLoadingPending(true)
      const pending = await FeedbackAnalyticsService.getPendingStudents(form.id)
      setPendingStudents(pending)
    } catch (err) {
      logger.error('Error loading pending students:', err)
    } finally {
      setLoadingPending(false)
    }
  }, [form.id])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilters(false)
      }
    }

    if (showFilters) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFilters])

  useEffect(() => {
    loadAnalytics()
    loadTrends()
    loadYearsAndSections()
    loadPendingStudents()
  }, [loadAnalytics, loadTrends, loadYearsAndSections, loadPendingStudents])

  useEffect(() => {
    if (startDate || endDate || selectedQuestionId) {
      loadAnalytics()
    }
  }, [startDate, endDate, selectedQuestionId, loadAnalytics])

  const getFilteredResponses = (): StudentResponseAnalytics[] => {
    if (!analytics) return []
    
    let filtered = analytics.studentResponses
    
    if (selectedYear) {
      filtered = filtered.filter(student => student.year === selectedYear)
    }
    
    if (selectedSection) {
      filtered = filtered.filter(student => student.section === selectedSection)
    }
    
    // Sort by peerTutorId so consecutive rows with the same peer tutor are grouped for rowSpan merging
    filtered = [...filtered].sort((a, b) => {
      const ta = a.peerTutorId || ''
      const tb = b.peerTutorId || ''
      return ta.localeCompare(tb)
    })
    
    return filtered
  }

  const handleClearFilters = () => {
    setSelectedYear('')
    setSelectedSection('')
    setStartDate('')
    setEndDate('')
    setSelectedQuestionId('')
  }

  const exportPendingStudents = () => {
    if (pendingStudents.length === 0) {
      toast.warning('No pending students to export')
      return
    }

    const worksheetData = pendingStudents.map((student, index) => ({
      'S.No': index + 1,
      'Name': student.name,
      'Email': student.email,
      'Register Number': student.register_number || '-',
      'Year': student.year,
      'Section': student.section
    }))

    const ws = XLSX.utils.json_to_sheet(worksheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pending Students')
    
    const fileName = `pending-students-${form.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
    
    toast.success(`Exported ${pendingStudents.length} pending students`)
  }

  const exportToPDF = () => {
    if (!analytics) return
    
    const filteredResponses = getFilteredResponses()
    
    if (filteredResponses.length === 0) {
      toast.warning('No responses to export. Please adjust your filters.')
      return
    }

    const doc = new jsPDF()
    
    doc.setFontSize(16)
    doc.text('Feedback Analytics Report', 14, 15)
    
    doc.setFontSize(10)
    doc.text(`Form: ${form.name}`, 14, 22)
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 27)
    doc.text(`Total Responses: ${analytics.totalResponses}`, 14, 32)
    doc.text(`Satisfaction Score: ${analytics.satisfactionScore.toFixed(1)}/5.0`, 14, 37)
    
    let yPos = 47
    
    filteredResponses.forEach((student) => {
      if (yPos > 250) {
        doc.addPage()
        yPos = 20
      }
      
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      const peerTutorLabel = student.peerTutorName ? ` | Peer Tutor: ${student.peerTutorName}` : ''
      doc.text(`${student.studentName} - Year: ${student.year}, Section: ${student.section}${peerTutorLabel}`, 14, yPos)
      yPos += 8
      
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      
      student.responses.forEach((response, qIndex) => {
        if (yPos > 260) {
          doc.addPage()
          yPos = 20
        }
        
        const questionText = `Q${qIndex + 1}: ${response.questionText}`
        const answerText = `A${qIndex + 1}: ${String(response.answer)}`
        
        const questionLines = doc.splitTextToSize(questionText, 180)
        const answerLines = doc.splitTextToSize(answerText, 180)
        
        doc.text(questionLines, 16, yPos)
        yPos += questionLines.length * 5
        
        doc.setFont('helvetica', 'italic')
        doc.text(answerLines, 18, yPos)
        yPos += answerLines.length * 5 + 3
        doc.setFont('helvetica', 'normal')
      })
      
      yPos += 5
    })
    
    const fileName = `feedback-analytics-${form.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(fileName)
  }

  if (loading) {
    return <TableSkeleton />
  }

  if (error) {
    return (
      <div className="bg-white rounded-[20px] p-8 text-center border border-gray-200">
        <div className="text-red-600 mb-4 font-medium">{error}</div>
        <button
          onClick={loadAnalytics}
          className="px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="bg-white rounded-[20px] p-8 text-center border border-gray-200">
        <div className="text-gray-600">No analytics data available</div>
      </div>
    )
  }

  const filteredResponses = getFilteredResponses()

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Filters Bar */}
      <div className="bg-white rounded-[20px] p-4 border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Per-Question</label>
            <select
              value={selectedQuestionId}
              onChange={(e) => setSelectedQuestionId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All questions</option>
              {analytics?.questionAnalytics?.map((q) => (
                <option key={q.questionId} value={q.questionId}>
                  {q.questionText.length > 40 ? q.questionText.slice(0, 37) + '…' : q.questionText}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards - Modern Design */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Responses Card */}
        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Responses</h3>
            <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
              <Users className="w-4 h-4 text-gray-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-4xl font-extrabold text-gray-900">{analytics.totalResponses}</span>
            <span className="text-lg text-gray-400">/ {analytics.totalStudents}</span>
          </div>
          <div className="flex items-center text-blue-500 text-xs font-bold">
            <span>{analytics.totalStudents > 0 ? analytics.responseRate.toFixed(1) : '0.0'}% RESPONSE RATE</span>
          </div>
          {trends.length > 0 && (
            <div className="mt-4">
              <MiniTrendChart data={trends} />
            </div>
          )}
        </div>

        {/* Completion Time Card */}
        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Avg. Completion</h3>
            <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
              <Clock className="w-4 h-4 text-gray-400" />
            </div>
          </div>
          <div className="text-4xl font-extrabold text-gray-900 mb-2">
            {analytics.totalResponses > 0 ? formatCompletionTime(analytics.averageCompletionTime) : '0s'}
          </div>
          <div className="flex items-center text-gray-500 text-xs font-bold">
            <span>AVERAGE TIME</span>
          </div>
        </div>

        {/* Satisfaction Card with Arc */}
        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Satisfaction</h3>
            <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
              <Star className="w-4 h-4 text-gray-400" />
            </div>
          </div>
          <SatisfactionArc score={analytics.totalResponses > 0 ? analytics.satisfactionScore : 0} />
          <div className="flex items-center justify-center text-xs font-bold mt-2">
            <div className="flex items-center gap-1">
              {[1,2,3,4,5].map((star) => (
                <Star 
                  key={star} 
                  className={`w-3 h-3 ${star <= Math.round(analytics.satisfactionScore) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} 
                />
              ))}
            </div>
          </div>
        </div>

        {/* Pending Students Card */}
        <div className="bg-white rounded-[20px] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Pending</h3>
            <div className="p-2 border border-gray-100 rounded-lg group-hover:bg-gray-50 transition-colors">
              <UserX className="w-4 h-4 text-orange-500" />
            </div>
          </div>
          <div className="text-4xl font-extrabold text-orange-500 mb-2">
            {loadingPending ? '...' : pendingStudents.length}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">NOT SUBMITTED</span>
            <button
              onClick={exportPendingStudents}
              disabled={pendingStudents.length === 0 || loadingPending}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                pendingStudents.length === 0 || loadingPending
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
              }`}
            >
              <Download className="w-3 h-3" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Question Analytics - Modern Cards */}
      {analytics.questionAnalytics.length > 0 && (
        <div className="bg-white rounded-[20px] border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Question Analytics</h3>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest mt-1">
              Detailed breakdown for each question
            </p>
          </div>
          
          <div className="divide-y divide-gray-100">
            {analytics.questionAnalytics.map((question, index) => (
              <div key={question.questionId} className="p-6 hover:bg-gray-50/50 transition-colors">
                {/* Question Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                        {index + 1}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        question.questionType === 'star_rating' 
                          ? 'bg-yellow-100 text-yellow-800'
                          : question.questionType === 'multiple_choice'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {question.questionType === 'star_rating' ? '★ Rating' :
                         question.questionType === 'multiple_choice' ? 'Choice' : 'Text'}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">
                        {question.totalResponses} responses
                      </span>
                    </div>
                    <h4 className="text-base font-semibold text-gray-900">{question.questionText}</h4>
                  </div>
                </div>

                {/* Star Rating Analytics */}
                {question.questionType === 'star_rating' && question.averageRating && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
                    {/* Average & Median */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                          {question.averageRating.toFixed(1)}
                        </div>
                        <div className="flex items-center justify-center gap-0.5 mb-2">
                          {[1,2,3,4,5].map((star) => (
                            <Star 
                              key={star} 
                              className={`w-4 h-4 ${star <= Math.round(question.averageRating!) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} 
                            />
                          ))}
                        </div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          Average Rating
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <span className="text-sm font-medium text-gray-600">
                            Median: {question.medianRating?.toFixed(1) ?? '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Rating Distribution Bars */}
                    <div className="lg:col-span-2 bg-gray-50 rounded-xl p-4">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-4">
                        Rating Distribution
                      </div>
                      <div className="space-y-2">
                        {question.ratingDistribution && (() => {
                          const total = Object.values(question.ratingDistribution).reduce((a, b) => a + b, 0)
                          const maxCount = Math.max(...Object.values(question.ratingDistribution))
                          return [5, 4, 3, 2, 1].map((rating) => (
                            <RatingDistributionBar
                              key={rating}
                              rating={rating}
                              count={question.ratingDistribution![rating] || 0}
                              total={total}
                              maxCount={maxCount}
                            />
                          ))
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Multiple Choice Analytics */}
                {question.questionType === 'multiple_choice' && question.optionDistribution && (
                  <div className="mt-4 bg-gray-50 rounded-xl p-4">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-4">
                      Option Distribution
                    </div>
                    <div className="space-y-2">
                      {Object.entries(question.optionDistribution).map(([option, count]) => {
                        const total = Object.values(question.optionDistribution!).reduce((a, b) => a + b, 0)
                        const percentage = total > 0 ? (count / total) * 100 : 0
                        return (
                          <div key={option} className="flex items-center gap-3">
                            <div className="w-32 text-sm font-medium text-gray-700 truncate">{option}</div>
                            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <div className="w-20 text-right">
                              <span className="text-sm font-medium text-gray-900">{count}</span>
                              <span className="text-xs text-gray-500 ml-1">({percentage.toFixed(0)}%)</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Text Analytics */}
                {question.questionType === 'text' && question.textResponses && (
                  <div className="mt-4 bg-gray-50 rounded-xl p-4">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-4">
                      Text Responses ({question.textResponses.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {question.textResponses.slice(0, 5).map((response, idx) => (
                        <div key={idx} className="text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-200">
                          &quot;{response}&quot;
                        </div>
                      ))}
                      {question.textResponses.length > 5 && (
                        <div className="text-sm text-gray-500 italic pt-2">
                          ... and {question.textResponses.length - 5} more responses
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Student Responses Table */}
      {analytics.studentResponses.length > 0 && (
        <div className="bg-white rounded-[20px] border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                  Student Responses ({filteredResponses.length})
                </h3>
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest mt-1">
                  Individual feedback submissions
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Filter Dropdown */}
                <div className="relative" ref={filterDropdownRef}>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-colors gap-2 ${
                      (selectedYear || selectedSection)
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                    Filter
                  </button>
                  
                  {showFilters && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg z-50 border border-gray-200 p-4 space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Year</label>
                        <select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">All Years</option>
                          {years.map((year) => (
                            <option key={year.id} value={year.name}>{year.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Section</label>
                        <select
                          value={selectedSection}
                          onChange={(e) => setSelectedSection(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">All Sections</option>
                          {sections.map((section) => (
                            <option key={section.id} value={section.name}>{section.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Export Button */}
                <button
                  onClick={exportToPDF}
                  disabled={filteredResponses.length === 0}
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-colors gap-2 ${
                    filteredResponses.length === 0
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  Export PDF
                </button>
              </div>
            </div>
            
            {/* Active Filters */}
            {(selectedYear || selectedSection) && (
              <div className="flex items-center gap-2 mt-3">
                {selectedYear && (
                  <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-800">
                    Year: {selectedYear}
                    <button onClick={() => setSelectedYear('')} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
                  </span>
                )}
                {selectedSection && (
                  <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-800">
                    Section: {selectedSection}
                    <button onClick={() => setSelectedSection('')} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="pl-6 py-4 text-left">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Student</span>
                  </th>
                  <th className="px-4 py-4 text-left">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Peer Tutor</span>
                  </th>
                  <th className="px-4 py-4 text-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Year / Section</span>
                  </th>
                  <th className="px-4 py-4 text-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Submitted</span>
                  </th>
                  <th className="px-4 py-4 text-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Time</span>
                  </th>
                  <th className="pr-6 py-4 text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Satisfaction</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredResponses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      <p className="text-sm font-medium">No students match the selected filters</p>
                      <button
                        onClick={handleClearFilters}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
                      >
                        Clear filters
                      </button>
                    </td>
                  </tr>
                ) : (() => {
                  // Build groups: each consecutive run of same peerTutorId stays together
                  // We need to compute rowSpan for the peer tutor cell
                  type GroupEntry = { student: typeof filteredResponses[0]; isFirstInGroup: boolean; groupSize: number }
                  const entries: GroupEntry[] = []
                  let i = 0
                  while (i < filteredResponses.length) {
                    const currentTutorId = filteredResponses[i].peerTutorId || '__none__'
                    let j = i
                    while (j < filteredResponses.length && (filteredResponses[j].peerTutorId || '__none__') === currentTutorId) {
                      j++
                    }
                    const groupSize = j - i
                    for (let k = i; k < j; k++) {
                      entries.push({ student: filteredResponses[k], isFirstInGroup: k === i, groupSize })
                    }
                    i = j
                  }

                  return entries.map(({ student, isFirstInGroup, groupSize }, idx) => (
                    <tr key={`${student.studentId}-${idx}`} className="hover:bg-gray-50 transition-colors">
                      <td className="pl-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{student.studentName}</div>
                          <div className="text-xs text-gray-500">{student.studentEmail}</div>
                        </div>
                      </td>
                      {isFirstInGroup && (
                        <td
                          className="px-4 py-4 text-left align-middle"
                          rowSpan={groupSize}
                          style={{ borderBottom: groupSize > 1 ? '2px solid #e5e7eb' : undefined }}
                        >
                          {student.peerTutorName ? (
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">
                                {student.peerTutorName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{student.peerTutorName}</span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-400 italic">Not Assigned</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm font-medium text-gray-700">
                          {student.year} / {student.section}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="text-sm text-gray-900">{new Date(student.submittedAt).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">{new Date(student.submittedAt).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm font-medium text-gray-900">
                          {formatCompletionTime(student.completionTime)}
                        </span>
                      </td>
                      <td className="pr-6 py-4 text-right">
                        {student.satisfactionScore ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="flex items-center gap-0.5">
                              {[1,2,3,4,5].map((star) => (
                                <Star 
                                  key={star} 
                                  className={`w-3 h-3 ${star <= Math.round(student.satisfactionScore!) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} 
                                />
                              ))}
                            </div>
                            <span className={`text-sm font-bold ${getSatisfactionColor(student.satisfactionScore)}`}>
                              {student.satisfactionScore.toFixed(1)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {analytics.studentResponses.length === 0 && (
        <div className="bg-white rounded-[20px] border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Responses Yet</h3>
          <p className="text-sm text-gray-500">Waiting for student submissions</p>
        </div>
      )}
    </div>
  )
}