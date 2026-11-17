import mongoose, { Schema } from 'mongoose';

// 1. users
const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, index: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'staff', 'viewer'], default: 'viewer', index: true },
    assignedClientIds: [{ type: String }],
    canUpdateAssignedServices: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecretEnc: { type: String, default: '' },
    resetTokenHash: { type: String, default: '' },
    resetTokenExpires: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'users' }
);

// 2. clients
const ClientSchema = new Schema(
  {
    clientId: { type: String, required: true, unique: true, index: true },
    clientName: { type: String, required: true, trim: true },
    companyName: { type: String, default: '', trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    mobile: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true, index: true },
    serviceProvider: { type: String, default: '' },
    serviceType: { type: String, default: 'Hosting & Domain' },
    servicePrice: { type: Number, default: 0, min: 0 },
    renewalPrice: { type: Number, default: 0, min: 0 },
    paymentStatus: { type: String, enum: ['Paid', 'Pending', 'Overdue', 'Partial'], default: 'Pending' },
    accountStatus: {
      type: String,
      enum: ['Active', 'Upcoming Expiry', 'Expired', 'Renewed', 'Cancelled'],
      default: 'Active',
      index: true,
    },
    notes: { type: String, default: '' },
  },
  { timestamps: true, collection: 'clients' }
);

// 3. hosting_services
const HostingServiceSchema = new Schema(
  {
    clientId: { type: String, required: true, index: true },
    clientName: { type: String, default: '' },
    providerId: { type: String, default: '' },
    hostingProvider: { type: String, required: true, trim: true },
    hostingPlan: { type: String, required: true, trim: true },
    domainName: { type: String, required: true, trim: true, index: true },
    serverName: { type: String, default: '' },
    serverIp: { type: String, default: '' },
    username: { type: String, default: '' },
    passwordEnc: { type: String, default: '' },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true, index: true },
    renewalAmount: { type: Number, default: 0, min: 0 },
    providerEmail: { type: String, default: '' },
    accountStatus: {
      type: String,
      enum: ['Active', 'Upcoming Expiry', 'Expired', 'Renewed', 'Cancelled'],
      default: 'Active',
      index: true,
    },
    notes: { type: String, default: '' },
  },
  { timestamps: true, collection: 'hosting_services' }
);

// 4. domains
const DomainSchema = new Schema(
  {
    clientId: { type: String, required: true, index: true },
    clientName: { type: String, default: '' },
    providerId: { type: String, default: '' },
    domainName: { type: String, required: true, trim: true, index: true },
    domainRegistrar: { type: String, required: true, trim: true },
    registrationDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true, index: true },
    renewalPrice: { type: Number, default: 0, min: 0 },
    domainUsername: { type: String, default: '' },
    domainPasswordEnc: { type: String, default: '' },
    dnsDetails: { type: String, default: '' },
    nameservers: [{ type: String }],
    accountStatus: {
      type: String,
      enum: ['Active', 'Upcoming Expiry', 'Expired', 'Renewed', 'Cancelled'],
      default: 'Active',
      index: true,
    },
    notes: { type: String, default: '' },
  },
  { timestamps: true, collection: 'domains' }
);

// 5. providers
const ProviderSchema = new Schema(
  {
    providerName: { type: String, required: true, trim: true, index: true },
    providerType: {
      type: String,
      enum: ['Domain Providers', 'Hosting Providers', 'Server Providers', 'Email Providers', 'Payment Providers'],
      required: true,
      index: true,
    },
    loginEmail: { type: String, default: '', trim: true },
    loginPasswordEnc: { type: String, default: '' },
    accountUrl: { type: String, default: '' },
    apiKeyEnc: { type: String, default: '' },
    apiSecretEnc: { type: String, default: '' },
    configurationDetails: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true, collection: 'providers' }
);

// 6. payment_gateways
const GatewayEnvSchema = new Schema(
  {
    email: { type: String, default: '' },
    passwordEnc: { type: String, default: '' },
    apiKeyEnc: { type: String, default: '' },
    apiSecretEnc: { type: String, default: '' },
    configurationDetails: { type: String, default: '' },
    status: { type: String, enum: ['Enabled', 'Disabled'], default: 'Disabled' },
  },
  { _id: false }
);

const PaymentGatewaySchema = new Schema(
  {
    gatewayKey: {
      type: String,
      enum: ['razorpay', 'smtp', 'google_play', 'apple_app_store'],
      required: true,
      unique: true,
    },
    providerName: { type: String, required: true },
    activeMode: { type: String, enum: ['test', 'live'], default: 'test' },
    testConfig: { type: GatewayEnvSchema, default: () => ({}) },
    liveConfig: { type: GatewayEnvSchema, default: () => ({}) },
  },
  { timestamps: true, collection: 'payment_gateways' }
);

