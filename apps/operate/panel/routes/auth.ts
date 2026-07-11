import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { better_sqlite_client } from '../db';
import logger from '../utils/logger';
import type { Request, Response } from 'express';

const router = express.Router();

interface UserRow {
  id: number;
  username: string;
  password: string;
  is_admin: number;
}

const DUMMY_PASSWORD_HASH = [
  '$2b$10$',
  'G6s7QvNxy4/Fq7l6f5Yx8eSE0qVYCSvJzpuG1HsfrN7kYMva9nQxW',
].join('');

const LoginBodySchema = z.object({
  username: z.string().min(1).max(255),
  // No min-length on password at login time: reject with a generic 401 rather than
  // leaking that validation (not authentication) failed.
  password: z.string().min(1).max(1024),
});

const parseCredentials = (body: unknown): { username: string; password: string } | null => {
  const parsed = LoginBodySchema.safeParse(body);
  return parsed.success
    ? { username: parsed.data.username.trim(), password: parsed.data.password }
    : null;
};

const passwordMatches = async (password: string, passwordHash: string): Promise<boolean | null> => {
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch (err) {
    logger.error({ err }, '[auth] bcrypt compare failed');
    return null;
  }
};

const establishSession = (req: Request, res: Response, user: UserRow): void => {
  req.session.regenerate((regenErr) => {
    if (regenErr) {
      logger.error({ err: regenErr }, '[auth] session regenerate failed');
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    logger.info({ username: user.username, ip: req.ip }, '[auth] login');
    req.session.user = { id: user.id, username: user.username, is_admin: user.is_admin };
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    req.session.save((saveErr) => {
      if (saveErr) {
        logger.error({ err: saveErr }, '[auth] session save failed');
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
      res.status(200).json({ message: 'Login successful' });
    });
  });
};

const login = async (req: Request, res: Response): Promise<void> => {
  const credentials = parseCredentials(req.body);
  if (!credentials) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const { username, password } = credentials;

  const query = better_sqlite_client.prepare(
    'SELECT id, username, password, is_admin FROM users WHERE username = ?'
  );
  const user = query.get(username) as UserRow | undefined;
  const passwordHash = user?.password ?? DUMMY_PASSWORD_HASH;

  const matches = await passwordMatches(password, passwordHash);
  if (matches === null) {
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  if (!user || !matches) {
    logger.warn({ username, ip: req.ip }, '[auth] failed login');
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  establishSession(req, res, user);
};

router.post('/auth/login', login);

router.post('/auth/logout', (req, res) => {
  const sessionCookieName = req.app.get('sessionCookieName') || 'cspanel.sid';
  const sessionCookieConfig = req.app.get('sessionCookieConfig') || { path: '/' };
  req.session.destroy((err) => {
    if (err) {
      logger.error({ err }, '[auth] session destroy failed');
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie(sessionCookieName, {
      httpOnly: sessionCookieConfig.httpOnly,
      sameSite: sessionCookieConfig.sameSite,
      secure: sessionCookieConfig.secure,
      path: sessionCookieConfig.path || '/',
    });
    const wantsJson = (req.headers.accept || '').includes('application/json') || req.xhr === true;
    if (wantsJson) {
      return res.status(200).json({ message: 'Logged out' });
    }
    res.redirect('/');
  });
});

export default router;
