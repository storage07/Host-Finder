import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db } from '../db/store.js';
import { sanitizeObject } from '../utils/crypto.js';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: 'admin' | 'staff' | 'viewer';
  assignedClientIds: string[];
  canUpdateAssignedServices: boolean;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function sanitizeRequestMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
}

export function signAuthToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const cookieToken = req.cookies?.hf_token;
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    const token = cookieToken || bearerToken;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    const user = await db.users.findById(payload.sub);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Account inactive or not found' });
    }

    req.user = {
      id: user._id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      assignedClientIds: user.assignedClientIds || [],
      canUpdateAssignedServices: Boolean(user.canUpdateAssignedServices),
      mustChangePassword: Boolean(user.mustChangePassword),
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireRole(...allowedRoles: Array<'admin' | 'staff' | 'viewer'>) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      });
    }
    next();
  };
}

export async function logActivity(
  req: AuthedRequest,
  action: string,
  resource: string,
  resourceId = '',
  details = ''
) {
  try {
    await db.activity_logs.create({
      userId: req.user?.id || '',
      username: req.user?.username || 'anonymous',
      role: req.user?.role || 'viewer',
      action,
      resource,
      resourceId,
      details,
      ipAddress:
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        '',
    });
  } catch {
    // Non-blocking audit log
  }
}
