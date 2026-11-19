import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. users (linked to Firebase Auth UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  username: text('username').notNull().unique(),
  fullName: text('full_name').notNull().default(''),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull().default(''),
  role: text('role').notNull().default('viewer'),
  assignedClientIds: jsonb('assigned_client_ids').$type<string[]>().notNull().default([]),
  canUpdateAssignedServices: boolean('can_update_assigned_services').notNull().default(true),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockUntil: text('lock_until'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  twoFactorSecretEnc: text('two_factor_secret_enc').notNull().default(''),
  resetTokenHash: text('reset_token_hash').notNull().default(''),
  resetTokenExpires: text('reset_token_expires'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: text('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 2. clients
export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  clientId: text('client_id').notNull().unique(),
  clientName: text('client_name').notNull(),
  companyName: text('company_name').notNull().default(''),
  email: text('email').notNull(),
  mobile: text('mobile').notNull(),
  address: text('address').notNull().default(''),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  serviceProvider: text('service_provider').notNull().default(''),
  serviceType: text('service_type').notNull().default('Hosting & Domain'),
  servicePrice: doublePrecision('service_price').notNull().default(0),
  renewalPrice: doublePrecision('renewal_price').notNull().default(0),
  paymentStatus: text('payment_status').notNull().default('Pending'),
  accountStatus: text('account_status').notNull().default('Active'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 3. hosting_services
export const hostingServices = pgTable('hosting_services', {
  id: serial('id').primaryKey(),
  clientId: text('client_id').notNull(),
  clientName: text('client_name').notNull().default(''),
  providerId: text('provider_id').notNull().default(''),
  hostingProvider: text('hosting_provider').notNull(),
  hostingPlan: text('hosting_plan').notNull(),
  domainName: text('domain_name').notNull(),
  serverName: text('server_name').notNull().default(''),
  serverIp: text('server_ip').notNull().default(''),
  username: text('username').notNull().default(''),
  passwordEnc: text('password_enc').notNull().default(''),
  startDate: text('start_date').notNull(),
  expiryDate: text('expiry_date').notNull(),
  renewalAmount: doublePrecision('renewal_amount').notNull().default(0),
  providerEmail: text('provider_email').notNull().default(''),
  accountStatus: text('account_status').notNull().default('Active'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 4. domains
export const domains = pgTable('domains', {
  id: serial('id').primaryKey(),
  clientId: text('client_id').notNull(),
  clientName: text('client_name').notNull().default(''),
  providerId: text('provider_id').notNull().default(''),
  domainName: text('domain_name').notNull(),
  domainRegistrar: text('domain_registrar').notNull(),
  registrationDate: text('registration_date').notNull(),
  expiryDate: text('expiry_date').notNull(),
  renewalPrice: doublePrecision('renewal_price').notNull().default(0),
  domainUsername: text('domain_username').notNull().default(''),
  domainPasswordEnc: text('domain_password_enc').notNull().default(''),
  dnsDetails: text('dns_details').notNull().default(''),
  nameservers: jsonb('nameservers').$type<string[]>().notNull().default([]),
  accountStatus: text('account_status').notNull().default('Active'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 5. providers
export const providers = pgTable('providers', {
  id: serial('id').primaryKey(),
  providerName: text('provider_name').notNull(),
  providerType: text('provider_type').notNull(),
  loginEmail: text('login_email').notNull().default(''),
  loginPasswordEnc: text('login_password_enc').notNull().default(''),
  accountUrl: text('account_url').notNull().default(''),
  apiKeyEnc: text('api_key_enc').notNull().default(''),
  apiSecretEnc: text('api_secret_enc').notNull().default(''),
  configurationDetails: text('configuration_details').notNull().default(''),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 6. payment_gateways
export const paymentGateways = pgTable('payment_gateways', {
  id: serial('id').primaryKey(),
  gatewayKey: text('gateway_key').notNull().unique(),
  providerName: text('provider_name').notNull(),
  activeMode: text('active_mode').notNull().default('test'),
  testConfig: jsonb('test_config').$type<Record<string, any>>().notNull().default({}),
  liveConfig: jsonb('live_config').$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 7. bank_accounts
export const bankAccounts = pgTable('bank_accounts', {
  id: serial('id').primaryKey(),
  entryType: text('entry_type').notNull(),
  cardholderName: text('cardholder_name').notNull().default(''),
  cardType: text('card_type').notNull().default(''),
  cardLast4: text('card_last4').notNull().default(''),
  tokenRef: text('token_ref').notNull().default(''),
  expiryDate: text('expiry_date').notNull().default(''),
  cardProvider: text('card_provider').notNull().default(''),
  upiId: text('upi_id').notNull().default(''),
  bankName: text('bank_name').notNull().default(''),
  accountHolderName: text('account_holder_name').notNull().default(''),
  accountNumberEnc: text('account_number_enc').notNull().default(''),
  accountLast4: text('account_last4').notNull().default(''),
  ifscCode: text('ifsc_code').notNull().default(''),
  accountType: text('account_type').notNull().default(''),
  branchName: text('branch_name').notNull().default(''),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 8. payment_records
export const paymentRecords = pgTable('payment_records', {
  id: serial('id').primaryKey(),
  clientId: text('client_id').notNull(),
  clientName: text('client_name').notNull().default(''),
  invoiceId: text('invoice_id').notNull().default(''),
  invoiceNumber: text('invoice_number').notNull().default(''),
  amount: doublePrecision('amount').notNull().default(0),
  currency: text('currency').notNull().default('INR'),
  paymentMethod: text('payment_method').notNull().default('Razorpay'),
  gatewayUsed: text('gateway_used').notNull().default('razorpay'),
  gatewayMode: text('gateway_mode').notNull().default('live'),
  transactionRef: text('transaction_ref').notNull().default(''),
  status: text('status').notNull().default('Paid'),
  paidAt: text('paid_at').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 9. invoices
export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  clientId: text('client_id').notNull(),
  clientName: text('client_name').notNull().default(''),
  companyName: text('company_name').notNull().default(''),
  clientEmail: text('client_email').notNull().default(''),
  clientAddress: text('client_address').notNull().default(''),
  lineItems: jsonb('line_items').$type<any[]>().notNull().default([]),
  taxMode: text('tax_mode').notNull().default('with_tax'),
  taxPercentage: doublePrecision('tax_percentage').notNull().default(18),
  subtotal: doublePrecision('subtotal').notNull().default(0),
  taxAmount: doublePrecision('tax_amount').notNull().default(0),
  totalAmount: doublePrecision('total_amount').notNull().default(0),
  currency: text('currency').notNull().default('INR'),
  issueDate: text('issue_date').notNull(),
  dueDate: text('due_date').notNull(),
  status: text('status').notNull().default('Pending'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 10. notifications
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  severity: text('severity').notNull().default('warning'),
  triggerWindow: text('trigger_window').notNull().default('30d'),
  entityType: text('entity_type').notNull().default('system'),
  entityId: text('entity_id').notNull().default(''),
  dedupeKey: text('dedupe_key').notNull().default(''),
  isRead: boolean('is_read').notNull().default(false),
  emailSent: boolean('email_sent').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 11. activity_logs
export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().default(''),
  username: text('username').notNull().default('system'),
  role: text('role').notNull().default('admin'),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id').notNull().default(''),
  details: text('details').notNull().default(''),
  ipAddress: text('ip_address').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 12. settings
export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique().default('global'),
  companyName: text('company_name').notNull().default('Host Finder Infrastructure Pvt. Ltd.'),
  companyEmail: text('company_email').notNull().default('billing@hostfinder.in'),
  companyPhone: text('company_phone').notNull().default('+91 98765 43210'),
  companyAddress: text('company_address').notNull().default('Bengaluru, Karnataka 560001, India'),
  companyGstNumber: text('company_gst_number').notNull().default('29AABCH1234F1Z5'),
  defaultCurrency: text('default_currency').notNull().default('INR'),
  defaultTaxMode: text('default_tax_mode').notNull().default('with_tax'),
  defaultTaxRate: doublePrecision('default_tax_rate').notNull().default(18),
  expiryReminderWindows: jsonb('expiry_reminder_windows').$type<number[]>().notNull().default([30, 15, 7, 1]),
  emailAlertsEnabled: boolean('email_alerts_enabled').notNull().default(true),
  defaultTheme: text('default_theme').notNull().default('light'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const clientsRelations = relations(clients, ({ many }) => ({
  hostingServices: many(hostingServices),
  domains: many(domains),
  invoices: many(invoices),
  paymentRecords: many(paymentRecords),
}));

export const hostingServicesRelations = relations(hostingServices, ({ one }) => ({
  client: one(clients, {
    fields: [hostingServices.clientId],
    references: [clients.clientId],
  }),
}));

export const domainsRelations = relations(domains, ({ one }) => ({
  client: one(clients, {
    fields: [domains.clientId],
    references: [clients.clientId],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.clientId],
  }),
}));

export const paymentRecordsRelations = relations(paymentRecords, ({ one }) => ({
  client: one(clients, {
    fields: [paymentRecords.clientId],
    references: [clients.clientId],
  }),
}));
