'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { FeedbackForm } from '@/lib/services/feedbackService'
import { FeedbackAnalyticsService, ResponseAnalytics, StudentResponseAnalytics } from '@/lib/services/feedbackAnalyticsService'
import { DepartmentService } from '@/lib/services/departmentService'
import StarRating from '@/components/ui/StarRating'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Chart, { TrendChart, SparklineChart } from '@/components/ui/Chart'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface FeedbackAnalyticsPageProps {
  form: FeedbackForm
}

export default function FeedbackAnalyticsPage({ form }: FeedbackAnalyticsPageProps) {
  const [analytics, setAnalytics] = useState<ResponseAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trends, setTrends] = useState<Array<{ date: string; responses: number }>>([])
  // Analytics filters (default All time, per user choice)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('')
  
  // Filter state
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [selectedSection, setSelectedSection] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)
  const [years, setYears] = useState<Array<{id: string, name: string}>>([])
  const [sections, setSections] = useState<Array<{id: string, name: string}>>([])
  const filterDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadAnalytics()
    loadTrends()
    loadYearsAndSections()
  }, [form.id])

  // Refetch analytics when date range or question filter changes
  useEffect(() => {
    loadAnalytics()
  }, [startDate, endDate, selectedQuestionId])

  // Close filter dropdown when clicking outside
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

  const loadAnalytics = async () => {
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
      console.error('Error loading analytics:', err)
      setError('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }

  const loadTrends = async () => {
    try {
      const trendData = await FeedbackAnalyticsService.getResponseTrends(form.id, 30)
      setTrends(trendData)
    } catch (err) {
      console.error('Error loading trends:', err)
    }
  }

  const loadYearsAndSections = async () => {
    try {
      const [yearsData, sectionsData] = await Promise.all([
        DepartmentService.getYears(),
        DepartmentService.getSections()
      ])
      setYears(yearsData)
      setSections(sectionsData)
    } catch (err) {
      console.error('Error loading years and sections:', err)
    }
  }

  // Filter student responses based on selected year and section
  const getFilteredResponses = (): StudentResponseAnalytics[] => {
    if (!analytics) return []
    
    let filtered = analytics.studentResponses
    
    if (selectedYear) {
      filtered = filtered.filter(student => student.year === selectedYear)
    }
    
    if (selectedSection) {
      filtered = filtered.filter(student => student.section === selectedSection)
    }
    
    return filtered
  }

  const handleClearFilters = () => {
    setSelectedYear('')
    setSelectedSection('')
  }

  const exportToPDF = () => {
    if (!analytics) return
    
    const filteredResponses = getFilteredResponses()
    
    if (filteredResponses.length === 0) {
      alert('No responses to export. Please adjust your filters.')
      return
    }

    const doc = new jsPDF()
    
    // Header
    doc.setFontSize(16)
    doc.text('Feedback Analytics Report', 14, 15)
    
    doc.setFontSize(10)
    doc.text(`Form: ${form.name}`, 14, 22)
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 27)
    
    // Filters info
    let filterInfo = 'Filters: '
    if (selectedYear || selectedSection) {
      if (selectedYear) filterInfo += `Year: ${selectedYear}`
      if (selectedYear && selectedSection) filterInfo += ' | '
      if (selectedSection) filterInfo += `Section: ${selectedSection}`
    } else {
      filterInfo += 'All'
    }
    // Append analytics filters (date range and question)
    const dateInfo = (startDate || endDate) ? ` | Date: ${startDate || '—'} to ${endDate || '—'}` : ' | Date: All time'
    const questionInfo = selectedQuestionId && analytics?.questionAnalytics?.length
      ? ` | Question: ${analytics.questionAnalytics[0]?.questionText?.slice(0, 60) || selectedQuestionId}`
      : ''
    doc.text(filterInfo + dateInfo + questionInfo, 14, 32)
    
    let yPos = 42
    
    // Process each student
    filteredResponses.forEach((student, studentIndex) => {
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage()
        yPos = 20
      }
      
      // Student header
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(`${student.studentName} - Year: ${student.year}, Section: ${student.section}`, 14, yPos)
      yPos += 8
      
      // Student responses
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      
      student.responses.forEach((response, qIndex) => {
        if (yPos > 260) {
          doc.addPage()
          yPos = 20
        }
        
        const questionText = `Q${qIndex + 1}: ${response.questionText}`
        const answerText = `A${qIndex + 1}: ${String(response.answer)}`
        
        // Split long text into multiple lines
        const questionLines = doc.splitTextToSize(questionText, 180)
        const answerLines = doc.splitTextToSize(answerText, 180)
        
        doc.text(questionLines, 16, yPos)
        yPos += questionLines.length * 5
        
        doc.setFont('helvetica', 'italic')
        doc.text(answerLines, 18, yPos)
        yPos += answerLines.length * 5 + 3
        doc.setFont('helvetica', 'normal')
      })
      
      // Add spacing between students
      yPos += 5
    })
    
    // Save PDF
    const fileName = `feedback-analytics-${form.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(fileName)
  }

  const formatCompletionTime = (minutes: number): string => {
    if (minutes < 1) {
      return '< 1 min'
    } else if (minutes < 60) {
      return `${Math.round(minutes)} min`
    } else {
      const hours = Math.floor(minutes / 60)
      const remainingMinutes = Math.round(minutes % 60)
      return `${hours}h ${remainingMinutes}m`
    }
  }

  const getSatisfactionColor = (score: number): string => {
    if (score >= 4) return 'text-green-600'
    if (score >= 3) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getDeltaColor = (delta: number): string => {
    if (delta > 0) return 'text-green-600'
    if (delta < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getDeltaIcon = (delta: number): string => {
    if (delta > 0) return '↗'
    if (delta < 0) return '↘'
    return '→'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="text-center py-8">
        <CardContent>
          <div className="text-red-600 mb-4 font-medium">{error}</div>
          <button
            onClick={loadAnalytics}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    )
  }

  if (!analytics) {
    return (
      <Card className="text-center py-8">
        <CardContent>
          <div className="text-gray-600">No analytics data available</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Global Analytics Filters (do not change table structure) */}
      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Per‑question</label>
              <select
                value={selectedQuestionId}
                onChange={(e) => setSelectedQuestionId(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All questions</option>
                {analytics?.questionAnalytics?.map((q) => (
                  <option key={q.questionId} value={q.questionId}>
                    {q.questionText.length > 60 ? q.questionText.slice(0, 57) + '…' : q.questionText}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setStartDate(''); setEndDate(''); setSelectedQuestionId('') }}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 transition-colors"
              >
                Clear filters
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Header Stats - Clean Minimal Design */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Responses & Response Rate */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="space-y-2">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Responses</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-gray-900">
                  {analytics.totalResponses}/{analytics.totalStudents}
                </p>
                <span className="text-sm text-gray-600">
                  ({analytics.totalStudents > 0 ? analytics.responseRate.toFixed(1) : '0.0'}%)
                </span>
              </div>
              {trends.length > 0 && (
                <div className="mt-3">
                  <SparklineChart data={trends} height={20} ariaLabel="30 day responses sparkline" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Average Completion Time */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="space-y-2">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Avg. Completion</p>
              <p className="text-3xl font-bold text-gray-900">
                {analytics.totalResponses > 0 ? formatCompletionTime(analytics.averageCompletionTime) : '0 min'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Satisfaction Score */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="space-y-2">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Satisfaction</p>
              <p className={`text-3xl font-bold ${analytics.totalResponses > 0 ? getSatisfactionColor(analytics.satisfactionScore) : 'text-gray-900'}`}>
                {analytics.totalResponses > 0 ? `${analytics.satisfactionScore.toFixed(1)}/5.0` : '0.0/5.0'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Delta Score */}
        <Card className="border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="space-y-2">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Delta Score</p>
              <p className={`text-3xl font-bold ${analytics.totalResponses > 0 ? getDeltaColor(analytics.satisfactionDelta) : 'text-gray-900'}`}>
                {analytics.totalResponses > 0 
                  ? `${analytics.satisfactionDelta > 0 ? '+' : ''}${analytics.satisfactionDelta.toFixed(1)}%`
                  : '0.0%'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Response Trends */}
      {trends.length > 0 && (
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Response Trends</CardTitle>
            <CardDescription>Daily response count over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={trends} title="Daily Response Count" />
          </CardContent>
        </Card>
      )}

      {/* Question Analytics */}
      {analytics.questionAnalytics.length > 0 && (
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Question Analytics</CardTitle>
            <CardDescription>Detailed analysis for each question in the feedback form</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {analytics.questionAnalytics.map((question, index) => (
                <div key={question.questionId} className="border border-gray-200 rounded-lg p-6 bg-gray-50">
                  <div className="mb-4">
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="text-base font-semibold text-gray-900">
                        {index + 1}. {question.questionText}
                      </h4>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        question.questionType === 'star_rating' 
                          ? 'bg-yellow-100 text-yellow-800'
                          : question.questionType === 'multiple_choice'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {question.questionType === 'star_rating' ? 'Star Rating' :
                         question.questionType === 'multiple_choice' ? 'Multiple Choice' : 'Text'}
                      </span>
                      <span className="text-sm text-gray-600">
                        {question.totalResponses} {question.totalResponses === 1 ? 'response' : 'responses'}
                      </span>
                    </div>
                  </div>

                  {/* Star Rating Analytics */}
                  {question.questionType === 'star_rating' && question.averageRating && (
                    <div className="space-y-4 mt-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex items-center space-x-3 bg-white rounded-lg p-4 border border-gray-200">
                          <span className="text-sm font-medium text-gray-700">Average</span>
                          <div className="flex items-center space-x-2">
                            <StarRating value={question.averageRating} onChange={() => {}} disabled={true} />
                            <span className="text-base font-semibold text-gray-900">{question.averageRating.toFixed(1)} / 5.0</span>
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <div className="text-sm text-gray-700">Median</div>
                          <div className="text-lg font-semibold text-gray-900">{question.medianRating?.toFixed(1) ?? '—'}</div>
                        </div>
                      </div>
                      
                      {question.ratingDistribution && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <Chart 
                              data={question.ratingDistribution} 
                              title="Rating Distribution" 
                              type="bar"
                              colors={['#F59E0B', '#F59E0B', '#F59E0B', '#F59E0B', '#F59E0B']}
                            />
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <Chart 
                              data={question.ratingDistribution} 
                              title="Rating Breakdown" 
                              type="pie"
                              colors={['#F59E0B', '#FBBF24', '#FCD34D', '#FDE68A', '#FEF3C7']}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Multiple Choice Analytics */}
                  {question.questionType === 'multiple_choice' && question.optionDistribution && (
                    <div className="space-y-4 mt-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <div className="text-sm text-gray-700">Top option</div>
                          <div className="text-lg font-semibold text-gray-900">{(question as any).topOption?.option ?? '—'}</div>
                          {question.totalResponses > 0 && (
                            <div className="text-xs text-gray-600">
                              {(question as any).topOption?.count ?? 0} · {((question as any).topOption?.percent ?? 0).toFixed(0)}%
                            </div>
                          )}
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <div className="text-sm text-gray-700">Distinct options</div>
                          <div className="text-lg font-semibold text-gray-900">{(question as any).distinctOptionCount ?? 0}</div>
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <div className="text-sm text-gray-700">Total selections</div>
                          <div className="text-lg font-semibold text-gray-900">{question.totalResponses}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <Chart 
                            data={question.optionDistribution} 
                            title="Option Distribution" 
                            type="bar"
                            colors={['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']}
                          />
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <Chart 
                            data={question.optionDistribution} 
                            title="Response Breakdown" 
                            type="pie"
                            colors={['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Text Analytics */}
                  {question.questionType === 'text' && question.textResponses && (
                    <div className="space-y-4 mt-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <div className="text-sm text-gray-700">Total text responses</div>
                          <div className="text-lg font-semibold text-gray-900">{question.textResponses.length}</div>
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <div className="text-sm text-gray-700">Top keywords</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(question as any).topKeywords?.length ? (
                              (question as any).topKeywords.map((kw: string, i: number) => (
                                <span key={i} className="px-2 py-0.5 text-xs rounded-md bg-gray-100 text-gray-700">{kw}</span>
                              ))
                            ) : (
                              <span className="text-xs text-gray-500">—</span>
                            )}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <Chart
                            data={(question as any).responseLengthHistogram || {}}
                            title="Response Lengths"
                            type="bar"
                            colors={["#6B7280"]}
                          />
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <span className="text-sm font-medium text-gray-700">
                          {question.textResponses.length} {question.textResponses.length === 1 ? 'text response' : 'text responses'}
                        </span>
                        <div className="max-h-48 overflow-y-auto space-y-2 mt-3" aria-label="Representative quotes">
                          {question.textResponses.slice(0, 10).map((response, idx) => (
                            <div key={idx} className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md border border-gray-200">
                              "{response}"
                            </div>
                          ))}
                          {question.textResponses.length > 10 && (
                            <div className="text-sm text-gray-500 italic pt-2">
                              ... and {question.textResponses.length - 10} more {question.textResponses.length - 10 === 1 ? 'response' : 'responses'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Student Responses Table */}
      {analytics.studentResponses.length > 0 && (() => {
        const filteredResponses = getFilteredResponses()
        return (
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Student Responses</CardTitle>
                  <CardDescription>
                    {filteredResponses.length} {filteredResponses.length === 1 ? 'student has' : 'students have'} submitted feedback
                    {((selectedYear || selectedSection) && filteredResponses.length !== analytics.studentResponses.length) && (
                      <span className="ml-2 text-xs text-gray-500">
                        (filtered from {analytics.studentResponses.length} total)
                      </span>
                    )}
                  </CardDescription>
                  {/* Active filter badges */}
                  {(selectedYear || selectedSection) && (
                    <div className="flex items-center gap-2 mt-2">
                      {selectedYear && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                          Year: {selectedYear}
                          <button
                            onClick={() => setSelectedYear('')}
                            className="ml-1 text-blue-600 hover:text-blue-800"
                          >
                            ×
                          </button>
                        </span>
                      )}
                      {selectedSection && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                          Section: {selectedSection}
                          <button
                            onClick={() => setSelectedSection('')}
                            className="ml-1 text-blue-600 hover:text-blue-800"
                          >
                            ×
                          </button>
                        </span>
                      )}
                      {(selectedYear || selectedSection) && (
                        <button
                          onClick={handleClearFilters}
                          className="text-xs text-gray-600 hover:text-gray-800 underline"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2" ref={filterDropdownRef}>
                  {/* Filter Button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        (selectedYear || selectedSection)
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                      Filter
                    </button>
                    
                    {/* Filter Dropdown */}
                    {showFilters && (
                      <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg z-50 border border-gray-200">
                        <div className="p-4 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                            <select
                              value={selectedYear}
                              onChange={(e) => setSelectedYear(e.target.value)}
                              className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">All Years</option>
                              {years.map((year) => (
                                <option key={year.id} value={year.name}>{year.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                            <select
                              value={selectedSection}
                              onChange={(e) => setSelectedSection(e.target.value)}
                              className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">All Sections</option>
                              {sections.map((section) => (
                                <option key={section.id} value={section.name}>{section.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-2">
              {filteredResponses.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-sm font-medium">No students match the selected filters</p>
                  <button
                    onClick={handleClearFilters}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <>
                  {/* Table Toolbar with Export Button */}
                  <div className="flex items-center justify-end mb-2 px-2">
                    <button
                      onClick={exportToPDF}
                      disabled={filteredResponses.length === 0}
                      className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        filteredResponses.length === 0
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export PDF
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Student
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Year/Section
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Submitted
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Completion Time
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Satisfaction Score
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredResponses.map((student) => (
                        <tr key={student.studentId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div>
                              <div className="text-xs font-medium text-gray-900">
                                {student.studentName}
                              </div>
                              <div className="text-xs text-gray-500">
                                {student.studentEmail}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="text-xs text-gray-900">
                              {student.year} / {student.section}
                            </div>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="text-xs text-gray-900">
                              {new Date(student.submittedAt).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(student.submittedAt).toLocaleTimeString()}
                            </div>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="text-xs text-gray-900">
                              {formatCompletionTime(student.completionTime)}
                            </div>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {student.satisfactionScore ? (
                              <div className="flex items-center space-x-1">
                                <StarRating
                                  value={student.satisfactionScore}
                                  onChange={() => {}}
                                  disabled={true}
                                />
                                <span className={`text-xs font-medium ${getSatisfactionColor(student.satisfactionScore)}`}>
                                  {student.satisfactionScore.toFixed(1)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500">N/A</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* Empty State for Student Responses */}
      {analytics.studentResponses.length === 0 && (
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Student Responses</CardTitle>
            <CardDescription>No student responses available yet</CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12">
            <div className="text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-medium">Waiting for student submissions</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}