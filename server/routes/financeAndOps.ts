import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { Router } from 'express';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { db, getDbStatus } from '../db/store.js';
import {
  AuthedRequest,
  logActivity,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { computeServiceStatus, runExpiryCheck } from '../services/statusAndCron.js';
import { encryptField, maskLast4, maskSecret } from '../utils/crypto.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ==========================================
// 1. PAYMENT GATEWAY CONFIGURATIONS (TEST & LIVE)
// ==========================================
function sanitizeGatewayEnv(cfg: any) {
  return {
    email: cfg?.email || '',
    hasPassword: Boolean(cfg?.passwordEnc),
    maskedPassword: cfg?.passwordEnc ? maskSecret(cfg.passwordEnc) : '',
    hasApiKey: Boolean(cfg?.apiKeyEnc),
    maskedApiKey: cfg?.apiKeyEnc ? maskSecret(cfg.apiKeyEnc) : '',
    hasApiSecret: Boolean(cfg?.apiSecretEnc),
    maskedApiSecret: cfg?.apiSecretEnc ? maskSecret(cfg.apiSecretEnc) : '',
    configurationDetails: cfg?.configurationDetails || '',
    status: cfg?.status || 'Disabled',
  };
}

router.get('/gateways', requireAuth, requireRole('admin'), async (_req, res) => {
  const all = await db.payment_gateways.find();
  return res.json({
    items: all.map((g) => ({
      _id: g._id,
      gatewayKey: g.gatewayKey,
      providerName: g.providerName,
      activeMode: g.activeMode,
      testConfig: sanitizeGatewayEnv(g.testConfig),
      liveConfig: sanitizeGatewayEnv(g.liveConfig),
      updatedAt: g.updatedAt,
    })),
  });
});

const gatewayUpdateSchema = z.object({
  providerName: z.string().min(1).optional(),
  activeMode: z.enum(['test', 'live']).optional(),
  modeToUpdate: z.enum(['test', 'live']).optional(),
  config: z
    .object({
      email: z.string().optional(),
      password: z.string().optional(),
      apiKey: z.string().optional(),
      apiSecret: z.string().optional(),
      configurationDetails: z.string().optional(),
      status: z.enum(['Enabled', 'Disabled']).optional(),
    })
    .optional(),
});

router.put('/gateways/:id', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const existing = await db.payment_gateways.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Payment gateway not found' });

  const parsed = gatewayUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid gateway update' });
  }

  const updates: Record<string, any> = {};
  if (parsed.data.providerName) updates.providerName = parsed.data.providerName;
  if (parsed.data.activeMode) updates.activeMode = parsed.data.activeMode;

  if (parsed.data.modeToUpdate && parsed.data.config) {
    const targetKey = parsed.data.modeToUpdate === 'live' ? 'liveConfig' : 'testConfig';
    const prevEnv = existing[targetKey] || {};
    const c = parsed.data.config;
    updates[targetKey] = {
      email: c.email !== undefined ? c.email : prevEnv.email || '',
      passwordEnc: c.password ? encryptField(c.password) : prevEnv.passwordEnc || '',
      apiKeyEnc: c.apiKey ? encryptField(c.apiKey) : prevEnv.apiKeyEnc || '',
      apiSecretEnc: c.apiSecret ? encryptField(c.apiSecret) : prevEnv.apiSecretEnc || '',
      configurationDetails:
        c.configurationDetails !== undefined
          ? c.configurationDetails
          : prevEnv.configurationDetails || '',
      status: c.status || prevEnv.status || 'Disabled',
    };
  }

  const updated = await db.payment_gateways.updateById(req.params.id, updates);
  await logActivity(
    req,
    'UPDATE_GATEWAY',
    'payment_gateways',
    req.params.id,
    `Updated ${existing.providerName} (${parsed.data.modeToUpdate || parsed.data.activeMode || 'config'})`
  );

  return res.json({
    item: {
      _id: updated._id,
      gatewayKey: updated.gatewayKey,
      providerName: updated.providerName,
      activeMode: updated.activeMode,
      testConfig: sanitizeGatewayEnv(updated.testConfig),
      liveConfig: sanitizeGatewayEnv(updated.liveConfig),
      updatedAt: updated.updatedAt,
    },
  });
});

// ==========================================
// 2. CARDS, UPI & BANK DETAILS (PCI-SAFE + ENCRYPTED)
// ==========================================
function sanitizeBankRecord(b: any) {
  return {
    _id: b._id,
    entryType: b.entryType,
    cardholderName: b.cardholderName,
    cardType: b.cardType,
    cardLast4: b.cardLast4,
    maskedCardNumber: b.cardLast4 ? maskLast4(b.cardLast4) : '',
    tokenRef: b.tokenRef,
    expiryDate: b.expiryDate,
    cardProvider: b.cardProvider,
    upiId: b.upiId,
    bankName: b.bankName,
    accountHolderName: b.accountHolderName,
    maskedAccountNumber: b.accountLast4 ? `••••••${b.accountLast4}` : '',
    ifscCode: b.ifscCode,
    accountType: b.accountType,
    branchName: b.branchName,
    isPrimary: Boolean(b.isPrimary),
    createdAt: b.createdAt,
  };
}