// 7. bank_accounts (Cards, UPI, Bank)
const BankAccountSchema = new Schema(
  {
    entryType: { type: String, enum: ['card', 'upi', 'bank'], required: true, index: true },
    // Card reference fields (never CVV or full PAN)
    cardholderName: { type: String, default: '' },
    cardType: { type: String, enum: ['Credit Card', 'Debit Card', 'UPI', 'RuPay', ''], default: '' },
    cardLast4: { type: String, default: '' },
    tokenRef: { type: String, default: '' },
    expiryDate: { type: String, default: '' },
    cardProvider: { type: String, default: '' },
    // UPI fields
    upiId: { type: String, default: '' },
    // Bank fields
    bankName: { type: String, default: '' },
    accountHolderName: { type: String, default: '' },
    accountNumberEnc: { type: String, default: '' },
    accountLast4: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    accountType: { type: String, default: '' },
    branchName: { type: String, default: '' },
    isPrimary: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'bank_accounts' }
);

// 8. payment_records
const PaymentRecordSchema = new Schema(
  {
    clientId: { type: String, required: true, index: true },
    clientName: { type: String, default: '' },
    invoiceId: { type: String, default: '', index: true },
    invoiceNumber: { type: String, default: '' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    paymentMethod: { type: String, default: 'Razorpay' },
    gatewayUsed: { type: String, default: 'razorpay' },
    gatewayMode: { type: String, enum: ['test', 'live'], default: 'live' },
    transactionRef: { type: String, default: '' },
    status: { type: String, enum: ['Paid', 'Pending', 'Failed', 'Refunded'], default: 'Paid' },
    paidAt: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
  },
  { timestamps: true, collection: 'payment_records' }
);

// 9. invoices
const InvoiceLineItemSchema = new Schema(
  {
    description: { type: String, required: true },
    serviceType: { type: String, default: 'Hosting' },
    quantity: { type: Number, default: 1, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const InvoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    clientId: { type: String, required: true, index: true },
    clientName: { type: String, default: '' },
    companyName: { type: String, default: '' },
    clientEmail: { type: String, default: '' },
    clientAddress: { type: String, default: '' },
    lineItems: [InvoiceLineItemSchema],
    taxMode: { type: String, enum: ['with_tax', 'without_tax'], default: 'with_tax' },
    taxPercentage: { type: Number, default: 18, min: 0, max: 100 },
    subtotal: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['Paid', 'Pending', 'Overdue'], default: 'Pending', index: true },
    notes: { type: String, default: '' },
  },
  { timestamps: true, collection: 'invoices' }
);

// 10. notifications
const NotificationSchema = new Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    triggerWindow: { type: String, enum: ['30d', '15d', '7d', '1d', 'expired', 'system'], default: '30d' },
    entityType: { type: String, enum: ['hosting', 'domain', 'client', 'invoice', 'system'], default: 'system' },
    entityId: { type: String, default: '' },
    dedupeKey: { type: String, default: '', index: true },
    isRead: { type: Boolean, default: false, index: true },
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'notifications' }
);

// 11. activity_logs
const ActivityLogSchema = new Schema(
  {
    userId: { type: String, default: '' },
    username: { type: String, default: 'system' },
    role: { type: String, default: 'admin' },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String, default: '' },
    details: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: true, collection: 'activity_logs' }
);

// 12. settings
const SettingSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true },
    companyName: { type: String, default: 'Host Finder Infrastructure Pvt. Ltd.' },
    companyEmail: { type: String, default: 'billing@hostfinder.in' },
    companyPhone: { type: String, default: '+91 98765 43210' },
    companyAddress: { type: String, default: 'Bengaluru, Karnataka 560001, India' },
    companyGstNumber: { type: String, default: '29AABCH1234F1Z5' },
    defaultCurrency: { type: String, default: 'INR' },
    defaultTaxMode: { type: String, enum: ['with_tax', 'without_tax'], default: 'with_tax' },
    defaultTaxRate: { type: Number, default: 18 },
    expiryReminderWindows: { type: [Number], default: [30, 15, 7, 1] },
    emailAlertsEnabled: { type: Boolean, default: true },
    defaultTheme: { type: String, enum: ['light', 'dark'], default: 'light' },
  },
  { timestamps: true, collection: 'settings' }
);

export const Models = {
  User: mongoose.models.User || mongoose.model('User', UserSchema),
  Client: mongoose.models.Client || mongoose.model('Client', ClientSchema),
  HostingService:
    mongoose.models.HostingService ||
    mongoose.model('HostingService', HostingServiceSchema),
  Domain: mongoose.models.Domain || mongoose.model('Domain', DomainSchema),
  Provider: mongoose.models.Provider || mongoose.model('Provider', ProviderSchema),
  PaymentGateway:
    mongoose.models.PaymentGateway ||
    mongoose.model('PaymentGateway', PaymentGatewaySchema),
  BankAccount:
    mongoose.models.BankAccount || mongoose.model('BankAccount', BankAccountSchema),
  PaymentRecord:
    mongoose.models.PaymentRecord ||
    mongoose.model('PaymentRecord', PaymentRecordSchema),
  Invoice: mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema),
  Notification:
    mongoose.models.Notification ||
    mongoose.model('Notification', NotificationSchema),
  ActivityLog:
    mongoose.models.ActivityLog ||
    mongoose.model('ActivityLog', ActivityLogSchema),
  Setting: mongoose.models.Setting || mongoose.model('Setting', SettingSchema),
};
