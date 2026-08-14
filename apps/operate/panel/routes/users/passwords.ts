/** Password verification and hashing shared by user lifecycle routes. */
import bcrypt from 'bcrypt';
import logger from '../../utils/logger';

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean | null> {
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch (err) {
    logger.error({ err }, '[users] bcrypt compare error');
    return null;
  }
}

export async function hashPassword(password: string): Promise<string | null> {
  try {
    return await bcrypt.hash(password, 12);
  } catch (err) {
    logger.error({ err }, '[users] bcrypt hash error');
    return null;
  }
}
