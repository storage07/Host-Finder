import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/store.js';
import {
  AuthedRequest,
  logActivity,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { computeServiceStatus, daysUntil } from '../services/statusAndCron.js';
import { decryptField, encryptField, maskSecret } from '../utils/crypto.js';

const router = Router();

function scopeByUser<T extends { clientId?: string }>(items: T[], user: AuthedRequest['user']): T[] {
  if (!user || user.role !== 'staff') return items;
  if (!user.assignedClientIds || user.assignedClientIds.length === 0) return [];
  return items.filter((item) => item.clientId && user.assignedClientIds.includes(item.clientId));
}

function canEditService(user: AuthedRequest['user'], clientId: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'staff' && user.canUpdateAssignedServices) {
    return user.assignedClientIds.includes(clientId);
  }
  return false;
}

// --- DASHBOARD SUMMARY ---
router.get('/dashboard/summary', requireAuth, async (req: AuthedRequest, res) => {
  const [clientsAll, hostingAll, domainsAll, invoicesAll, notificationsAll] = await Promise.all([
    db.clients.find(),
    db.hosting_services.find(),
    db.domains.find(),
    db.invoices.find(),
    db.notifications.find({}, { field: 'createdAt', dir: -1 }),
  ]);

  const clients = scopeByUser(clientsAll, req.user);
  const hosting = scopeByUser(hostingAll, req.user);
  const domains = scopeByUser(domainsAll, req.user);
  const invoices = scopeByUser(invoicesAll, req.user);

  const allServices = [
    ...hosting.map((h) => ({ ...h, serviceCategory: 'Hosting' as const, name: h.domainName })),
    ...domains.map((d) => ({ ...d, serviceCategory: 'Domain' as const, name: d.domainName })),
  ];

  const activeServices = allServices.filter(
    (s) => s.accountStatus === 'Active' || s.accountStatus === 'Renewed'
  ).length;
  const upcomingExpiry = allServices.filter(
    (s) => s.accountStatus === 'Upcoming Expiry'
  ).length;
  const expiredServices = allServices.filter(
    (s) => s.accountStatus === 'Expired'
  ).length;

  const totalRevenue = invoices
    .filter((i) => i.status === 'Paid')
    .reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);

  const pendingPayments = invoices
    .filter((i) => i.status === 'Pending' || i.status === 'Overdue')
    .reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);

  const upcomingList = allServices
    .filter((s) => s.accountStatus === 'Upcoming Expiry')
    .map((s) => ({
      _id: s._id,
      serviceCategory: s.serviceCategory,
      domainName: s.domainName,
      clientName: s.clientName,
      clientId: s.clientId,
      provider: s.serviceCategory === 'Hosting' ? s.hostingProvider : s.domainRegistrar,
      expiryDate: s.expiryDate,
      daysRemaining: daysUntil(s.expiryDate),
      amount: s.serviceCategory === 'Hosting' ? s.renewalAmount : s.renewalPrice,
      accountStatus: s.accountStatus,
    }))
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  const expiredList = allServices
    .filter((s) => s.accountStatus === 'Expired')
    .map((s) => ({
      _id: s._id,
      serviceCategory: s.serviceCategory,
      domainName: s.domainName,
      clientName: s.clientName,
      clientId: s.clientId,
      provider: s.serviceCategory === 'Hosting' ? s.hostingProvider : s.domainRegistrar,
      expiryDate: s.expiryDate,
      daysRemaining: daysUntil(s.expiryDate),
      amount: s.serviceCategory === 'Hosting' ? s.renewalAmount : s.renewalPrice,
      accountStatus: s.accountStatus,
    }))
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  return res.json({
    metrics: {
      totalClients: clients.length,
      totalHosting: hosting.length,
      totalDomains: domains.length,
      activeServices,
      upcomingExpiry,
      expiredServices,
      totalRevenue,
      pendingPayments,
    },
    upcomingList,
    expiredList,
    recentNotifications: notificationsAll.slice(0, 8),
  });
});

