import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/require-auth';
import { gameController } from './game.controller';

const router: Router = Router();

// Live gameplay runs over Socket.IO; these are read endpoints.
// All of them require a valid player token.
router.use(requireAuth);

router.post('/', gameController.create);
router.get('/:id', gameController.getById);
router.get('/:id/scores', gameController.getScores);

export default router;
