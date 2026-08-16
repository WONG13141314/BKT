# Task 4 report — Honest Timeout Evidence and Server-Timed Submissions

Base commit: `bb1ee4543f3b63bf185a48b46109d0d095515d6b`

## Delivered

- Replaced the `-1` timeout sentinel with nullable answer evidence. A timeout increments total questions, resets the streak, gives no reward, and keeps both BKT mastery and the per-skill consecutive-failure hint counter unchanged.
- Routed all solo challenge contexts, duels, and bots through the nullable/server-timed answer contracts. Socket payloads now contain only `gameId` and `selectedIndex`; the server computes elapsed time from receipt time and challenge start time.
- Added strict index validation before socket submissions are graded.
- Persisted `selectedIndex: null`, `timedOut: true`, server-derived response time, and identical pre/post mastery for timeouts. New games wait for each returning learner's pending write queue before loading their priors.
- Added concise worked feedback based on the issued operation. It is included only in the answering learner's answer-result payload and rendered as their private notification.

## TDD evidence

- Initial focused run failed as expected: the feedback and validation modules were absent, timeout results were false, and null evidence was not persisted as a timeout.
- A follow-up card-timeout assertion also failed as expected because a timed-out math card still awarded RM40. The timeout path now yields a `NONE` reward and applies no card effect.

## Verification

- Focused Jest: 4 suites / 20 tests passed.
- Full backend Jest: 23 suites / 233 tests passed.
- Backend and frontend no-emit TypeScript checks passed.
- Workspace production build passed. Vite retained its pre-existing large-chunk advisory.
