import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { isSqlConfigured } from '../../src/db/index.ts';
import { getOrCreateUser } from '../../src/db/users.ts';
import { adminAuth } from '../../src/lib/firebase-admin.ts';
import { env } from '../config/env.js';
import { db } from '../db/store.js';
import { sanitizeObject } from '../utils/crypto.js';

export interface AuthUser {
  id: string;
  uid?: string;
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

export function signAuthToken(user: AuthUser, rememberMe = false): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: rememberMe ? '7d' : '12h' }
  );
}

async function resolveFirebaseUser(decoded: { uid: string; email?: string; name?: string }) {
  if (isSqlConfigured()) {
    const row = await getOrCreateUser(
      decoded.uid,
      decoded.email || `${decoded.uid}@firebase.local`,
      decoded.name || ''
    );
    return {
      ...row,
      _id: String(row.id),
    };
  }

  const normalizedEmail = (decoded.email || `${decoded.uid}@firebase.local`).toLowerCase();
  let existing =
    (await db.users.findOne({ uid: decoded.uid })) ||
    (await db.users.findOne({ email: normalizedEmail }));

  if (!existing) {
    const allUsers = await db.users.find();
    const hasGoogleAdmin = allUsers.some(
      (u) => u.role === 'admin' && u.uid && !String(u.uid).startsWith('local_')
    );
    existing = await db.users.create({
      uid: decoded.uid,
      username: `${normalizedEmail.split('@')[0]}_${decoded.uid.slice(0, 6)}`,
      fullName: decoded.name || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      passwordHash: '',
      role: hasGoogleAdmin ? 'viewer' : 'admin',
      assignedClientIds: [],
      canUpdateAssignedServices: !hasGoogleAdmin,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      twoFactorEnabled: false,
      isActive: true,
      lastLoginAt: new Date().toISOString(),
    });
  } else {
    existing = await db.users.updateById(existing._id, {
      uid: decoded.uid,
      lastLoginAt: new Date().toISOString(),
    });
  }
  return existing;
}

function extractRequestToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.hf_token;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;
  return bearerToken || cookieToken;
}

export async function tryResolveAuthUser(req: Request): Promise<AuthUser | null> {
  try {
    const token = extractRequestToken(req);
    if (!token) return null;

    let user: any = null;
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      user = await resolveFirebaseUser({
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
      });
    } catch {
      try {
        const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
        user = await db.users.findById(payload.sub);
      } catch {
        return null;
      }
    }

    if (!user || !user.isActive) return null;

    return {
      id: String(user._id ?? user.id),
      uid: user.uid,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      assignedClientIds: user.assignedClientIds || [],
      canUpdateAssignedServices: Boolean(user.canUpdateAssignedServices),
      mustChangePassword: Boolean(user.mustChangePassword),
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
    };
  } catch {
    return null;
  }
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = extractRequestToken(req);

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    // 1. Verify Firebase ID Token (Primary Cloud SQL + Firebase Auth flow)
    let user: any = null;
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      user = await resolveFirebaseUser({
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
      });
    } catch {
      // 2. Fallback to local HS256 JWT token for local credentials
      try {
        const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
        user = await db.users.findById(payload.sub);
      } catch {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Account inactive or not found' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied. Only administrator accounts can access Host Finder.',
      });
    }

    req.user = {
      id: String(user._id ?? user.id),
      uid: user.uid,
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
  } catch (error) {
    console.error('Error verifying authentication token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
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
