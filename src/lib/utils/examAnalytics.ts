/**
 * Exam Analytics Utilities
 * Handles data preprocessing, feature engineering, and analytics calculations
 */

export interface ProcessedMark {
  studentId: string
  studentName: string
  subjectId: string
  subjectName: string
  rawMark: string | number
  numericMark: number
  maxMarks: number
  percentage: number
  normalizedScore: number // 0-1 scale
}

export interface StudentPerformance {
  studentId: string
  studentName: string
  totalMarks: number
  averagePercentage: number
  standardDeviation: number
  subjectCount: number
  subjectScores: Array<{
    subjectName: string
    mark: number
    percentage: number
    normalizedScore: number
  }>
  growthRate?: number // If previous data exists
}

export interface SubjectPerformance {
  subjectId: string
  subjectName: string
  averagePercentage: number
  standardDeviation: number
  studentCount: number
  studentScores: Array<{
    studentId: string
    studentName: string
    mark: number
    percentage: number
  }>
}

export interface AttentionItem {
  studentId: string
  studentName: string
  priority: 'high' | 'medium' | 'low'
  reasons: string[]
  subjects: Array<{
    subjectName: string
    percentage: number
    status: 'critical' | 'warning' | 'good'
  }>
  overallRank: number
  averagePercentage: number
}

/**
 * Preprocess marks data - convert "40/100" format to numerical values
 */
export function preprocessMarks(
  marksData: Record<string, Record<string, Record<string, number | string>>>,
  students: Array<{ id: string; name: string }>,
  subjects: Array<{ id: string; subject_name: string }>,
  maxMarks: number
): ProcessedMark[] {
  const processed: ProcessedMark[] = []

  students.forEach(student => {
    subjects.forEach(subject => {
      const markValue = marksData[student.id]?.[subject.id]?.['marks']
      
      if (markValue !== undefined && markValue !== null && markValue !== '') {
        let numericMark = 0
        let rawMark = markValue

        // Handle string format like "40/100" or "40"
        if (typeof markValue === 'string') {
          // Check if it's in "40/100" format
          if (markValue.includes('/')) {
            const parts = markValue.split('/')
            numericMark = parseFloat(parts[0]) || 0
          } else {
            numericMark = parseFloat(markValue) || 0
          }
        } else {
          numericMark = Number(markValue) || 0
        }

        if (!isNaN(numericMark) && numericMark >= 0) {
          const percentage = (numericMark / maxMarks) * 100
          const normalizedScore = numericMark / maxMarks // 0-1 scale

          processed.push({
            studentId: student.id,
            studentName: student.name,
            subjectId: subject.id,
            subjectName: subject.subject_name,
            rawMark,
            numericMark,
            maxMarks,
            percentage: Math.round(percentage * 10) / 10,
            normalizedScore: Math.round(normalizedScore * 1000) / 1000,
          })
        }
      }
    })
  })

  return processed
}

/**
 * Calculate student performance metrics
 */
export function calculateStudentPerformance(
  processedMarks: ProcessedMark[]
): StudentPerformance[] {
  const studentMap = new Map<string, StudentPerformance>()

  // Group by student
  processedMarks.forEach(mark => {
    if (!studentMap.has(mark.studentId)) {
      studentMap.set(mark.studentId, {
        studentId: mark.studentId,
        studentName: mark.studentName,
        totalMarks: 0,
        averagePercentage: 0,
        standardDeviation: 0,
        subjectCount: 0,
        subjectScores: [],
      })
    }

    const student = studentMap.get(mark.studentId)!
    student.totalMarks += mark.numericMark
    student.subjectCount++
    student.subjectScores.push({
      subjectName: mark.subjectName,
      mark: mark.numericMark,
      percentage: mark.percentage,
      normalizedScore: mark.normalizedScore,
    })
  })

  // Calculate statistics for each student
  const results: StudentPerformance[] = []
  studentMap.forEach(student => {
    const percentages = student.subjectScores.map(s => s.percentage)
    const average = percentages.reduce((sum, p) => sum + p, 0) / percentages.length
    const variance = percentages.reduce((sum, p) => sum + Math.pow(p - average, 2), 0) / percentages.length
    const stdDev = Math.sqrt(variance)

    results.push({
      ...student,
      averagePercentage: Math.round(average * 10) / 10,
      standardDeviation: Math.round(stdDev * 10) / 10,
    })
  })

  return results.sort((a, b) => b.averagePercentage - a.averagePercentage)
}

/**
 * Calculate subject-wise performance
 */
export function calculateSubjectPerformance(
  processedMarks: ProcessedMark[]
): SubjectPerformance[] {
  const subjectMap = new Map<string, SubjectPerformance>()

  // Group by subject
  processedMarks.forEach(mark => {
    if (!subjectMap.has(mark.subjectId)) {
      subjectMap.set(mark.subjectId, {
        subjectId: mark.subjectId,
        subjectName: mark.subjectName,
        averagePercentage: 0,
        standardDeviation: 0,
        studentCount: 0,
        studentScores: [],
      })
    }

    const subject = subjectMap.get(mark.subjectId)!
    subject.studentCount++
    subject.studentScores.push({
      studentId: mark.studentId,
      studentName: mark.studentName,
      mark: mark.numericMark,
      percentage: mark.percentage,
    })
  })

  // Calculate statistics for each subject
  const results: SubjectPerformance[] = []
  subjectMap.forEach(subject => {
    const percentages = subject.studentScores.map(s => s.percentage)
    const average = percentages.reduce((sum, p) => sum + p, 0) / percentages.length
    const variance = percentages.reduce((sum, p) => sum + Math.pow(p - average, 2), 0) / percentages.length
    const stdDev = Math.sqrt(variance)

    results.push({
      ...subject,
      averagePercentage: Math.round(average * 10) / 10,
      standardDeviation: Math.round(stdDev * 10) / 10,
    })
  })

  return results.sort((a, b) => b.averagePercentage - a.averagePercentage)
}

