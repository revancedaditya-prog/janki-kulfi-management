import React, { useState } from 'react';
import { useExpenses, useCreateExpense, useVoidExpense } from '@/hooks/useExpenses';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
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
} from 'lucide-react';
import { ExpenseCategory, PaymentMethod } from '@/types';

export const ExpensesPage: React.FC = () => {
  const { data: expenses = [], isLoading } = useExpenses();
  const { t } = useLanguage();
  const { isOwner } = useAuth();
  const { isOnline, saveDraft } = useSync();

  const createExpense = useCreateExpense();
  const voidExpense = useVoidExpense();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [expenseToVoid, setExpenseToVoid] = useState<string | null>(null);
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
        alert('ऑफ़लाइन ड्राफ्ट सुरक्षित हो गया! कनेक्शन मिलने पर यह सिंक हो जाएगा।');
      } else {
        await createExpense.mutateAsync({
          expense_date: expenseDate,
          category,
          amount: amountNum,
          payment_method: paymentMethod,
          description,
          vendor_name: vendorName || undefined,
        });
      }
      setIsAddModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'खर्चा दर्ज करने में त्रुटि');
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
    } catch (err: any) {
      alert(err.message || 'खर्चा रद्द करने में त्रुटि');
    }
  };

  const totalActiveExpenses = expenses
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
            <span className="text-[10px] font-bold text-gray-500 block">कुल खर्चे (Active)</span>
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

      {/* Expenses Table */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-gray-500 mt-3">{t.loading}</p>
        </div>
      ) : expenses.length === 0 ? (
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
                  <th className="py-2.5">स्थिति</th>
                  <th className="py-2.5 text-right">क्रिया (Action)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenses.map((exp) => (
                  <tr
                    key={exp.id}
                    className={`hover:bg-cream-50/50 ${
                      exp.status === 'voided' ? 'opacity-50 line-through' : ''
                    }`}
                  >
                    <td className="py-2.5 font-sans font-semibold text-gray-900">
                      {formatDate(exp.expense_date)}
                    </td>
                    <td className="py-2.5">
                      <span className="font-semibold text-maroon-900 bg-cream-100 px-2 py-0.5 rounded-md">
                        {t.expenseCategories[exp.category as keyof typeof t.expenseCategories] || exp.category}
                      </span>
                    </td>
                    <td className="py-2.5 font-medium text-gray-700">
                      <div>
                        <span>{exp.description}</span>
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
                    <td className="py-2.5 uppercase font-mono font-bold text-gray-600">
                      {exp.payment_method}
                    </td>
                    <td className="py-2.5 text-right font-mono font-black text-sm text-gray-900">
                      {formatCurrency(exp.amount)}
                    </td>
                    <td className="py-2.5">
                      <Badge variant={exp.status}>
                        {exp.status === 'active' ? t.active : exp.status === 'voided' ? t.voided : exp.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      {exp.status === 'active' && isOwner && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-700 hover:bg-rose-50 h-8 px-2"
                          onClick={() => {
                            setExpenseToVoid(exp.id);
                            setVoidReason('');
                          }}
                        >
                          <Ban className="w-4 h-4 mr-1" />
                          {t.voidExpense}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
    </div>
  );
};
