import React, { useState } from 'react';
import {
  useMonthlyExpenses,
  useConfirmMonthlyExpense,
  useCorrectPaidExpense,
  useCopyPreviousMonthExpenses,
  useExpenseHeads,
} from '@/hooks/useExpenseMaster';
import { useVoidExpense } from '@/hooks/useExpenses';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { formatCurrency, formatDate } from '@/lib/formatters';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  CheckCircle2,
  Clock,
  Ban,
  Plus,
  Edit3,
  AlertCircle,
  FolderLock,
  Receipt,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { MonthlyExpenseItem, PaymentMethod } from '@/types';

export const MonthlyExpensesPage: React.FC = () => {
  const { isOwner } = useAuth();

  // Selected Month State (Default to current month 'YYYY-MM')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `${yr}-${mo}`;
  });

  const { data: summary, isLoading } = useMonthlyExpenses(selectedMonth);
  const { data: heads = [] } = useExpenseHeads(false);

  const confirmMonthlyExpense = useConfirmMonthlyExpense();
  const correctExpense = useCorrectPaidExpense();
  const voidExpense = useVoidExpense();
  const copyPreviousMonth = useCopyPreviousMonthExpenses();

  // Modals & Selection state
  const [payModalItem, setPayModalItem] = useState<MonthlyExpenseItem | null>(null);
  const [correctModalItem, setCorrectModalItem] = useState<MonthlyExpenseItem | null>(null);
  const [voidModalItem, setVoidModalItem] = useState<MonthlyExpenseItem | null>(null);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  // Pay Form State
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payDescription, setPayDescription] = useState('');
  const [payVendor, setPayVendor] = useState('');
  const [payError, setPayError] = useState<string | null>(null);

  // Correct Form State
  const [correctAmount, setCorrectAmount] = useState('');
  const [correctDate, setCorrectDate] = useState(new Date().toISOString().split('T')[0]);
  const [correctMethod, setCorrectMethod] = useState<PaymentMethod>('cash');
  const [correctDescription, setCorrectDescription] = useState('');
  const [correctReason, setCorrectReason] = useState('');
  const [correctError, setCorrectError] = useState<string | null>(null);

  // Void Form State
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);

  // Custom Extra Expense Form
  const [customHeadId, setCustomHeadId] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  const [customMethod, setCustomMethod] = useState<PaymentMethod>('cash');
  const [customDesc, setCustomDesc] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Toast State
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [yr, mo] = selectedMonth.split('-').map(Number);
    const d = new Date(yr, mo - 2, 1);
    const newYr = d.getFullYear();
    const newMo = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newYr}-${newMo}`);
  };

  const handleNextMonth = () => {
    const [yr, mo] = selectedMonth.split('-').map(Number);
    const d = new Date(yr, mo, 1);
    const newYr = d.getFullYear();
    const newMo = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newYr}-${newMo}`);
  };

  const getMonthNameHindi = (m: string) => {
    const [yr, mo] = m.split('-').map(Number);
    const date = new Date(yr, mo - 1, 1);
    const monthName = date.toLocaleString('hi-IN', { month: 'long' });
    return `${monthName} ${yr}`;
  };

  // Open Pay Modal
  const openPayModal = (item: MonthlyExpenseItem) => {
    setPayModalItem(item);
    setPayAmount(String(item.expected_amount || ''));
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayMethod('cash');
    setPayDescription(`${item.head.name_hi} (${selectedMonth})`);
    setPayVendor(item.head.name_en || '');
    setPayError(null);
  };

  // Open Correct Modal
  const openCorrectModal = (item: MonthlyExpenseItem) => {
    setCorrectModalItem(item);
    setCorrectAmount(String(item.actual_amount || item.expected_amount || ''));
    setCorrectDate(item.expense?.expense_date || new Date().toISOString().split('T')[0]);
    setCorrectMethod(item.expense?.payment_method || 'cash');
    setCorrectDescription(item.expense?.description || '');
    setCorrectReason('');
    setCorrectError(null);
  };

  // Submit Pay / Confirm
  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalItem) return;
    setPayError(null);

    const amt = Number(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setPayError('कृपया 0 से अधिक की मान्य राशि दर्ज करें');
      return;
    }

    try {
      await confirmMonthlyExpense.mutateAsync({
        expense_head_id: payModalItem.head.id,
        month: selectedMonth,
        amount: amt,
        payment_method: payMethod,
        paid_date: payDate,
        description: payDescription.trim(),
        vendor_name: payVendor.trim() || undefined,
      });

      showToast(`₹${amt} का भुगतान सफलतापूर्वक दर्ज किया गया!`);
      setPayModalItem(null);
    } catch (err: any) {
      setPayError(err.message || 'भुगतान दर्ज करने में विफल');
    }
  };

  // Submit Correction (Safe revision)
  const handleCorrectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctModalItem || !correctModalItem.expense) return;
    setCorrectError(null);

    const amt = Number(correctAmount);
    if (isNaN(amt) || amt <= 0) {
      setCorrectError('कृपया 0 से अधिक की मान्य राशि दर्ज करें');
      return;
    }
    if (!correctReason.trim() || correctReason.trim().length < 3) {
      setCorrectError('संशोधन का कारण (Reason) दर्ज करना अनिवार्य है');
      return;
    }

    try {
      await correctExpense.mutateAsync({
        expenseId: correctModalItem.expense.id,
        updates: {
          amount: amt,
          payment_method: correctMethod,
          expense_date: correctDate,
          description: correctDescription.trim(),
        },
        reason: correctReason.trim(),
      });

      showToast(`खर्च सुरक्षित रूप से संशोधित किया गया (₹${amt})`);
      setCorrectModalItem(null);
    } catch (err: any) {
      setCorrectError(err.message || 'संशोधन विफल');
    }
  };

  // Submit Void
  const handleVoidExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalItem || !voidModalItem.expense) return;
    setVoidError(null);

    if (!voidReason.trim() || voidReason.trim().length < 3) {
      setVoidError('रद्द करने का कारण अनिवार्य है');
      return;
    }

    try {
      await voidExpense.mutateAsync({
        expenseId: voidModalItem.expense.id,
        voidReason: voidReason.trim(),
      });

      showToast('खर्च सुरक्षित रूप से रद्द (Void) कर दिया गया।');
      setVoidModalItem(null);
      setVoidReason('');
    } catch (err: any) {
      setVoidError(err.message || 'खर्च रद्द करने में विफल');
    }
  };

  // Submit Copy Previous Month
  const handleCopyPreviousMonth = async () => {
    const [yr, mo] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(yr, mo - 2, 1);
    const prevYr = prevDate.getFullYear();
    const prevMo = String(prevDate.getMonth() + 1).padStart(2, '0');
    const sourceMonth = `${prevYr}-${prevMo}`;

    try {
      const res = await copyPreviousMonth.mutateAsync({
        sourceMonth,
        targetMonth: selectedMonth,
      });
      showToast(
        `${sourceMonth} से ${res.copied_count} स्थायी खर्चे इस महीने (${selectedMonth}) में कॉपी किए गए!`
      );
    } catch (err: any) {
      showToast(err.message || 'कॉपी करने में विफल', 'error');
    }
  };

  // Submit Custom Extra Expense
  const handleAddCustomExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);

    if (!customHeadId) {
      setCustomError('कृपया एक खर्च हेड चुनें');
      return;
    }
    const amt = Number(customAmount);
    if (isNaN(amt) || amt <= 0) {
      setCustomError('कृपया मान्य राशि दर्ज करें');
      return;
    }

    try {
      await confirmMonthlyExpense.mutateAsync({
        expense_head_id: customHeadId,
        month: selectedMonth,
        amount: amt,
        payment_method: customMethod,
        paid_date: customDate,
        description: customDesc.trim() || undefined,
      });

      showToast('अतिरिक्त खर्च सफलतापूर्वक जोड़ा गया!');
      setIsCustomModalOpen(false);
      setCustomAmount('');
      setCustomDesc('');
    } catch (err: any) {
      setCustomError(err.message || 'खर्च जोड़ने में विफल');
    }
  };

  return (
    <div className="space-y-5 pb-20 sm:pb-8">
      {/* Toast Alert */}
      {toastMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-sm font-bold animate-in fade-in slide-in-from-top-3 ${
            toastMsg.type === 'success'
              ? 'bg-emerald-800 text-white shadow-emerald-900/30'
              : 'bg-rose-700 text-white shadow-rose-900/30'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-300" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-300" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Top Header & Month Selector */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-cream-300 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              <Calendar className="w-6 h-6 text-maroon-800" />
              मासिक खर्च प्रविष्टि (Monthly Expenses)
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              किराया, वेतन व अन्य मासिक स्थायी खर्चों का रिकॉर्ड और भुगतान
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/master/expenses">
              <Button variant="outline" size="sm" leftIcon={<FolderLock className="w-4 h-4" />}>
                खर्च मास्टर (Expense Master)
              </Button>
            </Link>

            {isOwner && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setIsCustomModalOpen(true)}
              >
                + अतिरिक्त खर्च
              </Button>
            )}
          </div>
        </div>

        {/* Large Mobile-Friendly Month Selector */}
        <div className="flex items-center justify-between bg-cream-100/70 p-2 sm:p-3 rounded-2xl border border-cream-200">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevMonth}
            className="min-h-[44px] px-3 font-bold bg-white"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="hidden sm:inline ml-1">पिछला महीना</span>
          </Button>

          <div className="flex flex-col items-center">
            <span className="text-base sm:text-lg font-black text-maroon-950">
              {getMonthNameHindi(selectedMonth)}
            </span>
            <span className="text-[11px] font-mono font-bold text-gray-500">
              Month: {selectedMonth}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNextMonth}
            className="min-h-[44px] px-3 font-bold bg-white"
          >
            <span className="hidden sm:inline mr-1">अगला महीना</span>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Expected */}
        <Card className="p-4 bg-white border-cream-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">अपेक्षित खर्च (Expected Total)</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-gray-900 font-mono mt-1">
            {formatCurrency(summary?.expected_total || 0)}
          </div>
          <span className="text-[11px] text-gray-400 mt-0.5 block">
            सक्रिय स्थायी खर्च हेड का कुल योग
          </span>
        </Card>

        {/* Paid */}
        <Card className="p-4 bg-white border-cream-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700">भुगतान हुआ (Confirmed Paid)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-800 font-mono mt-1">
            {formatCurrency(summary?.paid_total || 0)}
          </div>
          <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">
            वास्तविक पुष्टीकृत खर्च (लाभ से घटता है)
          </span>
        </Card>

        {/* Pending */}
        <Card className="p-4 bg-white border-cream-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700">बकाया / लंबित (Pending)</span>
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-800 font-mono mt-1">
            {formatCurrency(summary?.pending_total || 0)}
          </div>
          <span className="text-[11px] text-amber-700 font-medium mt-0.5 block">
            मालिक की पुष्टि होने तक लाभ से नहीं घटता
          </span>
        </Card>
      </div>

      {/* Action Bar: Copy Previous Month & Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-cream-50 rounded-2xl border border-cream-200 text-xs">
        <div className="flex items-center gap-2 text-gray-700 font-medium">
          <Receipt className="w-4 h-4 text-maroon-800 flex-shrink-0" />
          <span>
            <strong>नियम:</strong> खर्च टेम्पलेट केवल अनुस्मारक है। वास्तविक खर्च मालिक द्वारा भुगतान दर्ज करने पर ही मान्य होता है।
          </span>
        </div>

        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Copy className="w-3.5 h-3.5" />}
            onClick={handleCopyPreviousMonth}
            disabled={copyPreviousMonth.isPending}
            className="min-h-[40px] font-bold whitespace-nowrap bg-white text-maroon-900 border-cream-300 hover:bg-cream-100"
          >
            {copyPreviousMonth.isPending ? 'कॉपी हो रहा है...' : 'पिछले महीने का कॉपी करें'}
          </Button>
        )}
      </div>

      {/* Monthly Expense Items List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !summary || summary.items.length === 0 ? (
        <Card className="p-8 text-center bg-white border-dashed border-2 border-cream-300">
          <FolderLock className="w-12 h-12 text-cream-400 mx-auto mb-2" />
          <h4 className="text-base font-bold text-gray-800">कोई मासिक खर्च हेड उपलब्ध नहीं है</h4>
          <p className="text-xs text-gray-500 mt-1">
            कृपया पहले <Link to="/master/expenses" className="text-maroon-800 underline font-bold">खर्च मास्टर</Link> में जाकर मासिक हेड बनाएं।
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {summary.items.map((item) => {
            const isPaid = item.status === 'paid';
            const isVoided = item.status === 'voided';
            const isPending = item.status === 'pending';

            return (
              <Card
                key={item.head.id}
                className={`p-4 bg-white border transition-all ${
                  isPaid
                    ? 'border-emerald-200 bg-emerald-50/10'
                    : isVoided
                    ? 'border-rose-200 bg-rose-50/10'
                    : 'border-cream-300 hover:border-amber-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left Head Details */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-gray-500 bg-cream-100 px-2 py-0.5 rounded border border-cream-200">
                        {item.head.code}
                      </span>

                      {isPaid && (
                        <Badge variant="success" className="text-[11px] font-bold">
                          ✓ भुगतान हुआ (Paid)
                        </Badge>
                      )}
                      {isPending && (
                        <Badge variant="warning" className="text-[11px] font-bold">
                          ⏳ बकाया (Pending)
                        </Badge>
                      )}
                      {isVoided && (
                        <Badge variant="danger" className="text-[11px] font-bold">
                          ✕ रद्द (Voided)
                        </Badge>
                      )}
                    </div>

                    <div>
                      <h4 className="text-base font-black text-gray-900 leading-tight">
                        {item.head.name_hi}
                      </h4>
                      <p className="text-xs font-semibold text-gray-500">{item.head.name_en}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 pt-1">
                      <span>
                        नियत तारीख:{' '}
                        <strong className="text-gray-900">{formatDate(item.due_date)}</strong>
                      </span>

                      {item.paid_date && (
                        <span>
                          भुगतान तारीख:{' '}
                          <strong className="text-emerald-800">{formatDate(item.paid_date)}</strong>
                        </span>
                      )}

                      {item.payment_method && (
                        <span>
                          माध्यम:{' '}
                          <strong className="capitalize text-gray-900">{item.payment_method}</strong>
                        </span>
                      )}
                    </div>

                    {item.notes && (
                      <p className="text-[11px] text-gray-500 bg-cream-50 p-2 rounded-lg border border-cream-200">
                        {item.notes}
                      </p>
                    )}
                  </div>

                  {/* Right Amounts & Actions */}
                  <div className="flex flex-col sm:items-end justify-between gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                    <div className="flex items-center sm:flex-col sm:items-end justify-between gap-1">
                      <span className="text-[11px] font-bold text-gray-500">
                        {isPaid ? 'भुगतान राशि' : 'अपेक्षित राशि'}
                      </span>
                      <span
                        className={`text-xl font-black font-mono ${
                          isPaid ? 'text-emerald-800' : 'text-gray-900'
                        }`}
                      >
                        {formatCurrency(isPaid ? item.actual_amount : item.expected_amount)}
                      </span>
                    </div>

                    {isOwner && (
                      <div className="flex items-center gap-2">
                        {isPending && (
                          <Button
                            variant="primary"
                            size="sm"
                            className="min-h-[40px] px-4 font-bold text-xs"
                            onClick={() => openPayModal(item)}
                          >
                            भुगतान दर्ज करें
                          </Button>
                        )}

                        {isPaid && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-[40px] text-xs font-bold"
                              leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                              onClick={() => openCorrectModal(item)}
                            >
                              संशोधन (Edit)
                            </Button>

                            <Button
                              variant="danger"
                              size="sm"
                              className="min-h-[40px] text-xs px-3"
                              onClick={() => {
                                setVoidModalItem(item);
                                setVoidReason('');
                                setVoidError(null);
                              }}
                              title="खर्च रद्द करें (Void)"
                            >
                              <Ban className="w-4 h-4" />
                            </Button>
                          </>
                        )}

                        {isVoided && (
                          <Button
                            variant="primary"
                            size="sm"
                            className="min-h-[40px] text-xs font-bold"
                            onClick={() => openPayModal(item)}
                          >
                            पुनः भुगतान दर्ज करें
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pay / Confirm Modal */}
      <Modal
        isOpen={!!payModalItem}
        onClose={() => setPayModalItem(null)}
        title={`मासिक खर्च भुगतान: ${payModalItem?.head.name_hi || ''}`}
      >
        <form onSubmit={handleConfirmPayment} className="space-y-4">
          {payError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{payError}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-cream-100/70 border border-cream-200 flex justify-between items-center text-xs">
            <div>
              <span className="font-bold text-gray-500 block">खर्च हेड</span>
              <span className="font-black text-gray-900 text-sm">{payModalItem?.head.name_hi}</span>
            </div>
            <div className="text-right">
              <span className="font-bold text-gray-500 block">महीना</span>
              <span className="font-mono font-bold text-maroon-900">{selectedMonth}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="number"
              label="भुगतान राशि (₹ Actual Paid) *"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              min="1"
              step="any"
              placeholder="0.00"
              required
            />

            <Input
              type="date"
              label="भुगतान तारीख (Payment Date) *"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700">
                भुगतान माध्यम (Payment Method) *
              </label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 min-h-[44px]"
              >
                <option value="cash">नकद (Cash)</option>
                <option value="upi">UPI / Online</option>
                <option value="bank_transfer">बैंक ट्रांसफर (Bank Transfer)</option>
                <option value="credit">उधार / देय (Credit)</option>
              </select>
            </div>

            <Input
              label="प्राप्तकर्ता / वेंडर (Paid To / Vendor)"
              value={payVendor}
              onChange={(e) => setPayVendor(e.target.value)}
              placeholder="उदा. मकान मालिक / कर्मचारी का नाम"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">विवरण / टिप्पणी (Notes)</label>
            <textarea
              value={payDescription}
              onChange={(e) => setPayDescription(e.target.value)}
              rows={2}
              placeholder="अतिरिक्त विवरण..."
              className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-maroon-700"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPayModalItem(null)}
              className="min-h-[44px]"
            >
              रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="min-h-[44px] px-6 font-bold"
              disabled={confirmMonthlyExpense.isPending}
            >
              {confirmMonthlyExpense.isPending ? 'सहेज रहे हैं...' : 'भुगतान की पुष्टि करें (Confirm Payment)'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Safe Correction Modal */}
      <Modal
        isOpen={!!correctModalItem}
        onClose={() => setCorrectModalItem(null)}
        title="खर्च संशोधन (Safe Correction with Revision Link)"
      >
        <form onSubmit={handleCorrectPayment} className="space-y-4">
          {correctError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{correctError}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
            <strong>सुरक्षित संशोधन नियम:</strong> पुराना रिकॉर्ड इतिहास के लिए 'Voided' चिह्नित होगा और संशोधित डेटा के साथ नया रिकॉर्ड लिंक होकर बनेगा।
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="number"
              label="नई संशोधित राशि (₹ New Amount) *"
              value={correctAmount}
              onChange={(e) => setCorrectAmount(e.target.value)}
              min="1"
              step="any"
              required
            />

            <Input
              type="date"
              label="तारीख (Date) *"
              value={correctDate}
              onChange={(e) => setCorrectDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">भुगतान माध्यम</label>
            <select
              value={correctMethod}
              onChange={(e) => setCorrectMethod(e.target.value as PaymentMethod)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 min-h-[44px]"
            >
              <option value="cash">नकद (Cash)</option>
              <option value="upi">UPI / Online</option>
              <option value="bank_transfer">बैंक ट्रांसफर (Bank Transfer)</option>
              <option value="credit">उधार / देय (Credit)</option>
            </select>
          </div>

          <Input
            label="संशोधन का कारण (Mandatory Reason) *"
            value={correctReason}
            onChange={(e) => setCorrectReason(e.target.value)}
            placeholder="उदा. गलत बिल राशि दर्ज हो गई थी, सही बिल ₹15,000 है"
            required
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCorrectModalItem(null)}
              className="min-h-[44px]"
            >
              रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="min-h-[44px] px-6 font-bold"
              disabled={correctExpense.isPending}
            >
              {correctExpense.isPending ? 'संशोधित कर रहे हैं...' : 'संशोधन सुरक्षित करें (Save Correction)'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Void Modal with Mandatory Reason */}
      <Modal
        isOpen={!!voidModalItem}
        onClose={() => setVoidModalItem(null)}
        title="खर्च रद्द करें (Void Expense)"
      >
        <form onSubmit={handleVoidExpense} className="space-y-4">
          {voidError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{voidError}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
            क्या आप निश्चित रूप से <strong>₹{voidModalItem?.actual_amount}</strong> का यह खर्च रद्द करना चाहते हैं? वित्तीय अखंडता के लिए रद्द करने का कारण ऑडिट लॉग में दर्ज होगा।
          </div>

          <Input
            label="रद्द करने का कारण (Mandatory Void Reason) *"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="उदा. डुप्लीकेट प्रविष्टि अथवा चेक बाउंस"
            required
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setVoidModalItem(null)}
              className="min-h-[44px]"
            >
              वापस जाएं
            </Button>
            <Button
              type="submit"
              variant="danger"
              className="min-h-[44px] px-6 font-bold"
              disabled={voidExpense.isPending}
            >
              {voidExpense.isPending ? 'रद्द कर रहे हैं...' : 'खर्च रद्द करें (Void Expense)'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Custom Extra Expense Modal */}
      <Modal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        title="महीने के लिए अतिरिक्त खर्च जोड़ें (Add Monthly Expense)"
      >
        <form onSubmit={handleAddCustomExpense} className="space-y-4">
          {customError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{customError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">खर्च हेड चुनें *</label>
            <select
              value={customHeadId}
              onChange={(e) => setCustomHeadId(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 min-h-[44px]"
              required
            >
              <option value="">-- हेड का चयन करें --</option>
              {heads.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name_hi} ({h.name_en}) - {h.code}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="number"
              label="राशि (₹ Amount) *"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              min="1"
              step="any"
              placeholder="0.00"
              required
            />

            <Input
              type="date"
              label="तारीख (Date) *"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">भुगतान माध्यम</label>
            <select
              value={customMethod}
              onChange={(e) => setCustomMethod(e.target.value as PaymentMethod)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 min-h-[44px]"
            >
              <option value="cash">नकद (Cash)</option>
              <option value="upi">UPI / Online</option>
              <option value="bank_transfer">बैंक ट्रांसफर (Bank Transfer)</option>
              <option value="credit">उधार / देय (Credit)</option>
            </select>
          </div>

          <Input
            label="विवरण / टिप्पणी (Description)"
            value={customDesc}
            onChange={(e) => setCustomDesc(e.target.value)}
            placeholder="उदा. दीपावली बोनस / मेंटेनेंस"
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCustomModalOpen(false)}
              className="min-h-[44px]"
            >
              रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="min-h-[44px] px-6 font-bold"
              disabled={confirmMonthlyExpense.isPending}
            >
              {confirmMonthlyExpense.isPending ? 'सहेज रहे हैं...' : 'खर्च जोड़ें (Save Expense)'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
export default MonthlyExpensesPage;