/**
 * Generate attention items - students needing attention ranked by priority
 */
export function generateAttentionItems(
  studentPerformance: StudentPerformance[]
): AttentionItem[] {
  const attentionItems: AttentionItem[] = []

  studentPerformance.forEach((student, index) => {
    const reasons: string[] = []
    const subjects: Array<{
      subjectName: string
      percentage: number
      status: 'critical' | 'warning' | 'good'
    }> = []

    let criticalCount = 0
    let warningCount = 0

    student.subjectScores.forEach(subject => {
      let status: 'critical' | 'warning' | 'good' = 'good'
      
      if (subject.percentage < 40) {
        status = 'critical'
        criticalCount++
      } else if (subject.percentage < 60) {
        status = 'warning'
        warningCount++
      }

      subjects.push({
        subjectName: subject.subjectName,
        percentage: subject.percentage,
        status,
      })

      if (status === 'critical') {
        reasons.push(`${subject.subjectName} is critically low (${subject.percentage}%)`)
      } else if (status === 'warning') {
        reasons.push(`${subject.subjectName} needs improvement (${subject.percentage}%)`)
      }
    })

    // Determine priority
    let priority: 'high' | 'medium' | 'low' = 'low'
    if (criticalCount > 0 || student.averagePercentage < 40) {
      priority = 'high'
    } else if (warningCount > 0 || student.averagePercentage < 60) {
      priority = 'medium'
    }

    // Add general reasons
    if (student.averagePercentage < 50) {
      reasons.unshift(`Overall performance is below average (${student.averagePercentage}%)`)
    }
    if (student.standardDeviation > 25) {
      reasons.push(`Inconsistent performance across subjects (high variance: ${student.standardDeviation}%)`)
    }

    attentionItems.push({
      studentId: student.studentId,
      studentName: student.studentName,
      priority,
      reasons: reasons.length > 0 ? reasons : ['Performing well across all subjects'],
      subjects,
      overallRank: index + 1,
      averagePercentage: student.averagePercentage,
    })
  })

  // Sort by priority (high first), then by average percentage
  return attentionItems.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return a.averagePercentage - b.averagePercentage
  })
}

/**
 * Calculate simple linear regression for trend prediction
 */
export function calculateTrend(
  data: Array<{ x: number; y: number }>
): { slope: number; intercept: number; prediction: number } {
  if (data.length === 0) {
    return { slope: 0, intercept: 0, prediction: 0 }
  }

  const n = data.length
  const sumX = data.reduce((sum, d) => sum + d.x, 0)
  const sumY = data.reduce((sum, d) => sum + d.y, 0)
  const sumXY = data.reduce((sum, d) => sum + d.x * d.y, 0)
  const sumXX = data.reduce((sum, d) => sum + d.x * d.x, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Predict next value
  const nextX = data[data.length - 1].x + 1
  const prediction = slope * nextX + intercept

  return {
    slope: Math.round(slope * 100) / 100,
    intercept: Math.round(intercept * 100) / 100,
    prediction: Math.round(prediction * 10) / 10,
  }
}

/**
 * Generate ML-style insights
 */
export function generateInsights(
  studentPerformance: StudentPerformance[],
  subjectPerformance: SubjectPerformance[]
): string[] {
  const insights: string[] = []

  // Overall performance insights
  const avgPerformance = studentPerformance.reduce((sum, s) => sum + s.averagePercentage, 0) / studentPerformance.length
  if (avgPerformance < 60) {
    insights.push(`Overall class performance is below average (${avgPerformance.toFixed(1)}%). Consider targeted intervention.`)
  } else if (avgPerformance >= 80) {
    insights.push(`Excellent overall class performance (${avgPerformance.toFixed(1)}%). Maintain current teaching strategies.`)
  }

  // Subject insights
  subjectPerformance.forEach(subject => {
    if (subject.averagePercentage < 50) {
      insights.push(`${subject.subjectName} shows low average performance (${subject.averagePercentage.toFixed(1)}%). Focus on this subject.`)
    }
    if (subject.standardDeviation > 20) {
      insights.push(`${subject.subjectName} has high variance (${subject.standardDeviation.toFixed(1)}%). Consider differentiated instruction.`)
    }
  })

  // Student consistency insights
  const inconsistentStudents = studentPerformance.filter(s => s.standardDeviation > 25)
  if (inconsistentStudents.length > 0) {
    insights.push(`${inconsistentStudents.length} student(s) show inconsistent performance. Provide targeted support.`)
  }

  // Top performers
  const topPerformers = studentPerformance.filter(s => s.averagePercentage >= 80).slice(0, 3)
  if (topPerformers.length > 0) {
    insights.push(`Top performers: ${topPerformers.map(s => s.studentName).join(', ')}. Consider peer tutoring opportunities.`)
  }

  return insights.length > 0 ? insights : ['All students are performing consistently well.']
}

