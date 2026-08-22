/**
 * A transcription of the role list in docs/security/rbac.md, kept separate from the schema so a
 * test can compare the two. If someone edits the schema without the document, or the document
 * without the schema, `constraints.test.ts` fails.
 */
export default {
  roles: [
    'student',
    'lecturer_coach',
    'lab_admin',
    'academic_lead',
    'researcher',
    'faculty_executive',
    'external_partner',
  ],
} as const
