import React, { useState } from 'react';
import {
  useExpenses,
  useCreateExpense,
  useUpdateExpense,
  useVoidExpense,
  useDeleteExpense,
} from '@/hooks/useExpenses';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import {
  formatCurrency,
  formatDate,
  getTodayDateString,
} from '@/lib/formatters';
import {
  Wallet,
  Plus,
  Ban,
  Upload,
  AlertCircle,
  Eye,
  Edit2,
  Trash2,
  Calendar,
  CreditCard,
  Building2,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { Expense, ExpenseCategory, PaymentMethod } from '@/types';

export const ExpensesPage: React.FC = () => {
  const { data: expenses = [], isLoading } = useExpenses();
  const { t } = useLanguage();
  const { isOwner } = useAuth();
  const { isOnline, saveDraft } = useSync();

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const voidExpense = useVoidExpense();
  const deleteExpense = useDeleteExpense();

  // Modals & Selection state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewExpense, setViewExpense] = useState<Expense | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [expenseToVoid, setExpenseToVoid] = useState<string | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Add Expense Form State
  const [expenseDate, setExpenseDate] = useState<string>(getTodayDateString());
  const [category, setCategory] = useState<ExpenseCategory>('generator_fuel');
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [description, setDescription] = useState<string>('');
  const [vendorName, setVendorName] = useState<string>('');
  const [billImage, setBillImage] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Expense Form State
  const [editDate, setEditDate] = useState<string>(getTodayDateString());
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('generator_fuel');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('cash');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editVendorName, setEditVendorName] = useState<string>('');
  const [editFormError, setEditFormError] = useState<string | null>(null);

  // Filter state
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'voided'>('all');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const categories: ExpenseCategory[] = [
    'ingredients',
    'electricity',
    'generator_fuel',
    'wages',
    'seller_commission',
    'packaging',
    'transport',
    'repairs',
    'rent',
    'marketing',
    'other',
  ];

  const handleOpenAddModal = () => {
    setExpenseDate(getTodayDateString());
    setCategory('generator_fuel');
    setAmount('');
    setPaymentMethod('cash');
    setDescription('');
    setVendorName('');
    setBillImage(null);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (exp: Expense) => {
    setExpenseToEdit(exp);
    setEditDate(exp.expense_date);
    setEditCategory(exp.category);
    setEditAmount(String(exp.amount));
    setEditPaymentMethod(exp.payment_method);
    setEditDescription(exp.description);
    setEditVendorName(exp.vendor_name || '');
    setEditFormError(null);
  };

  const handleCreateExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('कृपया सही राशि दर्ज करें');
      return;
    }

    if (!description.trim()) {
      setFormError('कृपया खर्चे का विवरण दर्ज करें');
      return;
    }

    try {
      if (!isOnline) {
        await saveDraft('expense', {
          expense_date: expenseDate,
          category,
          amount: amountNum,
          payment_method: paymentMethod,
          description,
          vendor_name: vendorName || undefined,
        });
        showSuccess('ऑफ़लाइन ड्राफ्ट सुरक्षित हो गया! कनेक्शन मिलने पर यह सिंक हो जाएगा।');
      } else {
        await createExpense.mutateAsync({
          expense_date: expenseDate,
          category,
          amount: amountNum,
          payment_method: paymentMethod,
          description,
          vendor_name: vendorName || undefined,
        });
        showSuccess(`खर्चा ₹${amountNum} सफलतापूर्वक दर्ज हो गया।`);
      }
      setIsAddModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'खर्चा दर्ज करने में त्रुटि');
    }
  };

  const handleEditExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseToEdit) return;
    setEditFormError(null);

    const amountNum = parseFloat(editAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setEditFormError('कृपया सही राशि दर्ज करें');
      return;
    }

    if (!editDescription.trim()) {
      setEditFormError('कृपया खर्चे का विवरण दर्ज करें');
      return;
    }

    try {
      await updateExpense.mutateAsync({
        expenseId: expenseToEdit.id,
        updates: {
          expense_date: editDate,
          category: editCategory,
          amount: amountNum,
          payment_method: editPaymentMethod,
          description: editDescription,
          vendor_name: editVendorName || undefined,
        },
      });
      setExpenseToEdit(null);
      showSuccess(`खर्चा ₹${amountNum} का विवरण अपडेट हो गया।`);
    } catch (err: any) {
      setEditFormError(err.message || 'खर्चा अपडेट करने में त्रुटि');
    }
  };

  const handleConfirmVoid = async () => {
    if (!expenseToVoid) return;
    if (!voidReason.trim()) {
      alert(t.voidReasonRequired);
      return;
    }

    try {
      await voidExpense.mutateAsync({
        expenseId: expenseToVoid,
        voidReason: voidReason,
      });
      setExpenseToVoid(null);
      setVoidReason('');
      showSuccess('खर्चा सफलतापूर्वक रद्द (Void) कर दिया गया।');
    } catch (err: any) {
      alert(err.message || 'खर्चा रद्द करने में त्रुटि');
    }
  };

  const handleConfirmDelete = async () => {
    if (!expenseToDelete) return;
    try {
      const res = await deleteExpense.mutateAsync(expenseToDelete.id);
      showSuccess(res.message || 'खर्चा हटा दिया गया।');
      setExpenseToDelete(null);
    } catch (err: any) {
      alert(err.message || 'खर्चा हटाने में त्रुटि');
    }
  };

  // Filtered expenses
  const filteredExpenses = expenses.filter((e) => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    return true;
  });

  const totalActiveExpenses = expenses
    .filter((e) => e.status === 'active')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalFilteredSum = filteredExpenses
    .filter((e) => e.status === 'active')
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Wallet className="w-6 h-6 text-maroon-800" />
            {t.navExpenses}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            डीजल, बिजली, मजदूरी व कच्चे माल के दैनिक खर्चे
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white px-3.5 py-1.5 rounded-2xl border border-cream-300 shadow-sm text-right">
            <span className="text-[10px] font-bold text-gray-500 block">कुल सक्रिय खर्चे (Active)</span>
            <span className="text-base font-black text-rose-800 font-mono">
              {formatCurrency(totalActiveExpenses)}
            </span>
          </div>

          {isOwner && (
            <Button
              variant="primary"
              leftIcon={<Plus className="w-5 h-5" />}
              onClick={handleOpenAddModal}
            >
              {t.addExpense}
            </Button>
          )}
        </div>
      </div>

      {/* Success Notification Alert */}
      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between shadow-sm animate-fade-in">
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-900 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-2xl border border-cream-300 shadow-sm">
        <div className="flex items-center gap-1">
          <span className="text-xs font-bold text-gray-500 mr-1">स्थिति:</span>
          {(['all', 'active', 'voided'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterStatus === st
                  ? 'bg-maroon-800 text-white shadow-xs'
                  : 'bg-cream-100 text-gray-700 hover:bg-cream-200'
              }`}
            >
              {st === 'all' ? 'सभी' : st === 'active' ? 'सक्रिय' : 'रद्द (Void)'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs font-bold text-gray-500 mr-1">श्रेणी:</span>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-cream-50 border border-cream-300 rounded-xl px-2.5 py-1 text-xs font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-maroon-700"
          >
            <option value="all">सभी श्रेणियां</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {t.expenseCategories[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-gray-500 mt-3">{t.loading}</p>
        </div>
      ) : filteredExpenses.length === 0 ? (
        <Card className="text-center py-12">
          <div className="w-14 h-14 bg-rose-100 text-rose-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Wallet className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-900">कोई खर्चा रिकॉर्ड नहीं मिला</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            बिजली, डीजल, दूध व अन्य खर्चे दर्ज करने के लिए नया खर्चा जोड़ें।
          </p>
          {isOwner && (
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={handleOpenAddModal}
            >
              {t.addExpense}
            </Button>
          )}
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 font-bold">
                  <th className="py-2.5">तारीख</th>
                  <th className="py-2.5">श्रेणी (Category)</th>
                  <th className="py-2.5">विवरण</th>
                  <th className="py-2.5">भुगतान</th>
                  <th className="py-2.5 text-right">राशि</th>
                  <th className="py-2.5 text-center">स्थिति</th>
                  <th className="py-2.5 text-right">क्रियाएं (Actions)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredExpenses.map((exp) => (
                  <tr
                    key={exp.id}
                    className={`hover:bg-cream-50/60 transition-colors ${
                      exp.status === 'voided' ? 'opacity-60 bg-gray-50/50' : ''
                    }`}
                  >
                    <td className="py-2.5 font-sans font-semibold text-gray-900 whitespace-nowrap">
                      {formatDate(exp.expense_date)}
                    </td>
                    <td className="py-2.5">
                      <span className="font-semibold text-maroon-900 bg-cream-100 px-2 py-0.5 rounded-md whitespace-nowrap">
                        {t.expenseCategories[exp.category as keyof typeof t.expenseCategories] || exp.category}
                      </span>
                    </td>
                    <td className="py-2.5 font-medium text-gray-700">
                      <div>
                        <span className={exp.status === 'voided' ? 'line-through text-gray-400' : ''}>
                          {exp.description}
                        </span>
                        {exp.vendor_name && (
                          <span className="text-[11px] text-gray-500 block font-normal">
                            दुकानदार: {exp.vendor_name}
                          </span>
                        )}
                        {exp.status === 'voided' && exp.void_reason && (
                          <span className="text-[10px] text-rose-700 font-bold block not-italic">
                            रद्द कारण: {exp.void_reason}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 uppercase font-mono font-bold text-gray-600 whitespace-nowrap">
                      {exp.payment_method}
                    </td>
                    <td className={`py-2.5 text-right font-mono font-black text-sm whitespace-nowrap ${
                      exp.status === 'voided' ? 'line-through text-gray-400' : 'text-gray-900'
                    }`}>
                      {formatCurrency(exp.amount)}
                    </td>
                    <td className="py-2.5 text-center">
                      <Badge variant={exp.status}>
                        {exp.status === 'active' ? t.active : exp.status === 'voided' ? t.voided : exp.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {/* View Button */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-maroon-800 hover:bg-cream-100 h-8 w-8 p-0"
                          title={t.viewExpense}
                          onClick={() => setViewExpense(exp)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>

                        {/* Edit Button (Owner only & Active only) */}
                        {isOwner && exp.status === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-indigo-700 hover:bg-indigo-50 h-8 w-8 p-0"
                            title={t.editExpense}
                            onClick={() => handleOpenEditModal(exp)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        )}

                        {/* Void Button (Owner only & Active only) */}
                        {isOwner && exp.status === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-amber-700 hover:bg-amber-50 h-8 w-8 p-0"
                            title={t.voidExpense}
                            onClick={() => {
                              setExpenseToVoid(exp.id);
                              setVoidReason('');
                            }}
                          >
                            <Ban className="w-4 h-4" />
                          </Button>
                        )}

                        {/* Delete Button (Owner only) */}
                        {isOwner && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-700 hover:bg-rose-50 h-8 w-8 p-0"
                            title={t.deleteExpense}
                            onClick={() => setExpenseToDelete(exp)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredExpenses.length > 0 && (
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100 text-xs text-gray-500">
              <span>कुल रिकॉर्ड्स: {filteredExpenses.length}</span>
              <span className="font-bold text-gray-800">
                चयनित सक्रिय कुल: <span className="text-maroon-900 font-mono font-black">{formatCurrency(totalFilteredSum)}</span>
              </span>
            </div>
          )}
        </Card>
      )}

      {/* View Expense Details Modal */}
      <Modal
        isOpen={Boolean(viewExpense)}
        onClose={() => setViewExpense(null)}
        title={t.expenseDetails}
        maxWidth="md"
      >
        {viewExpense && (
          <div className="space-y-4 py-2 text-sm">
            {/* Header Amount Banner */}
            <div className="bg-cream-100 border border-cream-300 rounded-2xl p-4 text-center">
              <span className="text-xs font-bold text-gray-500 block">खर्च राशि</span>
              <span className="text-3xl font-black font-mono text-maroon-900">
                {formatCurrency(viewExpense.amount)}
              </span>
              <div className="mt-2 flex items-center justify-center gap-2">
                <Badge variant={viewExpense.status}>
                  {viewExpense.status === 'active' ? t.active : viewExpense.status === 'voided' ? t.voided : viewExpense.status}
                </Badge>
                <span className="text-xs font-semibold text-gray-600 bg-white px-2 py-0.5 rounded-md border border-cream-200">
                  {t.expenseCategories[viewExpense.category as keyof typeof t.expenseCategories] || viewExpense.category}
                </span>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                <span className="font-bold text-gray-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-maroon-700" />
                  खर्च तिथि
                </span>
                <span className="font-semibold text-gray-900 block text-sm">
                  {formatDate(viewExpense.expense_date)}
                </span>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                <span className="font-bold text-gray-400 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-maroon-700" />
                  भुगतान माध्यम
                </span>
                <span className="font-semibold text-gray-900 block uppercase text-sm font-mono">
                  {viewExpense.payment_method === 'cash'
                    ? 'नकद (Cash)'
                    : viewExpense.payment_method === 'upi'
                    ? 'UPI / ऑनलाइन'
                    : viewExpense.payment_method === 'bank_transfer'
                    ? 'बैंक ट्रांसफर'
                    : 'उधार (Credit)'}
                </span>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1 sm:col-span-2">
                <span className="font-bold text-gray-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-maroon-700" />
                  खर्चे का विवरण (Description)
                </span>
                <span className="font-semibold text-gray-900 block text-sm">
                  {viewExpense.description}
                </span>
              </div>

              {viewExpense.vendor_name && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1 sm:col-span-2">
                  <span className="font-bold text-gray-400 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-maroon-700" />
                    दुकानदार / वेंडर का नाम
                  </span>
                  <span className="font-semibold text-gray-900 block text-sm">
                    {viewExpense.vendor_name}
                  </span>
                </div>
              )}

              {viewExpense.status === 'voided' && viewExpense.void_reason && (
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 space-y-1 sm:col-span-2">
                  <span className="font-bold text-rose-700 flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5 text-rose-700" />
                    रद्द करने का कारण (Void Reason)
                  </span>
                  <span className="font-semibold block text-sm">
                    {viewExpense.void_reason}
                  </span>
                </div>
              )}
            </div>

            {/* Bill Photo Section */}
            <div className="p-3 bg-cream-50 rounded-xl border border-cream-200 space-y-2">
              <span className="font-bold text-gray-700 flex items-center gap-1.5 text-xs">
                <ImageIcon className="w-4 h-4 text-maroon-800" />
                {t.billPhoto}
              </span>
              {viewExpense.bill_image_path ? (
                <div className="rounded-lg overflow-hidden border border-gray-200 bg-white p-2 text-center">
                  <img
                    src={viewExpense.bill_image_path}
                    alt="Bill receipt"
                    className="max-h-48 mx-auto object-contain rounded-md"
                  />
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  {t.noBillPhoto}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <Button
                variant="secondary"
                onClick={() => setViewExpense(null)}
              >
                बंद करें (Close)
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Expense Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t.addExpense}
        maxWidth="md"
      >
        <form onSubmit={handleCreateExpenseSubmit} className="space-y-4 py-2">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="date"
              label="खर्च तिथि"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                खर्च श्रेणी (Category) *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {t.expenseCategories[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="number"
              step="0.01"
              label="खर्च राशि"
              prefixSymbol="₹"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                {t.paymentMethod}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
              >
                <option value="cash">नकद (Cash)</option>
                <option value="upi">UPI / ऑनलाइन</option>
                <option value="bank_transfer">बैंक ट्रांसफर (Bank Transfer)</option>
              </select>
            </div>
          </div>

          <Input
            label="खर्चे का विवरण (Description) *"
            placeholder="जैसे: जेनरेटर के लिए 5 लीटर डीजल"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />

          <Input
            label="विक्रेता / दुकानदार का नाम (Vendor)"
            placeholder="जैसे: गुप्ता पेट्रोल पंप, मिरहची"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
          />

          {/* Bill Photo Upload */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-800">
              बिल / रसीद की फोटो (Upload Bill Photo)
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-maroon-700 hover:bg-cream-50 cursor-pointer text-xs font-semibold text-gray-700 transition-all">
                <Upload className="w-4 h-4 text-maroon-800" />
                <span>{billImage ? billImage.name : 'फोटो चुनें'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setBillImage(e.target.files?.[0] || null)}
                />
              </label>
              {billImage && (
                <button
                  type="button"
                  onClick={() => setBillImage(null)}
                  className="text-xs text-rose-700 hover:underline"
                >
                  हटाएं
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAddModalOpen(false)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={createExpense.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Expense Modal */}
      <Modal
        isOpen={Boolean(expenseToEdit)}
        onClose={() => setExpenseToEdit(null)}
        title={t.editExpense}
        maxWidth="md"
      >
        <form onSubmit={handleEditExpenseSubmit} className="space-y-4 py-2">
          {editFormError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{editFormError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="date"
              label="खर्च तिथि"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              required
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                खर्च श्रेणी (Category) *
              </label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as ExpenseCategory)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {t.expenseCategories[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="number"
              step="0.01"
              label="खर्च राशि"
              prefixSymbol="₹"
              placeholder="0.00"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              required
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                {t.paymentMethod}
              </label>
              <select
                value={editPaymentMethod}
                onChange={(e) => setEditPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
              >
                <option value="cash">नकद (Cash)</option>
                <option value="upi">UPI / ऑनलाइन</option>
                <option value="bank_transfer">बैंक ट्रांसफर (Bank Transfer)</option>
              </select>
            </div>
          </div>

          <Input
            label="खर्चे का विवरण (Description) *"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            required
          />

          <Input
            label="विक्रेता / दुकानदार का नाम (Vendor)"
            value={editVendorName}
            onChange={(e) => setEditVendorName(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setExpenseToEdit(null)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={updateExpense.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Void Expense Modal */}
      <Modal
        isOpen={Boolean(expenseToVoid)}
        onClose={() => setExpenseToVoid(null)}
        title={t.voidExpense}
        maxWidth="sm"
      >
        <div className="space-y-4 py-2">
          <p className="text-xs text-gray-600">
            खर्चा रद्द करने पर यह लाभ-हानि गणना से हट जाएगा। रद्द करने का कारण लिखना अनिवार्य है।
          </p>

          <Input
            label={`${t.voidReason} *`}
            placeholder="जैसे: गलत राशि दर्ज हो गई थी..."
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setExpenseToVoid(null)}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmVoid}
              isLoading={voidExpense.isPending}
            >
              खर्चा रद्द करें (Void Expense)
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Expense Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(expenseToDelete)}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={handleConfirmDelete}
        title={t.deleteExpense}
        description={`क्या आप इस खर्चे (₹${expenseToDelete?.amount} - ${expenseToDelete?.description}) को हमेशा के लिए हटाना चाहते हैं?`}
        confirmText="हाँ, हटाएं"
        cancelText={t.cancel}
        variant="danger"
        isLoading={deleteExpense.isPending}
      />
    </div>
  );
};
