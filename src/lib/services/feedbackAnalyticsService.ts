import { createClient } from '@/utils/supabase/client'
import { FeedbackForm, FeedbackResponseWithDetails } from './feedbackService'

export interface ResponseAnalytics {
  totalResponses: number
  totalStudents: number
  responseRate: number
  averageCompletionTime: number
  satisfactionScore: number
  satisfactionDelta: number
  questionAnalytics: QuestionAnalytics[]
  studentResponses: StudentResponseAnalytics[]
}

export interface AnalyticsFilterOptions {
  startDate?: string // ISO string (inclusive)
  endDate?: string   // ISO string (inclusive)
  year?: string
  section?: string
  questionId?: string
}

export interface QuestionAnalytics {
  questionId: string
  questionText: string
  questionType: 'multiple_choice' | 'text' | 'star_rating'
  totalResponses: number
  averageRating?: number
  medianRating?: number
  percentHighRatings?: number // % of ratings that are 4 or 5
  ratingDistribution?: { [rating: number]: number }
  optionDistribution?: { [option: string]: number }
  optionPercentages?: { [option: string]: number }
  topOption?: { option: string; count: number; percent: number }
  distinctOptionCount?: number
  textResponses?: string[]
  topKeywords?: string[]
  responseLengthHistogram?: { [bucket: string]: number }
}

export interface StudentResponseAnalytics {
  studentId: string
  studentName: string
  studentEmail: string
  year: string
  section: string
  submittedAt: string
  completionTime: number
  satisfactionScore?: number
  responses: {
    questionId: string
    questionText: string
    answer: string | number
    questionType: string
  }[]
}

export class FeedbackAnalyticsService {
  /**
   * Get comprehensive analytics for a feedback form
   */
  static async getFormAnalytics(
    formId: string,
    filters: AnalyticsFilterOptions = {}
  ): Promise<ResponseAnalytics | null> {
    try {
      const supabase = createClient()
      
      // Try versioning schema first
      try {
        const { data: formData, error: formError } = await supabase
          .from('feedback_forms')
          .select(`
            *,
            current_version:feedback_form_versions!inner (
              *,
              questions:feedback_question_versions (
                *
              )
            )
          `)
          .eq('id', formId)
          .eq('current_version.is_active', true)
          .single()

        if (!formError && formData) {
          return await this.processVersionedAnalytics(formData, formId, filters)
        }
      } catch (versioningError) {
        console.log('Versioning tables not available, falling back to legacy schema')
      }

      // Fallback to legacy schema
      const { data: formData, error: formError } = await supabase
        .from('feedback_forms')
        .select(`
          *,
          questions:feedback_questions (
            *
          )
        `)
        .eq('id', formId)
        .single()

      if (formError || !formData) {
        console.error('Error getting form data:', formError)
        return null
      }

      return await this.processLegacyAnalytics(formData, formId, filters)

    } catch (error) {
      console.error('Error in getFormAnalytics:', error)
      return null
    }
  }

  /**
   * Process analytics for versioned forms
   */
  private static async processVersionedAnalytics(
    formData: any,
    formId: string,
    filters: AnalyticsFilterOptions
  ): Promise<ResponseAnalytics> {
    const supabase = createClient()
    
    // Get all responses for this form
    const { data: responsesData, error: responsesError } = await supabase
      .from('feedback_responses')
      .select(`
        *,
        student:student_id (
          id,
          name,
          email,
          year,
          section
        ),
        responses:feedback_answers (
          *,
          question:question_id (
            question_text,
            question_type
          )
        )
      `)
      .eq('feedback_form_id', formId)
      .order('submitted_at', { ascending: false })

    if (responsesError) {
      console.error('Error getting responses:', responsesError)
    }

    return this.calculateAnalytics(formData, responsesData || [], formId, filters)
  }

