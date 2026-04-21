import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { better_sqlite_client } from '../db';
import logger from '../utils/logger';

const router = express.Router();

interface UserRow {
  id: number;
  username: string;
  password: string;
  is_admin: number;
}

const DUMMY_PASSWORD_HASH = '$2b$10$G6s7QvNxy4/Fq7l6f5Yx8eSE0qVYCSvJzpuG1HsfrN7kYMva9nQxW';

const LoginBodySchema = z.object({
  username: z.string().min(1).max(255),
  // No min-length on password at login time: reject with a generic 401 rather than
  // leaking that validation (not authentication) failed.
  password: z.string().min(1).max(1024),
});

router.post('/auth/login', async (req, res) => {
  const parseResult = LoginBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
  }
  const { username: rawUsername, password } = parseResult.data;
  const username = rawUsername.trim();

  const query = better_sqlite_client.prepare(
    'SELECT id, username, password, is_admin FROM users WHERE username = ?'
  );
  const user = query.get(username) as UserRow | undefined;
  const passwordHash = user?.password || DUMMY_PASSWORD_HASH;

  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(password, passwordHash);
  } catch (err) {
    logger.error({ err }, '[auth] bcrypt compare failed');
    return res.status(500).json({ error: 'Internal server error' });
  }

  if (!user || !passwordMatches) {
    logger.warn({ username, ip: req.ip }, '[auth] failed login');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return req.session.regenerate((regenErr) => {
    if (regenErr) {
      logger.error({ err: regenErr }, '[auth] session regenerate failed');
      return res.status(500).json({ error: 'Internal server error' });
    }
    logger.info({ username: user.username, ip: req.ip }, '[auth] login');
    req.session.user = { id: user.id, username: user.username, is_admin: user.is_admin };
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    return req.session.save((saveErr) => {
      if (saveErr) {
        logger.error({ err: saveErr }, '[auth] session save failed');
        return res.status(500).json({ error: 'Internal server error' });
      }
      return res.status(200).json({ message: 'Login successful' });
    });
  });
});

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