// --- CLIENTS CRUD ---
const clientSchema = z.object({
  clientName: z.string().min(1),
  companyName: z.string().optional().default(''),
  email: z.string().email(),
  mobile: z.string().min(5),
  address: z.string().optional().default(''),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  serviceProvider: z.string().optional().default(''),
  serviceType: z.string().optional().default('Hosting & Domain'),
  servicePrice: z.coerce.number().min(0).default(0),
  renewalPrice: z.coerce.number().min(0).default(0),
  paymentStatus: z.enum(['Paid', 'Pending', 'Overdue', 'Partial']).default('Pending'),
  accountStatus: z
    .enum(['Active', 'Upcoming Expiry', 'Expired', 'Renewed', 'Cancelled'])
    .optional(),
  notes: z.string().optional().default(''),
});

async function generateNextClientId(): Promise<string> {
  const all = await db.clients.find();
  let maxNum = 0;
  for (const c of all) {
    const match = String(c.clientId || '').match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `HF-CLT-${String(maxNum + 1).padStart(4, '0')}`;
}

router.get('/clients', requireAuth, async (req: AuthedRequest, res) => {
  const all = await db.clients.find({}, { field: 'createdAt', dir: -1 });
  return res.json({ items: scopeByUser(all, req.user) });
});

router.post('/clients', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid client payload' });
  }
  const clientId = await generateNextClientId();
  const status = computeServiceStatus(parsed.data.endDate, parsed.data.accountStatus);
  const created = await db.clients.create({
    ...parsed.data,
    clientId,
    accountStatus: status,
  });
  await logActivity(req, 'CREATE_CLIENT', 'clients', created._id, `Created client ${clientId} (${created.clientName})`);
  return res.status(201).json({ item: created });
});

router.put('/clients/:id', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const parsed = clientSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid client update' });
  }
  const existing = await db.clients.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  const endDate = parsed.data.endDate || existing.endDate;
  const status = computeServiceStatus(endDate, parsed.data.accountStatus || existing.accountStatus);
  const updated = await db.clients.updateById(req.params.id, {
    ...parsed.data,
    accountStatus: status,
  });
  await logActivity(req, 'UPDATE_CLIENT', 'clients', req.params.id, `Updated client ${existing.clientId}`);
  return res.json({ item: updated });
});

router.delete('/clients/:id', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const existing = await db.clients.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  await db.clients.deleteById(req.params.id);
  await logActivity(req, 'DELETE_CLIENT', 'clients', req.params.id, `Deleted client ${existing.clientId}`);
  return res.json({ success: true });
});

// --- HOSTING SERVICES CRUD ---
const hostingSchema = z.object({
  clientId: z.string().min(1),
  providerId: z.string().optional().default(''),
  hostingProvider: z.string().min(1),
  hostingPlan: z.string().min(1),
  domainName: z.string().min(1),
  serverName: z.string().optional().default(''),
  serverIp: z.string().optional().default(''),
  username: z.string().optional().default(''),
  password: z.string().optional(),
  startDate: z.string().min(1),
  expiryDate: z.string().min(1),
  renewalAmount: z.coerce.number().min(0).default(0),
  providerEmail: z.string().optional().default(''),
  accountStatus: z
    .enum(['Active', 'Upcoming Expiry', 'Expired', 'Renewed', 'Cancelled'])
    .optional(),
  notes: z.string().optional().default(''),
});

function sanitizeHostingForClient(item: any, role: string) {
  const out = { ...item };
  delete out.passwordEnc;
  out.hasPassword = Boolean(item.passwordEnc);
  if (role === 'viewer') {
    out.username = out.username ? '••••••' : '';
    out.serverIp = out.serverIp ? '***.***.***.***' : '';
    out.providerEmail = '';
  }
  out.maskedPassword = item.passwordEnc ? maskSecret(item.passwordEnc) : '';
  return out;
}

