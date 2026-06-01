import { Router } from 'express';
import { scan } from '../scanner/index.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', (_req, res) => {
  const cwd = typeof _req.query.cwd === 'string' ? _req.query.cwd : undefined;

  const result = scan({
    cwd,
    triggeredBy: 'api',
  });

  res.status(200).json(result);
});

export default router;
