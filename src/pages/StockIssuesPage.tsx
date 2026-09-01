import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  useSellerIssues,
  useIssueSellerStock,
  useUpdateDraftSellerIssue,
  useCancelDraftSellerIssue,
  useCorrectSellerIssue,
  useIssueRevisionHistory,
  useSellers,
  useCarts,
} from '@/hooks/useSellers';
import { useProducts } from '@/hooks/useProducts';
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
  formatQuantity,
  formatDate,
  getTodayDateString,
} from '@/lib/formatters';
import {
  Truck,
  Plus,
  AlertCircle,
  CheckCircle,
  Edit3,
  History,
  Lock,
  ArrowRight,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { SellerIssueWithDetails } from '@/types';

export const StockIssuesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: issues = [], isLoading } = useSellerIssues();
  const { data: sellers = [] } = useSellers();
  const { data: carts = [] } = useCarts();
  const { data: products = [] } = useProducts();
  const { data: closings = [] } = useDailyClosings();
  const { t, language } = useLanguage();
  const { isProduction, isOwner } = useAuth();
  const { isOnline, saveDraft } = useSync();

  const issueStock = useIssueSellerStock();
  const updateDraftIssue = useUpdateDraftSellerIssue();
  const cancelDraftIssue = useCancelDraftSellerIssue();
  const correctIssue = useCorrectSellerIssue();

  const [isNewModalOpen, setIsNewModalOpen] = useState(searchParams.get('new') === 'true');
  const [selectedSellerId, setSelectedSellerId] = useState<string>('');
  const [selectedCartId, setSelectedCartId] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>(getTodayDateString());
  const [notes, setNotes] = useState<string>('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Edit / Correct / History State
  const [editingDraftIssue, setEditingDraftIssue] = useState<SellerIssueWithDetails | null>(null);
  const [correctingIssue, setCorrectingIssue] = useState<SellerIssueWithDetails | null>(null);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [issueToCancel, setIssueToCancel] = useState<string | null>(null);
  const [historyIssueId, setHistoryIssueId] = useState<string | null>(null);

  const { data: revisionHistory = [], isLoading: isHistoryLoading } = useIssueRevisionHistory(
    historyIssueId || undefined
  );

  const isDayClosed = (dateStr: string) =>
    closings.find((c) => c.business_date === dateStr)?.status === 'closed';

  const handleOpenNewModal = () => {
    const initialQty: Record<string, number> = {};
    products.forEach((p) => {
      initialQty[p.id] = 0;
    });
    setQuantities(initialQty);
    setSelectedSellerId(sellers[0]?.id || '');
    setSelectedCartId(sellers[0]?.default_cart_id || carts[0]?.id || '');
    setIssueDate(getTodayDateString());
    setNotes('');
    setFormError(null);
    setIsNewModalOpen(true);
  };

  const handleOpenEditDraft = (issue: SellerIssueWithDetails) => {
    const initialQty: Record<string, number> = {};
    products.forEach((p) => {
      const existing = issue.items.find((it) => it.product_id === p.id);
      initialQty[p.id] = existing ? existing.issued_quantity : 0;
    });
    setQuantities(initialQty);
    setSelectedSellerId(issue.seller_id);
    setSelectedCartId(issue.cart_id || '');
    setIssueDate(issue.issue_date);
    setNotes(issue.notes || '');
    setFormError(null);
    setEditingDraftIssue(issue);
  };

  const handleOpenCorrect = (issue: SellerIssueWithDetails) => {
    const initialQty: Record<string, number> = {};
    products.forEach((p) => {
      const existing = issue.items.find((it) => it.product_id === p.id);
      initialQty[p.id] = existing ? existing.issued_quantity : 0;
    });
    setQuantities(initialQty);
    setSelectedSellerId(issue.seller_id);
    setSelectedCartId(issue.cart_id || '');
    setIssueDate(issue.issue_date);
    setNotes(issue.notes || '');
    setCorrectionReason('');
    setFormError(null);
    setCorrectingIssue(issue);
  };

  const handleSellerChange = (sellerId: string) => {
    setSelectedSellerId(sellerId);
    const seller = sellers.find((s) => s.id === sellerId);
    if (seller?.default_cart_id) {
      setSelectedCartId(seller.default_cart_id);
    }
  };

  const handleQuantityChange = (productId: string, val: number) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(0, val),
    }));
  };

  const totalIssuedPieces = Object.values(quantities).reduce((sum, q) => sum + q, 0);

  // Submit New Issue
  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedSellerId) {
      setFormError('कृपया विक्रेता चुनें');
      return;
    }

    const items = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, qty]) => ({
        product_id: productId,
        issued_quantity: qty,
      }));

    if (items.length === 0) {
      setFormError('कम से कम एक उत्पाद की निकासी मात्रा दर्ज करें');
      return;
    }

    // Validate available freezer stock
    for (const it of items) {
      const prod = products.find((p) => p.id === it.product_id);
      const available = prod?.available_quantity || 0;
      if (it.issued_quantity > available) {
        setFormError(
          `${language === 'hi' ? prod?.name_hi : prod?.name_en}: फ्रीजर में केवल ${available} पीस उपलब्ध हैं, ${it.issued_quantity} जारी नहीं कर सकते!`
        );
        return;
      }
    }

    try {
      if (!isOnline) {
        await saveDraft('seller_issue', {
          seller_id: selectedSellerId,
          cart_id: selectedCartId || null,
          issue_date: issueDate,
          items,
          notes,
        });
        alert('ऑफ़लाइन ड्राफ्ट सुरक्षित हो गया! कनेक्शन आने पर स्वतः सिंक हो जाएगा।');
      } else {
        await issueStock.mutateAsync({
          sellerId: selectedSellerId,
          cartId: selectedCartId || null,
          issueDate,
          items,
          notes,
        });
      }
      setIsNewModalOpen(false);
      setSearchParams({});
    } catch (err: any) {
      setFormError(err.message || 'स्टॉक निकासी दर्ज करने में त्रुटि हुई');
    }
  };

  // Submit Edit Draft
  const handleUpdateDraftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDraftIssue) return;
    setFormError(null);

    const items = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, qty]) => ({
        product_id: productId,
        issued_quantity: qty,
      }));

    if (items.length === 0) {
      setFormError('कम से कम एक उत्पाद की निकासी मात्रा दर्ज करें');
      return;
    }

    try {
      await updateDraftIssue.mutateAsync({
        issueId: editingDraftIssue.id,
        issueDate,
        sellerId: selectedSellerId,
        cartId: selectedCartId || null,
        items,
        notes,
      });
      setEditingDraftIssue(null);
    } catch (err: any) {
      setFormError(err.message || 'ड्राफ्ट निकासी अपडेट करने में त्रुटि हुई');
    }
  };

  // Submit Correction
  const handleCorrectIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingIssue) return;
    setFormError(null);

    if (!correctionReason || correctionReason.trim().length < 5) {
      setFormError('कृपया सुधार का कारण (कम से कम 5 अक्षर) दर्ज करें');
      return;
    }

    if (isDayClosed(correctingIssue.issue_date)) {
      setFormError(`दिन (${correctingIssue.issue_date}) बंद है। सुधार से पहले दैनिक क्लोजिंग को पुनः खोलें।`);
      return;
    }

    const items = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, qty]) => ({
        product_id: productId,
        issued_quantity: qty,
      }));

    if (items.length === 0) {
      setFormError('कम से कम एक उत्पाद की निकासी मात्रा दर्ज करें');
      return;
    }

    try {
      await correctIssue.mutateAsync({
        issueId: correctingIssue.id,
        issueDate,
        sellerId: selectedSellerId,
        cartId: selectedCartId || null,
        items,
        notes,
        reason: correctionReason,
      });
      setCorrectingIssue(null);
    } catch (err: any) {
      setFormError(err.message || 'स्टॉक निकासी सुधारने में त्रुटि हुई');
    }
  };

  const handleConfirmCancel = async () => {
    if (!issueToCancel) return;
    try {
      await cancelDraftIssue.mutateAsync(issueToCancel);
      setIssueToCancel(null);
    } catch (err: any) {
      alert(err.message || 'ड्राफ्ट रद्द करने में त्रुटि हुई');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Truck className="w-7 h-7 text-maroon-800 dark:text-rose-400" />
            {t.stockIssues}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            विक्रेताओं व ठेलों को कुल्फी स्टॉक निकासी, सुरक्षित सुधार व संशोधन इतिहास
          </p>
        </div>

        {isProduction && (
          <Button
            variant="primary"
            leftIcon={<Plus className="w-5 h-5" />}
            onClick={handleOpenNewModal}
          >
            {t.newStockIssue}
          </Button>
        )}
      </div>

      {/* Issues List */}
      {isLoading ? (
        <Card className="py-12 text-center text-gray-500">{t.loading}</Card>
      ) : issues.length === 0 ? (
        <Card className="py-12 text-center text-gray-500">
          <Truck className="w-12 h-12 mx-auto text-gray-400 mb-3 opacity-50" />
          <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
            {language === 'hi' ? 'आज का कोई निकासी रिकॉर्ड नहीं मिला' : 'No stock issues found'}
          </p>
          {isProduction && (
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={handleOpenNewModal}
            >
              {t.newStockIssue}
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {issues.map((issue) => {
            const totalIssued = issue.items.reduce((s, it) => s + it.issued_quantity, 0);
            const closed = isDayClosed(issue.issue_date);
            const hasSettlements = (issue.settlements && issue.settlements.length > 0) || issue.status === 'settled';

            return (
              <Card key={issue.id} className="overflow-hidden border-cream-300 dark:border-gray-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-800">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-base text-maroon-950 dark:text-rose-200">
                        {issue.issue_number}
                      </span>
                      {issue.version_number && issue.version_number > 1 && (
                        <Badge variant="warning">
                          {t.version} {issue.version_number}
                        </Badge>
                      )}
                      <Badge variant={issue.status}>
                        {issue.status === 'issued'
                          ? t.issued
                          : issue.status === 'settled'
                          ? t.settled
                          : issue.status === 'draft'
                          ? t.draft
                          : issue.status}
                      </Badge>
                      {closed && (
                        <Badge variant="danger">
                          <Lock className="w-3 h-3 mr-1 inline" />
                          {language === 'hi' ? 'दिन बंद है' : 'Day Closed'}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200 block mt-0.5">
                      👤 {issue.seller?.full_name} {issue.cart ? `| 🛒 ${issue.cart.cart_name}` : ''}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    <span>📅 {formatDate(issue.issue_date)}</span>
                  </div>
                </div>

                {/* Items Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 my-3">
                  {issue.items.map((it) => (
                    <div
                      key={it.id}
                      className="p-2.5 rounded-xl bg-cream-50/80 dark:bg-gray-800/40 border border-cream-200 dark:border-gray-700 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-gray-900 dark:text-gray-100 block">
                          {language === 'hi' ? it.product?.name_hi : it.product?.name_en}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {formatCurrency(it.unit_selling_price_snapshot)} / pc
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-base text-maroon-900 dark:text-rose-300 block">
                          {formatQuantity(it.issued_quantity)}
                        </span>
                        <span className="text-[10px] text-gray-500">{t.pieces}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer and Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-800 bg-cream-50/30 dark:bg-gray-800/20 -mx-4 -mb-4 px-4 py-3 text-xs">
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      कुल निकासी:{' '}
                      <strong className="text-maroon-900 dark:text-rose-300 font-mono text-sm">
                        {formatQuantity(totalIssued)} {t.pieces}
                      </strong>
                    </span>
                    {issue.status === 'issued' && !hasSettlements && (
                      <span className="text-amber-800 dark:text-amber-400 font-bold">शाम का हिसाब बाकी</span>
                    )}
                    {hasSettlements && (
                      <span className="text-emerald-800 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> हिसाब दर्ज / पूर्ण
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Draft Actions */}
                    {issue.status === 'draft' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                          onClick={() => handleOpenEditDraft(issue)}
                        >
                          {t.editDraft}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-700 hover:bg-rose-50"
                          onClick={() => setIssueToCancel(issue.id)}
                        >
                          {t.cancelDraft}
                        </Button>
                      </>
                    )}

                    {/* Issued / Settled Actions */}
                    {issue.status === 'issued' && (
                      <>
                        {isOwner && (
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={closed ? <Lock className="w-3.5 h-3.5 text-rose-600" /> : <Edit3 className="w-3.5 h-3.5" />}
                            onClick={() => handleOpenCorrect(issue)}
                          >
                            {t.correctRecord}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<History className="w-3.5 h-3.5" />}
                          onClick={() => setHistoryIssueId(issue.id)}
                        >
                          {t.revisionHistory}
                        </Button>
                      </>
                    )}

                    {issue.status === 'settled' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<History className="w-3.5 h-3.5" />}
                        onClick={() => setHistoryIssueId(issue.id)}
                      >
                        {t.revisionHistory}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Stock Issue Modal */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => {
          setIsNewModalOpen(false);
          setSearchParams({});
        }}
        title={t.newStockIssue}
        subtitle="फ्रीजर से विक्रेता या ठेले को कुल्फी स्टॉक जारी करें"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmitIssue} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
                {t.selectSeller} *
              </label>
              <select
                value={selectedSellerId}
                onChange={(e) => handleSellerChange(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
                required
              >
                <option value="" disabled>
                  -- विक्रेता चुनें --
                </option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.seller_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
                {t.selectCart}
              </label>
              <select
                value={selectedCartId}
                onChange={(e) => setSelectedCartId(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
              >
                <option value="">-- ठेला चुनें (वैकल्पिक) --</option>
                {carts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cart_name} ({c.cart_code})
                  </option>
                ))}
              </select>
            </div>

            <Input
              type="date"
              label={t.issueDate}
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              उत्पाद मात्रा दर्ज करें (Pieces)
            </h4>

            <div className="space-y-3">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  className="p-3.5 rounded-2xl bg-cream-50 dark:bg-gray-800/40 border border-cream-200 dark:border-gray-700 flex items-center justify-between gap-4"
                >
                  <div>
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100 block">
                      {language === 'hi' ? prod.name_hi : prod.name_en}
                    </span>
                    <span className="text-xs text-gray-500 block">
                      दर: {formatCurrency(prod.current_price)} | उपलब्ध:{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400 font-mono">
                        {prod.available_quantity || 0}
                      </strong>{' '}
                      pcs
                    </span>
                  </div>

                  <div className="w-36">
                    <Input
                      type="number"
                      isPieceQuantity
                      value={quantities[prod.id] || 0}
                      onChange={(e) =>
                        handleQuantityChange(prod.id, parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Input
            label="अतिरिक्त टिप्पणी (Notes)"
            placeholder="जैसे: सुबह 10 बजे मेला ग्राउंड के लिए..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
            <div>
              <span className="text-xs text-gray-500 block">कुल निकासी पीस</span>
              <span className="text-lg font-black text-maroon-900 dark:text-rose-300 font-mono">
                {formatQuantity(totalIssuedPieces)} {t.pieces}
              </span>
            </div>

            <div className="flex items-center gap-2">
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
              <Button type="submit" variant="primary" isLoading={issueStock.isPending}>
                {t.save}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit Draft Issue Modal */}
      <Modal
        isOpen={Boolean(editingDraftIssue)}
        onClose={() => setEditingDraftIssue(null)}
        title={`${t.editDraft}: ${editingDraftIssue?.issue_number}`}
        subtitle="ड्राफ्ट स्टॉक निकासी की मात्रा व विवरण संशोधित करें"
        maxWidth="lg"
      >
        <form onSubmit={handleUpdateDraftSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
                {t.selectSeller} *
              </label>
              <select
                value={selectedSellerId}
                onChange={(e) => handleSellerChange(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
                required
              >
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.seller_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
                {t.selectCart}
              </label>
              <select
                value={selectedCartId}
                onChange={(e) => setSelectedCartId(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
              >
                <option value="">-- ठेला चुनें (वैकल्पिक) --</option>
                {carts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cart_name} ({c.cart_code})
                  </option>
                ))}
              </select>
            </div>

            <Input
              type="date"
              label={t.issueDate}
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              संशोधित मात्रा दर्ज करें (Pieces)
            </h4>

            <div className="space-y-3">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  className="p-3.5 rounded-2xl bg-cream-50 dark:bg-gray-800/40 border border-cream-200 dark:border-gray-700 flex items-center justify-between gap-4"
                >
                  <div>
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100 block">
                      {language === 'hi' ? prod.name_hi : prod.name_en}
                    </span>
                    <span className="text-xs text-gray-500 block">
                      उपलब्ध: {prod.available_quantity || 0} pcs
                    </span>
                  </div>

                  <div className="w-36">
                    <Input
                      type="number"
                      isPieceQuantity
                      value={quantities[prod.id] || 0}
                      onChange={(e) =>
                        handleQuantityChange(prod.id, parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Input
            label="अतिरिक्त टिप्पणी (Notes)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
            <div>
              <span className="text-xs text-gray-500 block">कुल निकासी</span>
              <span className="text-lg font-black text-maroon-900 dark:text-rose-300 font-mono">
                {formatQuantity(totalIssuedPieces)} {t.pieces}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditingDraftIssue(null)}>
                {t.cancel}
              </Button>
              <Button type="submit" variant="primary" isLoading={updateDraftIssue.isPending}>
                {t.save}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Correct Issued Stock Modal (Owner Only) */}
      <Modal
        isOpen={Boolean(correctingIssue)}
        onClose={() => setCorrectingIssue(null)}
        title={`${t.correctRecord}: ${correctingIssue?.issue_number}`}
        subtitle="पुराना निकासी रिकॉर्ड प्रतिस्थापित होगा और रिवर्सल स्टॉक मूवमेंट स्वतः दर्ज होगी"
        maxWidth="lg"
      >
        <form onSubmit={handleCorrectIssueSubmit} className="space-y-4">
          {/* Settled Warning Check */}
          {((correctingIssue?.settlements && correctingIssue.settlements.length > 0) ||
            correctingIssue?.status === 'settled') && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-700" />
                <span>हिसाब दर्ज होने के कारण सीधी निकासी में बदलाव वर्जित है!</span>
              </div>
              <p>{t.settlementExistsWarning}</p>
              <Link to="/settlements">
                <Button size="sm" variant="danger" className="mt-1" rightIcon={<ExternalLink className="w-3.5 h-3.5" />}>
                  संबंधित हिसाब खोलें (Go to Settlements)
                </Button>
              </Link>
            </div>
          )}

          {isDayClosed(correctingIssue?.issue_date || '') && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <Lock className="w-4 h-4 text-amber-700" />
                <span>{t.closedDayWarning}</span>
              </div>
              <p>तारीख {formatDate(correctingIssue?.issue_date || '')} का दिन क्लोज हो चुका है।</p>
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
              <p className="font-bold">सुरक्षित निकासी सुधार:</p>
              <p className="text-blue-800">
                पुराने स्टॉक मूवमेंट विक्रेता ठेले से फ्रीजर में वापस (Reversal) होंगे और नए संस्करण (V
                {(correctingIssue?.version_number || 1) + 1}) के मूवमेंट दर्ज होंगे।
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
                {t.selectSeller} *
              </label>
              <select
                value={selectedSellerId}
                onChange={(e) => handleSellerChange(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
                required
              >
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.seller_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
                {t.selectCart}
              </label>
              <select
                value={selectedCartId}
                onChange={(e) => setSelectedCartId(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
              >
                <option value="">-- ठेला चुनें --</option>
                {carts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cart_name} ({c.cart_code})
                  </option>
                ))}
              </select>
            </div>

            <Input
              type="date"
              label={t.issueDate}
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              उत्पाद मात्रा तुलना (Old vs New)
            </h4>

            <div className="space-y-3">
              {products.map((prod) => {
                const oldItem = correctingIssue?.items.find((i) => i.product_id === prod.id);
                const oldQty = oldItem ? oldItem.issued_quantity : 0;
                const newQty = quantities[prod.id] || 0;
                const diff = newQty - oldQty;

                return (
                  <div
                    key={prod.id}
                    className="p-3.5 rounded-2xl bg-cream-50 dark:bg-gray-800/40 border border-cream-200 dark:border-gray-700 flex items-center justify-between gap-4"
                  >
                    <div>
                      <span className="font-bold text-sm text-gray-900 dark:text-gray-100 block">
                        {language === 'hi' ? prod.name_hi : prod.name_en}
                      </span>
                      <span className="text-xs text-gray-500 block">
                        पुराना: {oldQty} pcs | उपलब्ध: {prod.available_quantity || 0} pcs
                      </span>
                      {diff !== 0 && (
                        <span
                          className={`text-xs font-bold ${
                            diff > 0 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          अतिरिक्त स्टॉक प्रभाव: {diff > 0 ? `+${diff}` : diff} pcs
                        </span>
                      )}
                    </div>

                    <div className="w-36">
                      <Input
                        type="number"
                        isPieceQuantity
                        value={newQty}
                        onChange={(e) =>
                          handleQuantityChange(prod.id, parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Input
            label={`${t.correctionReason} *`}
            placeholder="जैसे: ठेले में ट्रे की गिनती में अंतर, गलत विक्रेता चयन सुधार..."
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

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
            <div>
              <span className="text-xs text-gray-500 block">नया कुल निकासी</span>
              <span className="text-lg font-black text-maroon-900 dark:text-rose-300 font-mono">
                {formatQuantity(totalIssuedPieces)} {t.pieces}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setCorrectingIssue(null)}>
                {t.cancel}
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={correctIssue.isPending}
                disabled={
                  isDayClosed(correctingIssue?.issue_date || '') ||
                  Boolean(
                    (correctingIssue?.settlements && correctingIssue.settlements.length > 0) ||
                      correctingIssue?.status === 'settled'
                  )
                }
              >
                {t.correctRecord}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Revision History Modal */}
      <RevisionHistoryModal
        isOpen={Boolean(historyIssueId)}
        onClose={() => setHistoryIssueId(null)}
        title={`${t.revisionHistory}: ${issues.find((i) => i.id === historyIssueId)?.issue_number || ''}`}
        revisions={revisionHistory}
        isLoading={isHistoryLoading}
      />

      {/* Cancel Draft Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(issueToCancel)}
        onClose={() => setIssueToCancel(null)}
        onConfirm={handleConfirmCancel}
        title={t.cancelDraft}
        description="क्या आप वाकई इस ड्राफ्ट निकासी को रद्द करना चाहते हैं?"
        confirmText="हाँ, रद्द करें"
        cancelText="नहीं"
        variant="danger"
        isLoading={cancelDraftIssue.isPending}
      />
    </div>
  );
};
