import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { db } from '../db/store.js';
import { decryptField } from '../utils/crypto.js';

export type ServiceStatus =
  | 'Active'
  | 'Upcoming Expiry'
  | 'Expired'
  | 'Renewed'
  | 'Cancelled';

export function daysUntil(dateInput: string | Date): number {
  const target = new Date(dateInput);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  ).getTime();
  return Math.ceil((startOfTarget - startOfToday) / (1000 * 60 * 60 * 24));
}

export function computeServiceStatus(
  expiryDate: string | Date,
  manualStatus?: string
): ServiceStatus {
  if (manualStatus === 'Cancelled') return 'Cancelled';
  const days = daysUntil(expiryDate);
  if (days < 0) return 'Expired';
  if (days <= 30) return 'Upcoming Expiry';
  if (manualStatus === 'Renewed') return 'Renewed';
  return 'Active';
}

async function sendSmtpReminderEmail(subject: string, textBody: string) {
  try {
    const settings = await db.settings.findOne({ key: 'global' });
    if (!settings?.emailAlertsEnabled) return false;
    const smtp = await db.payment_gateways.findOne({ gatewayKey: 'smtp' });
    if (!smtp) return false;
    const cfg = smtp.activeMode === 'live' ? smtp.liveConfig : smtp.testConfig;
    if (!cfg || cfg.status !== 'Enabled' || !cfg.email || !cfg.passwordEnc) {
      return false;
    }
    let host = 'smtp.gmail.com';
    let port = 587;
    try {
      const parsed = JSON.parse(cfg.configurationDetails || '{}');
      if (parsed.host) host = parsed.host;
      if (parsed.port) port = Number(parsed.port);
    } catch {
      // keep defaults
    }
    if (!host || host.includes('example.com')) return false;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user: cfg.email,
        pass: decryptField(cfg.passwordEnc),
      },
    });
    await transporter.sendMail({
      from: cfg.email,
      to: settings.companyEmail || cfg.email,
      subject,
      text: textBody,
    });
    return true;
  } catch {
    return false;
  }
}

export async function runExpiryCheck(): Promise<{
  checkedHosting: number;
  checkedDomains: number;
  newNotifications: number;
}> {
  const hostingList = await db.hosting_services.find();
  const domainList = await db.domains.find();
  let newNotifications = 0;

  const evaluateWindow = (days: number): { window: '30d' | '15d' | '7d' | '1d' | 'expired'; severity: 'info' | 'warning' | 'critical' } | null => {
    if (days < 0) return { window: 'expired', severity: 'critical' };
    if (days <= 1) return { window: '1d', severity: 'critical' };
    if (days <= 7) return { window: '7d', severity: 'critical' };
    if (days <= 15) return { window: '15d', severity: 'warning' };
    if (days <= 30) return { window: '30d', severity: 'info' };
    return null;
  };

  for (const h of hostingList) {
    const nextStatus = computeServiceStatus(h.expiryDate, h.accountStatus);
    if (nextStatus !== h.accountStatus) {
      await db.hosting_services.updateById(h._id, { accountStatus: nextStatus });
    }
    if (nextStatus === 'Cancelled') continue;
    const days = daysUntil(h.expiryDate);
    const match = evaluateWindow(days);
    if (match) {
      const dedupeKey = `hosting:${h._id}:${match.window}`;
      const exists = await db.notifications.findOne({ dedupeKey });
      if (!exists) {
        const title =
          match.window === 'expired'
            ? `Hosting Expired: ${h.domainName}`
            : `Hosting Expiry (${match.window}): ${h.domainName}`;
        const message =
          days < 0
            ? `Hosting service (${h.hostingProvider} - ${h.hostingPlan}) for ${h.domainName} expired ${Math.abs(days)} day(s) ago.`
            : `Hosting service (${h.hostingProvider} - ${h.hostingPlan}) for ${h.domainName} expires in ${days} day(s).`;
        const emailSent = await sendSmtpReminderEmail(title, message);
        await db.notifications.create({
          title,
          message,
          severity: match.severity,
          triggerWindow: match.window,
          entityType: 'hosting',
          entityId: h._id,
          dedupeKey,
          isRead: false,
          emailSent,
        });
        newNotifications++;
      }
    }
  }

  for (const d of domainList) {
    const nextStatus = computeServiceStatus(d.expiryDate, d.accountStatus);
    if (nextStatus !== d.accountStatus) {
      await db.domains.updateById(d._id, { accountStatus: nextStatus });
    }
    if (nextStatus === 'Cancelled') continue;
    const days = daysUntil(d.expiryDate);
    const match = evaluateWindow(days);
    if (match) {
      const dedupeKey = `domain:${d._id}:${match.window}`;
      const exists = await db.notifications.findOne({ dedupeKey });
      if (!exists) {
        const title =
          match.window === 'expired'
            ? `Domain Expired: ${d.domainName}`
            : `Domain Expiry (${match.window}): ${d.domainName}`;
        const message =
          days < 0
            ? `Domain ${d.domainName} (${d.domainRegistrar}) expired ${Math.abs(days)} day(s) ago.`
            : `Domain ${d.domainName} (${d.domainRegistrar}) expires in ${days} day(s).`;
        const emailSent = await sendSmtpReminderEmail(title, message);
        await db.notifications.create({
          title,
          message,
          severity: match.severity,
          triggerWindow: match.window,
          entityType: 'domain',
          entityId: d._id,
          dedupeKey,
          isRead: false,
          emailSent,
        });
        newNotifications++;
      }
    }
  }

  // Also refresh client statuses
  const clients = await db.clients.find();
  for (const c of clients) {
    const nextStatus = computeServiceStatus(c.endDate, c.accountStatus);
    if (nextStatus !== c.accountStatus) {
      await db.clients.updateById(c._id, { accountStatus: nextStatus });
    }
  }

  return {
    checkedHosting: hostingList.length,
    checkedDomains: domainList.length,
    newNotifications,
  };
}

let cronStarted = false;

export function startExpiryCron() {
  if (cronStarted) return;
  cronStarted = true;
  // Daily at 08:00 AM server time
  cron.schedule('0 8 * * *', () => {
    runExpiryCheck().catch((err) =>
      console.error('[Cron] Expiry check failed:', err)
    );
  });
}