router.get('/bank-accounts', requireAuth, requireRole('admin'), async (_req, res) => {
  const all = await db.bank_accounts.find({}, { field: 'createdAt', dir: -1 });
  return res.json({ items: all.map(sanitizeBankRecord) });
});

router.post('/bank-accounts', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const body = req.body || {};
  // Strictly block CVV or full PAN storage
  if (body.cvv !== undefined && String(body.cvv).trim() !== '') {
    return res.status(400).json({ error: 'Security policy violation: CVV must never be submitted or stored.' });
  }
  if (body.fullCardNumber && String(body.fullCardNumber).replace(/\D/g, '').length > 4) {
    return res.status(400).json({ error: 'Security policy violation: Only last 4 digits and gateway token reference are permitted.' });
  }

  const entryType = body.entryType;
  if (!['card', 'upi', 'bank'].includes(entryType)) {
    return res.status(400).json({ error: 'Invalid entryType. Must be card, upi, or bank.' });
  }

  const payload: Record<string, any> = {
    entryType,
    isPrimary: Boolean(body.isPrimary),
  };

  if (entryType === 'card') {
    const last4 = String(body.cardLast4 || '').replace(/\D/g, '').slice(-4);
    if (last4.length !== 4) {
      return res.status(400).json({ error: 'Card last 4 digits must be exactly 4 numeric digits.' });
    }
    payload.cardholderName = String(body.cardholderName || '').trim();
    payload.cardType = String(body.cardType || 'Credit Card');
    payload.cardLast4 = last4;
    payload.tokenRef = String(body.tokenRef || `tok_ref_${Date.now()}`).trim();
    payload.expiryDate = String(body.expiryDate || '').trim();
    payload.cardProvider = String(body.cardProvider || '').trim();
  } else if (entryType === 'upi') {
    if (!body.upiId) return res.status(400).json({ error: 'UPI ID is required' });
    payload.upiId = String(body.upiId).trim();
    payload.accountHolderName = String(body.accountHolderName || '').trim();
    payload.bankName = String(body.bankName || '').trim();
  } else if (entryType === 'bank') {
    const acct = String(body.accountNumber || '').trim();
    if (!acct || !body.bankName || !body.ifscCode) {
      return res.status(400).json({ error: 'Bank name, account number, and IFSC code are required' });
    }
    payload.bankName = String(body.bankName).trim();
    payload.accountHolderName = String(body.accountHolderName || '').trim();
    payload.accountNumberEnc = encryptField(acct);
    payload.accountLast4 = acct.slice(-4);
    payload.ifscCode = String(body.ifscCode).toUpperCase().trim();
    payload.accountType = String(body.accountType || 'Current Account');
    payload.branchName = String(body.branchName || '').trim();
  }

  const created = await db.bank_accounts.create(payload);
  await logActivity(req, 'CREATE_BANK_RECORD', 'bank_accounts', created._id, `Added ${entryType} payment reference`);
  return res.status(201).json({ item: sanitizeBankRecord(created) });
});

router.delete('/bank-accounts/:id', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const ok = await db.bank_accounts.deleteById(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Record not found' });
  await logActivity(req, 'DELETE_BANK_RECORD', 'bank_accounts', req.params.id, 'Removed payment/bank record');
  return res.json({ success: true });
});

// ==========================================
// 3. INVOICES, TAX MANAGEMENT & PDF DOWNLOAD
// ==========================================
const invoiceSchema = z.object({
  clientId: z.string().min(1),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        serviceType: z.string().default('Hosting'),
        quantity: z.coerce.number().min(1).default(1),
        unitPrice: z.coerce.number().min(0),
      })
    )
    .min(1),
  taxMode: z.enum(['with_tax', 'without_tax']).default('with_tax'),
  taxPercentage: z.coerce.number().min(0).max(100).default(18),
  currency: z.string().default('INR'),
  dueDate: z.string().min(1),
  status: z.enum(['Paid', 'Pending', 'Overdue']).default('Pending'),
  notes: z.string().optional().default(''),
});