  /**
   * Process analytics for legacy forms
   */
  private static async processLegacyAnalytics(
    formData: any,
    formId: string,
    filters: AnalyticsFilterOptions
  ): Promise<ResponseAnalytics> {
    const supabase = createClient()
    
    // Get all responses for this form
    const { data: responsesData, error: responsesError } = await supabase
      .from('feedback_responses')
      .select(`
        *,
        student:student_id (
          id,
          name,
          email,
          year,
          section
        ),
        responses:feedback_answers (
          *,
          question:question_id (
            question_text,
            question_type
          )
        )
      `)
      .eq('feedback_form_id', formId)
      .order('submitted_at', { ascending: false })

    if (responsesError) {
      console.error('Error getting responses:', responsesError)
    }

    return this.calculateAnalytics(formData, responsesData || [], formId, filters)
  }

  /**
   * Calculate analytics from form and response data
   */
  private static async calculateAnalytics(
    formData: any,
    responsesData: any[],
    formId: string,
    filters: AnalyticsFilterOptions
  ): Promise<ResponseAnalytics> {
    const supabase = createClient()
    
    // Apply filters to responses in-memory (safer with nested selects)
    let filteredResponses = responsesData || []

    if (filters.startDate) {
      const startTs = new Date(filters.startDate).getTime()
      filteredResponses = filteredResponses.filter(r => new Date(r.submitted_at).getTime() >= startTs)
    }
    if (filters.endDate) {
      const endTs = new Date(filters.endDate).getTime()
      filteredResponses = filteredResponses.filter(r => new Date(r.submitted_at).getTime() <= endTs)
    }
    if (filters.year) {
      filteredResponses = filteredResponses.filter(r => (r.student?.year || '') === filters.year)
    }
    if (filters.section) {
      filteredResponses = filteredResponses.filter(r => (r.student?.section || '') === filters.section)
    }

    // Get total student count
    const { count: totalStudents, error: studentCountError } = await supabase
      .from('peer_students')
      .select('*', { count: 'exact', head: true })
      .eq('peer_tutor', false)

    if (studentCountError) {
      console.error('Error getting student count:', studentCountError)
    }

    const totalStudentsCount = totalStudents || 0
    const totalResponses = filteredResponses?.length || 0
    const responseRate = totalStudentsCount > 0 ? (totalResponses / totalStudentsCount) * 100 : 0

    // Calculate completion times - only if we have responses
    const questions = formData.current_version?.questions || formData.questions || []
    let averageCompletionTime = 0
    
    if (totalResponses > 0 && filteredResponses) {
      const completionTimes = filteredResponses.map(response => {
        const questionCount = questions.length
        return Math.max(1, questionCount * 0.5) // Assume 30 seconds per question minimum
      })

      averageCompletionTime = completionTimes.length > 0 
        ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length 
        : 0
    }

    // Calculate satisfaction score and delta - only if we have responses
    const satisfactionMetrics = totalResponses > 0 
      ? this.calculateSatisfactionMetrics(questions, filteredResponses)
      : { averageScore: 0, delta: 0 }

    // Calculate question analytics
    // If a questionId filter is present, limit analytics to that question; otherwise all
    const filteredQuestions = filters.questionId
      ? (questions || []).filter((q: any) => q.id === filters.questionId)
      : questions

    const questionAnalytics = this.calculateQuestionAnalytics(filteredQuestions, filteredResponses)

    // Calculate student response analytics
    const studentResponses = this.calculateStudentResponseAnalytics(filteredResponses, questions)

    return {
      totalResponses,
      totalStudents: totalStudentsCount,
      responseRate,
      averageCompletionTime,
      satisfactionScore: satisfactionMetrics.averageScore,
      satisfactionDelta: satisfactionMetrics.delta,
      questionAnalytics,
      studentResponses
    }
  }

  /**
   * Calculate satisfaction metrics for star rating questions
   * Only calculates if ALL questions are star_rating type
   */
  private static calculateSatisfactionMetrics(
    questions: any[],
    responses: any[]
  ): { averageScore: number; delta: number } {
    // Only calculate satisfaction if ALL questions are star_rating
    if (questions.length === 0 || !responses || responses.length === 0) {
      return { averageScore: 0, delta: 0 }
    }
    
    const allStarRating = questions.every(q => q.question_type === 'star_rating')
    if (!allStarRating) {
      return { averageScore: 0, delta: 0 }
    }
    
    const starRatingQuestions = questions.filter(q => q.question_type === 'star_rating')

    let totalScore = 0
    let totalResponses = 0

    responses.forEach(response => {
      response.responses?.forEach((answer: any) => {
        const question = starRatingQuestions.find(q => q.id === answer.question_id)
        if (question && answer.star_rating) {
          totalScore += answer.star_rating
          totalResponses++
        }
      })
    })

    // Only calculate if we have actual responses
    if (totalResponses === 0) {
      return { averageScore: 0, delta: 0 }
    }

    const averageScore = totalScore / totalResponses
    
    // Calculate delta based on actual responses - only show delta when we have responses
    // Baseline is 3.5 (middle of 5-star scale)
    const delta = (averageScore - 3.5) * 20

    return { averageScore, delta }
  }

