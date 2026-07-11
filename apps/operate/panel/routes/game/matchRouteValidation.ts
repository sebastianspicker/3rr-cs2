import type { Response } from 'express';
import type { z } from 'zod';

export function parseGameBody<Schema extends z.ZodType>(
  schema: Schema,
  body: unknown,
  response: Response
): z.infer<Schema> | null {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  response.status(400).json({ error: result.error.issues[0]?.message ?? 'Invalid input' });
  return null;
}