async function generateNextInvoiceNumber(): Promise<string> {
  const all = await db.invoices.find();
  const year = new Date().getFullYear();
  let maxNum = 0;
  for (const inv of all) {
    const match = String(inv.invoiceNumber || '').match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `HF-INV-${year}-${String(maxNum + 1).padStart(3, '0')}`;
}

router.get('/invoices', requireAuth, async (req: AuthedRequest, res) => {
  let all = await db.invoices.find({}, { field: 'createdAt', dir: -1 });
  if (req.user!.role === 'staff') {
    all = all.filter((i) => req.user!.assignedClientIds.includes(i.clientId));
  }
  const payments = await db.payment_records.find({}, { field: 'paidAt', dir: -1 });
  return res.json({ items: all, payments });
});

router.post('/invoices', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid invoice payload' });
  }
  const client = await db.clients.findOne({ clientId: parsed.data.clientId });
  if (!client) return res.status(404).json({ error: 'Selected client not found' });

  const items = parsed.data.lineItems.map((li) => ({
    ...li,
    amount: Number((li.quantity * li.unitPrice).toFixed(2)),
  }));
  const subtotal = Number(items.reduce((s, i) => s + i.amount, 0).toFixed(2));
  const rate = parsed.data.taxMode === 'with_tax' ? parsed.data.taxPercentage : 0;
  const taxAmount = Number(((subtotal * rate) / 100).toFixed(2));
  const totalAmount = Number((subtotal + taxAmount).toFixed(2));
  const invoiceNumber = await generateNextInvoiceNumber();

  const created = await db.invoices.create({
    invoiceNumber,
    clientId: client.clientId,
    clientName: client.clientName,
    companyName: client.companyName,
    clientEmail: client.email,
    clientAddress: client.address,
    lineItems: items,
    taxMode: parsed.data.taxMode,
    taxPercentage: rate,
    subtotal,
    taxAmount,
    totalAmount,
    currency: parsed.data.currency,
    issueDate: new Date().toISOString(),
    dueDate: parsed.data.dueDate,
    status: parsed.data.status,
    notes: parsed.data.notes,
  });

  if (parsed.data.status === 'Paid') {
    await db.payment_records.create({
      clientId: client.clientId,
      clientName: client.clientName,
      invoiceId: created._id,
      invoiceNumber: created.invoiceNumber,
      amount: totalAmount,
      currency: created.currency,
      paymentMethod: 'Manual Entry',
      gatewayUsed: 'manual',
      gatewayMode: 'live',
      transactionRef: `TXN-${Date.now()}`,
      status: 'Paid',
      paidAt: new Date().toISOString(),
    });
  }

  await logActivity(req, 'CREATE_INVOICE', 'invoices', created._id, `Generated invoice ${invoiceNumber} (${totalAmount} ${created.currency})`);
  return res.status(201).json({ item: created });
});

router.patch('/invoices/:id/status', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const status = req.body?.status;
  if (!['Paid', 'Pending', 'Overdue'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const existing = await db.invoices.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });

  const updated = await db.invoices.updateById(req.params.id, { status });
  if (status === 'Paid' && existing.status !== 'Paid') {
    await db.payment_records.create({
      clientId: existing.clientId,
      clientName: existing.clientName,
      invoiceId: existing._id,
      invoiceNumber: existing.invoiceNumber,
      amount: existing.totalAmount,
      currency: existing.currency || 'INR',
      paymentMethod: req.body?.paymentMethod || 'Razorpay / Bank',
      gatewayUsed: 'razorpay',
      gatewayMode: 'live',
      transactionRef: req.body?.transactionRef || `PAY-${Date.now()}`,
      status: 'Paid',
      paidAt: new Date().toISOString(),
    });
  }
  await logActivity(req, 'UPDATE_INVOICE_STATUS', 'invoices', req.params.id, `Marked ${existing.invoiceNumber} as ${status}`);
  return res.json({ item: updated });
});

router.delete('/invoices/:id', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const existing = await db.invoices.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });
  await db.invoices.deleteById(req.params.id);
  await logActivity(req, 'DELETE_INVOICE', 'invoices', req.params.id, `Deleted invoice ${existing.invoiceNumber}`);
  return res.json({ success: true });
});

