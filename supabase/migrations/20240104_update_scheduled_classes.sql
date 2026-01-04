-- Add progress and data columns to scheduled_classes
ALTER TABLE scheduled_classes 
ADD COLUMN IF NOT EXISTS topics TEXT,
ADD COLUMN IF NOT EXISTS image_link TEXT,
ADD COLUMN IF NOT EXISTS attendance_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS topics_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS completion_status TEXT DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Ensure attendance table columns exist (just in case)
ALTER TABLE attendance 
ADD COLUMN IF NOT EXISTS scheduled_class_id UUID REFERENCES scheduled_classes(id),
ADD COLUMN IF NOT EXISTS peer_tutor_id UUID REFERENCES peer_tutors(id);
