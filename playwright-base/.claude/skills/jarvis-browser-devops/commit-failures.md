# CI Health Report

Generate a CI health report for the last commit on the `main` branch of `microsoft/playwright`.
This is an overall tree health report ΓÇö not a commit regression analysis. The goal is to show
the full picture of what's failing, grouping by root cause. If any failures appear to be
regressions introduced by this specific commit, call that out, but most failures will be
pre-existing flakes, infrastructure issues, or platform-specific problems.

## Phase 1 ΓÇö Fetch logs

Run the fetch script to download all failed job logs into a local folder:

```
bash .claude/skills/playwright-devops/fetch-commit-logs.sh [<sha>]
```

- If no SHA is provided, it fetches the last commit on `main`.
- Creates `~/tmp/commit-<short-sha>/` with:
  - `summary.json` ΓÇö commit info, failed workflows, and failed job metadata
  - `<workflow-name>/<job-name>.log` ΓÇö failed log output for each failed job

**Note:** The script fetches failed jobs from both failed AND in-progress workflows.
Workflows may still be running while some of their jobs have already failed ΓÇö these
must be included in the report. If any workflows are still in progress, note this in
the report summary.

## Phase 2 ΓÇö Analyze

1. **Read `summary.json`** to get the commit message and the list of failed workflows/jobs.

2. **Read each `.log` file** and extract failing test names and error messages.

3. **Compile the report leading with a summary**, then detailed tables:

   ```markdown
   # CI Health Report ΓÇö <short-sha>

   Commit: `<commit message>`

   ## Summary

   Brief overview: N workflows, N failed jobs, N total test failures.
   Note if any workflows are still in progress.

   ### Possible regressions (may be related to this commit)
   - **N failures** in `test/file.spec.ts` across <browsers/platforms> ΓÇö <brief description>

   ### Pre-existing / flaky
   - **N failures** in `test/file.spec.ts` ΓÇö <brief description> (timeouts, infrastructure, platform-specific)

   ### Infrastructure issues
   - <description of non-test failures>

   ---

   ## Detailed Failures

   ### Workflow: <name> (run <id>)

   #### <job name> (job <id>) -- N failures
   | Test | Error |
   |------|-------|
   | `path/to/test.spec.ts:line` -- test title | error message |
   ```

   The summary should appear first so readers immediately see what matters. Group related failures
   (e.g. same test failing across browsers) into single summary bullet points rather than listing each individually.

4. **Save the report** to `ci-failures-<short-sha>.md` in the repo root.