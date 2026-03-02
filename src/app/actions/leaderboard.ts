'use server'

import { calculateLeaderboard, LeaderboardEntry } from "@/lib/leaderboard";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function getLeaderboardAction(departmentId: string): Promise<LeaderboardEntry[]> {
  try {
    return await calculateLeaderboard(departmentId);
  } catch (error) {
    logger.error("Error in getLeaderboardAction:", error);
    return [];
  }
}

export async function getStudentDepartmentInfoAction(email: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('peer_students')
    .select('id, faculty_id, dept, year')
    .eq('email', email)
    .single();

  if (error) {
    logger.error("Error fetching student dept info:", error);
    return null;
  }
  return data;
}
