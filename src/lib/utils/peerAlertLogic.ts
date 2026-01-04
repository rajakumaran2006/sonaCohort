
import { ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { AdditionalClassWithAttendance } from '@/lib/services/additionalClassService'

interface AlertCalculationResult {
  showAlert: boolean
  consecutivePendingCount: number
}

/**
 * Calculates if a peer tutor should receive a "consecutive pending classes" alert.
 * 
 * Logic:
 * - Events (Scheduled Classes and Additional Classes) are sorted by date.
 * - Scheduled Classes:
 *   - "Pending" (and in the past): Increments counter by 1.
 *   - "Completed": Resets counter to 0.
 * - Additional Classes:
 *   - Always act as a credit: Decrements counter by 2 (floored at 0).
 * - Alert triggers if counter >= 3.
 */
export function calculatePendingClassAlert(
  scheduledClasses: ScheduledClassWithDetails[],
  additionalClasses: AdditionalClassWithAttendance[]
): AlertCalculationResult {
  // 1. Combine all events into a single timeline
  type TimelineEvent = 
    | { type: 'scheduled'; date: Date; item: ScheduledClassWithDetails }
    | { type: 'additional'; date: Date; item: AdditionalClassWithAttendance };

  const events: TimelineEvent[] = [];

  // Add scheduled classes
  scheduledClasses.forEach(cls => {
    // Only consider classes up to "now" for alert purposes (ignore future scheduled classes)
    const classDate = new Date(cls.scheduled_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to start of day for comparison
    
    // We include classes from today and the past
    // If a class is scheduled for today, it might be pending, so it counts
    if (classDate <= today) {
        events.push({
            type: 'scheduled',
            date: classDate,
            item: cls
        });
    }
  });

  // Add additional classes
  additionalClasses.forEach(cls => {
    events.push({
      type: 'additional',
      date: new Date(cls.class_date),
      item: cls
    });
  });

  // 2. Sort events chronologically
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // 3. Process events to calculate consecutive pending count
  let consecutivePendingCount = 0;

  for (const event of events) {
    if (event.type === 'scheduled') {
      const cls = event.item;
      
      // Determine if the class is completed
      // Logic copied from ScheduledClassService.getPeerTutorClassStatus
      const isCompleted = 
        cls.completion_status === 'completed' || 
        (cls.attendance_completed && cls.topics_completed) ||
        (cls.completion_status === 'pending' && cls.attendance_completed && cls.topics_completed);

      if (isCompleted) {
        // Break the streak
        consecutivePendingCount = 0;
      } else {
        // It's pending (and in "past" or today, as filtered above)
        // Note: Future classes were already filtered out
        consecutivePendingCount += 1;
      }
    } else if (event.type === 'additional') {
      // Additional class credits
      // "if he taken addintional classes consider as 2 only" -> interpret as reducing the penalty
      // Reducing the pending count by 2 acts as "covering" for 2 pending classes.
      consecutivePendingCount = Math.max(0, consecutivePendingCount - 2);
    }
  }

  // 4. Determine alert status
  const showAlert = consecutivePendingCount >= 3;

  return {
    showAlert,
    consecutivePendingCount
  };
}
