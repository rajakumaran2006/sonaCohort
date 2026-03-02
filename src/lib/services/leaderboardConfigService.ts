import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

export interface ExamConfigItem {
  exam_id: string
  exam_name: string
  included: boolean
  weight: number // contribution among included exams, must sum to 100
}

export interface LeaderboardScoringConfig {
  id?: string
  department: string
  scheduled_classes_weight: number
  additional_classes_weight: number
  exam_weight: number
  exam_config: ExamConfigItem[]
  created_at?: string
  updated_at?: string
}

export interface TutorScoreInput {
  classStats: {
    totalClasses: number
    completedClasses: number
    pendingClasses?: number
    upcomingClasses?: number
    overdueClasses?: number
  }
  additionalClassesCount: number
}

export interface ExamSummaryForScoring {
  exam_id: string
  peer_tutor_id: string
  ascend_score: number
}

const DEFAULT_CONFIG: Omit<LeaderboardScoringConfig, 'id' | 'department' | 'created_at' | 'updated_at'> = {
  scheduled_classes_weight: 100,
  additional_classes_weight: 0,
  exam_weight: 0,
  exam_config: [],
}

export class LeaderboardConfigService {

  /**
   * Get the scoring config for a department. Returns defaults if none exists.
   */
  static async getConfig(department: string): Promise<LeaderboardScoringConfig> {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('leaderboard_scoring_config')
        .select('*')
        .eq('department', department)
        .single()

      if (error || !data) {
        logger.info('No leaderboard config found for department, using defaults:', department)
        return { department, ...DEFAULT_CONFIG }
      }

      return {
        ...data,
        exam_config: data.exam_config || [],
      } as LeaderboardScoringConfig
    } catch (error) {
      logger.error('Error fetching leaderboard config:', error)
      return { department, ...DEFAULT_CONFIG }
    }
  }

  /**
   * Upsert the scoring config for a department.
   */
  static async upsertConfig(
    department: string,
    config: {
      scheduled_classes_weight: number
      additional_classes_weight: number
      exam_weight: number
      exam_config: ExamConfigItem[]
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const total = config.scheduled_classes_weight + config.additional_classes_weight + config.exam_weight
      if (total !== 100) {
        return { success: false, error: `Main weights must sum to 100 (currently ${total})` }
      }

      // Validate exam config weights if exam_weight > 0
      if (config.exam_weight > 0) {
        const includedExams = config.exam_config.filter(e => e.included)
        if (includedExams.length === 0) {
          return { success: false, error: 'At least one exam must be included when exam weight > 0' }
        }
        const examTotal = includedExams.reduce((sum, e) => sum + e.weight, 0)
        if (examTotal !== 100) {
          return { success: false, error: `Included exam weights must sum to 100 (currently ${examTotal})` }
        }
      }

      const supabase = createClient()

      const { error } = await supabase
        .from('leaderboard_scoring_config')
        .upsert(
          {
            department,
            scheduled_classes_weight: config.scheduled_classes_weight,
            additional_classes_weight: config.additional_classes_weight,
            exam_weight: config.exam_weight,
            exam_config: config.exam_config,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'department' }
        )

      if (error) {
        logger.error('Error upserting leaderboard config:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        })
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      logger.error('Error in upsertConfig:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Calculate a tutor's leaderboard score (out of 100) based on the config.
   * 
   * @param tutor - tutor class stats and additional class count
   * @param config - scoring config with weights
   * @param examSummaries - optional array of exam summaries for this tutor
   * @returns an object containing the final score and its breakdown
   */
  static calculateScore(
    tutor: TutorScoreInput,
    config: LeaderboardScoringConfig,
    examSummaries?: ExamSummaryForScoring[]
  ): {
    finalScore: number,
    breakdown: {
      scheduledScore: number,
      scheduledWeighted: number,
      additionalScore: number,
      additionalWeighted: number,
      examScore: number,
      examWeighted: number
    }
  } {
    // 1. Scheduled Classes Score (0-100): completion percentage
    const completed = tutor.classStats?.completedClasses || 0
    const total = tutor.classStats?.totalClasses || 0
    const scheduledScoreRaw = total > 0 ? (completed / total) * 100 : 0
    const scheduledScore = Math.round(scheduledScoreRaw * 10) / 10
    const scheduledWeightedRaw = (scheduledScore * config.scheduled_classes_weight) / 100
    const scheduledWeighted = Math.round(scheduledWeightedRaw * 10) / 10

    // 2. Additional Classes Score (0-100): capped at 100, multiplier of 10
    const additionalCount = tutor.additionalClassesCount || 0
    const additionalScoreRaw = Math.min(additionalCount * 10, 100)
    const additionalScore = Math.round(additionalScoreRaw * 10) / 10
    const additionalWeightedRaw = (additionalScore * config.additional_classes_weight) / 100
    const additionalWeighted = Math.round(additionalWeightedRaw * 10) / 10

    // 3. Exam Score (0-100): weighted average of included exams' ascend scores
    let examScoreRaw = 0
    if (config.exam_weight > 0 && config.exam_config.length > 0 && examSummaries) {
      const includedExams = config.exam_config.filter(e => e.included)
      if (includedExams.length > 0) {
        let weightedSum = 0
        for (const examCfg of includedExams) {
          const summary = examSummaries.find(s => s.exam_id === examCfg.exam_id)
          // Ascend score is 0-10, normalize to 0-100
          const normalizedScore = summary ? (summary.ascend_score / 10) * 100 : 0
          weightedSum += normalizedScore * (examCfg.weight / 100)
        }
        examScoreRaw = weightedSum
      }
    }
    const examScore = Math.round(examScoreRaw * 10) / 10
    const examWeightedRaw = (examScore * config.exam_weight) / 100
    const examWeighted = Math.round(examWeightedRaw * 10) / 10

    // Final score out of 100
    const finalScoreRaw = scheduledWeighted + additionalWeighted + examWeighted
    const finalScore = Math.round(finalScoreRaw * 10) / 10

    return {
      finalScore,
      breakdown: {
        scheduledScore,
        scheduledWeighted,
        additionalScore,
        additionalWeighted,
        examScore,
        examWeighted
      }
    }
  }

  /**
   * Returns the default config (for resetting).
   */
  static getDefaultConfig(): Omit<LeaderboardScoringConfig, 'id' | 'department' | 'created_at' | 'updated_at'> {
    return { ...DEFAULT_CONFIG, exam_config: [] }
  }
}
