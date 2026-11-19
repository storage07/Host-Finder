import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { db } from './store.js';
import { encryptField } from '../utils/crypto.js';
import { runExpiryCheck } from '../services/statusAndCron.js';

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

let seedPromise: Promise<void> | null = null;

export function ensureSeededOnce(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedDatabase().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

export async function seedDatabase(): Promise<void> {
  // 1. Seed Settings
  const existingSettings = await db.settings.findOne({ key: 'global' });
  if (!existingSettings) {
    await db.settings.create({
      key: 'global',
      companyName: 'Host Finder Infrastructure Pvt. Ltd.',
      companyEmail: 'billing@hostfinder.in',
      companyPhone: '+91 80 4123 8900',
      companyAddress: '42 Indiranagar 100 Feet Road, Bengaluru, Karnataka 560038',
      companyGstNumber: '29AABCH8291F1Z5',
      defaultCurrency: 'INR',
      defaultTaxMode: 'with_tax',
      defaultTaxRate: 18,
      expiryReminderWindows: [30, 15, 7, 1],
      emailAlertsEnabled: true,
      defaultTheme: 'light',
    });
  }

  // 2. Seed Default Admin (always ensure admin exists)
  const existingAdmin = await db.users.findOne({ username: 'admin' });
  if (!existingAdmin) {
    const adminHash = await bcrypt.hash(env.ADMIN_INITIAL_PASSWORD, 12);
    await db.users.create({
      username: 'admin',
      fullName: 'System Administrator',
      email: 'admin@hostfinder.in',
      passwordHash: adminHash,
      role: 'admin',
      assignedClientIds: [],
      canUpdateAssignedServices: true,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockUntil: null,
      twoFactorEnabled: false,
      twoFactorSecretEnc: '',
      isActive: true,
    });
  }

  // If clients already exist, skip sample data seeding
  const clientCount = await db.clients.count();
  if (clientCount > 0) {
    await runExpiryCheck();
    return;
  }

  // Seed Staff & Viewer demo accounts
  const existingStaff = await db.users.findOne({ username: 'staff_ops' });
  if (!existingStaff) {
    const staffHash = await bcrypt.hash('Staff@2026!', 10);
    await db.users.create({
      uid: 'local_staff_ops',
      username: 'staff_ops',
      fullName: 'Aarav Mehta',
      email: 'aarav.ops@hostfinder.in',
      passwordHash: staffHash,
      role: 'staff',
      assignedClientIds: ['HF-CLT-0001', 'HF-CLT-0002', 'HF-CLT-0003'],
      canUpdateAssignedServices: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      twoFactorEnabled: false,
      isActive: true,
    });
  }

  const existingViewer = await db.users.findOne({ username: 'audit_viewer' });
  if (!existingViewer) {
    const viewerHash = await bcrypt.hash('Viewer@2026!', 10);
    await db.users.create({
      uid: 'local_audit_viewer',
      username: 'audit_viewer',
      fullName: 'Priya Nair',
      email: 'priya.audit@hostfinder.in',
      passwordHash: viewerHash,
      role: 'viewer',
      assignedClientIds: [],
      canUpdateAssignedServices: false,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      twoFactorEnabled: false,
      isActive: true,
    });
  }

  // 3. Seed Providers (all 5 categories)
  const p1 = await db.providers.create({
    providerName: 'AWS Lightsail & EC2',
    providerType: 'Server Providers',
    loginEmail: 'infra@hostfinder.in',
    loginPasswordEnc: encryptField('AwsProd#9912'),
    accountUrl: 'https://console.aws.amazon.com',
    apiKeyEnc: encryptField('AKIAIOSFODNN7EXAMPLE'),
    apiSecretEnc: encryptField('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'),
    configurationDetails: 'Region: ap-south-1 (Mumbai), IAM Role: HostFinderAdmin',
    notes: 'Primary cloud compute provider for enterprise clients.',
  });

  const p2 = await db.providers.create({
    providerName: 'Hostinger Business Cloud',
    providerType: 'Hosting Providers',
    loginEmail: 'hosting@hostfinder.in',
    loginPasswordEnc: encryptField('Hostinger!4420'),
    accountUrl: 'https://hpanel.hostinger.com',
    apiKeyEnc: encryptField('hst_live_889911aabbcc'),
    apiSecretEnc: encryptField('hst_sec_771122ddeeff'),
    configurationDetails: 'cPanel & hPanel multi-site reseller cluster',
    notes: 'Used for SME WordPress and corporate sites.',
  });

  const p3 = await db.providers.create({
    providerName: 'GoDaddy Pro Reseller',
    providerType: 'Domain Providers',
    loginEmail: 'domains@hostfinder.in',
    loginPasswordEnc: encryptField('GdPro@7721'),
    accountUrl: 'https://dcc.godaddy.com',
    apiKeyEnc: encryptField('gd_key_948102938'),
    apiSecretEnc: encryptField('gd_sec_110293847'),
    configurationDetails: 'Auto-renew disabled by default; manual client approval required',
    notes: 'Primary .in and .com domain registrar.',
  });

  const p4 = await db.providers.create({
    providerName: 'Zoho Mail Enterprise',
    providerType: 'Email Providers',
    loginEmail: 'mailadmin@hostfinder.in',
    loginPasswordEnc: encryptField('ZohoMail#5501'),
    accountUrl: 'https://mailadmin.zoho.in',
    apiKeyEnc: encryptField('zoho_key_441209'),
    apiSecretEnc: encryptField('zoho_sec_882103'),
    configurationDetails: 'DKIM + SPF enforced across all client workspaces',
    notes: 'Corporate email hosting.',
  });

  await db.providers.create({
    providerName: 'Razorpay Partner Desk',
    providerType: 'Payment Providers',
    loginEmail: 'finance@hostfinder.in',
    loginPasswordEnc: encryptField('RzpPartner@2026'),
    accountUrl: 'https://dashboard.razorpay.com',
    apiKeyEnc: encryptField('rzp_partner_key_demo'),
    apiSecretEnc: encryptField('rzp_partner_sec_demo'),
    configurationDetails: 'Settlement T+2 days to HDFC Current Account',
    notes: 'Indian INR + UPI + GST collection gateway.',
  });

  // 4. Seed Clients
  const clientsData = [
    {
      clientId: 'HF-CLT-0001',
      clientName: 'Rohan Sharma',
      companyName: 'Vanguard FinTech Solutions',
      email: 'rohan@vanguardfintech.in',
      mobile: '+91 98450 11223',
      address: 'HSR Layout Sector 2, Bengaluru, KA',
      startDate: addDaysIso(-340),
      endDate: addDaysIso(25),
      serviceProvider: 'AWS Lightsail & EC2',
      serviceType: 'Managed Cloud + Domain',
      servicePrice: 24000,
      renewalPrice: 24000,
      paymentStatus: 'Paid',
      accountStatus: 'Upcoming Expiry',
      notes: 'Requires 30-day advance GST invoice before renewal.',
    },
    {
      clientId: 'HF-CLT-0002',
      clientName: 'Ananya Deshmukh',
      companyName: 'Kalaakaar Studio LLP',
      email: 'ananya@kalaakaar.co.in',
      mobile: '+91 98201 44556',
      address: 'Bandra West, Mumbai, MH',
      startDate: addDaysIso(-358),
      endDate: addDaysIso(7),
      serviceProvider: 'Hostinger Business Cloud',
      serviceType: 'Business Hosting + .co.in',
      servicePrice: 12500,
      renewalPrice: 14000,
      paymentStatus: 'Pending',
      accountStatus: 'Upcoming Expiry',
      notes: 'Follow up on renewal payment via Razorpay link.',
    },
    {
      clientId: 'HF-CLT-0003',
      clientName: 'Vikramaditya Rao',
      companyName: 'Deccan Logistics Grid',
      email: 'vikram@deccanlogistics.com',
      mobile: '+91 90001 77889',
      address: 'HITEC City, Hyderabad, TS',
      startDate: addDaysIso(-120),
      endDate: addDaysIso(245),
      serviceProvider: 'AWS Lightsail & EC2',
      serviceType: 'Dedicated VPS + Multi-Domain',
      servicePrice: 48000,
      renewalPrice: 48000,
      paymentStatus: 'Paid',
      accountStatus: 'Active',
      notes: 'Annual enterprise SLA.',
    },
    {
      clientId: 'HF-CLT-0004',
      clientName: 'Meera Krishnan',
      companyName: 'Nilgiri Botanicals',
      email: 'meera@nilgiribotanicals.in',
      mobile: '+91 94430 66554',
      address: 'RS Puram, Coimbatore, TN',
      startDate: addDaysIso(-370),
      endDate: addDaysIso(-5),
      serviceProvider: 'GoDaddy Pro Reseller',
      serviceType: 'E-Commerce Hosting + Domain',
      servicePrice: 18500,
      renewalPrice: 19500,
      paymentStatus: 'Overdue',
      accountStatus: 'Expired',
      notes: 'Grace period ends in 10 days. Urgent call scheduled.',
    },
    {
      clientId: 'HF-CLT-0005',
      clientName: 'Siddharth Kapoor',
      companyName: 'NorthStar EdTech',
      email: 'siddharth@northstared.com',
      mobile: '+91 98111 33445',
      address: 'Cyber Hub, Gurugram, HR',
      startDate: addDaysIso(-364),
      endDate: addDaysIso(1),
      serviceProvider: 'Hostinger Business Cloud',
      serviceType: 'Cloud Startup Plan',
      servicePrice: 16000,
      renewalPrice: 16000,
      paymentStatus: 'Pending',
      accountStatus: 'Upcoming Expiry',
      notes: 'Expires tomorrow; invoice sent.',
    },
    {
      clientId: 'HF-CLT-0006',
      clientName: 'Neha Kulkarni',
      companyName: 'Sahyadri Architects',
      email: 'neha@sahyadriarch.in',
      mobile: '+91 97650 88990',
      address: 'Kothrud, Pune, MH',
      startDate: addDaysIso(-60),
      endDate: addDaysIso(305),
      serviceProvider: 'Zoho Mail Enterprise',
      serviceType: 'Domain + Mail Suite',
      servicePrice: 9500,
      renewalPrice: 9500,
      paymentStatus: 'Paid',
      accountStatus: 'Active',
      notes: '10 business mailboxes active.',
    },
  ];

  for (const c of clientsData) {
    await db.clients.create(c);
  }

  // 5. Seed Hosting Services
  const hostingData = [
    {
      clientId: 'HF-CLT-0001',
      clientName: 'Rohan Sharma',
      providerId: p1._id,
      hostingProvider: 'AWS Lightsail & EC2',
      hostingPlan: 'Mumbai 8GB Compute Node',
      domainName: 'vanguardfintech.in',
      serverName: 'ap-south-vanguard-01',
      serverIp: '13.234.118.42',
      username: 'ubuntu_vf_adm',
      passwordEnc: encryptField('Vf$CloudNode2026'),
      startDate: addDaysIso(-340),
      expiryDate: addDaysIso(25),
      renewalAmount: 18500,
      providerEmail: 'infra@hostfinder.in',
      accountStatus: 'Upcoming Expiry',
      notes: 'Automated nightly snapshots enabled.',
    },
    {
      clientId: 'HF-CLT-0002',
      clientName: 'Ananya Deshmukh',
      providerId: p2._id,
      hostingProvider: 'Hostinger Business Cloud',
      hostingPlan: 'Cloud Professional 100GB',
      domainName: 'kalaakaar.co.in',
      serverName: 'in-mum-cloud-09',
      serverIp: '145.223.19.84',
      username: 'u849201_kalaa',
      passwordEnc: encryptField('Kalaa#Panel88'),
      startDate: addDaysIso(-358),
      expiryDate: addDaysIso(7),
      renewalAmount: 11200,
      providerEmail: 'hosting@hostfinder.in',
      accountStatus: 'Upcoming Expiry',
      notes: 'SSL certificate auto-renews via Let’s Encrypt.',
    },
    {
      clientId: 'HF-CLT-0003',
      clientName: 'Vikramaditya Rao',
      providerId: p1._id,
      hostingProvider: 'AWS Lightsail & EC2',
      hostingPlan: 'EC2 c6i.large + RDS',
      domainName: 'deccanlogistics.com',
      serverName: 'ap-south-deccan-prod',
      serverIp: '65.1.142.190',
      username: 'ec2-user',
      passwordEnc: encryptField('DeccanOps!771'),
      startDate: addDaysIso(-120),
      expiryDate: addDaysIso(245),
      renewalAmount: 42000,
      providerEmail: 'infra@hostfinder.in',
      accountStatus: 'Active',
      notes: 'Production ERP cluster.',
    },
    {
      clientId: 'HF-CLT-0004',
      clientName: 'Meera Krishnan',
      providerId: p2._id,
      hostingProvider: 'Hostinger Business Cloud',
      hostingPlan: 'WooCommerce Turbo',
      domainName: 'nilgiribotanicals.in',
      serverName: 'in-blr-woo-03',
      serverIp: '82.112.230.15',
      username: 'u332190_nilgiri',
      passwordEnc: encryptField('NilgiriStore@90'),
      startDate: addDaysIso(-370),
      expiryDate: addDaysIso(-5),
      renewalAmount: 15800,
      providerEmail: 'hosting@hostfinder.in',
      accountStatus: 'Expired',
      notes: 'Suspended pending overdue invoice settlement.',
    },
    {
      clientId: 'HF-CLT-0005',
      clientName: 'Siddharth Kapoor',
      providerId: p2._id,
      hostingProvider: 'Hostinger Business Cloud',
      hostingPlan: 'Cloud Startup',
      domainName: 'northstared.com',
      serverName: 'in-del-edu-02',
      serverIp: '194.163.44.71',
      username: 'u992014_nstar',
      passwordEnc: encryptField('NorthStar!2026'),
      startDate: addDaysIso(-364),
      expiryDate: addDaysIso(1),
      renewalAmount: 13500,
      providerEmail: 'hosting@hostfinder.in',
      accountStatus: 'Upcoming Expiry',
      notes: '1-day urgent renewal reminder.',
    },
    {
      clientId: 'HF-CLT-0006',
      clientName: 'Neha Kulkarni',
      providerId: p4._id,
      hostingProvider: 'Zoho Mail Enterprise',
      hostingPlan: 'Portfolio Static + Mail',
      domainName: 'sahyadriarch.in',
      serverName: 'zoho-edge-in01',
      serverIp: '103.89.104.22',
      username: 'adm_sahyadri',
      passwordEnc: encryptField('SahyadriMail#22'),
      startDate: addDaysIso(-60),
      expiryDate: addDaysIso(305),
      renewalAmount: 7800,
      providerEmail: 'mailadmin@hostfinder.in',
      accountStatus: 'Active',
      notes: 'Clean static portfolio + corporate mail.',
    },
  ];

  for (const h of hostingData) {
    await db.hosting_services.create(h);
  }

  // 6. Seed Domains
  const domainsData = [
    {
      clientId: 'HF-CLT-0001',
      clientName: 'Rohan Sharma',
      providerId: p3._id,
      domainName: 'vanguardfintech.in',
      domainRegistrar: 'GoDaddy Pro Reseller',
      registrationDate: addDaysIso(-705),
      expiryDate: addDaysIso(14),
      renewalPrice: 1499,
      domainUsername: 'gd_vanguard_adm',
      domainPasswordEnc: encryptField('DomVanguard#14'),
      dnsDetails: 'A -> 13.234.118.42 | MX -> mx.zoho.in (10) | TXT -> v=spf1 include:zoho.in ~all',
      nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
      accountStatus: 'Upcoming Expiry',
      notes: 'Registrar lock enabled.',
    },
    {
      clientId: 'HF-CLT-0002',
      clientName: 'Ananya Deshmukh',
      providerId: p3._id,
      domainName: 'kalaakaar.co.in',
      domainRegistrar: 'GoDaddy Pro Reseller',
      registrationDate: addDaysIso(-358),
      expiryDate: addDaysIso(28),
      renewalPrice: 1299,
      domainUsername: 'gd_kalaakaar',
      domainPasswordEnc: encryptField('KalaaDom!28'),
      dnsDetails: 'A -> 145.223.19.84 | CNAME www -> kalaakaar.co.in',
      nameservers: ['ns1.dns-parking.com', 'ns2.dns-parking.com'],
      accountStatus: 'Upcoming Expiry',
      notes: '30-day renewal window active.',
    },
    {
      clientId: 'HF-CLT-0003',
      clientName: 'Vikramaditya Rao',
      providerId: p3._id,
      domainName: 'deccanlogistics.com',
      domainRegistrar: 'GoDaddy Pro Reseller',
      registrationDate: addDaysIso(-1200),
      expiryDate: addDaysIso(245),
      renewalPrice: 1899,
      domainUsername: 'gd_deccan_erp',
      domainPasswordEnc: encryptField('DeccanDom#99'),
      dnsDetails: 'A -> 65.1.142.190 | A api -> 65.1.142.191 | TXT -> MS=ms9928172',
      nameservers: ['ns-102.awsdns-12.com', 'ns-845.awsdns-41.net'],
      accountStatus: 'Active',
      notes: 'AWS Route53 managed zone.',
    },
    {
      clientId: 'HF-CLT-0004',
      clientName: 'Meera Krishnan',
      providerId: p3._id,
      domainName: 'nilgiribotanicals.in',
      domainRegistrar: 'GoDaddy Pro Reseller',
      registrationDate: addDaysIso(-735),
      expiryDate: addDaysIso(-2),
      renewalPrice: 1499,
      domainUsername: 'gd_nilgiri',
      domainPasswordEnc: encryptField('NilgiriDom!02'),
      dnsDetails: 'A -> 82.112.230.15 | CNAME shop -> nilgiribotanicals.in',
      nameservers: ['ns1.hostinger.com', 'ns2.hostinger.com'],
      accountStatus: 'Expired',
      notes: 'In redemption grace period.',
    },
    {
      clientId: 'HF-CLT-0005',
      clientName: 'Siddharth Kapoor',
      providerId: p3._id,
      domainName: 'northstared.com',
      domainRegistrar: 'GoDaddy Pro Reseller',
      registrationDate: addDaysIso(-360),
      expiryDate: addDaysIso(5),
      renewalPrice: 1899,
      domainUsername: 'gd_northstar',
      domainPasswordEnc: encryptField('NorthStarDom#05'),
      dnsDetails: 'A -> 194.163.44.71 | MX -> aspmx.l.google.com',
      nameservers: ['ns1.digitalocean.com', 'ns2.digitalocean.com'],
      accountStatus: 'Upcoming Expiry',
      notes: '7-day urgent renewal alert.',
    },
    {
      clientId: 'HF-CLT-0006',
      clientName: 'Neha Kulkarni',
      providerId: p3._id,
      domainName: 'sahyadriarch.in',
      domainRegistrar: 'GoDaddy Pro Reseller',
      registrationDate: addDaysIso(-60),
      expiryDate: addDaysIso(305),
      renewalPrice: 1499,
      domainUsername: 'gd_sahyadri',
      domainPasswordEnc: encryptField('SahyadriDom@305'),
      dnsDetails: 'A -> 103.89.104.22 | MX -> mx.zoho.in',
      nameservers: ['ns1.zohocloud.in', 'ns2.zohocloud.in'],
      accountStatus: 'Active',
      notes: 'DNSSEC enabled.',
    },
  ];

  for (const d of domainsData) {
    await db.domains.create(d);
  }

  // 7. Seed Payment Gateways (Razorpay, SMTP, Google Play Store, Apple App Store)
  const gatewaysData = [
    {
      gatewayKey: 'razorpay',
      providerName: 'Razorpay',
      activeMode: 'test',
      testConfig: {
        email: 'sandbox-payments@hostfinder.in',
        passwordEnc: encryptField('rzp_test_pass_2026'),
        apiKeyEnc: encryptField('rzp_test_1DP5mmOlF5G5ag'),
        apiSecretEnc: encryptField('rzp_test_secret_987654321'),
        configurationDetails: JSON.stringify({ webhookSecret: 'whsec_test_demo', autoCapture: true }),
        status: 'Enabled',
      },
      liveConfig: {
        email: 'finance@hostfinder.in',
        passwordEnc: encryptField('rzp_live_pass_2026'),
        apiKeyEnc: encryptField('rzp_live_99XkP2LmN8Q1z'),
        apiSecretEnc: encryptField('rzp_live_secret_secure_vault'),
        configurationDetails: JSON.stringify({ webhookSecret: 'whsec_live_prod', autoCapture: true }),
        status: 'Disabled',
      },
    },
    {
      gatewayKey: 'smtp',
      providerName: 'SMTP Mail Server',
      activeMode: 'test',
      testConfig: {
        email: 'sandbox-mailer@example.com',
        passwordEnc: encryptField('smtp_test_app_pass'),
        apiKeyEnc: encryptField('smtp_test_key'),
        apiSecretEnc: encryptField('smtp_test_secret'),
        configurationDetails: JSON.stringify({ host: 'smtp.example.com', port: 587, tls: true }),
        status: 'Enabled',
      },
      liveConfig: {
        email: 'alerts@hostfinder.in',
        passwordEnc: encryptField('smtp_live_app_pass'),
        apiKeyEnc: encryptField('smtp_live_key'),
        apiSecretEnc: encryptField('smtp_live_secret'),
        configurationDetails: JSON.stringify({ host: 'smtp.zoho.in', port: 465, tls: true }),
        status: 'Disabled',
      },
    },
    {
      gatewayKey: 'google_play',
      providerName: 'Google Play Store',
      activeMode: 'test',
      testConfig: {
        email: 'play-sandbox@hostfinder.in',
        passwordEnc: encryptField('play_test_service_pass'),
        apiKeyEnc: encryptField('gp_test_client_id_001'),
        apiSecretEnc: encryptField('gp_test_service_account_secret'),
        configurationDetails: JSON.stringify({ packageName: 'in.hostfinder.console.dev', pubsubTopic: 'play-test-rtdn' }),
        status: 'Enabled',
      },
      liveConfig: {
        email: 'play-release@hostfinder.in',
        passwordEnc: encryptField('play_live_service_pass'),
        apiKeyEnc: encryptField('gp_live_client_id_prod'),
        apiSecretEnc: encryptField('gp_live_service_account_secret'),
        configurationDetails: JSON.stringify({ packageName: 'in.hostfinder.console', pubsubTopic: 'play-prod-rtdn' }),
        status: 'Disabled',
      },
    },
    {
      gatewayKey: 'apple_app_store',
      providerName: 'Apple App Store',
      activeMode: 'test',
      testConfig: {
        email: 'appstore-sandbox@hostfinder.in',
        passwordEnc: encryptField('apple_test_issuer_pass'),
        apiKeyEnc: encryptField('ASC_TEST_KEY_9912'),
        apiSecretEnc: encryptField('ASC_TEST_P8_PRIVATE_KEY'),
        configurationDetails: JSON.stringify({ bundleId: 'in.hostfinder.ios.dev', issuerId: 'test-issuer-uuid' }),
        status: 'Enabled',
      },
      liveConfig: {
        email: 'appstore-prod@hostfinder.in',
        passwordEnc: encryptField('apple_live_issuer_pass'),
        apiKeyEnc: encryptField('ASC_LIVE_KEY_4410'),
        apiSecretEnc: encryptField('ASC_LIVE_P8_PRIVATE_KEY'),
        configurationDetails: JSON.stringify({ bundleId: 'in.hostfinder.ios', issuerId: 'prod-issuer-uuid' }),
        status: 'Disabled',
      },
    },
  ];

  for (const g of gatewaysData) {
    await db.payment_gateways.create(g);
  }

  // 8. Seed Cards, UPI, and Bank Details (Safe Tokenized Refs + Encrypted Bank Numbers)
  await db.bank_accounts.create({
    entryType: 'card',
    cardholderName: 'Host Finder Corporate Ops',
    cardType: 'Credit Card',
    cardLast4: '4829',
    tokenRef: 'tok_rzp_visa_8829104',
    expiryDate: '09/2029',
    cardProvider: 'HDFC Regalia Visa',
    isPrimary: true,
  });

  await db.bank_accounts.create({
    entryType: 'card',
    cardholderName: 'Host Finder Infrastructure',
    cardType: 'RuPay',
    cardLast4: '9104',
    tokenRef: 'tok_npci_rupay_554120',
    expiryDate: '11/2028',
    cardProvider: 'ICICI Business RuPay',
    isPrimary: false,
  });

  await db.bank_accounts.create({
    entryType: 'upi',
    upiId: 'hostfinder.billing@hdfcbank',
    accountHolderName: 'Host Finder Infrastructure Pvt. Ltd.',
    bankName: 'HDFC Bank',
    isPrimary: true,
  });

  await db.bank_accounts.create({
    entryType: 'bank',
    bankName: 'HDFC Bank Ltd.',
    accountHolderName: 'Host Finder Infrastructure Pvt. Ltd.',
    accountNumberEnc: encryptField('50200048291033'),
    accountLast4: '1033',
    ifscCode: 'HDFC0001248',
    accountType: 'Current Account',
    branchName: 'Indiranagar 100ft Road, Bengaluru',
    isPrimary: true,
  });

  // 9. Seed Invoices & Payment Records
  const inv1 = await db.invoices.create({
    invoiceNumber: 'HF-INV-2026-001',
    clientId: 'HF-CLT-0001',
    clientName: 'Rohan Sharma',
    companyName: 'Vanguard FinTech Solutions',
    clientEmail: 'rohan@vanguardfintech.in',
    clientAddress: 'HSR Layout Sector 2, Bengaluru, KA',
    lineItems: [
      { description: 'AWS Lightsail 8GB Annual Managed Hosting', serviceType: 'Hosting', quantity: 1, unitPrice: 22501, amount: 22501 },
      { description: 'vanguardfintech.in Domain Registration', serviceType: 'Domain', quantity: 1, unitPrice: 1499, amount: 1499 },
    ],
    taxMode: 'with_tax',
    taxPercentage: 18,
    subtotal: 24000,
    taxAmount: 4320,
    totalAmount: 28320,
    currency: 'INR',
    issueDate: addDaysIso(-30),
    dueDate: addDaysIso(-15),
    status: 'Paid',
    notes: 'GST 18% included (CGST 9% + SGST 9%).',
  });

  await db.invoices.create({
    invoiceNumber: 'HF-INV-2026-002',
    clientId: 'HF-CLT-0002',
    clientName: 'Ananya Deshmukh',
    companyName: 'Kalaakaar Studio LLP',
    clientEmail: 'ananya@kalaakaar.co.in',
    clientAddress: 'Bandra West, Mumbai, MH',
    lineItems: [
      { description: 'Hostinger Cloud Professional Renewal', serviceType: 'Hosting', quantity: 1, unitPrice: 11200, amount: 11200 },
      { description: 'kalaakaar.co.in Domain Renewal', serviceType: 'Domain', quantity: 1, unitPrice: 1300, amount: 1300 },
    ],
    taxMode: 'with_tax',
    taxPercentage: 18,
    subtotal: 12500,
    taxAmount: 2250,
    totalAmount: 14750,
    currency: 'INR',
    issueDate: addDaysIso(-5),
    dueDate: addDaysIso(7),
    status: 'Pending',
    notes: 'Awaiting Razorpay settlement.',
  });

  const inv3 = await db.invoices.create({
    invoiceNumber: 'HF-INV-2026-003',
    clientId: 'HF-CLT-0003',
    clientName: 'Vikramaditya Rao',
    companyName: 'Deccan Logistics Grid',
    clientEmail: 'vikram@deccanlogistics.com',
    clientAddress: 'HITEC City, Hyderabad, TS',
    lineItems: [
      { description: 'EC2 c6i.large + RDS Dedicated Infrastructure', serviceType: 'Hosting', quantity: 1, unitPrice: 46101, amount: 46101 },
      { description: 'deccanlogistics.com Domain Renewal', serviceType: 'Domain', quantity: 1, unitPrice: 1899, amount: 1899 },
    ],
    taxMode: 'with_tax',
    taxPercentage: 18,
    subtotal: 48000,
    taxAmount: 8640,
    totalAmount: 56640,
    currency: 'INR',
    issueDate: addDaysIso(-120),
    dueDate: addDaysIso(-105),
    status: 'Paid',
    notes: 'Paid via NEFT to HDFC Current Account.',
  });

  await db.invoices.create({
    invoiceNumber: 'HF-INV-2026-004',
    clientId: 'HF-CLT-0004',
    clientName: 'Meera Krishnan',
    companyName: 'Nilgiri Botanicals',
    clientEmail: 'meera@nilgiribotanicals.in',
    clientAddress: 'RS Puram, Coimbatore, TN',
    lineItems: [
      { description: 'WooCommerce Turbo Hosting + Domain Renewal', serviceType: 'Hosting & Domain', quantity: 1, unitPrice: 18500, amount: 18500 },
    ],
    taxMode: 'without_tax',
    taxPercentage: 0,
    subtotal: 18500,
    taxAmount: 0,
    totalAmount: 18500,
    currency: 'INR',
    issueDate: addDaysIso(-20),
    dueDate: addDaysIso(-5),
    status: 'Overdue',
    notes: 'Billed without tax per composition waiver.',
  });

  await db.payment_records.create({
    clientId: 'HF-CLT-0001',
    clientName: 'Rohan Sharma',
    invoiceId: inv1._id,
    invoiceNumber: inv1.invoiceNumber,
    amount: 28320,
    currency: 'INR',
    paymentMethod: 'Razorpay UPI',
    gatewayUsed: 'razorpay',
    gatewayMode: 'live',
    transactionRef: 'pay_Rzp901928371',
    status: 'Paid',
    paidAt: addDaysIso(-20),
    notes: 'Settled in full.',
  });

  await db.payment_records.create({
    clientId: 'HF-CLT-0003',
    clientName: 'Vikramaditya Rao',
    invoiceId: inv3._id,
    invoiceNumber: inv3.invoiceNumber,
    amount: 56640,
    currency: 'INR',
    paymentMethod: 'Bank Transfer (NEFT)',
    gatewayUsed: 'bank',
    gatewayMode: 'live',
    transactionRef: 'UTR99182736451',
    status: 'Paid',
    paidAt: addDaysIso(-110),
    notes: 'Direct NEFT settlement.',
  });

  await db.activity_logs.create({
    username: 'system',
    role: 'admin',
    action: 'SEED_DATABASE',
    resource: 'system',
    details: 'Initialized Host Finder default admin, sample clients, services, gateways, and billing records.',
    ipAddress: '127.0.0.1',
  });

  // Trigger initial 30d/15d/7d/1d expiry notification generation
  await runExpiryCheck();
}
