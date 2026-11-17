export type UserRole = 'admin' | 'staff' | 'viewer';

export type ServiceStatus =
  | 'Active'
  | 'Upcoming Expiry'
  | 'Expired'
  | 'Renewed'
  | 'Cancelled';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  assignedClientIds: string[];
  canUpdateAssignedServices: boolean;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
}

export interface Client {
  _id: string;
  clientId: string;
  clientName: string;
  companyName: string;
  email: string;
  mobile: string;
  address: string;
  startDate: string;
  endDate: string;
  serviceProvider: string;
  serviceType: string;
  servicePrice: number;
  renewalPrice: number;
  paymentStatus: 'Paid' | 'Pending' | 'Overdue' | 'Partial';
  accountStatus: ServiceStatus;
  notes: string;
  createdAt?: string;
}

export interface HostingService {
  _id: string;
  clientId: string;
  clientName: string;
  providerId?: string;
  hostingProvider: string;
  hostingPlan: string;
  domainName: string;
  serverName: string;
  serverIp: string;
  username: string;
  hasPassword?: boolean;
  maskedPassword?: string;
  startDate: string;
  expiryDate: string;
  renewalAmount: number;
  providerEmail: string;
  accountStatus: ServiceStatus;
  notes: string;
}

export interface DomainRecord {
  _id: string;
  clientId: string;
  clientName: string;
  providerId?: string;
  domainName: string;
  domainRegistrar: string;
  registrationDate: string;
  expiryDate: string;
  renewalPrice: number;
  domainUsername: string;
  hasPassword?: boolean;
  maskedPassword?: string;
  dnsDetails: string;
  nameservers: string[];
  accountStatus: ServiceStatus;
  notes: string;
}

export type ProviderType =
  | 'Domain Providers'
  | 'Hosting Providers'
  | 'Server Providers'
  | 'Email Providers'
  | 'Payment Providers';

export interface Provider {
  _id: string;
  providerName: string;
  providerType: ProviderType;
  loginEmail: string;
  accountUrl: string;
  configurationDetails: string;
  notes: string;
  hasLoginPassword?: boolean;
  hasApiKey?: boolean;
  hasApiSecret?: boolean;
  maskedPassword?: string;
  maskedApiKey?: string;
  maskedApiSecret?: string;
}

export interface GatewayEnvConfig {
  email: string;
  hasPassword: boolean;
  maskedPassword: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  hasApiSecret: boolean;
  maskedApiSecret: string;
  configurationDetails: string;
  status: 'Enabled' | 'Disabled';
}

export interface PaymentGateway {
  _id: string;
  gatewayKey: 'razorpay' | 'smtp' | 'google_play' | 'apple_app_store';
  providerName: string;
  activeMode: 'test' | 'live';
  testConfig: GatewayEnvConfig;
  liveConfig: GatewayEnvConfig;
  updatedAt?: string;
}

export interface BankAccountRecord {
  _id: string;
  entryType: 'card' | 'upi' | 'bank';
  cardholderName?: string;
  cardType?: 'Credit Card' | 'Debit Card' | 'UPI' | 'RuPay' | '';
  cardLast4?: string;
  maskedCardNumber?: string;
  tokenRef?: string;
  expiryDate?: string;
  cardProvider?: string;
  upiId?: string;
  bankName?: string;
  accountHolderName?: string;
  maskedAccountNumber?: string;
  ifscCode?: string;
  accountType?: string;
  branchName?: string;
  isPrimary?: boolean;
}

export interface InvoiceLineItem {
  description: string;
  serviceType: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  companyName: string;
  clientEmail: string;
  clientAddress: string;
  lineItems: InvoiceLineItem[];
  taxMode: 'with_tax' | 'without_tax';
  taxPercentage: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  notes: string;
}

export interface PaymentRecord {
  _id: string;
  clientId: string;
  clientName: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  gatewayUsed: string;
  gatewayMode: 'test' | 'live';
  transactionRef: string;
  status: string;
  paidAt: string;
}

export interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  triggerWindow: '30d' | '15d' | '7d' | '1d' | 'expired' | 'system';
  entityType: string;
  entityId: string;
  isRead: boolean;
  emailSent: boolean;
  createdAt: string;
}

export interface ManagedUser {
  _id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  assignedClientIds: string[];
  canUpdateAssignedServices: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockUntil: string | null;
  twoFactorEnabled: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface ActivityLog {
  _id: string;
  username: string;
  role: string;
  action: string;
  resource: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

export interface AppSettings {
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  companyGstNumber: string;
  defaultCurrency: string;
  defaultTaxMode: 'with_tax' | 'without_tax';
  defaultTaxRate: number;
  expiryReminderWindows: number[];
  emailAlertsEnabled: boolean;
  defaultTheme: 'light' | 'dark';
}
