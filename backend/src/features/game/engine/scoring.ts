// Final scores and each learner's mastery report.

import { GameState, PlayerState, FinalScore, MasteryReport } from '../game.types';
import { SKILL_NAMES } from '../game.constants';
import { calculatePropertyValue, calculateLevelUpValue } from '../board.config';
import { INITIAL_MASTERY } from '../../../bkt/bkt.defaults';
import { checkMastery } from '../../../bkt/bkt.utils';

// ---- SCORING ----

export function calculateFinalScores(state: GameState): FinalScore[] {
  const scores: FinalScore[] = state.players.map((p) => {
    const propertyValue = calculatePropertyValue(p.properties);
    const levelUpValue = calculateLevelUpValue(p.properties, state.properties);
    const netWorth = p.money + propertyValue + levelUpValue;

    return {
      playerId: p.id,
      playerName: p.name,
      color: p.color,
      isBot: p.isBot,
      cash: p.money,
      propertyValue,
      levelUpValue,
      netWorth,
      totalCorrect: p.totalCorrect,
      totalQuestions: p.totalQuestions,
      rank: 0,
    };
  });

  // Rank by net worth (highest first)
  scores.sort((a, b) => b.netWorth - a.netWorth);
  scores.forEach((s, i) => { s.rank = i + 1; });

  return scores;
}

export function generateMasteryReport(player: PlayerState): MasteryReport {
  const skills = SKILL_NAMES.map((s) => {
    const mastery = player.masteryStates[s] ?? INITIAL_MASTERY;
    return {
      skillName: s,
      mastery,
      // Real per-skill counts. These were hard-coded to zero with a note that
      // per-skill tracking would be needed; Phase 4 added it.
      totalAttempts: player.skillAttempts[s] ?? 0,
      isMastered: checkMastery(mastery),
    };
  });

  // Rank only what was actually practised — a skill nobody touched this session
  // is not the player's "weakest", it is simply unmeasured.
  const practised = skills.filter((s) => s.totalAttempts > 0);
  const ranked = [...(practised.length > 0 ? practised : skills)].sort(
    (a, b) => b.mastery - a.mastery
  );

  return {
    playerId: player.id,
    playerName: player.name,
    skills,
    bestSkill: ranked[0].skillName,
    weakestSkill: ranked[ranked.length - 1].skillName,
    overallAccuracy: player.totalQuestions > 0 ? player.totalCorrect / player.totalQuestions : 0,
  };
}
