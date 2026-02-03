-- Add RLS policy to allow admins to delete any proposal
-- Run this in your Supabase SQL Editor

-- Policy: Admins can delete any proposal
CREATE POLICY "Admins can delete any proposal"
ON proposals
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Verify the policy was created
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'proposals' AND cmd = 'DELETE';