router.get('/invoices/:id/pdf', requireAuth, async (req: AuthedRequest, res) => {
  const inv = await db.invoices.findById(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  if (req.user!.role === 'staff' && !req.user!.assignedClientIds.includes(inv.clientId)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const settings = (await db.settings.findOne({ key: 'global' })) || {};

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${inv.invoiceNumber}.pdf"`
  );
  doc.pipe(res);

  const cur = inv.currency === 'INR' ? 'INR ' : `${inv.currency || 'INR'} `;

  // Header
  doc.fontSize(20).fillColor('#0F172A').text(settings.companyName || 'Host Finder Infrastructure Pvt. Ltd.', 50, 50);
  doc.fontSize(9).fillColor('#475569');
  doc.text(settings.companyAddress || '', 50, 76);
  doc.text(`GSTIN: ${settings.companyGstNumber || 'N/A'}  |  Email: ${settings.companyEmail || ''}`, 50, 90);

  doc.fontSize(22).fillColor('#2563EB').text('TAX INVOICE', 400, 50, { align: 'right' });
  doc.fontSize(10).fillColor('#0F172A').text(inv.invoiceNumber, 400, 78, { align: 'right' });
  doc.fontSize(9).fillColor('#475569')
    .text(`Issue Date: ${new Date(inv.issueDate).toLocaleDateString('en-IN')}`, 400, 94, { align: 'right' })
    .text(`Due Date: ${new Date(inv.dueDate).toLocaleDateString('en-IN')}`, 400, 108, { align: 'right' })
    .text(`Status: ${inv.status}`, 400, 122, { align: 'right' });

  doc.moveTo(50, 145).lineTo(545, 145).strokeColor('#CBD5E1').stroke();

  // Bill To
  doc.fontSize(10).fillColor('#0F172A').text('BILL TO', 50, 162);
  doc.fontSize(11).text(`${inv.clientName}${inv.companyName ? ` — ${inv.companyName}` : ''}`, 50, 178);
  doc.fontSize(9).fillColor('#475569');
  if (inv.clientAddress) doc.text(inv.clientAddress, 50, 194);
  doc.text(`Client ID: ${inv.clientId}  |  Email: ${inv.clientEmail}`, 50, 208);

  // Table Header
  const tableTop = 245;
  doc.rect(50, tableTop, 495, 24).fill('#F1F5F9');
  doc.fillColor('#0F172A').fontSize(9);
  doc.text('Description', 60, tableTop + 7);
  doc.text('Type', 270, tableTop + 7);
  doc.text('Qty', 345, tableTop + 7, { width: 40, align: 'right' });
  doc.text('Unit Price', 395, tableTop + 7, { width: 70, align: 'right' });
  doc.text('Amount', 475, tableTop + 7, { width: 60, align: 'right' });

  let y = tableTop + 32;
  for (const li of inv.lineItems || []) {
    doc.fillColor('#1E293B').fontSize(9);
    doc.text(li.description, 60, y, { width: 205 });
    doc.text(li.serviceType || 'Service', 270, y, { width: 70 });
    doc.text(String(li.quantity || 1), 345, y, { width: 40, align: 'right' });
    doc.text(`${cur}${Number(li.unitPrice).toLocaleString('en-IN')}`, 395, y, { width: 70, align: 'right' });
    doc.text(`${cur}${Number(li.amount).toLocaleString('en-IN')}`, 475, y, { width: 60, align: 'right' });
    y += 24;
    doc.moveTo(50, y - 6).lineTo(545, y - 6).strokeColor('#E2E8F0').stroke();
  }

  // Totals
  y += 14;
  doc.fontSize(10).fillColor('#475569').text('Subtotal:', 360, y, { width: 100, align: 'right' });
  doc.fillColor('#0F172A').text(`${cur}${Number(inv.subtotal).toLocaleString('en-IN')}`, 465, y, { width: 75, align: 'right' });

  y += 18;
  const taxLabel = inv.taxMode === 'with_tax' ? `GST (${inv.taxPercentage}%):` : 'Tax (Without Tax):';
  doc.fillColor('#475569').text(taxLabel, 360, y, { width: 100, align: 'right' });
  doc.fillColor('#0F172A').text(`${cur}${Number(inv.taxAmount).toLocaleString('en-IN')}`, 465, y, { width: 75, align: 'right' });

  y += 22;
  doc.rect(350, y - 4, 195, 26).fill('#0F172A');
  doc.fillColor('#FFFFFF').fontSize(11).text('Total Amount:', 360, y + 3, { width: 100, align: 'right' });
  doc.text(`${cur}${Number(inv.totalAmount).toLocaleString('en-IN')}`, 465, y + 3, { width: 75, align: 'right' });

  if (inv.notes) {
    doc.fillColor('#475569').fontSize(9).text(`Notes: ${inv.notes}`, 50, y + 48, { width: 495 });
  }

  doc.fontSize(8).fillColor('#94A3B8').text('Generated by Host Finder Billing Engine', 50, 770, { align: 'center', width: 495 });
  doc.end();
});

// ==========================================
// 4. EXCEL IMPORT & EXPORT (ExcelJS)
// ==========================================
router.get('/excel/template', requireAuth, async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Clients Import Template');
  ws.columns = [
    { header: 'Client Name', key: 'clientName', width: 24 },
    { header: 'Company Name', key: 'companyName', width: 26 },
    { header: 'Email Address', key: 'email', width: 28 },
    { header: 'Mobile Number', key: 'mobile', width: 18 },
    { header: 'Address', key: 'address', width: 30 },
    { header: 'Start Date (YYYY-MM-DD)', key: 'startDate', width: 22 },
    { header: 'End Date (YYYY-MM-DD)', key: 'endDate', width: 22 },
    { header: 'Service Provider', key: 'serviceProvider', width: 24 },
    { header: 'Service Type', key: 'serviceType', width: 22 },
    { header: 'Service Price', key: 'servicePrice', width: 15 },
    { header: 'Renewal Price', key: 'renewalPrice', width: 15 },
    { header: 'Payment Status', key: 'paymentStatus', width: 16 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  ws.addRow({
    clientName: 'Arjun Verma',
    companyName: 'Verma Cloud Labs',
    email: 'arjun@vermacloud.in',
    mobile: '+91 98765 00112',
    address: 'MG Road, Bengaluru',
    startDate: '2026-01-15',
    endDate: '2027-01-15',
    serviceProvider: 'AWS Lightsail & EC2',
    serviceType: 'Managed Cloud + Domain',
    servicePrice: 18000,
    renewalPrice: 18000,
    paymentStatus: 'Paid',
    notes: 'Sample row — replace or append rows',
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="host_finder_clients_template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

router.post(
  '/excel/import/preview',
  requireAuth,
  requireRole('admin'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an Excel (.xlsx) file' });
    }
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer as any);
      const ws = wb.worksheets[0];
      if (!ws) return res.status(400).json({ error: 'Workbook has no worksheets' });

      const existingClients = await db.clients.find();
      const existingEmails = new Set(existingClients.map((c) => String(c.email).toLowerCase()));
      const seenEmails = new Set<string>();

      const validRows: any[] = [];
      const duplicateRows: any[] = [];
      const invalidRows: any[] = [];

      const headerRow = ws.getRow(1);
      const headers: Record<number, string> = {};
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber] = String(cell.value || '').trim().toLowerCase();
      });

      const getVal = (row: ExcelJS.Row, matchKeys: string[]): string => {
        for (const [colIdx, h] of Object.entries(headers)) {
          if (matchKeys.some((k) => h.includes(k))) {
            const v = row.getCell(Number(colIdx)).value;
            if (v instanceof Date) return v.toISOString().slice(0, 10);
            if (v && typeof v === 'object' && 'text' in v) return String((v as any).text).trim();
            return String(v ?? '').trim();
          }
        }
        return '';
      };

      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const clientName = getVal(row, ['client name', 'name']);
        const companyName = getVal(row, ['company']);
        const email = getVal(row, ['email']).toLowerCase();
        const mobile = getVal(row, ['mobile', 'phone']);
        const address = getVal(row, ['address']);
        const startDate = getVal(row, ['start date', 'start']);
        const endDate = getVal(row, ['end date', 'expiry', 'end']);
        const serviceProvider = getVal(row, ['provider']);
        const serviceType = getVal(row, ['service type', 'type']) || 'Hosting & Domain';
        const servicePrice = Number(getVal(row, ['service price', 'price']) || 0);
        const renewalPrice = Number(getVal(row, ['renewal']) || servicePrice);
        const paymentStatus = getVal(row, ['payment']) || 'Pending';
        const notes = getVal(row, ['notes']);

        if (!clientName && !email && !mobile) return;

        const record = {
          rowNumber,
          clientName,
          companyName,
          email,
          mobile,
          address,
          startDate: startDate || new Date().toISOString().slice(0, 10),
          endDate: endDate || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
          serviceProvider,
          serviceType,
          servicePrice: isNaN(servicePrice) ? 0 : servicePrice,
          renewalPrice: isNaN(renewalPrice) ? 0 : renewalPrice,
          paymentStatus: ['Paid', 'Pending', 'Overdue', 'Partial'].includes(paymentStatus)
            ? paymentStatus
            : 'Pending',
          notes,
        };

        const errors: string[] = [];
        if (!clientName) errors.push('Missing Client Name');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid Email');
        if (!mobile || mobile.length < 5) errors.push('Invalid Mobile');

        if (errors.length > 0) {
          invalidRows.push({ ...record, reason: errors.join(', ') });
        } else if (existingEmails.has(email) || seenEmails.has(email)) {
          duplicateRows.push({
            ...record,
            reason: existingEmails.has(email)
              ? 'Email already exists in database'
              : 'Duplicate email in uploaded file',
          });
        } else {
          seenEmails.add(email);
          validRows.push(record);
        }
      });

      return res.json({ validRows, duplicateRows, invalidRows });
    } catch (err) {
      return res.status(400).json({ error: `Failed to parse Excel file: ${(err as Error).message}` });
    }
  }
);

