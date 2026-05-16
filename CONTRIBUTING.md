# Contributing

Workflow rules for the Aptus repo. Concise on purpose.

## The deploy promise

**`main` is always deployable.** Every commit on `main` must produce a successful Vercel build. If a commit can't deploy, it's not done.

The pre-push hook (`.githooks/pre-push`) runs `next build` before allowing a push, blocking broken commits before they reach Vercel. It auto-installs after `pnpm install`. Bypass only in emergencies via `SKIP_PRE_PUSH=1 git push`.

## Workflow

### Default — feature branch + self-merged PR

```bash
git switch -c feat/short-name        # branch from main
# ... commit work in small chunks ...
git push -u origin feat/short-name   # pre-push hook runs build
gh pr create --fill                  # creates PR; Vercel auto-deploys to preview URL
```

The Vercel preview URL is the **point** of the PR — even when self-reviewing, click around the preview before merging. When ready:

```bash
gh pr merge --squash --delete-branch
```

Squash-merge keeps `main`'s history at one commit per feature.

### Direct push to main — only for

- 1-line typo fixes
- Doc changes (`*.md`, `*.txt`)
- Build-time-only changes (CI workflow tweaks, gitignore)

Anything that changes `src/`, `prisma/`, `tests/`, or `package.json` should go through a feature branch so the preview URL exists.

## Visual regression — two suites

| Suite | What it tests | Config | When it runs |
|---|---|---|---|
| **Report mocks** (`pnpm test:visual`) | The 27 static HTML mocks under `docs/design/v1.2/reports/` via `file://` | `playwright.visual.config.ts` | Every PR — the `Visual Regression (report mocks)` CI job |
| **Live app** (`pnpm test:visual-app`) | The redesigned Next.js pages (`/design-system`, `/login`) via `next start` | `playwright.visual-app.config.ts` | CI job wired; baselines must be committed before the job actually runs |

### Generating live-app baselines (one-time setup)

The `visual-regression-app` CI job is wired in `.github/workflows/ci.yml` but guards itself: if `tests/visual-regression-app/redesigned-screens.spec.ts-snapshots/` is empty, the job emits a warning and skips. Generate baselines once on a machine that can complete `pnpm build` (≈ 3 GB memory):

```bash
pnpm test:visual-app:update
git add tests/visual-regression-app/redesigned-screens.spec.ts-snapshots/
git commit -m "test(visual-app): pin baselines for redesigned screens"
```

After the baselines are committed, every PR will run the suite and fail on any pixel drift.

## Local validation before push

The pre-push hook handles `next build` (~80s on this repo). For faster iteration loops while developing:

```bash
pnpm test:unit                        # ~6s — typed contract checks
pnpm test:visual                      # ~30s — design package regression
npx tsc --noEmit -p .                 # ~30s — strict type-check
```

If `next build` fails locally, **fix it before pushing**. Vercel runs the same command — if it fails locally it'll fail there, and you'll have polluted the deployment history.

## Commit style

- Imperative present tense: `feat(report): add Findings PDF` (not `added`)
- Scope tag in parentheses: `feat(report):`, `fix(build):`, `test(visual):`, `ci:`, `docs:`, `chore:`
- One logical change per commit. If you can't summarize it in one line, it's probably two commits.
- Body explains the *why*, not the *what* (the diff shows the what).

## Hook bypass — when it's actually OK

`SKIP_PRE_PUSH=1` exists because emergencies are real, not so you can ignore broken builds. Acceptable uses:

- Pushing a docs-only change when you know the build is unrelated
- Pushing a hotfix branch where you've already validated locally and the hook is too slow to wait

Not acceptable:

- "I'll fix the build in the next commit" — push a working commit instead
- "It's just a small change" — small changes break builds too
- Anything pushed to `main` directly (just don't)

## Failure alerts — you have three signals, subscribe to at least one

Aptus has three independent failure-alert channels. They overlap by design — if one is muted, the others still fire.

| Channel | What it catches | How to enable |
|---|---|---|
| **Vercel email** | Failed deploys | <https://vercel.com/account/notifications> → toggle "Deployment Failed" ON. Defaults to ON for the team owner; team members must opt in. |
| **GitHub commit status** | Failed CI workflow (Quality Gates / Visual Regression / E2E) | Already wired via the Vercel ↔ GitHub integration. Visible on every commit page as ✓/✗. Enable repo notifications in your GitHub account if you want emails. |
| **GitHub Actions email** | Failed CI workflow | <https://github.com/settings/notifications> → "Actions" → "Failed workflows only" |

If you push to `main` and any of these go red, fix it before doing anything else. A red `main` is a contract violation regardless of how it got there.

### Why three channels for one event?

Email goes to one inbox; commit status is right there on the GitHub PR/commit page; Actions email is filterable in your inbox. Different humans react to different signals. Pick one — but don't disable the others.

## When the build fails on Vercel anyway

If a push slipped through (someone bypassed, or the hook missed something), you'll get a Vercel email. Triage:

1. Open the failed deployment URL from the email
2. Click "View Build Logs" — find the first error line
3. Reproduce locally with `npx next build`
4. Fix and re-push (don't bypass the hook this time)

Don't let failed deploys pile up. They make rollback harder and mask real outages.
