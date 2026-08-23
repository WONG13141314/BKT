# Mathopoly Improvement Roadmap

The approved design is implemented through four ordered plans. Each plan ends in working, reviewable software and must pass its own verification before the next begins.

1. [Runtime and Networking Stability](./2026-08-16-runtime-networking-stability.md)
2. [Adaptive Learning and Rule Simplification](./2026-08-16-adaptive-learning-and-rules.md)
3. [Frontend UX and Accessibility](./2026-08-16-frontend-ux-accessibility.md)
4. [Code Health and Release Verification](./2026-08-16-code-health-and-release.md)

The plans share the constraints in the approved [full-game design](../specs/2026-08-16-monopoly-game-improvement-design.md). Execution stays on `monopoly-game-improve`; no plan may commit the existing untracked proposal, QA, temporary, or prototype files.

## Specification Coverage

| Approved requirement | Owning plan/task |
| --- | --- |
| Explicit public state and answer/mastery privacy | Runtime Tasks 1 and 4 |
| Animation-safe question/decision timing | Runtime Task 2 |
| First-turn timer, duplicate start, multi-tab, lobby recovery | Runtime Tasks 2–4 |
| Duel and finished-game refresh | Runtime Task 4 |
| Ordered bot playback | Runtime Task 5 |
| Four active skills and concise arithmetic wording | Learning Task 1 |
| Anti-repeat selection and balanced exposure | Learning Task 2 |
| Division prerequisites, exact division, hard remainders | Learning Task 3 |
| Property-price context and worked feedback | Learning Tasks 3–4 |
| Timeout logging without mastery change | Learning Task 4 |
| Auction removal and declined-property behavior | Learning Task 5 |
| Unreachable Roll/Level-Up cleanup | Learning Task 6 |
| Landing, profile, and lobby UX | Frontend Tasks 1–2 |
| Responsive board/action layout and keyboard path | Frontend Task 3 |
| Accessible timer, questions, duels, and short-screen dialogs | Frontend Task 4 |
| Immediate ending and private learning report | Frontend Task 5 |
| Desktop/mobile/landscape/zoom browser checks | Frontend Task 6 |
| Lint, unused checks, dead code, and shared board rules | Code Health Tasks 1–2 |
| Question-generator module split | Code Health Task 3 |
| Fonts, favicon, CORS, Three/Rapier, bundle, and deployment | Code Health Task 4 |
| Full test matrix, review, documentation, and GitHub push | Code Health Task 5 |
