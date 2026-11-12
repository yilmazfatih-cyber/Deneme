# Systematic debugging

## When

On any bug, failing test, unexpected behaviour or performance problem; before proposing a fix.

## Steps

1. **Reproduce.** Write the shortest reproduction and, when possible, turn it into a failing test: {{TEK_TEST}}.
2. **Collect evidence.** Read the whole error message and stack trace. Look at recent changes:
   `git log -p -5 -- <file>` and `git diff`.
3. **Narrow down.** Shrink the input, bisect between a good and a bad version (`git bisect`), add temporary logging at
   boundaries. Tools for this stack: {{HATA_ARACLARI}}.
4. **One hypothesis.** Write "the bug is X because Y" and test it with a single change. Never change several things at
   once.
5. **Fix the root cause.** Fix the cause, not the symptom. The test from step 1 turns green and {{TEST}} stays green.
6. **Clean up.** Remove temporary logging; state the root cause in one sentence in the commit message.

## Stop and ask

- After three failed fix attempts the problem is probably in the design: ask a human.
- If the bug is in production or data loss is possible, tell a human first.

## Do not

- Make random changes hoping one of them works.
- Skip or silence a failing test, or catch and swallow the error.