  /**
   * Calculate analytics for each question
   */
  private static calculateQuestionAnalytics(
    questions: any[],
    responses: any[]
  ): QuestionAnalytics[] {
    return questions.map(question => {
      const questionResponses = responses.flatMap(response => 
        response.responses?.filter((answer: any) => answer.question_id === question.id) || []
      )

      const analytics: QuestionAnalytics = {
        questionId: question.id,
        questionText: question.question_text,
        questionType: question.question_type,
        totalResponses: questionResponses.length
      }

      if (question.question_type === 'star_rating') {
        const ratings = questionResponses
          .map((answer: any) => answer.star_rating)
          .filter((rating: number) => rating !== null && rating !== undefined)

        if (ratings.length > 0) {
          analytics.averageRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
          analytics.medianRating = this.calculateMedian(ratings)
          const highCount = ratings.filter((r: number) => r >= 4).length
          analytics.percentHighRatings = (highCount / ratings.length) * 100
          
          // Calculate rating distribution
          analytics.ratingDistribution = {}
          for (let i = 1; i <= 5; i++) {
            analytics.ratingDistribution[i] = ratings.filter(rating => rating === i).length
          }
        }
      } else if (question.question_type === 'multiple_choice') {
        const options = questionResponses
          .map((answer: any) => {
            const opt = answer.selected_option
            if (opt === null || opt === undefined || String(opt).trim() === '') return 'Other'
            return String(opt)
          })

        analytics.optionDistribution = {}
        options.forEach(option => {
          analytics.optionDistribution![option] = (analytics.optionDistribution![option] || 0) + 1
        })

        const total = options.length || 0
        if (total > 0) {
          analytics.optionPercentages = {}
          Object.entries(analytics.optionDistribution).forEach(([opt, count]) => {
            analytics.optionPercentages![opt] = (count / total) * 100
          })
          const [topOpt, topCount] = Object.entries(analytics.optionDistribution).sort((a, b) => b[1] - a[1])[0]
          analytics.topOption = {
            option: topOpt,
            count: topCount,
            percent: (topCount / total) * 100
          }
          analytics.distinctOptionCount = Object.keys(analytics.optionDistribution).length
        }
      } else if (question.question_type === 'text') {
        analytics.textResponses = questionResponses
          .map((answer: any) => answer.answer_text)
          .filter((text: string) => text !== null && text !== undefined && text.trim() !== '')

        if (analytics.textResponses && analytics.textResponses.length > 0) {
          analytics.topKeywords = this.extractTopKeywords(analytics.textResponses, 5)
          analytics.responseLengthHistogram = this.buildLengthHistogram(analytics.textResponses)
        }
      }

      return analytics
    })
  }

  /**
   * Calculate student response analytics
   */
  private static calculateStudentResponseAnalytics(
    responses: any[],
    questions: any[]
  ): StudentResponseAnalytics[] {
    // Only calculate satisfaction if ALL questions are star_rating
    const allStarRating = questions.length > 0 && questions.every(q => q.question_type === 'star_rating')
    
    return responses.map(response => {
      const studentResponses = response.responses?.map((answer: any) => {
        const question = questions.find(q => q.id === answer.question_id)
        return {
          questionId: answer.question_id,
          questionText: question?.question_text || '',
          answer: answer.star_rating || answer.selected_option || answer.answer_text || '',
          questionType: question?.question_type || ''
        }
      }) || []

      // Calculate satisfaction score for this student - only if ALL questions are star_rating
      let satisfactionScore: number | undefined = undefined
      if (allStarRating) {
        const starRatingAnswers = studentResponses.filter(r => r.questionType === 'star_rating')
        satisfactionScore = starRatingAnswers.length > 0
          ? starRatingAnswers.reduce((sum, r) => sum + (r.answer as number), 0) / starRatingAnswers.length
          : undefined
      }

      // Estimate completion time
      const completionTime = Math.max(1, questions.length * 0.5)

      return {
        studentId: response.student_id,
        studentName: response.student?.name || 'Unknown',
        studentEmail: response.student?.email || '',
        year: response.student?.year || '',
        section: response.student?.section || '',
        submittedAt: response.submitted_at,
        completionTime,
        satisfactionScore,
        responses: studentResponses
      }
    })
  }