router.post('/excel/import/confirm', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) {
    return res.status(400).json({ error: 'No valid rows selected for import' });
  }
  const existing = await db.clients.find();
  let maxNum = 0;
  for (const c of existing) {
    const m = String(c.clientId || '').match(/(\d+)$/);
    if (m && Number(m[1]) > maxNum) maxNum = Number(m[1]);
  }

  let importedCount = 0;
  for (const r of rows) {
    maxNum++;
    const clientId = `HF-CLT-${String(maxNum).padStart(4, '0')}`;
    const status = computeServiceStatus(r.endDate);
    await db.clients.create({
      clientId,
      clientName: r.clientName,
      companyName: r.companyName || '',
      email: String(r.email).toLowerCase(),
      mobile: r.mobile,
      address: r.address || '',
      startDate: new Date(r.startDate).toISOString(),
      endDate: new Date(r.endDate).toISOString(),
      serviceProvider: r.serviceProvider || '',
      serviceType: r.serviceType || 'Hosting & Domain',
      servicePrice: Number(r.servicePrice || 0),
      renewalPrice: Number(r.renewalPrice || 0),
      paymentStatus: r.paymentStatus || 'Pending',
      accountStatus: status,
      notes: r.notes || '',
    });
    importedCount++;
  }

  await logActivity(req, 'EXCEL_IMPORT', 'clients', '', `Imported ${importedCount} clients via Excel`);
  return res.json({ importedCount });
});

