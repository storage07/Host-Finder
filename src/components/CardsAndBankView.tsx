import React, { useEffect, useState } from 'react';
import { Building2, CreditCard, Plus, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { BankAccountRecord } from '../types';
import { apiFetch } from '../utils/api';
import {
  ConfirmDialog,
  EmptyState,
  inputCls,
  labelCls,
  Modal,
  SecretRevealControl,
  TableSkeleton,
} from './UI';

export function CardsAndBankView({
  onToast,
}: {
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [items, setItems] = useState<BankAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'card' | 'upi' | 'bank'>('card');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<BankAccountRecord | null>(null);
  const [busy, setBusy] = useState(false);

  // Form states
  const [cardholderName, setCardholderName] = useState('');
  const [cardType, setCardType] = useState<'Credit Card' | 'Debit Card' | 'UPI' | 'RuPay'>('Credit Card');
  const [cardLast4, setCardLast4] = useState('');
  const [tokenRef, setTokenRef] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cardProvider, setCardProvider] = useState('');

  const [upiId, setUpiId] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountType, setAccountType] = useState('Current Account');
  const [branchName, setBranchName] = useState('');

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: BankAccountRecord[] }>('/api/bank-accounts');
      setItems(res.items);
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const filtered = items.filter((i) => i.entryType === activeTab);

  const openModal = () => {
    setCardholderName('');
    setCardLast4('');
    setTokenRef('');
    setExpiryDate('');
    setCardProvider('');
    setUpiId('');
    setAccountHolderName('');
    setBankName('');
    setAccountNumber('');
    setIfscCode('');
    setBranchName('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload =
        activeTab === 'card'
          ? {
              entryType: 'card',
              cardholderName,
              cardType,
              cardLast4,
              tokenRef,
              expiryDate,
              cardProvider,
            }
          : activeTab === 'upi'
          ? {
              entryType: 'upi',
              upiId,
              accountHolderName,
              bankName,
            }
          : {
              entryType: 'bank',
              bankName,
              accountHolderName,
              accountNumber,
              ifscCode,
              accountType,
              branchName,
            };

      await apiFetch('/api/bank-accounts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onToast('Payment reference saved securely', 'success');
      setModalOpen(false);
      await loadRecords();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/bank-accounts/${deleting._id}`, { method: 'DELETE' });
      onToast('Payment record deleted', 'success');
      setDeleting(null);
      await loadRecords();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Compliance Notice */}
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            PCI-Safe Tokenization & Encrypted Banking Vault
          </p>
          <p className="mt-0.5">
            CVV codes and full card numbers are strictly prohibited and never stored. Cards retain only gateway token references and last-4 digits; bank account numbers are encrypted at rest via AES-256-GCM.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('card')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap ${
              activeTab === 'card'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Cards ({items.filter((i) => i.entryType === 'card').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upi')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap ${
              activeTab === 'upi'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            UPI ({items.filter((i) => i.entryType === 'upi').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bank')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap ${
              activeTab === 'bank'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            Bank Accounts ({items.filter((i) => i.entryType === 'bank').length})
          </button>
        </div>

        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Add {activeTab === 'card' ? 'Card Reference' : activeTab === 'upi' ? 'UPI ID' : 'Bank Account'}
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={`No ${activeTab.toUpperCase()} records added`}
          description="Add authorized payment references for settlements and vendor renewals."
          actionLabel="Add Record"
          onAction={openModal}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((rec) => (
            <div
              key={rec._id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              {rec.entryType === 'card' && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {rec.cardProvider || rec.cardType}
                      </p>
                      <p className="text-[11px] text-slate-500">{rec.cardType}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleting(rec)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="pt-2 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {rec.maskedCardNumber}
                  </p>
                  <div className="flex items-center justify-between pt-1 text-slate-600 dark:text-slate-400">
                    <span>{rec.cardholderName}</span>
                    <span className="font-mono">Exp: {rec.expiryDate}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-2 font-mono text-[11px] text-slate-500 dark:border-slate-800">
                    Token: {rec.tokenRef}
                  </div>
                </div>
              )}

              {rec.entryType === 'upi' && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {rec.bankName || 'UPI Handle'}
                      </p>
                      <p className="text-[11px] text-slate-500">{rec.accountHolderName}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleting(rec)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="pt-2 font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {rec.upiId}
                  </p>
                </div>
              )}

              {rec.entryType === 'bank' && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {rec.bankName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {rec.accountType} &middot; {rec.branchName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleting(rec)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{rec.accountHolderName}</p>
                  <div className="pt-1">
                    <span className="text-[11px] text-slate-500">Account Number: </span>
                    <SecretRevealControl
                      resource="bank"
                      id={rec._id}
                      hasValue
                      canReveal
                      masked={rec.maskedAccountNumber}
                    />
                  </div>
                  <p className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    IFSC: {rec.ifscCode}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          activeTab === 'card'
            ? 'Add Tokenized Card Reference'
            : activeTab === 'upi'
            ? 'Add UPI Information'
            : 'Add Encrypted Bank Account'
        }
        subtitle={
          activeTab === 'card'
            ? 'Enter ONLY last 4 digits and payment gateway token reference (never CVV or full PAN)'
            : undefined
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          {activeTab === 'card' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Cardholder Name *</label>
                <input
                  type="text"
                  required
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Card Type *</label>
                <select
                  value={cardType}
                  onChange={(e) => setCardType(e.target.value as any)}
                  className={inputCls}
                >
                  <option value="Credit Card">Credit Card</option>
                  <option value="Debit Card">Debit Card</option>
                  <option value="UPI">UPI</option>
                  <option value="RuPay">RuPay</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Last 4 Digits Only *</label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  pattern="\d{4}"
                  value={cardLast4}
                  onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4829"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>Expiry Date (MM/YYYY) *</label>
                <input
                  type="text"
                  required
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  placeholder="09/2029"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>Card Provider *</label>
                <input
                  type="text"
                  required
                  value={cardProvider}
                  onChange={(e) => setCardProvider(e.target.value)}
                  placeholder="HDFC Visa / ICICI RuPay"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Gateway Token Reference</label>
                <input
                  type="text"
                  value={tokenRef}
                  onChange={(e) => setTokenRef(e.target.value)}
                  placeholder="tok_rzp_..."
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
          )}

          {activeTab === 'upi' && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>UPI ID *</label>
                <input
                  type="text"
                  required
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="company@hdfcbank"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>Account Holder Name *</label>
                <input
                  type="text"
                  required
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Bank Name *</label>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {activeTab === 'bank' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Bank Name *</label>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Account Holder Name *</label>
                <input
                  type="text"
                  required
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Account Number (AES Encrypted) *</label>
                <input
                  type="password"
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>IFSC Code *</label>
                <input
                  type="text"
                  required
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                  placeholder="HDFC0001248"
                  className={`${inputCls} font-mono uppercase`}
                />
              </div>
              <div>
                <label className={labelCls}>Account Type</label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className={inputCls}
                >
                  <option value="Current Account">Current Account</option>
                  <option value="Savings Account">Savings Account</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Branch Name</label>
                <input
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? 'Saving...' : 'Save Securely'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remove Payment Record"
        message="Are you sure you want to delete this card/UPI/bank record?"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </div>
  );
}
