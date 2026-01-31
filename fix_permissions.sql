-- Enable RLS on departments table if not already enabled
ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users (Peer Tutors) to view the department they are assigned to
CREATE POLICY "Allow peer tutors to view their assigned department"
ON "public"."departments"
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT faculty_id 
    FROM peer_tutors 
    WHERE email = auth.email()
  )
);

-- Fallback policy: Allow reading specific setting by department name (if needed)
-- Note: This is broader, use if the above is too restrictive or if linkage is broken
-- CREATE POLICY "Allow reading department settings"
-- ON "public"."departments"
-- FOR SELECT
-- TO authenticated
-- USING (true);
