/**
 * Calculate Ascend score (1-10) based on student marks across all subjects
 * Formula considers:
 * - Average percentage across all subjects
 * - Consistency (how evenly distributed the scores are)
 * - Completion rate (how many subjects have marks)
 * 
 * @param marksData - Object with structure: { [subjectId]: { marks: string } }
 * @param maxMarks - Maximum marks for the exam
 * @returns Ascend score from 1 to 10
 */
export function calculateAscendScore(
  marksData: Record<string, Record<string, number | string>>,
  maxMarks: number,
  relevantSubjectCount?: number
): number {
  if (!marksData || Object.keys(marksData).length === 0) {
    return 0
  }

  const subjectScores: number[] = []
  
  // Extract numeric scores from marks data
  Object.values(marksData).forEach((subjectMarks) => {
    const marksValue = subjectMarks['marks']
    if (marksValue !== undefined && marksValue !== null && marksValue !== '') {
      const numericValue = typeof marksValue === 'string' 
        ? parseFloat(marksValue) 
        : Number(marksValue)
      
      if (!isNaN(numericValue) && numericValue >= 0) {
        subjectScores.push(numericValue)
      }
    }
  })

  if (subjectScores.length === 0) {
    return 0
  }

  // Calculate average percentage
  const totalScore = subjectScores.reduce((sum, score) => sum + score, 0)
  const averageScore = totalScore / subjectScores.length
  const averagePercentage = (averageScore / maxMarks) * 100

  // Calculate consistency (lower standard deviation = higher consistency)
  const mean = averageScore
  const variance = subjectScores.reduce((sum, score) => {
    return sum + Math.pow(score - mean, 2)
  }, 0) / subjectScores.length
  const stdDev = Math.sqrt(variance)
  const consistencyScore = Math.max(0, 100 - (stdDev / maxMarks) * 100)

  // Completion rate (normalize against the provided count, or default to the number of subjects in marksData)
  const totalSubjects = relevantSubjectCount !== undefined ? relevantSubjectCount : Object.keys(marksData).length
  const completionRate = totalSubjects > 0 ? (subjectScores.length / totalSubjects) * 100 : 0

  // Weighted formula:
  // - 60% weight on average percentage
  // - 25% weight on consistency
  // - 15% weight on completion rate
  const weightedScore = 
    (averagePercentage * 0.6) + 
    (consistencyScore * 0.25) + 
    (completionRate * 0.15)

  // Scale to 1-10 range
  // 90-100% = 9-10, 80-90% = 8-9, etc.
  let ascendScore = (weightedScore / 10)
  
  // Ensure score is between 1 and 10
  ascendScore = Math.max(1, Math.min(10, ascendScore))
  
  // Round to 1 decimal place
  return Math.round(ascendScore * 10) / 10
}

/**
 * Calculate Ascend score for a peer tutor based on all their students' marks
 */
export function calculatepeertutorsAscendScore(
  allStudentsMarks: Record<string, Record<string, Record<string, number | string>>>,
  maxMarks: number,
  relevantSubjectCounts?: Record<string, number>
): number {
  if (!allStudentsMarks || Object.keys(allStudentsMarks).length === 0) {
    return 0
  }

  const studentScores: number[] = []

  // Calculate Ascend score for each student
  Object.keys(allStudentsMarks).forEach((studentId) => {
    const studentMarks = allStudentsMarks[studentId]
    const studentAscend = calculateAscendScore(
      studentMarks, 
      maxMarks, 
      relevantSubjectCounts ? relevantSubjectCounts[studentId] : undefined
    )
    if (studentAscend > 0) {
      studentScores.push(studentAscend)
    }
  })

  if (studentScores.length === 0) {
    return 0
  }

  // Return average Ascend score across all students
  const averageAscend = studentScores.reduce((sum, score) => sum + score, 0) / studentScores.length
  return Math.round(averageAscend * 10) / 10
}

