# Test-driven development

## When

New behaviour, bug fixes, or refactors that change behaviour. Throwaway spikes, generated files and pure configuration
changes may skip it after agreeing with the team.

## Loop

1. **Red:** write one test that describes the behaviour ({{TEST_DESENI}}). Run it: {{TEK_TEST}}. Confirm it fails
   for the right reason; a missing import or a typo is not "red".
2. **Green:** write the smallest code that makes it pass. Do not code for the next tests yet.
3. **Tidy:** while green, fix names and duplication without changing behaviour.
4. **Whole suite:** {{TEST}}. Then move to the next behaviour: one test and one small fix per turn.

## A good test

- Exercises behaviour through the public interface, not private functions or database rows.
- Takes its expected value from an independent source (a worked example, the spec). Repeating the code's own
  calculation inside the test proves nothing.
- Reads like a sentence: "checkout is rejected for an empty cart".
- Uses fakes only at the boundary (network, clock, file system, payment provider).

## Red flags

- A new test that passes on its first run is not testing anything new.
- Editing the test to make it pass: first write down why the test was wrong.
- "We will add tests later" is not a decision to make without a human.

## Definition of done

{{TEST}} is green{{EK_KAPILAR}}; the new behaviour has at least one test and that test was seen failing first.