router.get('/excel/export', requireAuth, requireRole('admin', 'staff'), async (req: AuthedRequest, res) => {
  const exportType = String(req.query.type || 'clients');
  const statusFilter = String(req.query.status || '');
  const providerFilter = String(req.query.provider || '').toLowerCase();
  const clientFilter = String(req.query.clientId || '');
  const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)).getTime() : 0;
  const toDate = req.query.toDate ? new Date(String(req.query.toDate)).getTime() : 0;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(exportType.toUpperCase());

  const applyCommonFilters = (items: any[], dateField: string, providerField: string) => {
    return items.filter((item) => {
      if (req.user!.role === 'staff' && !req.user!.assignedClientIds.includes(item.clientId)) {
        return false;
      }
      if (statusFilter && item.accountStatus !== statusFilter && item.status !== statusFilter) return false;
      if (clientFilter && item.clientId !== clientFilter) return false;
      if (providerFilter && !String(item[providerField] || '').toLowerCase().includes(providerFilter)) return false;
      if (fromDate || toDate) {
        const t = new Date(item[dateField] || item.createdAt).getTime();
        if (fromDate && t < fromDate) return false;
        if (toDate && t > toDate + 86400000) return false;
      }
      return true;
    });
  };

  if (exportType === 'clients') {
    const rows = applyCommonFilters(await db.clients.find(), 'endDate', 'serviceProvider');
    ws.columns = [
      { header: 'Client ID', key: 'clientId', width: 15 },
      { header: 'Client Name', key: 'clientName', width: 22 },
      { header: 'Company Name', key: 'companyName', width: 24 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Mobile', key: 'mobile', width: 18 },
      { header: 'Provider', key: 'serviceProvider', width: 22 },
      { header: 'Service Type', key: 'serviceType', width: 20 },
      { header: 'Start Date', key: 'startDate', width: 15 },
      { header: 'End Date', key: 'endDate', width: 15 },
      { header: 'Service Price', key: 'servicePrice', width: 14 },
      { header: 'Renewal Price', key: 'renewalPrice', width: 14 },
      { header: 'Payment Status', key: 'paymentStatus', width: 16 },
      { header: 'Account Status', key: 'accountStatus', width: 16 },
    ];
    rows.forEach((r) =>
      ws.addRow({
        ...r,
        startDate: String(r.startDate).slice(0, 10),
        endDate: String(r.endDate).slice(0, 10),
      })
    );
  } else if (exportType === 'hosting') {
    const rows = applyCommonFilters(await db.hosting_services.find(), 'expiryDate', 'hostingProvider');
    ws.columns = [
      { header: 'Client ID', key: 'clientId', width: 14 },
      { header: 'Client Name', key: 'clientName', width: 20 },
      { header: 'Hosting Provider', key: 'hostingProvider', width: 22 },
      { header: 'Plan', key: 'hostingPlan', width: 22 },
      { header: 'Domain', key: 'domainName', width: 24 },
      { header: 'Server Name', key: 'serverName', width: 20 },
      { header: 'Server IP', key: 'serverIp', width: 16 },
      { header: 'Start Date', key: 'startDate', width: 14 },
      { header: 'Expiry Date', key: 'expiryDate', width: 14 },
      { header: 'Renewal Amount', key: 'renewalAmount', width: 15 },
      { header: 'Status', key: 'accountStatus', width: 16 },
    ];
    rows.forEach((r) =>
      ws.addRow({
        ...r,
        startDate: String(r.startDate).slice(0, 10),
        expiryDate: String(r.expiryDate).slice(0, 10),
      })
    );
  } else if (exportType === 'domains') {
    const rows = applyCommonFilters(await db.domains.find(), 'expiryDate', 'domainRegistrar');
    ws.columns = [
      { header: 'Client ID', key: 'clientId', width: 14 },
      { header: 'Client Name', key: 'clientName', width: 20 },
      { header: 'Domain Name', key: 'domainName', width: 24 },
      { header: 'Registrar', key: 'domainRegistrar', width: 22 },
      { header: 'Registration Date', key: 'registrationDate', width: 16 },
      { header: 'Expiry Date', key: 'expiryDate', width: 14 },
      { header: 'Renewal Price', key: 'renewalPrice', width: 14 },
      { header: 'Nameservers', key: 'nameservers', width: 32 },
      { header: 'Status', key: 'accountStatus', width: 16 },
    ];
    rows.forEach((r) =>
      ws.addRow({
        ...r,
        registrationDate: String(r.registrationDate).slice(0, 10),
        expiryDate: String(r.expiryDate).slice(0, 10),
        nameservers: (r.nameservers || []).join(', '),
      })
    );
  } else if (exportType === 'upcoming' || exportType === 'expired') {
    const targetStatus = exportType === 'upcoming' ? 'Upcoming Expiry' : 'Expired';
    const hosting = applyCommonFilters(await db.hosting_services.find(), 'expiryDate', 'hostingProvider')
      .filter((h) => h.accountStatus === targetStatus)
      .map((h) => ({
        category: 'Hosting',
        clientId: h.clientId,
        clientName: h.clientName,
        name: h.domainName,
        provider: h.hostingProvider,
        expiryDate: String(h.expiryDate).slice(0, 10),
        amount: h.renewalAmount,
        status: h.accountStatus,
      }));
    const domains = applyCommonFilters(await db.domains.find(), 'expiryDate', 'domainRegistrar')
      .filter((d) => d.accountStatus === targetStatus)
      .map((d) => ({
        category: 'Domain',
        clientId: d.clientId,
        clientName: d.clientName,
        name: d.domainName,
        provider: d.domainRegistrar,
        expiryDate: String(d.expiryDate).slice(0, 10),
        amount: d.renewalPrice,
        status: d.accountStatus,
      }));
    ws.columns = [
      { header: 'Category', key: 'category', width: 12 },
      { header: 'Client ID', key: 'clientId', width: 14 },
      { header: 'Client Name', key: 'clientName', width: 20 },
      { header: 'Service / Domain', key: 'name', width: 24 },
      { header: 'Provider', key: 'provider', width: 22 },
      { header: 'Expiry Date', key: 'expiryDate', width: 14 },
      { header: 'Renewal Price', key: 'amount', width: 14 },
      { header: 'Status', key: 'status', width: 16 },
    ];
    [...hosting, ...domains].forEach((r) => ws.addRow(r));
  } else if (exportType === 'payments') {
    const rows = applyCommonFilters(await db.invoices.find(), 'issueDate', 'clientName');
    ws.columns = [
      { header: 'Invoice #', key: 'invoiceNumber', width: 18 },
      { header: 'Client ID', key: 'clientId', width: 14 },
      { header: 'Client Name', key: 'clientName', width: 22 },
      { header: 'Tax Mode', key: 'taxMode', width: 14 },
      { header: 'Tax %', key: 'taxPercentage', width: 10 },
      { header: 'Subtotal', key: 'subtotal', width: 14 },
      { header: 'Tax Amount', key: 'taxAmount', width: 14 },
      { header: 'Total Amount', key: 'totalAmount', width: 14 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Due Date', key: 'dueDate', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
    ];
    rows.forEach((r) =>
      ws.addRow({
        ...r,
        dueDate: String(r.dueDate).slice(0, 10),
      })
    );
  }

  await logActivity(req, 'EXCEL_EXPORT', exportType, '', `Exported ${exportType} workbook`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="host_finder_${exportType}_${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ==========================================
// 5. NOTIFICATIONS & EXPIRY SCANNER
// ==========================================
router.get('/notifications', requireAuth, async (_req, res) => {
  const items = await db.notifications.find({}, { field: 'createdAt', dir: -1 });
  return res.json({ items });
});

router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
  const updated = await db.notifications.updateById(req.params.id, { isRead: true });
  if (!updated) return res.status(404).json({ error: 'Notification not found' });
  return res.json({ item: updated });
});

router.post('/notifications/read-all', requireAuth, async (_req, res) => {
  await db.notifications.updateMany({ isRead: false }, { isRead: true });
  return res.json({ success: true });
});

router.post('/notifications/scan', requireAuth, requireRole('admin', 'staff'), async (req: AuthedRequest, res) => {
  const result = await runExpiryCheck();
  await logActivity(req, 'RUN_EXPIRY_SCAN', 'notifications', '', `Checked ${result.checkedHosting} hosting & ${result.checkedDomains} domains; ${result.newNotifications} new alerts`);
  return res.json(result);
});

// ==========================================
// 6. USER MANAGEMENT & RBAC (ADMIN ONLY)
// ==========================================
function sanitizeUser(u: any) {
  return {
    _id: u._id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    assignedClientIds: u.assignedClientIds || [],
    canUpdateAssignedServices: Boolean(u.canUpdateAssignedServices),
    mustChangePassword: Boolean(u.mustChangePassword),
    failedLoginAttempts: u.failedLoginAttempts || 0,
    lockUntil: u.lockUntil || null,
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    isActive: Boolean(u.isActive),
    lastLoginAt: u.lastLoginAt || null,
    createdAt: u.createdAt,
  };
}

router.get('/users', requireAuth, requireRole('admin'), async (_req, res) => {
  const all = await db.users.find({}, { field: 'createdAt', dir: -1 });
  return res.json({ items: all.map(sanitizeUser) });
});

const createUserSchema = z.object({
  username: z.string().min(3),
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'staff', 'viewer']),
  assignedClientIds: z.array(z.string()).optional().default([]),
  canUpdateAssignedServices: z.boolean().optional().default(true),
  mustChangePassword: z.boolean().optional().default(true),
});

