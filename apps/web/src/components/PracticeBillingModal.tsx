import { useState, useEffect, type FC } from 'react';
import {
  X,
  Receipt,
  CreditCard,
  QrCode,
  Banknote,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Search,
  Check,
  Eye,
  Printer,
} from 'lucide-react';
import {
  getDailyCollectionsSummary,
  listEncounterBillings,
  recordEncounterBilling,
  updateEncounterBillingStatus,
} from '../api/client';
import type { PracticeCollectionsSummary } from '@aarogyadamu/contracts';

interface Props {
  patients: Array<{ id: string; fullName: string }>;
  onClose: () => void;
}

export const PracticeBillingModal: FC<Props> = ({ patients, onClose }) => {
  const [summary, setSummary] = useState<PracticeCollectionsSummary | null>(null);
  const [billings, setBillings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New billing form
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id || '');
  const [feeInr, setFeeInr] = useState<number>(600);
  const [discountInr, setDiscountInr] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CASH' | 'CARD'>('UPI');
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'PENDING'>('PENDING');
  const [notes] = useState('Consultation fee');
  const [submitting, setSubmitting] = useState(false);

  // Search and status filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID' | 'CANCELLED_REFUNDED'>('ALL');

  // Receipt Preview Modal
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, billRes] = await Promise.all([
        getDailyCollectionsSummary(),
        listEncounterBillings(),
      ]);
      if (sumRes.success) setSummary(sumRes.summary);
      if (billRes.success) setBillings(billRes.billings);
    } catch (err: any) {
      setError(err.message || 'Failed to load practice collections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRecordPayment = async (e?: React.FormEvent, overrideStatus?: 'PAID' | 'PENDING') => {
    if (e) e.preventDefault();
    if (!selectedPatientId) return;
    setSubmitting(true);
    try {
      const targetStatus = overrideStatus || paymentStatus;
      const net = Math.max(0, feeInr - discountInr);
      await recordEncounterBilling({
        patientId: selectedPatientId,
        consultationFeeInr: feeInr,
        discountInr,
        totalAmountInr: net,
        paymentStatus: targetStatus,
        paymentMethod,
        notes,
      });
      setShowAddForm(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to record encounter billing');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateQuickPending = async () => {
    setSubmitting(true);
    try {
      const targetPatient = patients[0]?.id || selectedPatientId;
      await recordEncounterBilling({
        patientId: targetPatient,
        consultationFeeInr: 600,
        discountInr: 0,
        totalAmountInr: 600,
        paymentStatus: 'PENDING',
        paymentMethod: 'UPI',
        notes: 'Follow-up consultation fee (Pending Collection)',
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create sample pending invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransitionStatus = async (
    billingId: string,
    newStatus: 'PAID' | 'CANCELLED' | 'REFUNDED',
    method: 'UPI' | 'CASH' | 'CARD' = 'UPI',
  ) => {
    try {
      await updateEncounterBillingStatus(billingId, {
        paymentStatus: newStatus,
        paymentMethod: method,
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || `Failed to update billing to ${newStatus}`);
    }
  };

  const pendingCount = billings.filter((b) => b.paymentStatus === 'PENDING').length;
  const paidCount = billings.filter((b) => b.paymentStatus === 'PAID').length;
  const voidedCount = billings.filter((b) => b.paymentStatus === 'CANCELLED' || b.paymentStatus === 'REFUNDED').length;

  const filteredBillings = billings.filter((b) => {
    const matchesSearch =
      b.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.receiptNumber?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'PENDING') return b.paymentStatus === 'PENDING';
    if (statusFilter === 'PAID') return b.paymentStatus === 'PAID';
    if (statusFilter === 'CANCELLED_REFUNDED') {
      return b.paymentStatus === 'CANCELLED' || b.paymentStatus === 'REFUNDED';
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white bg-surface-container-lowest shadow-2xl border border-outline-variant/30 overflow-hidden my-8 max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-6 py-4 bg-surface-container-low/80">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Receipt className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-headline font-bold text-on-surface">Practice Billing & Collections</h2>
              <p className="text-xs font-body text-on-surface-variant">Daily revenue tracking, patient receipts, and collection breakdown</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-error-container/40 border border-error/30 rounded-xl text-xs text-error font-medium">
              {error}
            </div>
          )}

          {/* Daily KPI Metrics */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low/70 p-4 shadow-sm">
                <div className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">Today's Revenue</div>
                <div className="mt-1 text-2xl font-headline font-bold text-on-surface font-mono">
                  ₹{summary.totalRevenueInr.toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] font-body text-on-surface-variant mt-0.5">{summary.totalConsultationsCount} visits today</div>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-4 shadow-sm">
                <div className="text-[11px] font-label font-bold text-emerald-800 uppercase tracking-wider">Collected</div>
                <div className="mt-1 text-2xl font-headline font-bold text-emerald-700 font-mono">
                  ₹{summary.totalCollectedInr.toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] font-body text-emerald-600 mt-0.5">{summary.paidConsultationsCount} paid visits</div>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-50/50 p-4 shadow-sm">
                <div className="text-[11px] font-label font-bold text-amber-800 uppercase tracking-wider">Pending Dues</div>
                <div className="mt-1 text-2xl font-headline font-bold text-amber-700 font-mono">
                  ₹{summary.totalPendingInr.toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] font-body text-amber-600 mt-0.5">{summary.pendingConsultationsCount} pending</div>
              </div>
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low/70 p-4 shadow-sm">
                <div className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">Collections by Mode</div>
                <div className="mt-2 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-on-surface">
                    <span className="flex items-center gap-1 font-medium font-body"><QrCode className="h-3 w-3 text-primary" /> UPI</span>
                    <span className="font-bold">₹{summary.collectionsByMethod.UPI.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-on-surface">
                    <span className="flex items-center gap-1 font-medium font-body"><Banknote className="h-3 w-3 text-emerald-600" /> Cash</span>
                    <span className="font-bold">₹{summary.collectionsByMethod.CASH.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-on-surface">
                    <span className="flex items-center gap-1 font-medium font-body"><CreditCard className="h-3 w-3 text-blue-600" /> Card</span>
                    <span className="font-bold">₹{summary.collectionsByMethod.CARD.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Row & Filters */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Search patient name or receipt number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low/50 pl-9 pr-3 py-2 text-xs font-body text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateQuickPending}
                  disabled={submitting}
                  className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3.5 py-2 text-xs font-label font-semibold text-on-surface hover:bg-surface-container transition-all shadow-xs disabled:opacity-50"
                  title="Create a sample ₹600 pending visit to test Mark Paid and Cancel"
                >
                  <Plus className="h-3.5 w-3.5 text-amber-700" />
                  + Sample Pending Bill
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary px-4 py-2 text-xs font-label font-bold hover:opacity-95 shadow-md shadow-primary/20 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  {showAddForm ? 'Close Form' : 'Record Encounter Payment'}
                </button>
              </div>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-outline-variant/20 pb-2">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-label font-semibold transition ${
                  statusFilter === 'ALL'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface border border-outline-variant/20'
                }`}
              >
                All ({billings.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PENDING')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-label font-semibold transition flex items-center gap-1.5 ${
                  statusFilter === 'PENDING'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <Clock className="h-3 w-3" /> Pending ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PAID')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-label font-semibold transition flex items-center gap-1.5 ${
                  statusFilter === 'PAID'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <CheckCircle2 className="h-3 w-3" /> Paid ({paidCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('CANCELLED_REFUNDED')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-label font-semibold transition flex items-center gap-1.5 ${
                  statusFilter === 'CANCELLED_REFUNDED'
                    ? 'bg-surface-container-highest text-on-surface shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface border border-outline-variant/20'
                }`}
              >
                Cancelled / Refunded ({voidedCount})
              </button>
            </div>
          </div>

          {/* Add Billing Form */}
          {showAddForm && (
            <form onSubmit={handleRecordPayment} className="p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/80 space-y-4">
              <h4 className="text-sm font-headline font-bold text-on-surface">Record Direct Consultation Fee</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">Patient</label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-body font-medium text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">Consultation Fee (₹)</label>
                  <input
                    type="number"
                    value={feeInr}
                    onChange={(e) => setFeeInr(parseInt(e.target.value) || 0)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-body text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">Discount (₹)</label>
                  <input
                    type="number"
                    value={discountInr}
                    onChange={(e) => setDiscountInr(parseInt(e.target.value) || 0)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-body text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-body text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="UPI">UPI (GPay / PhonePe / QR)</option>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Debit / Credit Card</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-label font-semibold text-on-surface-variant mb-1">Payment Status</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-body font-medium text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="PENDING">Pending Payment (Collect later)</option>
                    <option value="PAID">Paid in Full (Issue Receipt Now)</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary px-4 py-2 text-xs font-label font-bold hover:opacity-95 shadow-md shadow-primary/20 transition-all disabled:opacity-50"
                  >
                    {submitting
                      ? 'Saving...'
                      : paymentStatus === 'PAID'
                      ? `Collect & Issue Receipt (₹${Math.max(0, feeInr - discountInr)})`
                      : `Save as Pending (₹${Math.max(0, feeInr - discountInr)})`}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Billings Table */}
          <div className="rounded-2xl border border-outline-variant/30 overflow-hidden shadow-sm bg-surface-container-lowest">
            <table className="w-full text-left text-xs font-body">
              <thead className="bg-surface-container-low text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/20">
                <tr>
                  <th className="px-4 py-3">Receipt No.</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Fee / Net</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {filteredBillings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">
                      No encounter receipts found matching current filter.
                    </td>
                  </tr>
                ) : (
                  filteredBillings.map((b) => (
                    <tr key={b.id} className="hover:bg-surface-container-low/60 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-xs text-on-surface">
                        {b.receiptNumber}
                      </td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{b.patientName}</td>
                      <td className="px-4 py-3 font-medium text-on-surface font-mono">
                        ₹{b.totalAmountInr}{' '}
                        {b.discountInr > 0 && <span className="text-xs text-on-surface-variant line-through">₹{b.consultationFeeInr}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-surface-container px-2 py-0.5 text-xs font-medium text-on-surface">
                          {b.paymentMethod === 'UPI' && <QrCode className="h-3 w-3 text-primary" />}
                          {b.paymentMethod === 'CASH' && <Banknote className="h-3 w-3 text-emerald-600" />}
                          {b.paymentMethod === 'CARD' && <CreditCard className="h-3 w-3 text-blue-600" />}
                          {b.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            b.paymentStatus === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : b.paymentStatus === 'CANCELLED'
                              ? 'bg-surface-container-highest text-on-surface-variant'
                              : b.paymentStatus === 'REFUNDED'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {b.paymentStatus === 'PAID' ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : b.paymentStatus === 'REFUNDED' ? (
                            <RefreshCw className="h-3 w-3" />
                          ) : b.paymentStatus === 'CANCELLED' ? (
                            <X className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {b.paymentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-on-surface-variant">
                        {new Date(b.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {b.paymentStatus === 'PENDING' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleTransitionStatus(b.id, 'PAID', 'UPI')}
                              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1 text-xs font-label font-bold text-white hover:bg-emerald-700 shadow-sm transition"
                              title="Mark as Paid (Tick to Collect)"
                            >
                              <Check className="h-3.5 w-3.5" /> Mark Paid
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTransitionStatus(b.id, 'CANCELLED')}
                              className="inline-flex items-center gap-1 rounded-xl border border-error/30 bg-surface-container-lowest px-2.5 py-1 text-xs font-label font-semibold text-error hover:bg-error-container/30 transition"
                              title="Cancel invoice"
                            >
                              <X className="h-3.5 w-3.5" /> Cancel (Void)
                            </button>
                          </div>
                        )}
                        {b.paymentStatus === 'PAID' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedReceipt(b)}
                              className="inline-flex items-center gap-1 rounded-xl border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-label font-bold text-primary hover:bg-primary/20 transition shadow-xs"
                              title="View & Print Official Receipt"
                            >
                              <Eye className="h-3.5 w-3.5" /> View Receipt
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to refund/cancel this receipt for ${b.patientName}?`)) {
                                  handleTransitionStatus(b.id, 'REFUNDED');
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-2.5 py-1 text-xs font-label font-medium text-on-surface-variant hover:bg-surface-container transition"
                              title="Cancel or refund payment"
                            >
                              Refund / Cancel
                            </button>
                          </div>
                        )}
                        {b.paymentStatus === 'CANCELLED' && (
                          <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant font-medium">
                            <X className="h-3 w-3" /> Voided
                          </span>
                        )}
                        {b.paymentStatus === 'REFUNDED' && (
                          <span className="inline-flex items-center gap-1 text-xs text-purple-600 font-medium">
                            <RefreshCw className="h-3 w-3" /> Refunded
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-outline-variant/20 px-6 py-4 bg-surface-container-low/50 flex items-center justify-between">
          <div className="text-xs font-body text-on-surface-variant">
            GST compliant practice encounter billing • Receipts stored securely
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-1.5 text-xs font-label font-semibold text-on-surface hover:bg-surface-container transition-all"
          >
            Close
          </button>
        </div>

        {/* OFFICIAL CLINICAL RECEIPT MODAL */}
        {selectedReceipt && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-on-surface/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest shadow-2xl border border-outline-variant/30 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-start justify-between border-b border-outline-variant/20 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-headline font-bold text-on-surface tracking-tight">
                      AarogyaDamu Clinical Care
                    </h3>
                    <p className="text-xs font-body text-on-surface-variant">Official Consultation Encounter Receipt</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(null)}
                  className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Receipt Details Grid */}
              <div className="rounded-2xl bg-surface-container-low/80 border border-outline-variant/20 p-4 space-y-3 font-body text-xs">
                <div className="flex justify-between">
                  <span className="text-on-surface-variant font-medium">Receipt Number:</span>
                  <span className="font-mono font-bold text-on-surface">{selectedReceipt.receiptNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant font-medium">Patient Name:</span>
                  <span className="font-bold text-on-surface">{selectedReceipt.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant font-medium">Date & Time:</span>
                  <span className="text-on-surface font-mono">
                    {new Date(selectedReceipt.createdAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant font-medium">Payment Mode:</span>
                  <span className="font-semibold text-on-surface">{selectedReceipt.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant font-medium">Status:</span>
                  <span className="font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> PAID (CONFIRMED)
                  </span>
                </div>
              </div>

              {/* Fee Breakdown */}
              <div className="border border-outline-variant/20 rounded-2xl overflow-hidden font-body">
                <table className="w-full text-xs">
                  <thead className="bg-surface-container-low text-on-surface-variant font-label font-semibold border-b border-outline-variant/20">
                    <tr>
                      <th className="px-3 py-2 text-left">Clinical Service</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/15">
                    <tr>
                      <td className="px-3 py-2.5 text-on-surface font-medium">
                        Consultation & Clinical Evaluation
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-on-surface">
                        ₹{selectedReceipt.consultationFeeInr}
                      </td>
                    </tr>
                    {selectedReceipt.discountInr > 0 && (
                      <tr className="text-emerald-700 bg-emerald-50/40">
                        <td className="px-3 py-2 font-medium">Discount Applied</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">-₹{selectedReceipt.discountInr}</td>
                      </tr>
                    )}
                    <tr className="bg-surface-container-low/60 font-bold text-on-surface text-sm">
                      <td className="px-3 py-2.5">Total Paid</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-700">
                        ₹{selectedReceipt.totalAmountInr}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] font-body text-on-surface-variant/80 text-center leading-relaxed">
                Computer-generated receipt • GST exempt under Healthcare Clinical Services • Stored securely in AarogyaDamu Health Vault
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3.5 py-1.5 text-xs font-label font-semibold text-on-surface hover:bg-surface-container shadow-xs transition"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Receipt
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(null)}
                  className="rounded-xl bg-primary text-on-primary px-4 py-1.5 text-xs font-label font-bold hover:bg-primary-container transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default PracticeBillingModal;
