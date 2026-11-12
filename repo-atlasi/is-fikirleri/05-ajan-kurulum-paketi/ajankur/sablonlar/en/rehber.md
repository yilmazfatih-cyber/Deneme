# Coding agent guide for the team

This guide came with the `ajankur` setup package. Goal: everyone uses agents with the same rules, the same commands
and safely.

## What was installed

- `AGENTS.md`: project commands, verification order, working and safety rules. This is the single source of truth.
- `CLAUDE.md`: one line, `@AGENTS.md`. Claude Code reads its instructions from here.
- `{{BECERI_DIZINI}}/`: starter skills ({{BECERI_ADLARI}}).
- `.claude/hooks/guvenlik_kancasi.py` and `.claude/settings.json`: a hook that blocks dangerous commands in Claude Code,
  plus permission denials (`permissions.deny`) that hold even when the hook does not run.
- `opencode.json`: opencode permissions: plain test and lint commands allowed, destructive commands denied, the rest
  asks.

## Which tool reads what

- **Claude Code:** `CLAUDE.md` (via its `@AGENTS.md` line), skills in `.claude/skills/`. If skills live in
  `.agents/skills/`, a link is enough: `ln -s ../.agents/skills .claude/skills`.
- **opencode:** `AGENTS.md` (falls back to `CLAUDE.md`); skills in `.opencode/skills/`, `.claude/skills/`,
  `.agents/skills/`.
- **OpenClaw:** `skills/` and `.agents/skills/` in the workspace.
- **Hermes:** `.hermes/skills/` and `.agents/skills/`; run `hermes skills trust` once for the repository.

## First week

1. Everyone reads `AGENTS.md` and fills the gaps in the "Commands" table.
2. Test the hook on every developer's machine: ask the agent to run `git push` and watch it get blocked.
3. Fix a small bug with the `tdd` skill; mention agent use in the pull request.
4. Thirty minutes a week: discuss the agent's mistakes and turn the recurring ones into rules in `AGENTS.md`.

## Team rules

- Agent output is intern code: it never reaches the main branch without human review.
- Customer data and secrets are never sent to cloud models (privacy law and NDAs). Use a local model if needed.
- Before adding a new skill or hook: `python3 -m ajankur denetle .`
- Read third-party skills and hooks line by line; they are part of your supply chain.

## Limits of the hook and the real controls

The hook is a seatbelt; a determined agent or person can get around it (for example an `npm run release` script that
runs `git push`). The real boundaries are:

- **Branch protection on the server:** no direct or force pushes to the main branch, merges only after review. The
  main branch stays safe even when the hook is bypassed.
- **Separate identity and isolation:** run the agent as a separate user or in a container (devcontainer, virtual
  machine), away from your personal accounts; use short-lived, narrowly scoped access tokens.
- **Permission denials:** the `permissions.deny` lines in `.claude/settings.json` hold even when the hook does not
  run. This is why every `.env*` file, `.env.example` included, is unreadable in Claude Code; remove that line if
  needed.
- **When the hook does not run:** Claude Code blocks only on exit code 2. If `python3` is missing or the hook
  crashes, the tool is not blocked. Test the hook on Windows on day one and adapt the command if it does not run.
- **opencode `--auto` mode:** approves everything that would ask; only `deny` rules remain.

## Measuring

Compare before setup and four weeks later: review rounds per pull request, reverted commits, how often CI stays red,
and the team's own assessment. Measure at team level: per-person metrics are personal data about employees and need
prior notice to them and a proportionate purpose under privacy law.