router.get('/hosting', requireAuth, async (req: AuthedRequest, res) => {
  const all = await db.hosting_services.find({}, { field: 'expiryDate', dir: 1 });
  const scoped = scopeByUser(all, req.user);
  return res.json({
    items: scoped.map((h) => sanitizeHostingForClient(h, req.user!.role)),
  });
});

router.post('/hosting', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const parsed = hostingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid hosting record' });
  }
  const client = await db.clients.findOne({ clientId: parsed.data.clientId });
  const status = computeServiceStatus(parsed.data.expiryDate, parsed.data.accountStatus);
  const { password, ...rest } = parsed.data;
  const created = await db.hosting_services.create({
    ...rest,
    clientName: client?.clientName || '',
    passwordEnc: password ? encryptField(password) : '',
    accountStatus: status,
  });
  await logActivity(req, 'CREATE_HOSTING', 'hosting_services', created._id, `Added hosting for ${created.domainName}`);
  return res.status(201).json({ item: sanitizeHostingForClient(created, req.user!.role) });
});

router.put('/hosting/:id', requireAuth, async (req: AuthedRequest, res) => {
  const existing = await db.hosting_services.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Hosting service not found' });
  if (!canEditService(req.user, existing.clientId)) {
    return res.status(403).json({ error: 'Insufficient permissions to edit this hosting service' });
  }
  const parsed = hostingSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid hosting update' });
  }
  const { password, ...rest } = parsed.data;
  const updates: Record<string, any> = { ...rest };
  if (password && req.user!.role === 'admin') {
    updates.passwordEnc = encryptField(password);
  }
  if (rest.clientId) {
    const client = await db.clients.findOne({ clientId: rest.clientId });
    updates.clientName = client?.clientName || existing.clientName;
  }
  const exp = rest.expiryDate || existing.expiryDate;
  updates.accountStatus = computeServiceStatus(exp, rest.accountStatus || existing.accountStatus);

  const updated = await db.hosting_services.updateById(req.params.id, updates);
  await logActivity(req, 'UPDATE_HOSTING', 'hosting_services', req.params.id, `Updated hosting for ${existing.domainName}`);
  return res.json({ item: sanitizeHostingForClient(updated, req.user!.role) });
});

router.delete('/hosting/:id', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const existing = await db.hosting_services.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Hosting service not found' });
  await db.hosting_services.deleteById(req.params.id);
  await logActivity(req, 'DELETE_HOSTING', 'hosting_services', req.params.id, `Deleted hosting for ${existing.domainName}`);
  return res.json({ success: true });
});

// --- DOMAINS CRUD ---
const domainSchema = z.object({
  clientId: z.string().min(1),
  providerId: z.string().optional().default(''),
  domainName: z.string().min(1),
  domainRegistrar: z.string().min(1),
  registrationDate: z.string().min(1),
  expiryDate: z.string().min(1),
  renewalPrice: z.coerce.number().min(0).default(0),
  domainUsername: z.string().optional().default(''),
  domainPassword: z.string().optional(),
  dnsDetails: z.string().optional().default(''),
  nameservers: z.union([z.array(z.string()), z.string()]).optional().default([]),
  accountStatus: z
    .enum(['Active', 'Upcoming Expiry', 'Expired', 'Renewed', 'Cancelled'])
    .optional(),
  notes: z.string().optional().default(''),
});

function sanitizeDomainForClient(item: any, role: string) {
  const out = { ...item };
  delete out.domainPasswordEnc;
  out.hasPassword = Boolean(item.domainPasswordEnc);
  out.maskedPassword = item.domainPasswordEnc ? maskSecret(item.domainPasswordEnc) : '';
  if (role === 'viewer') {
    out.domainUsername = out.domainUsername ? '••••••' : '';
  }
  return out;
}

