# Agent rules for this repository

## Project root

The canonical project root is:

F:\projects\Diplom\Stackoverflow2.0

Always run GSD from this root. Do not start GSD from `.gsd/`, `.gsd/worktrees/*`, `src/backend`, or `src/frontend`.

## Git / GSD rules

- Do not use GSD worktree isolation for this project.
- Do not manually construct paths under `.gsd/worktrees/<MID>`.
- Do not read `.gsd/OVERRIDES.md` relative to a worktree cwd.
- If GSD state is needed, use project-root `.gsd/...`.
- If a GSD file is missing, treat optional files like `OVERRIDES.md` as empty instead of failing the task.
- Never manually edit completion state in `.gsd` unless explicitly asked.
- Prefer `/gsd doctor`, `/gsd doctor fix`, `/gsd undo-task`, `/gsd reset-slice`, and `/gsd steer`.

## gsd_exec rules

Never call `gsd_exec` with:

- runtime: "python3"
- runtime: "pip"
- runtime: "git"
- runtime: "rg"

For Python scripts, use:

runtime: "bash"

and run:

python3 - <<'PY'
...
PY

If a `gsd_exec` call fails schema validation, it did not execute. Retry with a valid runtime.

## Environment rules

Use:

- python3
- python3 -m pip
- rg
- git

Do not assume bare `python`, `pip`, or `rg` exists until verified.

## Verification rules

Before completing a slice or milestone, verify actual files and paths. Do not cite guessed paths.

For frontend tests, use real paths under:

src/frontend/...

For backend tests, use real paths under:

src/backend/...

Record exact commands and exact outputs in summaries.