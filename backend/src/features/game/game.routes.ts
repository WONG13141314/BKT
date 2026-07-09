import { Router } from 'express';
import { gameController } from './game.controller';

const router = Router();

router.post('/', gameController.create);
router.get('/:id', gameController.getById);
router.get('/:id/scores', gameController.getScores);

export default router;