router.get('/domains', requireAuth, async (req: AuthedRequest, res) => {
  const all = await db.domains.find({}, { field: 'expiryDate', dir: 1 });
  const scoped = scopeByUser(all, req.user);
  return res.json({
    items: scoped.map((d) => sanitizeDomainForClient(d, req.user!.role)),
  });
});

router.post('/domains', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const parsed = domainSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid domain record' });
  }
  const client = await db.clients.findOne({ clientId: parsed.data.clientId });
  const status = computeServiceStatus(parsed.data.expiryDate, parsed.data.accountStatus);
  const nsArray = Array.isArray(parsed.data.nameservers)
    ? parsed.data.nameservers
    : parsed.data.nameservers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  const { domainPassword, ...rest } = parsed.data;
  const created = await db.domains.create({
    ...rest,
    nameservers: nsArray,
    clientName: client?.clientName || '',
    domainPasswordEnc: domainPassword ? encryptField(domainPassword) : '',
    accountStatus: status,
  });
  await logActivity(req, 'CREATE_DOMAIN', 'domains', created._id, `Added domain ${created.domainName}`);
  return res.status(201).json({ item: sanitizeDomainForClient(created, req.user!.role) });
});

router.put('/domains/:id', requireAuth, async (req: AuthedRequest, res) => {
  const existing = await db.domains.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Domain not found' });
  if (!canEditService(req.user, existing.clientId)) {
    return res.status(403).json({ error: 'Insufficient permissions to edit this domain' });
  }
  const parsed = domainSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid domain update' });
  }
  const { domainPassword, nameservers, ...rest } = parsed.data;
  const updates: Record<string, any> = { ...rest };
  if (nameservers !== undefined) {
    updates.nameservers = Array.isArray(nameservers)
      ? nameservers
      : nameservers.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (domainPassword && req.user!.role === 'admin') {
    updates.domainPasswordEnc = encryptField(domainPassword);
  }
  if (rest.clientId) {
    const client = await db.clients.findOne({ clientId: rest.clientId });
    updates.clientName = client?.clientName || existing.clientName;
  }
  const exp = rest.expiryDate || existing.expiryDate;
  updates.accountStatus = computeServiceStatus(exp, rest.accountStatus || existing.accountStatus);

  const updated = await db.domains.updateById(req.params.id, updates);
  await logActivity(req, 'UPDATE_DOMAIN', 'domains', req.params.id, `Updated domain ${existing.domainName}`);
  return res.json({ item: sanitizeDomainForClient(updated, req.user!.role) });
});

router.delete('/domains/:id', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const existing = await db.domains.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Domain not found' });
  await db.domains.deleteById(req.params.id);
  await logActivity(req, 'DELETE_DOMAIN', 'domains', req.params.id, `Deleted domain ${existing.domainName}`);
  return res.json({ success: true });
});

// --- PROVIDERS CRUD ---
const providerSchema = z.object({
  providerName: z.string().min(1),
  providerType: z.enum([
    'Domain Providers',
    'Hosting Providers',
    'Server Providers',
    'Email Providers',
    'Payment Providers',
  ]),
  loginEmail: z.string().optional().default(''),
  loginPassword: z.string().optional(),
  accountUrl: z.string().optional().default(''),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  configurationDetails: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

function sanitizeProvider(p: any, role: string) {
  const out = {
    _id: p._id,
    providerName: p.providerName,
    providerType: p.providerType,
    accountUrl: p.accountUrl,
    configurationDetails: role === 'viewer' ? '[Redacted for Viewer]' : p.configurationDetails,
    notes: p.notes,
    loginEmail: role === 'viewer' ? '••••••' : p.loginEmail,
    hasLoginPassword: Boolean(p.loginPasswordEnc),
    hasApiKey: Boolean(p.apiKeyEnc),
    hasApiSecret: Boolean(p.apiSecretEnc),
    maskedPassword: p.loginPasswordEnc ? maskSecret(p.loginPasswordEnc) : '',
    maskedApiKey: p.apiKeyEnc ? maskSecret(p.apiKeyEnc) : '',
    maskedApiSecret: p.apiSecretEnc ? maskSecret(p.apiSecretEnc) : '',
    createdAt: p.createdAt,
  };
  return out;
}

router.get('/providers', requireAuth, async (req: AuthedRequest, res) => {
  const all = await db.providers.find({}, { field: 'providerName', dir: 1 });
  return res.json({
    items: all.map((p) => sanitizeProvider(p, req.user!.role)),
  });
});

router.post('/providers', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const parsed = providerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid provider' });
  }
  const { loginPassword, apiKey, apiSecret, ...rest } = parsed.data;
  const created = await db.providers.create({
    ...rest,
    loginPasswordEnc: loginPassword ? encryptField(loginPassword) : '',
    apiKeyEnc: apiKey ? encryptField(apiKey) : '',
    apiSecretEnc: apiSecret ? encryptField(apiSecret) : '',
  });
  await logActivity(req, 'CREATE_PROVIDER', 'providers', created._id, `Added provider ${created.providerName}`);
  return res.status(201).json({ item: sanitizeProvider(created, req.user!.role) });
});

