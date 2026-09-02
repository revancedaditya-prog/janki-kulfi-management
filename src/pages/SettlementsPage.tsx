import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  useSellerSettlements,
  useProcessSettlement,
  useApproveSettlement,
  useUpdatePendingSettlement,
  useCorrectApprovedSettlement,
  useDeleteSellerSettlement,
  useSettlementRevisionHistory,
} from '@/hooks/useSettlements';
import { useSellerIssues } from '@/hooks/useSellers';
import { useDailyClosings } from '@/hooks/useDailyClosing';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RevisionHistoryModal } from '@/components/common/RevisionHistoryModal';
import {
  formatCurrency,
  formatDate,
  getTodayDateString,
} from '@/lib/formatters';
import {
  calculateSettlementSummary,
  calculateSettlementItem,
  SettlementItemInput,
} from '@/lib/calculations';
import {
  Receipt,
  Plus,
  CheckCircle,
  Printer,
  AlertCircle,
  Edit3,
  History,
  Lock,
  ArrowRight,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { SellerSettlementWithDetails } from '@/types';

export const SettlementsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: settlements = [], isLoading } = useSellerSettlements();
  const { data: issues = [] } = useSellerIssues();
  const { data: closings = [] } = useDailyClosings();
  const { t, language } = useLanguage();
  const { isOwner } = useAuth();
  const { isOnline, saveDraft } = useSync();

  const processSettlement = useProcessSettlement();
  const approveSettlement = useApproveSettlement();
  const updatePendingSettlement = useUpdatePendingSettlement();
  const correctApprovedSettlement = useCorrectApprovedSettlement();
  const deleteSettlement = useDeleteSellerSettlement();

  const [isNewModalOpen, setIsNewModalOpen] = useState(searchParams.get('new') === 'true');
  const [selectedIssueId, setSelectedIssueId] = useState<string>('');
  const [settlementDate, setSettlementDate] = useState<string>(getTodayDateString());
  const [cashReceived, setCashReceived] = useState<string>('0');
  const [upiReceived, setUpiReceived] = useState<string>('0');
  const [creditAmount, setCreditAmount] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const [settlementToDelete, setSettlementToDelete] = useState<SellerSettlementWithDetails | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Edit Pending / Correct Approved / Revision History State
  const [editingPendingSettlement, setEditingPendingSettlement] = useState<SellerSettlementWithDetails | null>(null);
  const [correctingSettlement, setCorrectingSettlement] = useState<SellerSettlementWithDetails | null>(null);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [historySettlementId, setHistorySettlementId] = useState<string | null>(null);

  const { data: revisionHistory = [], isLoading: isHistoryLoading } = useSettlementRevisionHistory(
    historySettlementId || undefined
  );

  // Per-item return/damage/complimentary inputs
  const [itemInputs, setItemInputs] = useState<
    Record<
      string,
      {
        returned_qty: number;
        damaged_qty: number;
        comp_qty: number;
        damage_reason: string;
        comp_reason: string;
      }
    >
  >({});

  // Receipt Modal
  const [receiptSettlement, setReceiptSettlement] = useState<SellerSettlementWithDetails | null>(null);
  const [settlementToApprove, setSettlementToApprove] = useState<string | null>(null);

  const isDayClosed = (dateStr: string) =>
    closings.find((c) => c.business_date === dateStr)?.status === 'closed';

  const openIssues = issues.filter(
    (i) => i.status === 'issued' || i.status === 'partially_settled'
  );

  const handleOpenNewModal = () => {
    const defaultIssue = openIssues[0];
    if (defaultIssue) {
      setSelectedIssueId(defaultIssue.id);
      initializeItemInputs(defaultIssue.id);
    } else {
      setSelectedIssueId('');
    }
    setSettlementDate(getTodayDateString());
    setCashReceived('0');
    setUpiReceived('0');
    setCreditAmount('0');
    setNotes('');
    setFormError(null);
    setIsNewModalOpen(true);
  };

  const initializeItemInputs = (issueId: string) => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;
    const initial: Record<string, any> = {};
    issue.items.forEach((it) => {
      initial[it.id] = {
        returned_qty: 0,
        damaged_qty: 0,
        comp_qty: 0,
        damage_reason: '',
        comp_reason: '',
      };
    });
    setItemInputs(initial);
  };

  const handleOpenEditPending = (st: SellerSettlementWithDetails) => {
    setSelectedIssueId(st.seller_issue_id);
    const initial: Record<string, any> = {};
    st.items.forEach((it) => {
      initial[it.seller_issue_item_id || it.id] = {
        returned_qty: it.returned_quantity,
        damaged_qty: it.damaged_quantity,
        comp_qty: it.complimentary_quantity,
        damage_reason: it.damage_reason || '',
        comp_reason: it.complimentary_reason || '',
      };
    });
    setItemInputs(initial);
    setSettlementDate(st.settlement_date);
    setCashReceived(String(st.cash_received));
    setUpiReceived(String(st.upi_received));
    setCreditAmount(String(st.credit_amount));
    setNotes(st.notes || '');
    setFormError(null);
    setEditingPendingSettlement(st);
  };

  const handleOpenCorrect = (st: SellerSettlementWithDetails) => {
    setSelectedIssueId(st.seller_issue_id);
    const initial: Record<string, any> = {};
    st.items.forEach((it) => {
      initial[it.seller_issue_item_id || it.id] = {
        returned_qty: it.returned_quantity,
        damaged_qty: it.damaged_quantity,
        comp_qty: it.complimentary_quantity,
        damage_reason: it.damage_reason || '',
        comp_reason: it.complimentary_reason || '',
      };
    });
    setItemInputs(initial);
    setSettlementDate(st.settlement_date);
    setCashReceived(String(st.cash_received));
    setUpiReceived(String(st.upi_received));
    setCreditAmount(String(st.credit_amount));
    setNotes(st.notes || '');
    setCorrectionReason('');
    setFormError(null);
    setCorrectingSettlement(st);
  };

  const handleIssueSelect = (issueId: string) => {
    setSelectedIssueId(issueId);
    initializeItemInputs(issueId);
  };

  const handleItemFieldChange = (
    itemId: string,
    field: 'returned_qty' | 'damaged_qty' | 'comp_qty' | 'damage_reason' | 'comp_reason',
    value: any
  ) => {
    setItemInputs((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  // Find currently selected issue
  const currentIssue =
    issues.find((i) => i.id === selectedIssueId) ||
    issues.find((i) => i.id === editingPendingSettlement?.seller_issue_id) ||
    issues.find((i) => i.id === correctingSettlement?.seller_issue_id);

  // Build calculation items dynamically
  const calculationItems: SettlementItemInput[] = (currentIssue?.items || []).map((it) => {
    const inp = itemInputs[it.id] || {
      returned_qty: 0,
      damaged_qty: 0,
      comp_qty: 0,
    };
    return {
      issued_quantity: it.issued_quantity,
      returned_quantity: inp.returned_qty,
      damaged_quantity: inp.damaged_qty,
      complimentary_quantity: inp.comp_qty,
      unit_selling_price: it.unit_selling_price_snapshot,
      commission_type: it.commission_type_snapshot as any,
      commission_value: it.commission_value_snapshot,
    };
  });

  const cashNum = parseFloat(cashReceived) || 0;
  const upiNum = parseFloat(upiReceived) || 0;
  const creditNum = parseFloat(creditAmount) || 0;

  // Live calculated financial summary
  const summary = calculateSettlementSummary(
    calculationItems,
    cashNum,
    upiNum,
    creditNum
  );

  // Submit New Settlement
  const handleSubmitSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedIssueId || !currentIssue) {
      setFormError('कृपया निकासी पर्ची चुनें');
      return;
    }

    const items = currentIssue.items.map((it) => {
      const inp = itemInputs[it.id] || {
        returned_qty: 0,
        damaged_qty: 0,
        comp_qty: 0,
        damage_reason: '',
        comp_reason: '',
      };
      return {
        issue_item_id: it.id,
        returned_quantity: inp.returned_qty,
        damaged_quantity: inp.damaged_qty,
        complimentary_quantity: inp.comp_qty,
        damage_reason: inp.damage_reason,
        complimentary_reason: inp.comp_reason,
      };
    });

    for (const it of currentIssue.items) {
      const inp = itemInputs[it.id] || { returned_qty: 0, damaged_qty: 0, comp_qty: 0 };
      const nonSold = inp.returned_qty + inp.damaged_qty + inp.comp_qty;
      if (nonSold > it.issued_quantity) {
        setFormError(
          `वापसी+खराब+मुफ्त मात्रा (${nonSold}) दी गई मात्रा (${it.issued_quantity}) से अधिक नहीं हो सकती!`
        );
        return;
      }
    }

    try {
      if (!isOnline) {
        await saveDraft('seller_settlement', {
          issue_id: selectedIssueId,
          settlement_date: settlementDate,
          items,
          cash_received: cashNum,
          upi_received: upiNum,
          credit_amount: creditNum,
          notes,
        });
        alert('ऑफ़लाइन हिसाब सुरक्षित हो गया! कनेक्शन आने पर स्वतः सिंक हो जाएगा।');
      } else {
        await processSettlement.mutateAsync({
          issueId: selectedIssueId,
          settlementDate,
          items,
          cashReceived: cashNum,
          upiReceived: upiNum,
          creditAmount: creditNum,
          notes,
        });
      }
      setIsNewModalOpen(false);
      setSearchParams({});
    } catch (err: any) {
      setFormError(err.message || 'हिसाब दर्ज करने में त्रुटि हुई');
    }
  };

  // Submit Edit Pending Settlement
  const handleUpdatePendingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPendingSettlement || !currentIssue) return;
    setFormError(null);

    const items = currentIssue.items.map((it) => {
      const inp = itemInputs[it.id] || {
        returned_qty: 0,
        damaged_qty: 0,
        comp_qty: 0,
        damage_reason: '',
        comp_reason: '',
      };
      return {
        issue_item_id: it.id,
        returned_quantity: inp.returned_qty,
        damaged_quantity: inp.damaged_qty,
        complimentary_quantity: inp.comp_qty,
        damage_reason: inp.damage_reason,
        complimentary_reason: inp.comp_reason,
      };
    });

    try {
      await updatePendingSettlement.mutateAsync({
        settlementId: editingPendingSettlement.id,
        items,
        cashReceived: cashNum,
        upiReceived: upiNum,
        creditAmount: creditNum,
        notes,
      });
      setEditingPendingSettlement(null);
    } catch (err: any) {
      setFormError(err.message || 'पेंडिंग हिसाब अपडेट करने में त्रुटि हुई');
    }
  };

  // Submit Correct Approved Settlement
  const handleCorrectApprovedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingSettlement || !currentIssue) return;
    setFormError(null);

    if (!correctionReason || correctionReason.trim().length < 5) {
      setFormError('कृपया सुधार का कारण (कम से कम 5 अक्षर) दर्ज करें');
      return;
    }

    if (isDayClosed(correctingSettlement.settlement_date)) {
      setFormError(
        `दिन (${correctingSettlement.settlement_date}) बंद है। सुधार से पहले दैनिक क्लोजिंग को पुनः खोलें।`
      );
      return;
    }

    const items = currentIssue.items.map((it) => {
      const inp = itemInputs[it.id] || {
        returned_qty: 0,
        damaged_qty: 0,
        comp_qty: 0,
        damage_reason: '',
        comp_reason: '',
      };
      return {
        issue_item_id: it.id,
        returned_quantity: inp.returned_qty,
        damaged_quantity: inp.damaged_qty,
        complimentary_quantity: inp.comp_qty,
        damage_reason: inp.damage_reason,
        complimentary_reason: inp.comp_reason,
      };
    });

    try {
      await correctApprovedSettlement.mutateAsync({
        settlementId: correctingSettlement.id,
        settlementDate,
        cashReceived: cashNum,
        upiReceived: upiNum,
        creditAmount: creditNum,
        items,
        notes,
        reason: correctionReason,
      });
      setCorrectingSettlement(null);
    } catch (err: any) {
      setFormError(err.message || 'हिसाब सुधारने में त्रुटि हुई');
    }
  };

  const handleConfirmApprove = async () => {
    if (!settlementToApprove) return;
    try {
      await approveSettlement.mutateAsync(settlementToApprove);
      setSettlementToApprove(null);
    } catch (err: any) {
      alert(err.message || 'हिसाब स्वीकृत करने में त्रुटि हुई');
    }
  };

  const handleConfirmDelete = async () => {
    if (!settlementToDelete) return;
    setDeleteError(null);
    try {
      await deleteSettlement.mutateAsync({
        settlementId: settlementToDelete.id,
        reason: deleteReason.trim() || 'Deleted by Owner',
      });
      setSettlementToDelete(null);
      setDeleteReason('');
    } catch (err: any) {
      setDeleteError(err.message || 'हिसाब हटाने में त्रुटि हुई');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-maroon-800" />
            {t.settlements}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            शाम की वापसी, बिकी कुल्फी, कमीशन, वसूली एवं सुरक्षित संशोधन इतिहास
          </p>
        </div>

        <Button
          variant="primary"
          leftIcon={<Plus className="w-5 h-5" />}
          onClick={handleOpenNewModal}
        >
          {t.newSettlement}
        </Button>
      </div>

      {/* Settlements List */}
      {isLoading ? (
        <Card className="py-12 text-center text-gray-500">{t.loading}</Card>
      ) : settlements.length === 0 ? (
        <Card className="text-center py-12">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Receipt className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-900">
            कोई हिसाब रिकॉर्ड नहीं मिला
          </h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            शाम को विक्रेता की वापसी और नकद वसूली दर्ज करने के लिए नया हिसाब जोड़ें।
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-4"
            onClick={handleOpenNewModal}
          >
            {t.newSettlement}
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {settlements.map((st) => {
            const totalSold = st.items.reduce((s, it) => s + it.sold_quantity, 0);
            const closed = isDayClosed(st.settlement_date);

            return (
              <Card key={st.id} className="overflow-hidden border-cream-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono font-bold text-base text-maroon-950">
                        {st.settlement_number}
                      </span>
                      {st.version_number && st.version_number > 1 && (
                        <Badge variant="warning">
                          {t.version} {st.version_number}
                        </Badge>
                      )}
                      <Badge variant={st.status}>
                        {st.status === 'approved'
                          ? t.approved
                          : st.status === 'pending_approval'
                          ? t.pending
                          : st.status === 'superseded'
                          ? t.superseded
                          : st.status}
                      </Badge>
                      {closed && (
                        <Badge variant="danger">
                          <Lock className="w-3 h-3 mr-1 inline" />
                          {language === 'hi' ? 'दिन बंद है' : 'Day Closed'}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs font-bold text-gray-800 block mt-0.5">
                      👤 {st.seller?.full_name} | 📅 {formatDate(st.settlement_date)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Printer className="w-4 h-4" />}
                      onClick={() => setReceiptSettlement(st)}
                    >
                      {t.printReceipt}
                    </Button>

                    {st.status === 'pending_approval' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                          onClick={() => handleOpenEditPending(st)}
                        >
                          {t.editDraft}
                        </Button>
                        {isOwner && (
                          <Button
                            size="sm"
                            variant="primary"
                            leftIcon={<CheckCircle className="w-4 h-4" />}
                            onClick={() => setSettlementToApprove(st.id)}
                          >
                            {t.approveSettlement}
                          </Button>
                        )}
                      </>
                    )}

                    {st.status === 'approved' && isOwner && (
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={closed ? <Lock className="w-3.5 h-3.5 text-rose-600" /> : <Edit3 className="w-3.5 h-3.5" />}
                        onClick={() => handleOpenCorrect(st)}
                      >
                        {t.correctRecord}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<History className="w-3.5 h-3.5" />}
                      onClick={() => setHistorySettlementId(st.id)}
                    >
                      {t.revisionHistory}
                    </Button>

                    {/* Owner Delete Button */}
                    {isOwner && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                        onClick={() => {
                          setSettlementToDelete(st);
                          setDeleteReason('');
                          setDeleteError(null);
                        }}
                      >
                        {t.deleteSettlement || 'हटाएं'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Financial Summary Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-cream-50 border border-cream-200">
                    <span className="text-gray-500 block">कुल बिक्री (Gross)</span>
                    <span className="font-bold text-sm text-gray-900 block mt-0.5">
                      {formatCurrency(st.gross_sales)}
                    </span>
                    <span className="text-[10px] text-gray-500">{totalSold} {t.pieces} बिकी</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-cream-50 border border-cream-200">
                    <span className="text-gray-500 block">विक्रेता कमीशन</span>
                    <span className="font-bold text-sm text-maroon-800 block mt-0.5">
                      {formatCurrency(st.total_commission)}
                    </span>
                    <span className="text-[10px] text-gray-500">कटा हुआ</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <span className="text-emerald-800 font-semibold block">प्राप्त (Cash+UPI)</span>
                    <span className="font-bold text-sm text-emerald-900 block mt-0.5">
                      {formatCurrency(st.total_received)}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      नकद: {formatCurrency(st.cash_received, false)} | UPI: {formatCurrency(st.upi_received, false)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
                    <span className="text-amber-800 font-semibold block">कमी / उधार</span>
                    <span className="font-bold text-sm text-amber-900 block mt-0.5">
                      {st.shortage_amount > 0 ? (
                        <span className="text-rose-700">कमी: {formatCurrency(st.shortage_amount)}</span>
                      ) : (
                        <span>उधार: {formatCurrency(st.credit_amount)}</span>
                      )}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      अपेक्षित: {formatCurrency(st.expected_collection)}
                    </span>
                  </div>
                </div>

                {/* Items Detail Preview */}
                <div className="pt-2 border-t border-gray-100 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                  {st.items.map((it) => (
                    <span key={it.id}>
                      <strong className="text-gray-900">
                        {language === 'hi' ? it.product?.name_hi : it.product?.name_en}:
                      </strong>{' '}
                      दी: {it.issued_quantity_snapshot} | वापसी: {it.returned_quantity} | खराब: {it.damaged_quantity} | बिकी:{' '}
                      <strong className="text-emerald-800">{it.sold_quantity}</strong>
                    </span>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Settlement Modal */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => {
          setIsNewModalOpen(false);
          setSearchParams({});
        }}
        title={t.newSettlement}
        subtitle="ठेले से वापसी, खराब, मुफ्त कुल्फी एवं वसूली का हिसाब"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmitSettlement} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                {t.selectOpenIssue} *
              </label>
              <select
                value={selectedIssueId}
                onChange={(e) => handleIssueSelect(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
                required
              >
                <option value="" disabled>
                  -- बकाया निकासी चुनें --
                </option>
                {openIssues.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.issue_number} - {i.seller?.full_name} ({formatDate(i.issue_date)})
                  </option>
                ))}
              </select>
            </div>

            <Input
              type="date"
              label="हिसाब तिथि"
              value={settlementDate}
              onChange={(e) => setSettlementDate(e.target.value)}
              required
            />
          </div>

          {/* Product Items Breakdown */}
          {currentIssue ? (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                उत्पाद वापसी व बिक्री का विवरण (Pieces)
              </h4>

              <div className="space-y-3">
                {currentIssue.items.map((it) => {
                  const inp = itemInputs[it.id] || {
                    returned_qty: 0,
                    damaged_qty: 0,
                    comp_qty: 0,
                    damage_reason: '',
                    comp_reason: '',
                  };
                  const res = calculateSettlementItem({
                    issued_quantity: it.issued_quantity,
                    returned_quantity: inp.returned_qty,
                    damaged_quantity: inp.damaged_qty,
                    complimentary_quantity: inp.comp_qty,
                    unit_selling_price: it.unit_selling_price_snapshot,
                    commission_type: it.commission_type_snapshot as any,
                    commission_value: it.commission_value_snapshot,
                  });

                  return (
                    <div
                      key={it.id}
                      className="p-3.5 rounded-2xl bg-cream-50 border border-cream-200 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-sm text-gray-900 block">
                            {language === 'hi' ? it.product?.name_hi : it.product?.name_en}
                          </span>
                          <span className="text-xs text-gray-500">
                            दी गई मात्रा: <strong className="font-mono">{it.issued_quantity}</strong> | दर: {formatCurrency(it.unit_selling_price_snapshot)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-gray-500 block">कुल बिकी पीस:</span>
                          <span className="font-mono font-black text-lg text-emerald-800">
                            {res.sold_quantity} {t.pieces}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          type="number"
                          label={t.returnedQty}
                          isPieceQuantity
                          value={inp.returned_qty}
                          onChange={(e) =>
                            handleItemFieldChange(it.id, 'returned_qty', parseInt(e.target.value, 10) || 0)
                          }
                        />
                        <Input
                          type="number"
                          label={t.damagedQty}
                          isPieceQuantity
                          value={inp.damaged_qty}
                          onChange={(e) =>
                            handleItemFieldChange(it.id, 'damaged_qty', parseInt(e.target.value, 10) || 0)
                          }
                        />
                        <Input
                          type="number"
                          label={t.compQty}
                          isPieceQuantity
                          value={inp.comp_qty}
                          onChange={(e) =>
                            handleItemFieldChange(it.id, 'comp_qty', parseInt(e.target.value, 10) || 0)
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-50 text-amber-900 text-xs">
              कृपया पहले ऊपर से एक सक्रिय निकासी पर्ची चुनें।
            </div>
          )}

          {/* Collection & Payment Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <Input
              type="number"
              step="0.01"
              label={`${t.cashReceived} (₹)`}
              prefixSymbol="₹"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              label={`${t.upiReceived} (₹)`}
              prefixSymbol="₹"
              value={upiReceived}
              onChange={(e) => setUpiReceived(e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              label={`${t.approvedCredit} (₹)`}
              prefixSymbol="₹"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
          </div>

          {/* Live Summary Box */}
          <div className="p-3.5 rounded-2xl bg-cream-100/60 border border-cream-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-gray-500 block">कुल बिक्री</span>
              <span className="font-bold text-sm text-gray-900">{formatCurrency(summary.gross_sales)}</span>
            </div>
            <div>
              <span className="text-gray-500 block">कमीशन</span>
              <span className="font-bold text-sm text-maroon-800">{formatCurrency(summary.total_commission)}</span>
            </div>
            <div>
              <span className="text-emerald-800 font-semibold block">अपेक्षित वसूली</span>
              <span className="font-bold text-sm text-emerald-950">{formatCurrency(summary.expected_collection)}</span>
            </div>
            <div>
              <span className="text-amber-800 font-semibold block">कुल प्राप्त</span>
              <span className="font-bold text-sm text-amber-950">{formatCurrency(summary.total_received)}</span>
            </div>
          </div>

          <Input
            label="टिप्पणी (Notes)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsNewModalOpen(false);
                setSearchParams({});
              }}
            >
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={processSettlement.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Pending Settlement Modal */}
      <Modal
        isOpen={Boolean(editingPendingSettlement)}
        onClose={() => setEditingPendingSettlement(null)}
        title={`${t.editDraft}: ${editingPendingSettlement?.settlement_number}`}
        subtitle="स्वीकृति से पूर्व हिसाब व वापसी मात्रा संशोधित करें"
        maxWidth="lg"
      >
        <form onSubmit={handleUpdatePendingSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {currentIssue && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                उत्पाद वापसी संशोधन (Pieces)
              </h4>

              <div className="space-y-3">
                {currentIssue.items.map((it) => {
                  const inp = itemInputs[it.id] || {
                    returned_qty: 0,
                    damaged_qty: 0,
                    comp_qty: 0,
                    damage_reason: '',
                    comp_reason: '',
                  };
                  const res = calculateSettlementItem({
                    issued_quantity: it.issued_quantity,
                    returned_quantity: inp.returned_qty,
                    damaged_quantity: inp.damaged_qty,
                    complimentary_quantity: inp.comp_qty,
                    unit_selling_price: it.unit_selling_price_snapshot,
                    commission_type: it.commission_type_snapshot as any,
                    commission_value: it.commission_value_snapshot,
                  });

                  return (
                    <div
                      key={it.id}
                      className="p-3.5 rounded-2xl bg-cream-50 border border-cream-200 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-sm text-gray-900 block">
                            {language === 'hi' ? it.product?.name_hi : it.product?.name_en}
                          </span>
                          <span className="text-xs text-gray-500">
                            दी गई मात्रा: {it.issued_quantity}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-gray-500 block">कुल बिकी पीस:</span>
                          <span className="font-mono font-black text-lg text-emerald-800">
                            {res.sold_quantity} {t.pieces}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          type="number"
                          label={t.returnedQty}
                          isPieceQuantity
                          value={inp.returned_qty}
                          onChange={(e) =>
                            handleItemFieldChange(it.id, 'returned_qty', parseInt(e.target.value, 10) || 0)
                          }
                        />
                        <Input
                          type="number"
                          label={t.damagedQty}
                          isPieceQuantity
                          value={inp.damaged_qty}
                          onChange={(e) =>
                            handleItemFieldChange(it.id, 'damaged_qty', parseInt(e.target.value, 10) || 0)
                          }
                        />
                        <Input
                          type="number"
                          label={t.compQty}
                          isPieceQuantity
                          value={inp.comp_qty}
                          onChange={(e) =>
                            handleItemFieldChange(it.id, 'comp_qty', parseInt(e.target.value, 10) || 0)
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <Input
              type="number"
              step="0.01"
              label={`${t.cashReceived} (₹)`}
              prefixSymbol="₹"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              label={`${t.upiReceived} (₹)`}
              prefixSymbol="₹"
              value={upiReceived}
              onChange={(e) => setUpiReceived(e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              label={`${t.approvedCredit} (₹)`}
              prefixSymbol="₹"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <Button type="button" variant="secondary" onClick={() => setEditingPendingSettlement(null)}>
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={updatePendingSettlement.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Correct Approved Settlement Modal (Owner Only) */}
      <Modal
        isOpen={Boolean(correctingSettlement)}
        onClose={() => setCorrectingSettlement(null)}
        title={`${t.correctRecord}: ${correctingSettlement?.settlement_number}`}
        subtitle="पुराने वित्तीय व स्टॉक असर को उलटकर नया स्वीकृत हिसाब (V{(correctingSettlement?.version_number || 1) + 1}) दर्ज होगा"
        maxWidth="lg"
      >
        <form onSubmit={handleCorrectApprovedSubmit} className="space-y-4">
          {isDayClosed(correctingSettlement?.settlement_date || '') && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <Lock className="w-4 h-4 text-amber-700" />
                <span>{t.closedDayWarning}</span>
              </div>
              <p>तारीख {formatDate(correctingSettlement?.settlement_date || '')} का दिन क्लोज हो चुका है।</p>
              <Link to="/closing">
                <Button size="sm" variant="outline" className="mt-1" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                  दैनिक क्लोजिंग खोलें
                </Button>
              </Link>
            </div>
          )}

          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 text-xs flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">सुरक्षित वित्तीय सुधार:</p>
              <p className="text-blue-800">
                पुराने हिसाब के स्टॉक रिवर्सल एवं नकद/UPI सुधार स्वतः दर्ज होंगे।
              </p>
            </div>
          </div>

          {currentIssue && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                उत्पाद वापसी व बिक्री संशोधन (Pieces)
              </h4>

              <div className="space-y-3">
                {currentIssue.items.map((it) => {
                  const inp = itemInputs[it.id] || {
                    returned_qty: 0,
                    damaged_qty: 0,
                    comp_qty: 0,
                    damage_reason: '',
                    comp_reason: '',
                  };
                  const res = calculateSettlementItem({
                    issued_quantity: it.issued_quantity,
                    returned_quantity: inp.returned_qty,
                    damaged_quantity: inp.damaged_qty,
                    complimentary_quantity: inp.comp_qty,
                    unit_selling_price: it.unit_selling_price_snapshot,
                    commission_type: it.commission_type_snapshot as any,
                    commission_value: it.commission_value_snapshot,
                  });

                  return (
                    <div
                      key={it.id}
                      className="p-3.5 rounded-2xl bg-cream-50 border border-cream-200 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-sm text-gray-900 block">
                            {language === 'hi' ? it.product?.name_hi : it.product?.name_en}
                          </span>
                          <span className="text-xs text-gray-500">
                            दी गई मात्रा: {it.issued_quantity}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-gray-500 block">नया बिकी पीस:</span>
                          <span className="font-mono font-black text-lg text-emerald-800">
                            {res.sold_quantity} {t.pieces}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          type="number"
                          label={t.returnedQty}
                          isPieceQuantity
                          value={inp.returned_qty}
                          onChange={(e) =>
                            handleItemFieldChange(it.id, 'returned_qty', parseInt(e.target.value, 10) || 0)
                          }
                        />
                        <Input
                          type="number"
                          label={t.damagedQty}
                          isPieceQuantity
                          value={inp.damaged_qty}
                          onChange={(e) =>
                            handleItemFieldChange(it.id, 'damaged_qty', parseInt(e.target.value, 10) || 0)
                          }
                        />
                        <Input
                          type="number"
                          label={t.compQty}
                          isPieceQuantity
                          value={inp.comp_qty}
                          onChange={(e) =>
                            handleItemFieldChange(it.id, 'comp_qty', parseInt(e.target.value, 10) || 0)
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <Input
              type="number"
              step="0.01"
              label={`${t.cashReceived} (₹)`}
              prefixSymbol="₹"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              label={`${t.upiReceived} (₹)`}
              prefixSymbol="₹"
              value={upiReceived}
              onChange={(e) => setUpiReceived(e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              label={`${t.approvedCredit} (₹)`}
              prefixSymbol="₹"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
          </div>

          <div className="p-3.5 rounded-2xl bg-cream-100/60 border border-cream-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-gray-500 block">नया Gross Sales</span>
              <span className="font-bold text-sm text-gray-900">{formatCurrency(summary.gross_sales)}</span>
            </div>
            <div>
              <span className="text-gray-500 block">नया कमीशन</span>
              <span className="font-bold text-sm text-maroon-800">{formatCurrency(summary.total_commission)}</span>
            </div>
            <div>
              <span className="text-emerald-800 font-semibold block">अपेक्षित वसूली</span>
              <span className="font-bold text-sm text-emerald-950">{formatCurrency(summary.expected_collection)}</span>
            </div>
            <div>
              <span className="text-amber-800 font-semibold block">कुल प्राप्त</span>
              <span className="font-bold text-sm text-amber-950">{formatCurrency(summary.total_received)}</span>
            </div>
          </div>

          <Input
            label={`${t.correctionReason} *`}
            placeholder="जैसे: शाम को नकद गिनती में ₹200 का अंतर ठीक किया गया..."
            value={correctionReason}
            onChange={(e) => setCorrectionReason(e.target.value)}
            helperText="कम से कम 5 अक्षर का स्पष्ट कारण"
            required
          />

          <Input
            label="अतिरिक्त टिप्पणी (Notes)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <Button type="button" variant="secondary" onClick={() => setCorrectingSettlement(null)}>
              {t.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={correctApprovedSettlement.isPending}
              disabled={isDayClosed(correctingSettlement?.settlement_date || '')}
            >
              {t.correctRecord}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Revision History Modal */}
      <RevisionHistoryModal
        isOpen={Boolean(historySettlementId)}
        onClose={() => setHistorySettlementId(null)}
        title={`${t.revisionHistory}: ${settlements.find((s) => s.id === historySettlementId)?.settlement_number || ''}`}
        revisions={revisionHistory}
        isLoading={isHistoryLoading}
      />

      {/* Receipt Modal */}
      <Modal
        isOpen={Boolean(receiptSettlement)}
        onClose={() => setReceiptSettlement(null)}
        title={t.settlementReceipt}
        maxWidth="md"
      >
        {receiptSettlement && (
          <div className="space-y-4">
            <div
              id="settlement-receipt-print"
              className="p-5 rounded-2xl bg-white border border-gray-300 text-gray-900 space-y-4 font-mono text-xs"
            >
              {/* Header */}
              <div className="text-center border-b border-gray-300 pb-3">
                <h2 className="text-lg font-black tracking-tight">{t.brandName}</h2>
                <p className="text-[11px] text-gray-600">{t.brandTagline}</p>
                <p className="text-[11px] font-bold mt-1">शाम की हिसाब पर्ची (Settlement Receipt)</p>
                <div className="flex justify-between text-[10px] text-gray-500 mt-2">
                  <span>पर्ची सं: {receiptSettlement.settlement_number}</span>
                  <span>तारीख: {formatDate(receiptSettlement.settlement_date)}</span>
                </div>
                <div className="text-left text-[11px] font-bold text-gray-800 mt-1">
                  विक्रेता: {receiptSettlement.seller?.full_name} ({receiptSettlement.seller?.seller_code})
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-gray-300 font-bold">
                    <th className="py-1">उत्पाद</th>
                    <th className="py-1 text-center">दी</th>
                    <th className="py-1 text-center">वापसी</th>
                    <th className="py-1 text-center">खराब</th>
                    <th className="py-1 text-center">बिकी</th>
                    <th className="py-1 text-right">रकम</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {receiptSettlement.items.map((it) => (
                    <tr key={it.id}>
                      <td className="py-1 font-sans font-semibold">
                        {language === 'hi' ? it.product?.name_hi : it.product?.name_en}
                      </td>
                      <td className="py-1 text-center">{it.issued_quantity_snapshot}</td>
                      <td className="py-1 text-center">{it.returned_quantity}</td>
                      <td className="py-1 text-center">{it.damaged_quantity}</td>
                      <td className="py-1 text-center font-bold">{it.sold_quantity}</td>
                      <td className="py-1 text-right font-bold">{formatCurrency(it.gross_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="border-t border-gray-300 pt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>कुल बिक्री (Gross):</span>
                  <span className="font-bold">{formatCurrency(receiptSettlement.gross_sales)}</span>
                </div>
                <div className="flex justify-between">
                  <span>विक्रेता कमीशन (-):</span>
                  <span>-{formatCurrency(receiptSettlement.total_commission)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-dashed border-gray-300 pt-1">
                  <span>अपेक्षित वसूली:</span>
                  <span>{formatCurrency(receiptSettlement.expected_collection)}</span>
                </div>
                <div className="flex justify-between">
                  <span>नकद (Cash):</span>
                  <span>{formatCurrency(receiptSettlement.cash_received)}</span>
                </div>
                <div className="flex justify-between">
                  <span>UPI:</span>
                  <span>{formatCurrency(receiptSettlement.upi_received)}</span>
                </div>
                {receiptSettlement.credit_amount > 0 && (
                  <div className="flex justify-between">
                    <span>उधार (Credit):</span>
                    <span>{formatCurrency(receiptSettlement.credit_amount)}</span>
                  </div>
                )}
                {receiptSettlement.shortage_amount > 0 && (
                  <div className="flex justify-between font-bold text-rose-700">
                    <span>कमी (Shortage):</span>
                    <span>{formatCurrency(receiptSettlement.shortage_amount)}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="text-center pt-3 border-t border-gray-300 text-[10px] text-gray-500">
                <p>धन्यवाद! जानकी कुल्फी, मिरहची (एटा)</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => window.print()}
                leftIcon={<Printer className="w-4 h-4" />}
              >
                {t.printReceipt}
              </Button>
              <Button variant="primary" onClick={() => setReceiptSettlement(null)}>
                बंद करें
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Approve Pending Dialog */}
      <ConfirmDialog
        isOpen={Boolean(settlementToApprove)}
        onClose={() => setSettlementToApprove(null)}
        onConfirm={handleConfirmApprove}
        title={t.approveSettlement}
        description="इस हिसाब को स्वीकृत करने पर बची हुई कुल्फी मुख्य फ्रीजर में स्वतः वापस जुड़ जाएगी और बिक्री की पुष्टि हो जाएगी।"
        confirmText="हाँ, हिसाब स्वीकृत करें"
        cancelText={t.cancel}
        variant="primary"
        isLoading={approveSettlement.isPending}
      />

      {/* Delete Settlement Modal */}
      <Modal
        isOpen={Boolean(settlementToDelete)}
        onClose={() => {
          setSettlementToDelete(null);
          setDeleteReason('');
          setDeleteError(null);
        }}
        title={`${t.deleteSettlement || 'हिसाब हटाएं'}: ${settlementToDelete?.settlement_number || ''}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800 space-y-1">
              <p className="font-semibold text-rose-900">
                {t.deleteSettlementConfirm || 'क्या आप वाकई इस हिसाब को हटाना चाहते हैं?'}
              </p>
              <p>
                {settlementToDelete?.status === 'approved'
                  ? 'यह क्रिया हिसाब के दौरान वापस/खराब की गई कुल्फी के स्टॉक मूवमेंट्स को रिवर्स कर देगी एवं संबंधित स्टॉक निकासी को पुनः खोल देगी।'
                  : 'यह पेंडिंग हिसाब स्थायी रूप से हटा दिया जाएगा।'}
              </p>
            </div>
          </div>

          {deleteError && (
            <div className="p-3 bg-rose-100 border border-rose-300 text-rose-800 rounded-lg text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-700" />
              {deleteError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {t.deleteReason || 'हटाने का कारण'} (वैकल्पिक)
            </label>
            <input
              type="text"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="जैसे: गलत गणना, दोबारा हिसाब दर्ज करना है"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <Button
              variant="secondary"
              onClick={() => {
                setSettlementToDelete(null);
                setDeleteReason('');
                setDeleteError(null);
              }}
              disabled={deleteSettlement.isPending}
            >
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              isLoading={deleteSettlement.isPending}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              {t.deleteSettlement || 'हाँ, हिसाब हटाएं'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
