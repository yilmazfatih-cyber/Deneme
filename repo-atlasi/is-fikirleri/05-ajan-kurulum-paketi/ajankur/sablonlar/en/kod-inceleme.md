# Code review

## When

Before opening a pull request (reviewing your own change) or when reviewing a teammate's change.

## First

- Write the purpose of the change in one sentence. See the diff: `git diff {{ANA_DAL}}...HEAD`.
- Automated gates: {{KAPILAR}}. Do not ask for human review while a gate is red.

## Checklist (in order of importance)

1. **Correctness:** edge cases (empty, very large, missing fields), error paths, concurrency, time zones.
2. **Security:** input validation, authorization checks, secrets leaking into logs, SQL or command injection, origin
   and licence of new dependencies.
3. **Tests:** does the new behaviour have a test, and does it test behaviour rather than implementation details?
4. **Scope:** is the change limited to what was asked, without needless abstraction or unrelated files?
5. **Readability:** names, outdated comments, dead code.

## Writing findings

Every finding has three parts: **severity** (Blocker, Important, Suggestion), **location** (`file:line`) and a
**concrete fix**. Mark matters of taste as "Suggestion"; Blocker is only for correctness, security and data loss.

## Receiving feedback

Verify each comment against the code. If it is wrong, push back with evidence; if it is unclear, ask. Do not apply it
blindly with "you're right".