  /**
   * Utility: median of number array
   */
  private static calculateMedian(values: number[]): number {
    if (!values || values.length === 0) return 0
    const nums = [...values].sort((a, b) => a - b)
    const mid = Math.floor(nums.length / 2)
    if (nums.length % 2 === 0) {
      return (nums[mid - 1] + nums[mid]) / 2
    }
    return nums[mid]
  }

  /**
   * Utility: extract top keywords from an array of texts (basic heuristic)
   */
  private static extractTopKeywords(texts: string[], maxKeywords: number = 5): string[] {
    const stopwords = new Set([
      'the','a','an','and','or','but','if','then','else','for','to','of','in','on','at','with','by','is','are','was','were','be','been','it','this','that','these','those','I','you','he','she','they','we','as','from','about','not','no','yes','very','so','just','can','could','would','should','will','do','did','done'
    ])
    const counts: { [word: string]: number } = {}
    texts.forEach(t => {
      const words = String(t)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopwords.has(w))
      words.forEach(w => {
        counts[w] = (counts[w] + 1) || 1
      })
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([w]) => w)
  }

  /**
   * Utility: build response length histogram buckets
   */
  private static buildLengthHistogram(texts: string[]): { [bucket: string]: number } {
    const buckets: { [bucket: string]: number } = {
      '0-50': 0,
      '51-100': 0,
      '101-200': 0,
      '200+': 0
    }
    texts.forEach(t => {
      const len = String(t).trim().length
      if (len <= 50) buckets['0-50']++
      else if (len <= 100) buckets['51-100']++
      else if (len <= 200) buckets['101-200']++
      else buckets['200+']++
    })
    return buckets
  }

  /**
   * Get response trends over time
   */
  static async getResponseTrends(formId: string, days: number = 30): Promise<{
    date: string
    responses: number
  }[]> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('feedback_responses')
        .select('submitted_at')
        .eq('feedback_form_id', formId)
        .gte('submitted_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        .order('submitted_at', { ascending: true })

      if (error) {
        console.error('Error getting response trends:', error)
        return []
      }

      // Group by date
      const trends: { [date: string]: number } = {}
      data?.forEach(response => {
        const date = new Date(response.submitted_at).toISOString().split('T')[0]
        trends[date] = (trends[date] || 0) + 1
      })

      return Object.entries(trends).map(([date, responses]) => ({
        date,
        responses
      }))
    } catch (error) {
      console.error('Error in getResponseTrends:', error)
      return []
    }
  }

  /**
   * Get response trends for an arbitrary date range (inclusive)
   */
  static async getResponseTrendsRange(
    formId: string,
    startDate: string,
    endDate: string
  ): Promise<{ date: string; responses: number }[]> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('feedback_responses')
        .select('submitted_at')
        .eq('feedback_form_id', formId)
        .gte('submitted_at', new Date(startDate).toISOString())
        .lte('submitted_at', new Date(endDate).toISOString())
        .order('submitted_at', { ascending: true })

      if (error) {
        console.error('Error getting response trends (range):', error)
        return []
      }

      const trends: { [date: string]: number } = {}
      data?.forEach(response => {
        const date = new Date(response.submitted_at).toISOString().split('T')[0]
        trends[date] = (trends[date] || 0) + 1
      })

      return Object.entries(trends).map(([date, responses]) => ({ date, responses }))
    } catch (error) {
      console.error('Error in getResponseTrendsRange:', error)
      return []
    }
  }
}
