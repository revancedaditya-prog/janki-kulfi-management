import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useSellerSettlements,
  useProcessSettlement,
  useApproveSettlement,
} from '@/hooks/useSettlements';
import { useSellerIssues } from '@/hooks/useSellers';
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
} from 'lucide-react';
import { SellerSettlementWithDetails } from '@/types';

export const SettlementsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: settlements = [], isLoading } = useSellerSettlements();
  const { data: issues = [] } = useSellerIssues();
  const { t, language } = useLanguage();
  const { isOwner } = useAuth();
  const { isOnline, saveDraft } = useSync();

  const processSettlement = useProcessSettlement();
  const approveSettlement = useApproveSettlement();

  const [isNewModalOpen, setIsNewModalOpen] = useState(searchParams.get('new') === 'true');
  const [selectedIssueId, setSelectedIssueId] = useState<string>('');
  const [settlementDate, setSettlementDate] = useState<string>(getTodayDateString());
  const [cashReceived, setCashReceived] = useState<string>('0');
  const [upiReceived, setUpiReceived] = useState<string>('0');
  const [creditAmount, setCreditAmount] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

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

  // Selected issue object
  const currentIssue = issues.find((i) => i.id === selectedIssueId);

  // Live Summary Calculation
  const calculationItems: SettlementItemInput[] = (currentIssue?.items || []).map((it) => {
    const inp = itemInputs[it.id] || {
      returned_qty: 0,
      damaged_qty: 0,
      comp_qty: 0,
      damage_reason: '',
      comp_reason: '',
    };
    return {
      issued_quantity: it.issued_quantity,
      returned_quantity: inp.returned_qty,
      damaged_quantity: inp.damaged_qty,
      complimentary_quantity: inp.comp_qty,
      unit_selling_price: it.unit_selling_price_snapshot,
      commission_type: it.commission_type_snapshot as any,
      commission_value: it.commission_value_snapshot,
      damage_reason: inp.damage_reason,
      complimentary_reason: inp.comp_reason,
    };
  });

  const liveSummary = calculateSettlementSummary(
    calculationItems,
    parseFloat(cashReceived) || 0,
    parseFloat(upiReceived) || 0,
    parseFloat(creditAmount) || 0
  );

  const handleSubmitSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedIssueId || !currentIssue) {
      setFormError('कृपया स्टॉक निकासी चुनें');
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

      if (inp.damaged_qty > 0 && (!inp.damage_reason || inp.damage_reason.trim() === '')) {
        throw new Error(`कृपया ${language === 'hi' ? it.product?.name_hi : it.product?.name_en} के खराब होने का कारण दर्ज करें।`);
      }
      if (inp.comp_qty > 0 && (!inp.comp_reason || inp.comp_reason.trim() === '')) {
        throw new Error(`कृपया ${language === 'hi' ? it.product?.name_hi : it.product?.name_en} को मुफ्त देने का कारण दर्ज करें।`);
      }

      if (inp.returned_qty + inp.damaged_qty + inp.comp_qty > it.issued_quantity) {
        throw new Error(`वापसी, खराब व मुफ्त पीस का योग जारी मात्रा (${it.issued_quantity}) से अधिक नहीं हो सकता!`);
      }

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
      if (!isOnline) {
        await saveDraft('seller_settlement', {
          issue_id: selectedIssueId,
          settlement_date: settlementDate,
          items,
          cash: parseFloat(cashReceived) || 0,
          upi: parseFloat(upiReceived) || 0,
          credit: parseFloat(creditAmount) || 0,
          notes,
          is_approved: isOwner,
        });
        alert('ऑफ़लाइन ड्राफ्ट सुरक्षित हो गया! कनेक्शन मिलने पर यह सिंक हो जाएगा।');
      } else {
        const result = await processSettlement.mutateAsync({
          issueId: selectedIssueId,
          settlementDate,
          items,
          cashReceived: parseFloat(cashReceived) || 0,
          upiReceived: parseFloat(upiReceived) || 0,
          creditAmount: parseFloat(creditAmount) || 0,
          notes,
        });
        // Open receipt modal
        setReceiptSettlement(result);
      }

      setIsNewModalOpen(false);
      setSearchParams({});
    } catch (err: any) {
      setFormError(err.message || 'हिसाब दर्ज करने में त्रुटि');
    }
  };

  const handleConfirmApprove = async () => {
    if (!settlementToApprove) return;
    try {
      const updated = await approveSettlement.mutateAsync(settlementToApprove);
      setSettlementToApprove(null);
      setReceiptSettlement(updated);
    } catch (err: any) {
      alert(err.message || 'स्वीकृति में त्रुटि');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-maroon-800" />
            {t.settlements}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            शाम की वापसी, बिकी कुल्फी, कमीशन एवं नकद/UPI वसूली का हिसाब
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
        <div className="text-center py-12">
          <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-gray-500 mt-3">{t.loading}</p>
        </div>
      ) : settlements.length === 0 ? (
        <Card className="text-center py-12">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Receipt className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-900">कोई हिसाब रिकॉर्ड नहीं मिला</h3>
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

            return (
              <Card key={st.id} className="overflow-hidden border-cream-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-base text-maroon-950">
                        {st.settlement_number}
                      </span>
                      <Badge variant={st.status}>
                        {st.status === 'approved' ? t.approved : st.status === 'pending_approval' ? t.pending : st.status}
                      </Badge>
                    </div>
                    <span className="text-xs font-bold text-gray-800 block mt-0.5">
                      👤 {st.seller?.full_name} | 📅 {formatDate(st.settlement_date)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Printer className="w-4 h-4" />}
                      onClick={() => setReceiptSettlement(st)}
                    >
                      {t.printReceipt}
                    </Button>
                    {st.status === 'pending_approval' && isOwner && (
                      <Button
                        size="sm"
                        variant="primary"
                        leftIcon={<CheckCircle className="w-4 h-4" />}
                        onClick={() => setSettlementToApprove(st.id)}
                      >
                        {t.approveSettlement}
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
                    <span className="text-[10px] text-gray-600">अपेक्षित: {formatCurrency(st.expected_collection)}</span>
                  </div>
                </div>

                {/* Items Detail Preview */}
                <div className="pt-2 border-t border-gray-100 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                  {st.items.map((it) => (
                    <span key={it.id}>
                      <strong className="text-gray-900">{language === 'hi' ? it.product?.name_hi : it.product?.name_en}:</strong>{' '}
                      दी: {it.issued_quantity_snapshot} | वापसी: {it.returned_quantity} | खराब: {it.damaged_quantity} | बिकी: <strong className="text-emerald-800">{it.sold_quantity}</strong>
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
                <option value="" disabled>-- बकाया निकासी चुनें --</option>
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

                      {inp.damaged_qty > 0 && (
                        <Input
                          label={`${t.damageReason} *`}
                          placeholder="जैसे: पेटी में पिघल गई, धूप के कारण..."
                          value={inp.damage_reason}
                          onChange={(e) => handleItemFieldChange(it.id, 'damage_reason', e.target.value)}
                          required
                        />
                      )}

                      {inp.comp_qty > 0 && (
                        <Input
                          label={`${t.compReason} *`}
                          placeholder="जैसे: ग्राहक को चखने दिया, प्रचार..."
                          value={inp.comp_reason}
                          onChange={(e) => handleItemFieldChange(it.id, 'comp_reason', e.target.value)}
                          required
                        />
                      )}

                      <div className="flex justify-between text-xs font-semibold text-gray-600 bg-white p-2 rounded-xl border border-cream-200">
                        <span>बिक्री: {formatCurrency(res.gross_sales)}</span>
                        <span>कमीशन: {formatCurrency(res.commission_amount)}</span>
                        <span className="text-emerald-800">वसूली: {formatCurrency(res.net_collection)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              कृपया ऊपर दी गई सूची से स्टॉक निकासी का चयन करें।
            </div>
          )}

          {/* Payment Collection Inputs */}
          <div className="p-4 rounded-2xl bg-cream-100/70 border border-cream-300 space-y-3">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              वसूली एवं भुगतान विवरण (Payment Received)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                type="number"
                step="0.01"
                label={t.cashReceived}
                prefixSymbol="₹"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
              />
              <Input
                type="number"
                step="0.01"
                label={t.upiReceived}
                prefixSymbol="₹"
                value={upiReceived}
                onChange={(e) => setUpiReceived(e.target.value)}
              />
              <Input
                type="number"
                step="0.01"
                label={t.approvedCredit}
                prefixSymbol="₹"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                helperText="उधार (Credit)"
              />
            </div>
          </div>

          {/* Live Calculated Summary Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-maroon-900 to-maroon-950 text-white space-y-2 text-xs">
            <div className="flex justify-between text-cream-200">
              <span>सकल बिक्री (Gross Sales):</span>
              <span className="font-mono font-bold text-white">{formatCurrency(liveSummary.gross_sales)}</span>
            </div>
            <div className="flex justify-between text-cream-200">
              <span>विक्रेता कमीशन (-):</span>
              <span className="font-mono font-bold text-saffron-300">-{formatCurrency(liveSummary.total_commission)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm border-t border-white/10 pt-1.5">
              <span>{t.expectedCollection}:</span>
              <span className="font-mono text-saffron-400">{formatCurrency(liveSummary.expected_collection)}</span>
            </div>
            <div className="flex justify-between text-cream-200">
              <span>कुल प्राप्त राशि (Cash + UPI + Credit):</span>
              <span className="font-mono font-bold text-white">{formatCurrency(liveSummary.accounted_amount)}</span>
            </div>
            <div className="flex justify-between font-extrabold text-sm border-t border-white/10 pt-1.5">
              <span>{liveSummary.collection_difference < 0 ? t.shortage : t.surplus}:</span>
              <span
                className={`font-mono ${
                  liveSummary.collection_difference < 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {formatCurrency(Math.abs(liveSummary.collection_difference))}
              </span>
            </div>
          </div>

          <Input
            label="टिप्पणी (Notes)"
            placeholder="जैसे: पूरा हिसाब चुकता, ₹50 कल देगा..."
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
              {isOwner ? t.approveSettlement : t.submitPending}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Printable Receipt Modal */}
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
    </div>
  );
};
