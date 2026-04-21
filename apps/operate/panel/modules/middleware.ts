import type { Request, Response, NextFunction } from 'express';

function isAuthenticated(req: Request, res: Response, next: NextFunction): void {
  if (req.session.user) {
    next();
  } else {
    const acceptHeader = req.headers['accept'];
    if (acceptHeader && acceptHeader.includes('text/html')) {
      res.redirect('/');
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
}

export default isAuthenticated;
