import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { z } from 'zod';
import { db } from '../db/store.js';
import {
  AuthedRequest,
  AuthUser,
  logActivity,
  requireAuth,
  signAuthToken,
} from '../middleware/auth.js';
import {
  decryptField,
  encryptField,
  generateBase32Secret,
  getTotpOtpAuthUrl,
  verifyTotpCode,
} from '../utils/crypto.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login requests. Please wait 15 minutes.' },
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function toAuthUser(u: any): AuthUser {
  return {
    id: u._id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    assignedClientIds: u.assignedClientIds || [],
    canUpdateAssignedServices: Boolean(u.canUpdateAssignedServices),
    mustChangePassword: Boolean(u.mustChangePassword),
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
  };
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const { username, password, totpCode } = parsed.data;
  const normalized = username.trim();
  const user =
    (await db.users.findOne({ username: normalized })) ||
    (await db.users.findOne({ email: normalized.toLowerCase() }));

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!user.isActive) {
    return res.status(403).json({ error: 'Account is deactivated. Contact administrator.' });
  }

  if (user.lockUntil && new Date(user.lockUntil).getTime() > Date.now()) {
    const minsLeft = Math.ceil(
      (new Date(user.lockUntil).getTime() - Date.now()) / 60000
    );
    return res.status(423).json({
      error: `Account locked due to multiple failed attempts. Try again in ${minsLeft} minute(s).`,
      lockedUntil: user.lockUntil,
    });
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const updates: Record<string, any> = { failedLoginAttempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      updates.lockUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
    }
    await db.users.updateById(user._id, updates);

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      return res.status(423).json({
        error: 'Account locked for 15 minutes after 5 failed login attempts.',
      });
    }
    return res.status(401).json({
      error: `Invalid credentials. ${MAX_FAILED_ATTEMPTS - attempts} attempt(s) remaining before lockout.`,
    });
  }

  // Check 2FA if enabled
  if (user.twoFactorEnabled) {
    if (!totpCode) {
      return res.status(200).json({
        requiresTwoFactor: true,
        message: 'Enter your 6-digit authenticator code.',
      });
    }
    const secret = decryptField(user.twoFactorSecretEnc);
    if (!verifyTotpCode(secret, totpCode)) {
      return res.status(401).json({ error: 'Invalid two-factor authentication code' });
    }
  }

  await db.users.updateById(user._id, {
    failedLoginAttempts: 0,
    lockUntil: null,
    lastLoginAt: new Date().toISOString(),
  });

  const authUser = toAuthUser(user);
  const token = signAuthToken(authUser);

  res.cookie('hf_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });

  await logActivity(
    { ...req, user: authUser } as AuthedRequest,
    'LOGIN',
    'auth',
    user._id,
    `User ${user.username} signed in`
  );

  return res.json({ user: authUser, token });
});

router.post('/logout', requireAuth, async (req: AuthedRequest, res) => {
  await logActivity(req, 'LOGOUT', 'auth', req.user?.id || '', 'User signed out');
  res.clearCookie('hf_token');
  return res.json({ success: true });
});

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  return res.json({ user: req.user });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
});

router.post('/change-password', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password' });
  }

  const user = await db.users.findById(req.user!.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return res.status(400).json({ error: 'New password must be different from current password' });
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const updated = await db.users.updateById(user._id, {
    passwordHash: newHash,
    mustChangePassword: false,
  });

  await logActivity(req, 'CHANGE_PASSWORD', 'users', user._id, 'Password updated');

  return res.json({ user: toAuthUser(updated), message: 'Password updated successfully' });
});

router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = await db.users.findOne({ email });
  if (!user) {
    // Avoid user enumeration
    return res.json({
      message: 'If an account matches that email, a password reset code has been generated.',
    });
  }

  const rawToken = crypto.randomBytes(4).toString('hex').toUpperCase();
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  await db.users.updateById(user._id, {
    resetTokenHash: tokenHash,
    resetTokenExpires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });

  return res.json({
    message: 'Password reset verification code generated (valid for 30 minutes).',
    // Returned in development/preview so admins without live SMTP can complete reset verification
    previewResetCode: process.env.NODE_ENV !== 'production' ? rawToken : undefined,
  });
});

router.post('/reset-password', async (req, res) => {
  const { email, resetCode, newPassword } = req.body || {};
  if (!email || !resetCode || !newPassword) {
    return res.status(400).json({ error: 'Email, reset code, and new password are required' });
  }

  const user = await db.users.findOne({ email: String(email).trim().toLowerCase() });
  if (!user || !user.resetTokenHash || !user.resetTokenExpires) {
    return res.status(400).json({ error: 'Invalid or expired reset code' });
  }

  if (new Date(user.resetTokenExpires).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Reset code has expired' });
  }

  const incomingHash = crypto
    .createHash('sha256')
    .update(String(resetCode).trim().toUpperCase())
    .digest('hex');

  if (incomingHash !== user.resetTokenHash) {
    return res.status(400).json({ error: 'Invalid reset code' });
  }

  const newHash = await bcrypt.hash(String(newPassword), 12);
  await db.users.updateById(user._id, {
    passwordHash: newHash,
    resetTokenHash: '',
    resetTokenExpires: null,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockUntil: null,
  });

  return res.json({ message: 'Password reset successful. You can now sign in.' });
});

router.post('/2fa/setup', requireAuth, async (req: AuthedRequest, res) => {
  const secret = generateBase32Secret();
  const otpAuthUrl = getTotpOtpAuthUrl(req.user!.username, secret);
  const qrDataUrl = await QRCode.toDataURL(otpAuthUrl);

  await db.users.updateById(req.user!.id, {
    twoFactorSecretEnc: encryptField(secret),
  });

  return res.json({ secret, otpAuthUrl, qrDataUrl });
});

router.post('/2fa/enable', requireAuth, async (req: AuthedRequest, res) => {
  const code = String(req.body?.code || '');
  const user = await db.users.findById(req.user!.id);
  if (!user || !user.twoFactorSecretEnc) {
    return res.status(400).json({ error: 'Initialize 2FA setup first' });
  }
  const secret = decryptField(user.twoFactorSecretEnc);
  if (!verifyTotpCode(secret, code)) {
    return res.status(400).json({ error: 'Invalid 6-digit verification code' });
  }
  const updated = await db.users.updateById(user._id, { twoFactorEnabled: true });
  await logActivity(req, 'ENABLE_2FA', 'users', user._id, 'Two-factor authentication enabled');
  return res.json({ user: toAuthUser(updated) });
});

router.post('/2fa/disable', requireAuth, async (req: AuthedRequest, res) => {
  const updated = await db.users.updateById(req.user!.id, {
    twoFactorEnabled: false,
    twoFactorSecretEnc: '',
  });
  await logActivity(req, 'DISABLE_2FA', 'users', req.user!.id, 'Two-factor authentication disabled');
  return res.json({ user: toAuthUser(updated) });
});

export default router;
