# Prototype question timing and hints

This implementation follows the revised references proposal dated 2 October
2026: Malaysian primary pupils aged 10–12, with English / DLP questions as
confirmed by the developer. It supports the proposal's recorded hint usage and
response times without adding a practice tutorial.

## Initial timing policy

| Difficulty | Previous window | New window |
| --- | ---: | ---: |
| Easy | 25 seconds | 30 seconds |
| Medium | 20 seconds | 45 seconds |
| Hard | 15 seconds | 60 seconds |

The previous policy reduced time as questions became more demanding. The new
policy gives pupils more time to inspect the vertical layout, reason about the
missing value, and select an answer. Each item requests one answer or missing
step, rather than completion of a whole worksheet.

**30 / 45 / 60 is a prototype design choice, not a published age-based norm or
a proven optimum.** Pupils' familiarity, question template, language and device
can all affect time. Do not shorten windows just because adults finish quickly.

The shared server selector applies the policy to Banker Offers, challenge cards,
jail escapes and both participants in a math duel. Solo and multiplayer use the
same policy. A duel participant receives the window for their own question's
tier. Asking for help or reconnecting preserves the original expiry; no speed
reward or hint fee is introduced.

The 18-minute game clock remains a **soft target**: the game completes the lap
after reaching it. Longer question windows can increase the overrun. Rehearse
both modes before claiming that two games and questionnaires fit the proposal's
approximately one-hour session. This change does not guarantee an 18-minute
maximum or a one-hour session.

## Evidence and its limits

The [Standards and Testing Agency validity framework](https://www.gov.uk/government/publications/multiplication-tables-check-validity-framework/multiplication-tables-check-validity-framework)
uses six seconds for fluent multiplication fact recall, supported by trials.
It explicitly separates that construct from applications and calculation
strategies. That deadline cannot establish an appropriate limit for this game's
missing digits, regrouping or long-division steps.

The [IES elementary mathematics practice guide](https://ies.ed.gov/ncee/wwc/practiceguide/26)
recommends timed activities as one method of developing fluency within an
intervention. It does not specify seconds for this game's difficulty tiers.
The guide therefore informs the distinction between practiced fluency and
learning a strategy, rather than validating the chosen windows.

An [original study of fourth- and fifth-grade pupils](https://doi.org/10.1016/j.jsp.2024.101316)
found higher reported anxiety for complex than simple tasks, without a
significant overall difference between overt and covert timing in either task
condition. This supports considering task complexity, and does not justify
claiming that visible timers always harm children. A calm, visible countdown
remains in the prototype.

## Voluntary hint behavior

An active human player can press **Help me start** once per question. The server
returns a short strategy and highlights relevant visible cells. Examples:

- Addition: start with the ones column and consider carrying.
- Missing operand: use the inverse operation with the shown values.
- Division product: multiply the quotient digit by the divisor.
- Remainder: perform the final subtraction and check it is smaller than the divisor.

The generator receives the redacted layout. It does not reveal the target
answer, hidden operands or later division work, and it does not remove answer
choices. Opponents never receive another player's hint. Requests are bound to
the authenticated player and current challenge, rejected after expiry or
submission, and idempotent if retried. Reconnecting restores a used cue.

Assisted answers receive normal game grading, rewards and streak behavior.
They supply no independent BKT observation: both assisted correct and assisted
wrong answers leave mastery and difficulty-evidence counts unchanged. Timeouts
receive the same treatment. Independent wrong answers retain normal BKT updates.
This is a conservative policy for an engine whose guess and slip parameters
have not been fitted for assisted responses; it does not estimate learning
caused by hints.

## Research logging

The existing `QuestionAttempt.hintLevel` is `0` when no cue was requested and
`1` when one was requested. `isCorrect` records actual game correctness;
`timedOut` identifies unanswered/expired opportunities. The original full
question remains in `questionData`, with two additional objects:

- `timingPolicy`: version (`reasoning-30-45-60-v1`), actual `timeLimitSeconds`,
  server `startedAt` and `expiresAt` timestamps in milliseconds.
- `hintUsage`: version (`strategy-cue-v1`), server `requestedAt`, and
  `timeFromStartMs`; the latter two are null when no hint was requested.

Response latency is measured by the server from question issuance to received
answer. It includes transport time. The request timestamp records server
acceptance, rather than the exact moment the pupil read the cue. Metadata is
persisted when the question resolves through an answer or timeout.
The existing `answeredAt` column is the queued database write time, not exact
answer receipt; use the server latency and timing metadata for timing analysis.

Mastery reload counts only historical rows with `timedOut = false` and
`hintLevel = 0` as independent evidence. Historical positive hint levels are
excluded conservatively even if produced by the previous automatic hint system.
Already stored mastery is not retrospectively recomputed by this update.

For baseline BKT AUC/RMSE, use independent, non-timeout rows; report assisted
correctness, hint uptake and timeout rates separately. Counting assisted answers
as independent correct evidence would confuse scaffolding with mastery.

## Refinement with pupils

Use the actual target school years, English / DLP wording and school devices in
a low-pressure pilot with generous observation windows. Balance operation,
difficulty and template exposure rather than sampling only the weak skills
chosen by BKT. Treat sample-size targets as practical planning choices, not
guarantees of statistical precision.

Inspect accuracy, hint uptake and latency by operation, tier and target
template. A candidate rule such as the 90th percentile of independent correct
response times plus a small input margin is an engineering policy to evaluate,
not a research-established threshold. Sparse groups need more observations.

Retain timeouts as censored latencies: pupils' eventual answer time and
correctness are unknown. Successful responses collected under the old short
deadline alone will underestimate the needed time. Inspect timeout rates by
pupil year and mode, and keep assisted responses separate from independent
latency calibration.

Freeze timing, hint rules and item policy before the formal counterbalanced
mode comparison. Measure complete session duration in rehearsals. Any later
timing change requires a new policy version and equivalent settings in both
modes. The BKT probabilities also require evaluation with pupil data; these
timing changes do not make them perfectly calibrated.
