import { createClient } from "@/lib/supabase/server";

export interface LeaderboardEntry {
  id: string;
  name: string;
  totalPoints: number;
  scheduledClassPoints: number;
  additionalClassPoints: number;
  examPoints: number;
  dept: string;
  year: string;
  section: string;
}

interface ExamConfigItem {
  exam_id: string;
  weight: number;
}

export async function calculateLeaderboard(
  departmentId: string
): Promise<LeaderboardEntry[]> {
  const supabase = await createClient();

  // Get department name
  const { data: deptData } = await supabase
    .from("departments")
    .select("name")
    .eq("id", departmentId)
    .single();

  if (!deptData) return [];

  // Get scoring config
  const { data: scoringConfig } = await supabase
    .from("leaderboard_scoring_config")
    .select("*")
    .eq("department", deptData.name)
    .single();

  const scheduledWeight = scoringConfig?.scheduled_classes_weight ?? 100;
  const additionalWeight = scoringConfig?.additional_classes_weight ?? 0;
  const examWeight = scoringConfig?.exam_weight ?? 0;
  const examConfig: ExamConfigItem[] = Array.isArray(scoringConfig?.exam_config)
    ? scoringConfig.exam_config
    : [];
  const totalWeight = scheduledWeight + additionalWeight + examWeight;

  if (totalWeight === 0) return [];

  // Get all peer tutors
  const { data: peerTutors } = await supabase
    .from("peer_tutors")
    .select("id, name, dept, year, section")
    .eq("faculty_id", departmentId);

  if (!peerTutors || peerTutors.length === 0) return [];

  const tutorIds = peerTutors.map((t) => t.id);

  // --- SCHEDULED CLASS SCORE: attendance present % ---
  const { data: scheduledAttendance } = await supabase
    .from("attendance")
    .select("peer_tutor_id, status")
    .in("peer_tutor_id", tutorIds)
    .not("scheduled_class_id", "is", null);

  const scheduledStats: Record<string, { present: number; total: number }> = {};
  if (scheduledAttendance) {
    for (const r of scheduledAttendance) {
      if (!scheduledStats[r.peer_tutor_id]) {
        scheduledStats[r.peer_tutor_id] = { present: 0, total: 0 };
      }
      scheduledStats[r.peer_tutor_id].total++;
      if (r.status === "present") {
        scheduledStats[r.peer_tutor_id].present++;
      }
    }
  }

  // --- ADDITIONAL CLASS SCORE: attendance present % ---
  const { data: additionalAttendance } = await supabase
    .from("additional_class_attendance")
    .select("peer_tutor_id, status")
    .in("peer_tutor_id", tutorIds);

  const additionalStats: Record<string, { present: number; total: number }> = {};
  if (additionalAttendance) {
    for (const r of additionalAttendance) {
      if (!additionalStats[r.peer_tutor_id]) {
        additionalStats[r.peer_tutor_id] = { present: 0, total: 0 };
      }
      additionalStats[r.peer_tutor_id].total++;
      if (r.status === "present") {
        additionalStats[r.peer_tutor_id].present++;
      }
    }
  }

  // --- EXAM SCORE: from exam_peer_tutor_summary ---
  const examScores: Record<string, number> = {};
  if (examConfig.length > 0 && examWeight > 0) {
    const examIds = examConfig.map((e) => e.exam_id);
    const totalExamConfigWeight = examConfig.reduce((s, e) => s + e.weight, 0);

    const { data: examSummaries } = await supabase
      .from("exam_peer_tutor_summary")
      .select("peer_tutor_id, exam_id, ascend_score")
      .in("peer_tutor_id", tutorIds)
      .in("exam_id", examIds);

    if (examSummaries && totalExamConfigWeight > 0) {
      const wMap: Record<string, number> = {};
      for (const ec of examConfig) wMap[ec.exam_id] = ec.weight;

      for (const s of examSummaries) {
        const w = wMap[s.exam_id] || 0;
        const score = (Number(s.ascend_score) * w) / totalExamConfigWeight;
        examScores[s.peer_tutor_id] = (examScores[s.peer_tutor_id] || 0) + score;
      }
    }
  }

  // --- CALCULATE FINAL SCORE ---
  const leaderboard: LeaderboardEntry[] = peerTutors.map((tutor) => {
    const s = scheduledStats[tutor.id] || { present: 0, total: 0 };
    const scheduledPct = s.total > 0 ? (s.present / s.total) * 100 : 0;
    const scheduledClassPoints = (scheduledPct * scheduledWeight) / totalWeight;

    const a = additionalStats[tutor.id] || { present: 0, total: 0 };
    const additionalPct = a.total > 0 ? (a.present / a.total) * 100 : 0;
    const additionalClassPoints = (additionalPct * additionalWeight) / totalWeight;

    const rawExam = examScores[tutor.id] || 0;
    const examPoints = (rawExam * examWeight) / totalWeight;

    const totalPoints =
      Math.round((scheduledClassPoints + additionalClassPoints + examPoints) * 10) / 10;

    return {
      id: tutor.id,
      name: tutor.name,
      totalPoints,
      scheduledClassPoints: Math.round(scheduledClassPoints * 10) / 10,
      additionalClassPoints: Math.round(additionalClassPoints * 10) / 10,
      examPoints: Math.round(examPoints * 10) / 10,
      dept: tutor.dept,
      year: tutor.year,
      section: tutor.section,
    };
  });

  leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
  return leaderboard;
}