router.post('/users', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user data' });
  }
  const dupUser = await db.users.findOne({ username: parsed.data.username.trim() });
  const dupEmail = await db.users.findOne({ email: parsed.data.email.trim().toLowerCase() });
  if (dupUser || dupEmail) {
    return res.status(409).json({ error: 'Username or email already exists' });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const created = await db.users.create({
    username: parsed.data.username.trim(),
    fullName: parsed.data.fullName.trim(),
    email: parsed.data.email.trim().toLowerCase(),
    passwordHash,
    role: parsed.data.role,
    assignedClientIds: parsed.data.assignedClientIds,
    canUpdateAssignedServices: parsed.data.canUpdateAssignedServices,
    mustChangePassword: parsed.data.mustChangePassword,
    failedLoginAttempts: 0,
    lockUntil: null,
    twoFactorEnabled: false,
    twoFactorSecretEnc: '',
    isActive: true,
  });

  await logActivity(req, 'CREATE_USER', 'users', created._id, `Created ${created.role} user ${created.username}`);
  return res.status(201).json({ item: sanitizeUser(created) });
});

router.put('/users/:id', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const existing = await db.users.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const updates: Record<string, any> = {};
  if (req.body.fullName) updates.fullName = String(req.body.fullName).trim();
  if (req.body.role && ['admin', 'staff', 'viewer'].includes(req.body.role)) {
    updates.role = req.body.role;
  }
  if (Array.isArray(req.body.assignedClientIds)) updates.assignedClientIds = req.body.assignedClientIds;
  if (typeof req.body.canUpdateAssignedServices === 'boolean') {
    updates.canUpdateAssignedServices = req.body.canUpdateAssignedServices;
  }
  if (typeof req.body.isActive === 'boolean') updates.isActive = req.body.isActive;
  if (req.body.newPassword && String(req.body.newPassword).length >= 8) {
    updates.passwordHash = await bcrypt.hash(String(req.body.newPassword), 12);
    updates.mustChangePassword = true;
  }

  const updated = await db.users.updateById(req.params.id, updates);
  await logActivity(req, 'UPDATE_USER', 'users', req.params.id, `Updated user ${existing.username}`);
  return res.json({ item: sanitizeUser(updated) });
});

