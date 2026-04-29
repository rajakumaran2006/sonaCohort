import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LeaderboardClient from "@/app/incharge/leaderboard/LeaderboardClient";
import { calculateLeaderboard } from "@/lib/leaderboard";

interface ExamConfig {
  exam_id: string;
  exam_name: string;
  weight: number;
  included: boolean;
}

interface ScoringConfig {
  scheduled_classes_weight: number;
  additional_classes_weight: number;
  exam_weight: number;
  feedback_weight: number;
  exam_config: ExamConfig[];
  department: string;
}

async function fetchScoringConfig(
  departmentName: string
): Promise<ScoringConfig | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leaderboard_scoring_config")
    .select("*")
    .eq("department", departmentName)
    .single();
  return data as ScoringConfig | null;
}

const createDefaultScoringConfig = (departmentName: string): ScoringConfig => ({
  scheduled_classes_weight: 100,
  additional_classes_weight: 0,
  exam_weight: 0,
  feedback_weight: 0,
  exam_config: [],
  department: departmentName,
});

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: department } = await supabase
    .from("departments")
    .select("*")
    .eq("faculty_email", user.email)
    .single();

  if (!department) redirect("/login");

  const leaderboardEntries = await calculateLeaderboard(department.id);
  const scoringConfig = await fetchScoringConfig(department.name);

  const leaderboardData = leaderboardEntries.map((entry, index) => ({
    rank: index + 1,
    odealId: entry.id,
    odealName: entry.name,
    points: entry.totalPoints,
    scheduledClassPoints: entry.scheduledClassPoints,
    additionalClassPoints: entry.additionalClassPoints,
    examPoints: entry.examPoints,
    dept: entry.dept,
    dept_id: department.id,
    year: entry.year,
    section: entry.section,
  }));

  const years = [...new Set(leaderboardData.map((item) => item.year))].sort();
  const sections = [...new Set(leaderboardData.map((item) => item.section))].sort();

  const resolvedConfig: ScoringConfig = scoringConfig ?? createDefaultScoringConfig(department.name);

  const examConfigs: ExamConfig[] = Array.isArray(resolvedConfig.exam_config)
    ? resolvedConfig.exam_config
    : [];

  let examNames: Record<string, string> = {};
  if (examConfigs.length > 0) {
    const examIds = examConfigs.map((e) => e.exam_id);
    const { data: exams } = await supabase
      .from("exams")
      .select("id, name")
      .in("id", examIds);
    if (exams) {
      examNames = Object.fromEntries(
        (exams as { id: string; name: string }[]).map((e) => [e.id, e.name])
      );
    }
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LeaderboardClient
        leaderboardData={leaderboardData}
        years={years}
        sections={sections}
        scoringConfig={resolvedConfig}
        examNames={examNames}
      />
    </Suspense>
  );
}
