// Game controller — HTTP endpoints for game management
// Socket events handle real-time game flow; these endpoints handle CRUD

import { Request, Response } from 'express';
import { gameService } from './game.service';

export const gameController = {
  /**
   * POST /api/games — Create a new game session
   * Body: { players: [{ id, userId, name, color, order }] }
   */
  create: async (req: Request, res: Response) => {
    try {
      const { players } = req.body;
      if (!players || !Array.isArray(players) || players.length !== 4) {
        return res.status(400).json({ error: 'Exactly 4 players required' });
      }

      const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const state = await gameService.createGame(gameId, players);

      return res.status(201).json({ gameId: state.id, state });
    } catch (error) {
      console.error('Error creating game:', error);
      return res.status(500).json({ error: 'Failed to create game' });
    }
  },

  /**
   * GET /api/games/:id — Get game state
   */
  getById: async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const state = await gameService.getGame(id);

      if (!state) {
        return res.status(404).json({ error: 'Game not found' });
      }

      return res.json({ state });
    } catch (error) {
      console.error('Error getting game:', error);
      return res.status(500).json({ error: 'Failed to get game' });
    }
  },

  /**
   * GET /api/games/:id/scores — Get final scores
   */
  getScores: async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const scores = gameService.getScores(id);

      if (!scores) {
        return res.status(404).json({ error: 'Game not found' });
      }

      return res.json({ scores });
    } catch (error) {
      console.error('Error getting scores:', error);
      return res.status(500).json({ error: 'Failed to get scores' });
    }
  },
};