router.put('/providers/:id', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const existing = await db.providers.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Provider not found' });
  const parsed = providerSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid provider update' });
  }
  const { loginPassword, apiKey, apiSecret, ...rest } = parsed.data;
  const updates: Record<string, any> = { ...rest };
  if (loginPassword) updates.loginPasswordEnc = encryptField(loginPassword);
  if (apiKey) updates.apiKeyEnc = encryptField(apiKey);
  if (apiSecret) updates.apiSecretEnc = encryptField(apiSecret);

  const updated = await db.providers.updateById(req.params.id, updates);
  await logActivity(req, 'UPDATE_PROVIDER', 'providers', req.params.id, `Updated provider ${existing.providerName}`);
  return res.json({ item: sanitizeProvider(updated, req.user!.role) });
});

router.delete('/providers/:id', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const existing = await db.providers.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Provider not found' });
  await db.providers.deleteById(req.params.id);
  await logActivity(req, 'DELETE_PROVIDER', 'providers', req.params.id, `Deleted provider ${existing.providerName}`);
  return res.json({ success: true });
});

// --- ADMIN-ONLY CREDENTIAL REVEAL (AUDITED) ---
router.post('/secrets/reveal', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const { resource, id, field, mode } = req.body || {};
  let secretValue = '';

  if (resource === 'hosting') {
    const doc = await db.hosting_services.findById(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    secretValue = decryptField(doc.passwordEnc);
  } else if (resource === 'domain') {
    const doc = await db.domains.findById(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    secretValue = decryptField(doc.domainPasswordEnc);
  } else if (resource === 'provider') {
    const doc = await db.providers.findById(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (field === 'loginPassword') secretValue = decryptField(doc.loginPasswordEnc);
    if (field === 'apiKey') secretValue = decryptField(doc.apiKeyEnc);
    if (field === 'apiSecret') secretValue = decryptField(doc.apiSecretEnc);
  } else if (resource === 'gateway') {
    const doc = await db.payment_gateways.findById(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const cfg = mode === 'live' ? doc.liveConfig : doc.testConfig;
    if (field === 'password') secretValue = decryptField(cfg?.passwordEnc);
    if (field === 'apiKey') secretValue = decryptField(cfg?.apiKeyEnc);
    if (field === 'apiSecret') secretValue = decryptField(cfg?.apiSecretEnc);
  } else if (resource === 'bank') {
    const doc = await db.bank_accounts.findById(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    secretValue = decryptField(doc.accountNumberEnc);
  } else {
    return res.status(400).json({ error: 'Invalid resource type' });
  }

  await logActivity(
    req,
    'REVEAL_SECRET',
    String(resource),
    String(id),
    `Revealed encrypted ${field || 'credential'}`
  );

  return res.json({ value: secretValue });
});

export default router;