router.post('/users/:id/unlock', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const updated = await db.users.updateById(req.params.id, {
    failedLoginAttempts: 0,
    lockUntil: null,
  });
  if (!updated) return res.status(404).json({ error: 'User not found' });
  await logActivity(req, 'UNLOCK_USER', 'users', req.params.id, `Unlocked user ${updated.username}`);
  return res.json({ item: sanitizeUser(updated) });
});

router.delete('/users/:id', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete your own active admin account' });
  }
  const existing = await db.users.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  await db.users.deleteById(req.params.id);
  await logActivity(req, 'DELETE_USER', 'users', req.params.id, `Deleted user ${existing.username}`);
  return res.json({ success: true });
});

// ==========================================
// 7. ACTIVITY LOGS, SETTINGS & API DOCS
// ==========================================
router.get('/activity-logs', requireAuth, requireRole('admin'), async (_req, res) => {
  const logs = await db.activity_logs.find({}, { field: 'createdAt', dir: -1 });
  return res.json({ items: logs.slice(0, 150) });
});

router.get('/settings', requireAuth, async (_req, res) => {
  const settings = await db.settings.findOne({ key: 'global' });
  return res.json({
    settings: settings || {},
    database: getDbStatus(),
  });
});

router.put('/settings', requireAuth, requireRole('admin'), async (req: AuthedRequest, res) => {
  const existing = await db.settings.findOne({ key: 'global' });
  if (!existing) return res.status(404).json({ error: 'Settings not initialized' });

  const allowed = [
    'companyName',
    'companyEmail',
    'companyPhone',
    'companyAddress',
    'companyGstNumber',
    'defaultCurrency',
    'defaultTaxMode',
    'defaultTaxRate',
    'emailAlertsEnabled',
    'defaultTheme',
  ];
  const updates: Record<string, any> = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  const updated = await db.settings.updateById(existing._id, updates);
  await logActivity(req, 'UPDATE_SETTINGS', 'settings', existing._id, 'Updated system & tax settings');
  return res.json({ settings: updated });
});

router.get('/docs', requireAuth, (_req, res) => {
  return res.json({
    version: '1.0.0',
    baseUrl: '/api',
    endpoints: [
      { method: 'POST', path: '/api/auth/login', auth: 'Public (Rate Limited)', description: 'Authenticate user, enforce 5-attempt lockout, optional TOTP 2FA' },
      { method: 'POST', path: '/api/auth/change-password', auth: 'Bearer / Cookie', description: 'Update user password and clear first-login flag' },
      { method: 'GET', path: '/api/dashboard/summary', auth: 'All Roles', description: 'Fetch 8 KPI metrics, upcoming/expired lists, and notifications' },
      { method: 'GET/POST/PUT/DELETE', path: '/api/clients', auth: 'Admin (Write) / Staff+Viewer (Read)', description: 'Manage clients with auto-generated HF-CLT IDs' },
      { method: 'GET/POST/PUT/DELETE', path: '/api/hosting', auth: 'Admin / Authorized Staff', description: 'Manage hosting services with AES-256-GCM password encryption' },
      { method: 'GET/POST/PUT/DELETE', path: '/api/domains', auth: 'Admin / Authorized Staff', description: 'Manage domain registrars, DNS details, nameservers, and auto-expiry status' },
      { method: 'GET/POST/PUT/DELETE', path: '/api/providers', auth: 'Admin (Write) / All (Read Masked)', description: 'Manage Domain, Hosting, Server, Email, and Payment providers' },
      { method: 'POST', path: '/api/secrets/reveal', auth: 'Admin Only', description: 'Audited decryption of a single password, API secret, or bank account' },
      { method: 'GET/PUT', path: '/api/gateways', auth: 'Admin Only', description: 'Configure Razorpay, SMTP, Google Play, Apple App Store with strict Test/Live isolation' },
      { method: 'GET/POST/DELETE', path: '/api/bank-accounts', auth: 'Admin Only', description: 'Manage tokenized last-4 cards, UPI IDs, and encrypted bank accounts' },
      { method: 'GET/POST/PATCH/DELETE', path: '/api/invoices', auth: 'Admin (Write)', description: 'Create With-Tax / Without-Tax GST invoices and record payments' },
      { method: 'GET', path: '/api/invoices/:id/pdf', auth: 'All Roles', description: 'Download formatted GST PDF invoice via PDFKit' },
      { method: 'POST', path: '/api/excel/import/preview & /confirm', auth: 'Admin Only', description: 'Upload .xlsx, validate rows, flag duplicates, and commit import' },
      { method: 'GET', path: '/api/excel/export', auth: 'Admin / Staff', description: 'Export filtered Clients, Hosting, Domains, Upcoming, Expired, or Payments to .xlsx' },
      { method: 'GET/PATCH/POST', path: '/api/notifications', auth: 'All Roles', description: 'View 30d/15d/7d/1d expiry reminders and trigger manual scan' },
      { method: 'GET/POST/PUT/DELETE', path: '/api/users', auth: 'Admin Only', description: 'RBAC user management, client assignment, and lockout reset' },
    ],
  });
});

export default router;
