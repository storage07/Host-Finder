import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';

function sanitizeUsernameBase(email: string, uid: string): string {
  const local = email.split('@')[0] || 'user';
  const clean = local.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 32);
  return `${clean}_${uid.slice(0, 6)}`;
}

export async function getOrCreateUser(uid: string, email: string, fullName = '') {
  try {
    const normalizedEmail = (email || `${uid}@firebase.local`).trim().toLowerCase();

    // Check if any Google-linked admin exists yet; first Google user becomes admin
    const existingAdmins = await db
      .select({ id: users.id, uid: users.uid })
      .from(users)
      .where(eq(users.role, 'admin'));
    const hasLinkedAdmin = existingAdmins.some((u) => !u.uid.startsWith('local_'));
    const defaultRole = hasLinkedAdmin ? 'viewer' : 'admin';

    // If an account with this email already exists (e.g. seeded or pre-created), link its Firebase UID
    const byEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail));

    if (byEmail.length > 0 && byEmail[0].uid !== uid) {
      const updated = await db
        .update(users)
        .set({
          uid,
          fullName: fullName || byEmail[0].fullName,
          lastLoginAt: new Date().toISOString(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, byEmail[0].id))
        .returning();
      return updated[0];
    }

    const result = await db
      .insert(users)
      .values({
        uid,
        username: sanitizeUsernameBase(normalizedEmail, uid),
        fullName: fullName || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        role: defaultRole,
        assignedClientIds: [],
        canUpdateAssignedServices: defaultRole === 'admin',
        mustChangePassword: false,
        isActive: true,
        lastLoginAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          lastLoginAt: new Date().toISOString(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
