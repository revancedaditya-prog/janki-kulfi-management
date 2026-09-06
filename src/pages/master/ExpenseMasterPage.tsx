import React, { useState } from 'react';
import {
  useExpenseHeads,
  useCreateExpenseHead,
  useUpdateExpenseHead,
  useDeleteOrArchiveExpenseHead,
  useRestoreExpenseHead,
} from '@/hooks/useExpenseMaster';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { formatCurrency } from '@/lib/formatters';
import {
  Plus,
  Edit2,
  Trash2,
  Archive,
  RotateCcw,
  CheckCircle2,
  FolderLock,
  Layers,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { ExpenseHead, ExpenseGroup, CalculationMode } from '@/types';

export const ExpenseMasterPage: React.FC = () => {
  const { isOwner } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'monthly_fixed' | 'variable_production' | 'archived'>('all');

  const { data: activeHeads = [], isLoading: isLoadingActive } = useExpenseHeads(false);
  const { data: allHeads = [], isLoading: isLoadingAll } = useExpenseHeads(true);

  const createHead = useCreateExpenseHead();
  const updateHead = useUpdateExpenseHead();
  const deleteOrArchiveHead = useDeleteOrArchiveExpenseHead();
  const restoreHead = useRestoreExpenseHead();

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHead, setEditingHead] = useState<ExpenseHead | null>(null);
  const [headToDelete, setHeadToDelete] = useState<ExpenseHead | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameHi, setNameHi] = useState('');
  const [expenseGroup, setExpenseGroup] = useState<ExpenseGroup>('monthly_fixed');
  const [calculationMode, setCalculationMode] = useState<CalculationMode>('manual');
  const [defaultAmount, setDefaultAmount] = useState('0');
  const [dueDay, setDueDay] = useState('5');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const openCreateModal = () => {
    setEditingHead(null);
    setCode(`EXP-${Math.floor(100 + Math.random() * 900)}`);
    setNameEn('');
    setNameHi('');
    setExpenseGroup('monthly_fixed');
    setCalculationMode('manual');
    setDefaultAmount('0');
    setDueDay('5');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setNotes('');
    setIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (head: ExpenseHead) => {
    setEditingHead(head);
    setCode(head.code);
    setNameEn(head.name_en);
    setNameHi(head.name_hi);
    setExpenseGroup(head.expense_group);
    setCalculationMode(head.calculation_mode);
    setDefaultAmount(String(head.default_amount || 0));
    setDueDay(String(head.due_day || 5));
    setStartDate(head.start_date || new Date().toISOString().split('T')[0]);
    setEndDate(head.end_date || '');
    setNotes(head.notes || '');
    setIsActive(head.is_active);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!code.trim()) {
      setFormError('यूनिक कोड आवश्यक है (Unique Code is required)');
      return;
    }
    if (!nameHi.trim() || !nameEn.trim()) {
      setFormError('हिंदी और अंग्रेजी दोनों नाम आवश्यक हैं');
      return;
    }
    const amt = Number(defaultAmount);
    if (isNaN(amt) || amt < 0) {
      setFormError('डिफ़ॉल्ट राशि मान्य संख्या होनी चाहिए');
      return;
    }
    const day = Number(dueDay);
    if (isNaN(day) || day < 1 || day > 31) {
      setFormError('नियत दिन 1 से 31 के बीच होना चाहिए');
      return;
    }

    try {
      if (editingHead) {
        await updateHead.mutateAsync({
          headId: editingHead.id,
          updates: {
            code: code.trim().toUpperCase(),
            name_en: nameEn.trim(),
            name_hi: nameHi.trim(),
            expense_group: expenseGroup,
            calculation_mode: calculationMode,
            default_amount: amt,
            due_day: day,
            start_date: startDate,
            end_date: endDate.trim() ? endDate : null,
            notes: notes.trim() ? notes : null,
            is_active: isActive,
          },
        });
        showToast('खर्च हेड सफलतापूर्वक अपडेट किया गया!');
      } else {
        await createHead.mutateAsync({
          code: code.trim().toUpperCase(),
          name_en: nameEn.trim(),
          name_hi: nameHi.trim(),
          expense_group: expenseGroup,
          calculation_mode: calculationMode,
          default_amount: amt,
          due_day: day,
          start_date: startDate,
          end_date: endDate.trim() ? endDate : null,
          notes: notes.trim() ? notes : null,
          is_active: isActive,
        });
        showToast('नया खर्च हेड सफलतापूर्वक बनाया गया!');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'खर्च हेड सहेजने में विफल');
    }
  };

  const handleDeleteOrArchive = async () => {
    if (!headToDelete) return;
    try {
      const res = await deleteOrArchiveHead.mutateAsync(headToDelete.id);
      if (res?.action === 'archived') {
        showToast('खर्च हेड का पिछला रिकॉर्ड था, इसलिए इसे सुरक्षित रूप से संग्रहित (Archive) कर दिया गया।');
      } else {
        showToast('अप्रयुक्त खर्च हेड सफलतापूर्वक हटा दिया गया।');
      }
      setHeadToDelete(null);
    } catch (err: any) {
      showToast(err.message || 'कार्रवाई विफल रही', 'error');
    }
  };

  const handleRestore = async (head: ExpenseHead) => {
    try {
      await restoreHead.mutateAsync(head.id);
      showToast('खर्च हेड पुनः सक्रिय (Restore) कर दिया गया!');
    } catch (err: any) {
      showToast(err.message || 'रीस्टोर विफल रहा', 'error');
    }
  };

  // Filter list by tab
  const displayList = (activeTab === 'archived' ? allHeads.filter((h) => h.is_archived) : activeHeads).filter((h) => {
    if (activeTab === 'monthly_fixed') return h.expense_group === 'monthly_fixed';
    if (activeTab === 'variable_production') return h.expense_group === 'variable_production';
    return true;
  });

  const fixedCount = activeHeads.filter((h) => h.expense_group === 'monthly_fixed').length;
  const variableCount = activeHeads.filter((h) => h.expense_group === 'variable_production').length;
  const archivedCount = allHeads.filter((h) => h.is_archived).length;

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

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-maroon-900 via-maroon-850 to-maroon-800 p-4 sm:p-6 rounded-2xl text-white shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-white/10 backdrop-blur-sm">
              <FolderLock className="w-6 h-6 text-amber-300" />
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">खर्च मास्टर (Expense Master)</h2>
              <p className="text-xs sm:text-sm text-cream-200 mt-0.5">
                मासिक स्थायी खर्चे व उत्पादन लागत हेड का सुरक्षित प्रबंधन
              </p>
            </div>
          </div>
        </div>

        {isOwner && (
          <Button
            variant="secondary"
            className="bg-amber-400 hover:bg-amber-300 text-maroon-950 font-black shadow-sm min-h-[44px]"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={openCreateModal}
          >
            + नया खर्च हेड जोड़ें
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs sm:text-sm font-bold">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap min-h-[44px] flex items-center gap-2 ${
            activeTab === 'all'
              ? 'bg-maroon-800 text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-cream-100 border border-cream-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>सभी सक्रिय ({activeHeads.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('monthly_fixed')}
          className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap min-h-[44px] flex items-center gap-2 ${
            activeTab === 'monthly_fixed'
              ? 'bg-maroon-800 text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-cream-100 border border-cream-200'
          }`}
        >
          <Calendar className="w-4 h-4 text-amber-500" />
          <span>मासिक स्थायी खर्च ({fixedCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('variable_production')}
          className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap min-h-[44px] flex items-center gap-2 ${
            activeTab === 'variable_production'
              ? 'bg-maroon-800 text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-cream-100 border border-cream-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-sky-500" />
          <span>उत्पादन लागत हेड ({variableCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('archived')}
          className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap min-h-[44px] flex items-center gap-2 ${
            activeTab === 'archived'
              ? 'bg-gray-800 text-white shadow-sm'
              : 'bg-white text-gray-600 hover:bg-cream-100 border border-cream-200'
          }`}
        >
          <Archive className="w-4 h-4 text-gray-400" />
          <span>संग्रहीत (Archived) ({archivedCount})</span>
        </button>
      </div>

      {/* Expense Heads List / Cards */}
      {isLoadingActive || isLoadingAll ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displayList.length === 0 ? (
        <Card className="p-8 text-center bg-white border-dashed border-2 border-cream-300">
          <FolderLock className="w-12 h-12 text-cream-400 mx-auto mb-2" />
          <h4 className="text-base font-bold text-gray-800">कोई खर्च हेड नहीं मिला</h4>
          <p className="text-xs text-gray-500 mt-1">नया हेड जोड़ने के लिए ऊपर दिए गए बटन पर क्लिक करें।</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {displayList.map((head) => (
            <Card
              key={head.id}
              className={`p-4 bg-white border transition-all flex flex-col justify-between ${
                head.is_archived
                  ? 'border-gray-300 opacity-75 bg-gray-50'
                  : head.is_active
                  ? 'border-cream-300 hover:border-maroon-400 shadow-sm'
                  : 'border-rose-200 bg-rose-50/30'
              }`}
            >
              <div className="space-y-2.5">
                {/* Top Badge & Code */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold text-gray-500 bg-cream-100 px-2 py-0.5 rounded-lg border border-cream-200">
                    {head.code}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={
                        head.expense_group === 'monthly_fixed'
                          ? 'warning'
                          : 'info'
                      }
                      className="text-[10px]"
                    >
                      {head.expense_group === 'monthly_fixed' ? 'मासिक स्थायी' : 'उत्पादन लागत'}
                    </Badge>

                    {head.is_archived ? (
                      <Badge variant="default" className="text-[10px] bg-gray-200 text-gray-700">
                        संग्रहीत
                      </Badge>
                    ) : head.is_active ? (
                      <Badge variant="success" className="text-[10px]">
                        सक्रिय
                      </Badge>
                    ) : (
                      <Badge variant="danger" className="text-[10px]">
                        निष्क्रिय
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Names */}
                <div>
                  <h3 className="text-base font-black text-gray-900 leading-snug">{head.name_hi}</h3>
                  <p className="text-xs font-semibold text-gray-500">{head.name_en}</p>
                </div>

                {/* Details Metrics */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-gray-600 block">डिफ़ॉल्ट राशि</span>
                    <span className="font-mono font-black text-gray-900 text-sm">
                      {head.calculation_mode === 'automatic' ? (
                        <span className="text-sky-700 font-sans text-xs">ऑटोमैटिक (Auto)</span>
                      ) : (
                        formatCurrency(head.default_amount)
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-gray-600 block">हर महीने की तारीख</span>
                    <span className="font-mono font-bold text-gray-800 text-xs">
                      {head.due_day} तारीख को नियत
                    </span>
                  </div>
                </div>

                {head.notes && (
                  <p className="text-[11px] text-gray-700 bg-cream-50 p-2 rounded-lg border border-cream-200 line-clamp-2">
                    {head.notes}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              {isOwner && (
                <div className="flex items-center gap-2 pt-3 mt-3 border-t border-gray-100">
                  {head.is_archived ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[40px] text-xs font-bold text-emerald-800 border-emerald-300 hover:bg-emerald-50"
                      leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                      onClick={() => handleRestore(head)}
                    >
                      पुनः सक्रिय करें (Restore)
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-h-[40px] text-xs font-bold"
                        leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                        onClick={() => openEditModal(head)}
                      >
                        एडिट करें
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        className="min-h-[40px] px-3 text-xs"
                        onClick={() => setHeadToDelete(head)}
                        title="हटाएं या संग्रहित करें"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingHead ? 'खर्च हेड संपादित करें (Edit Expense Head)' : 'नया खर्च हेड जोड़ें (Add Expense Head)'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="यूनिक कोड (Unique Code) *"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="उदा. EXP-RENT-01"
              required
            />

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700">
                खर्च ग्रुप (Expense Group) *
              </label>
              <select
                value={expenseGroup}
                onChange={(e) => setExpenseGroup(e.target.value as ExpenseGroup)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 min-h-[44px]"
              >
                <option value="monthly_fixed">मासिक स्थायी खर्च (Monthly Fixed)</option>
                <option value="variable_production">उत्पादन लागत (Variable Production)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="हिंदी नाम (Hindi Name) *"
              value={nameHi}
              onChange={(e) => setNameHi(e.target.value)}
              placeholder="उदा. दुकान/कारखाना किराया"
              required
            />

            <Input
              label="अंग्रेजी नाम (English Name) *"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="e.g. Factory / Shop Rent"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700">गणना का प्रकार (Mode) *</label>
              <select
                value={calculationMode}
                onChange={(e) => setCalculationMode(e.target.value as CalculationMode)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 min-h-[44px]"
              >
                <option value="manual">मैनुअल दर्ज (Manual Entry)</option>
                <option value="automatic">ऑटोमैटिक (Batch / LPG Consumption)</option>
              </select>
            </div>

            <Input
              type="number"
              label="डिफ़ॉल्ट राशि (₹ Expected)"
              value={defaultAmount}
              onChange={(e) => setDefaultAmount(e.target.value)}
              min="0"
              step="any"
              disabled={calculationMode === 'automatic'}
            />

            <Input
              type="number"
              label="नियत दिन (Due Day 1-31)"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              min="1"
              max="31"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="date"
              label="लागू होने की तारीख (Start Date)"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />

            <Input
              type="date"
              label="समाप्ति तारीख (End Date - Optional)"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">विवरण / नोट्स (Notes)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="अतिरिक्त जानकारी या संदर्भ..."
              className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-maroon-700"
            />
          </div>

          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-cream-50 border border-cream-200">
            <input
              type="checkbox"
              id="isActiveHead"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-5 h-5 rounded text-maroon-800 focus:ring-maroon-700 border-gray-300"
            />
            <label htmlFor="isActiveHead" className="text-xs font-bold text-gray-800 cursor-pointer">
              यह खर्च हेड सक्रिय है (Active for monthly reminders)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="min-h-[44px]"
            >
              रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="min-h-[44px] px-6"
              disabled={createHead.isPending || updateHead.isPending}
            >
              {createHead.isPending || updateHead.isPending ? 'सहेज रहे हैं...' : 'सहेजें (Save Head)'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete / Archive Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!headToDelete}
        onClose={() => setHeadToDelete(null)}
        onConfirm={handleDeleteOrArchive}
        title="खर्च हेड हटाएं या संग्रहित करें"
        description={`क्या आप निश्चित रूप से "${headToDelete?.name_hi} (${headToDelete?.name_en})" को हटाना चाहते हैं? यदि इसका पुराना खर्च इतिहास है, तो यह सुरक्षित रूप से संग्रहित (Archive) होगा और कोई डेटा नष्ट नहीं होगा।`}
        confirmText="हाँ, हटाएं / Archive करें"
        cancelText="रद्द करें"
        variant="danger"
      />
    </div>
  );
};
export default ExpenseMasterPage;
