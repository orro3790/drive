# Audit schemas, types, and configuration

Task: DRV-ehh

## Steps

1. Enumerate every file in `src/lib/schemas/` and `src/lib/config/`, assert expected scope counts (25 schema files and 4 config files), and record the audited file list in the report.
2. Audit each Zod schema for completeness and validation quality (required fields, constraints, enums, ranges, lengths, and missing guardrails).
3. Build an explicit Zod-to-Drizzle mapping for tables/enums/columns, flag mismatches in both directions (Zod-only and Drizzle-only), and verify type export consistency with conflicting/redundant type detection.
4. Validate config and policy alignment against `CLAUDE.md`, including dispatch policy values, notification template placeholder correctness (missing/extra/unknown tokens), and lifecycle state-machine coverage (state labels plus valid/invalid transition handling).
5. Write `logs/nightly/2026-02-10/audit-schemas-config.md` with findings grouped by severity (Critical/High/Medium/Low), evidence (`file:path:line`), impact, remediation, and a final coverage table proving all 29 target files were audited.

## Acceptance Criteria

- Production-readiness audit covers all files in `src/lib/schemas/` and `src/lib/config/`, with the expected 25+4 file scope verified.
- Findings include checks for schema completeness, schema-database alignment, type export consistency, and missing validations.
- Findings include checks for dispatch policy/business-rule alignment against `CLAUDE.md`, notification template placeholder correctness, and lifecycle state/transition plus label coverage.
- Report is written to `logs/nightly/2026-02-10/audit-schemas-config.md` with severity ratings, evidence, and a coverage table.
