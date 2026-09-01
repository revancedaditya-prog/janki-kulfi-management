import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  useProductionBatches,
  useCreateProductionBatch,
  useCompleteProductionBatch,
  useCancelProductionBatch,
  useUpdateDraftProductionBatch,
  useCorrectProductionBatch,
  useProductionRevisionHistory,
} from '@/hooks/useProduction';
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
  Factory,
  Plus,
  CheckCircle,
  AlertCircle,
  Edit3,
  History,
  Lock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { ProductionBatchWithItems } from '@/types';

export const ProductionPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: batches = [], isLoading } = useProductionBatches();
  const { data: products = [] } = useProducts();
  const { data: closings = [] } = useDailyClosings();
  const { t, language } = useLanguage();
  const { isOwner } = useAuth();
  const { isOnline, saveDraft } = useSync();

  const createBatch = useCreateProductionBatch();
  const completeBatch = useCompleteProductionBatch();
  const cancelBatch = useCancelProductionBatch();
  const updateDraftBatch = useUpdateDraftProductionBatch();
  const correctBatch = useCorrectProductionBatch();

  const [isNewModalOpen, setIsNewModalOpen] = useState(searchParams.get('new') === 'true');
  const [batchToComplete, setBatchToComplete] = useState<string | null>(null);
  const [batchToCancel, setBatchToCancel] = useState<string | null>(null);

  // Edit Draft Modal State
  const [editingDraftBatch, setEditingDraftBatch] = useState<ProductionBatchWithItems | null>(null);

  // Correct Completed Batch Modal State
  const [correctingBatch, setCorrectingBatch] = useState<ProductionBatchWithItems | null>(null);
  const [correctionReason, setCorrectionReason] = useState<string>('');

  // Revision History Modal State
  const [historyBatchId, setHistoryBatchId] = useState<string | null>(null);
  const { data: revisionHistory = [], isLoading: isHistoryLoading } = useProductionRevisionHistory(
    historyBatchId || undefined
  );

  // Form State for New / Edit / Correction
  const [productionDate, setProductionDate] = useState(getTodayDateString());
  const [totalIngredientCost, setTotalIngredientCost] = useState<string>('500');
  const [notes, setNotes] = useState('');
  const [itemsState, setItemsState] = useState<
    Record<string, { produced: number; damaged: number; notes: string }>
  >({});
  const [formError, setFormError] = useState<string | null>(null);

  const isDayClosed = (dateStr: string) =>
    closings.find((c) => c.business_date === dateStr)?.status === 'closed';

  // Initialize form with active products for New Batch
  const handleOpenNewModal = () => {
    const initial: Record<string, { produced: number; damaged: number; notes: string }> = {};
    products.forEach((p) => {
      initial[p.id] = { produced: 0, damaged: 0, notes: '' };
    });
    setItemsState(initial);
    setProductionDate(getTodayDateString());
    setTotalIngredientCost('500');
    setNotes('');
    setFormError(null);
    setIsNewModalOpen(true);
  };

  // Open Edit Draft Modal
  const handleOpenEditDraft = (batch: ProductionBatchWithItems) => {
    const initial: Record<string, { produced: number; damaged: number; notes: string }> = {};
    products.forEach((p) => {
      const existing = batch.items.find((it) => it.product_id === p.id);
      initial[p.id] = {
        produced: existing ? existing.produced_quantity : 0,
        damaged: existing ? existing.damaged_quantity : 0,
        notes: existing?.notes || '',
      };
    });
    setItemsState(initial);
    setProductionDate(batch.production_date);
    setTotalIngredientCost(String(batch.total_ingredient_cost));
    setNotes(batch.notes || '');
    setFormError(null);
    setEditingDraftBatch(batch);
  };

  // Open Correct Completed Batch Modal
  const handleOpenCorrectModal = (batch: ProductionBatchWithItems) => {
    const initial: Record<string, { produced: number; damaged: number; notes: string }> = {};
    products.forEach((p) => {
      const existing = batch.items.find((it) => it.product_id === p.id);
      initial[p.id] = {
        produced: existing ? existing.produced_quantity : 0,
        damaged: existing ? existing.damaged_quantity : 0,
        notes: existing?.notes || '',
      };
    });
    setItemsState(initial);
    setProductionDate(batch.production_date);
    setTotalIngredientCost(String(batch.total_ingredient_cost));
    setNotes(batch.notes || '');
    setCorrectionReason('');
    setFormError(null);
    setCorrectingBatch(batch);
  };

  const handleItemChange = (productId: string, field: 'produced' | 'damaged', value: number) => {
    setItemsState((prev) => {
      const current = prev[productId] || { produced: 0, damaged: 0, notes: '' };
      return {
        ...prev,
        [productId]: {
          ...current,
          [field]: Math.max(0, value),
        },
      };
    });
  };

  // Calculate live total saleable pieces
  const totalSaleable = products.reduce((sum, p) => {
    const item = itemsState[p.id] || { produced: 0, damaged: 0 };
    return sum + Math.max(0, item.produced - item.damaged);
  }, 0);

  // Submit New Batch
  const handleCreateBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const costNum = parseFloat(totalIngredientCost) || 0;
    const items = products
      .map((p) => {
        const item = itemsState[p.id] || { produced: 0, damaged: 0, notes: '' };
        return {
          product_id: p.id,
          produced_quantity: item.produced,
          damaged_quantity: item.damaged,
          notes: item.notes,
        };
      })
      .filter((it) => it.produced_quantity > 0);

    if (items.length === 0) {
      setFormError('कम से कम एक उत्पाद की उत्पादन मात्रा (Produced Quantity) दर्ज करें।');
      return;
    }

    for (const it of items) {
      if (it.damaged_quantity > it.produced_quantity) {
        setFormError('खराब मात्रा (Damaged Quantity) उत्पादित मात्रा से अधिक नहीं हो सकती।');
        return;
      }
    }

    try {
      if (!isOnline) {
        await saveDraft('production_batch', {
          production_date: productionDate,
          total_ingredient_cost: costNum,
          notes,
          items,
        });
        alert('ऑफ़लाइन ड्राफ्ट सुरक्षित हो गया! इंटरनेट कनेक्ट होने पर यह सिंक हो जाएगा।');
      } else {
        await createBatch.mutateAsync({
          productionDate,
          totalIngredientCost: costNum,
          notes,
          items,
        });
      }
      setIsNewModalOpen(false);
      setSearchParams({});
    } catch (err: any) {
      setFormError(err.message || 'बैच बनाने में त्रुटि हुई');
    }
  };

  // Submit Edit Draft Batch
  const handleUpdateDraftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDraftBatch) return;
    setFormError(null);

    const costNum = parseFloat(totalIngredientCost) || 0;
    const items = products
      .map((p) => {
        const item = itemsState[p.id] || { produced: 0, damaged: 0, notes: '' };
        return {
          product_id: p.id,
          produced_quantity: item.produced,
          damaged_quantity: item.damaged,
          notes: item.notes,
        };
      })
      .filter((it) => it.produced_quantity > 0);

    if (items.length === 0) {
      setFormError('कम से कम एक उत्पाद की उत्पादन मात्रा दर्ज करें।');
      return;
    }

    try {
      await updateDraftBatch.mutateAsync({
        batchId: editingDraftBatch.id,
        productionDate,
        totalIngredientCost: costNum,
        notes,
        items,
      });
      setEditingDraftBatch(null);
    } catch (err: any) {
      setFormError(err.message || 'ड्राफ्ट बैच अपडेट करने में त्रुटि हुई');
    }
  };

  // Submit Correction for Completed Batch
  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingBatch) return;
    setFormError(null);

    if (!correctionReason || correctionReason.trim().length < 5) {
      setFormError('कृपया सुधार का वैध कारण (कम से कम 5 अक्षर) दर्ज करें।');
      return;
    }

    if (isDayClosed(correctingBatch.production_date)) {
      setFormError(
        `दिन (${correctingBatch.production_date}) बंद है। सुधार से पहले दैनिक क्लोजिंग को पुनः खोलें।`
      );
      return;
    }

    const costNum = parseFloat(totalIngredientCost) || 0;
    const items = products
      .map((p) => {
        const item = itemsState[p.id] || { produced: 0, damaged: 0, notes: '' };
        return {
          product_id: p.id,
          produced_quantity: item.produced,
          damaged_quantity: item.damaged,
          notes: item.notes,
        };
      })
      .filter((it) => it.produced_quantity > 0);

    if (items.length === 0) {
      setFormError('कम से कम एक उत्पाद की उत्पादन मात्रा दर्ज करें।');
      return;
    }

    // Client-side pre-validation: check freezer stock reduction
    for (const it of items) {
      const oldItem = correctingBatch.items.find((i) => i.product_id === it.product_id);
      const oldSaleable = oldItem ? oldItem.saleable_quantity : 0;
      const newSaleable = it.produced_quantity - (it.damaged_quantity || 0);
      const netDiff = newSaleable - oldSaleable;

      if (netDiff < 0) {
        const prod = products.find((p) => p.id === it.product_id);
        const avail = prod?.available_quantity || 0;
        if (avail + netDiff < 0) {
          setFormError(
            `${language === 'hi' ? prod?.name_hi : prod?.name_en}: सुधार से फ्रीजर स्टॉक ऋणात्मक (${avail + netDiff}) हो जाएगा। उत्पादन कमी जारी किए गए स्टॉक से अधिक नहीं हो सकती।`
          );
          return;
        }
      }
    }

    try {
      await correctBatch.mutateAsync({
        batchId: correctingBatch.id,
        productionDate,
        totalIngredientCost: costNum,
        notes,
        items,
        reason: correctionReason,
      });
      setCorrectingBatch(null);
    } catch (err: any) {
      setFormError(err.message || 'बैच सुधारने में त्रुटि हुई');
    }
  };

  const handleConfirmComplete = async () => {
    if (!batchToComplete) return;
    try {
      await completeBatch.mutateAsync(batchToComplete);
      setBatchToComplete(null);
    } catch (err: any) {
      alert(err.message || 'बैच पूरा करने में त्रुटि हुई');
    }
  };

  const handleConfirmCancel = async () => {
    if (!batchToCancel) return;
    try {
      await cancelBatch.mutateAsync(batchToCancel);
      setBatchToCancel(null);
    } catch (err: any) {
      alert(err.message || 'बैच रद्द करने में त्रुटि हुई');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Factory className="w-7 h-7 text-maroon-800 dark:text-rose-400" />
            {t.productionBatches}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            कारखाने में दैनिक कुल्फी निर्माण, बैच लागत व सुरक्षित संशोधन प्रबंधन
          </p>
        </div>

        <Button
          variant="primary"
          leftIcon={<Plus className="w-5 h-5" />}
          onClick={handleOpenNewModal}
        >
          {t.newBatch}
        </Button>
      </div>

      {/* Batches List */}
      {isLoading ? (
        <Card className="py-12 text-center text-gray-500">{t.loading}</Card>
      ) : batches.length === 0 ? (
        <Card className="py-12 text-center text-gray-500">
          <Factory className="w-12 h-12 mx-auto text-gray-400 mb-3 opacity-50" />
          <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
            {language === 'hi' ? 'आज का कोई उत्पादन बैच नहीं मिला' : 'No production batches found'}
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-4"
            onClick={handleOpenNewModal}
          >
            {t.newBatch}
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const totalDamaged = batch.items.reduce((s, it) => s + it.damaged_quantity, 0);
            const batchTotalSaleable = batch.items.reduce((s, it) => s + it.saleable_quantity, 0);
            const closed = isDayClosed(batch.production_date);

            return (
              <Card key={batch.id} className="overflow-hidden border-cream-300 dark:border-gray-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono font-bold text-base text-maroon-950 dark:text-rose-200">
                      {batch.batch_number}
                    </span>
                    {batch.version_number && batch.version_number > 1 && (
                      <Badge variant="warning">
                        {t.version} {batch.version_number}
                      </Badge>
                    )}
                    <Badge variant={batch.status}>
                      {batch.status === 'completed'
                        ? t.completed
                        : batch.status === 'draft'
                        ? t.draft
                        : batch.status === 'superseded'
                        ? t.superseded
                        : batch.status}
                    </Badge>
                    {closed && (
                      <Badge variant="danger">
                        <Lock className="w-3 h-3 mr-1 inline" />
                        {language === 'hi' ? 'दिन बंद है' : 'Day Closed'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs font-semibold text-gray-600 dark:text-gray-400">
                    <span>📅 {formatDate(batch.production_date)}</span>
                    <span>
                      💰 {t.totalIngredientCost}: {formatCurrency(batch.total_ingredient_cost)}
                    </span>
                  </div>
                </div>

                {/* Items Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-3">
                  {batch.items.map((it) => (
                    <div
                      key={it.id}
                      className="p-2.5 rounded-xl bg-cream-50/70 dark:bg-gray-800/40 border border-cream-200 dark:border-gray-700 text-xs"
                    >
                      <span className="font-bold text-gray-900 dark:text-gray-100 block text-sm mb-1">
                        {language === 'hi' ? it.product?.name_hi : it.product?.name_en}
                      </span>
                      <div className="flex justify-between text-gray-600 dark:text-gray-400">
                        <span>{t.producedQty}:</span>
                        <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                          {formatQuantity(it.produced_quantity)}
                        </span>
                      </div>
                      <div className="flex justify-between text-rose-700 dark:text-rose-400">
                        <span>{t.damagedQty}:</span>
                        <span className="font-mono font-bold">
                          {formatQuantity(it.damaged_quantity)}
                        </span>
                      </div>
                      <div className="flex justify-between text-emerald-800 dark:text-emerald-400 font-bold border-t border-cream-200 dark:border-gray-700 pt-1 mt-1">
                        <span>{t.saleableQty}:</span>
                        <span className="font-mono">
                          {formatQuantity(it.saleable_quantity)} {t.pieces}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary & Action Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-800 bg-cream-50/30 dark:bg-gray-800/20 -mx-4 -mb-4 px-4 py-3">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      कुल बिक्री योग्य:{' '}
                      <strong className="text-maroon-900 dark:text-rose-300 font-mono text-sm">
                        {formatQuantity(batchTotalSaleable)} {t.pieces}
                      </strong>
                    </span>
                    {totalDamaged > 0 && (
                      <span className="text-rose-700 dark:text-rose-400 font-medium">
                        खराब: {formatQuantity(totalDamaged)} {t.pieces}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Draft Actions */}
                    {batch.status === 'draft' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                          onClick={() => handleOpenEditDraft(batch)}
                        >
                          {t.editDraft}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-700 hover:bg-rose-50"
                          onClick={() => setBatchToCancel(batch.id)}
                        >
                          {t.cancelDraft}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          leftIcon={<CheckCircle className="w-4 h-4" />}
                          onClick={() => setBatchToComplete(batch.id)}
                        >
                          {t.completeBatch}
                        </Button>
                      </>
                    )}

                    {/* Completed Actions */}
                    {batch.status === 'completed' && (
                      <>
                        {isOwner && (
                          <Button
                            variant={closed ? 'outline' : 'secondary'}
                            size="sm"
                            leftIcon={closed ? <Lock className="w-3.5 h-3.5 text-rose-600" /> : <Edit3 className="w-3.5 h-3.5" />}
                            onClick={() => handleOpenCorrectModal(batch)}
                          >
                            {t.correctRecord}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<History className="w-3.5 h-3.5" />}
                          onClick={() => setHistoryBatchId(batch.id)}
                        >
                          {t.revisionHistory}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Batch Modal */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => {
          setIsNewModalOpen(false);
          setSearchParams({});
        }}
        title={t.newBatch}
        subtitle="कारखाने में तैयार कुल्फी पीस और कुल सामग्री लागत दर्ज करें"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateBatchSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="date"
              label={t.productionDate}
              value={productionDate}
              onChange={(e) => setProductionDate(e.target.value)}
              required
            />

            <Input
              type="number"
              step="0.01"
              label={t.totalIngredientCost}
              prefixSymbol="₹"
              value={totalIngredientCost}
              onChange={(e) => setTotalIngredientCost(e.target.value)}
              helperText="दूध, मावा, चीनी, मेवे की कुल लागत"
              required
            />
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              उत्पाद-वार उत्पादन विवरण (Pieces)
            </h4>

            <div className="space-y-3">
              {products.map((prod) => {
                const item = itemsState[prod.id] || { produced: 0, damaged: 0, notes: '' };
                const saleable = Math.max(0, item.produced - item.damaged);

                return (
                  <div
                    key={prod.id}
                    className="p-3.5 rounded-2xl bg-cream-50 dark:bg-gray-800/40 border border-cream-200 dark:border-gray-700 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                          {language === 'hi' ? prod.name_hi : prod.name_en}
                        </span>
                        <span className="text-xs text-gray-500 block">
                          SKU: {prod.sku} | दर: {formatCurrency(prod.current_price)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                          बिक्री योग्य: <strong className="font-mono text-base">{saleable}</strong>{' '}
                          {t.pieces}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        label={t.producedQty}
                        isPieceQuantity
                        value={item.produced}
                        onChange={(e) =>
                          handleItemChange(prod.id, 'produced', parseInt(e.target.value, 10) || 0)
                        }
                      />
                      <Input
                        type="number"
                        label={t.damagedQty}
                        isPieceQuantity
                        value={item.damaged}
                        onChange={(e) =>
                          handleItemChange(prod.id, 'damaged', parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Input
            label="अतिरिक्त टिप्पणी (Notes)"
            placeholder="जैसे: सुबह की शिफ्ट, विशेष मावा बैच..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
            <div>
              <span className="text-xs text-gray-500 block">कुल तैयार पीस</span>
              <span className="text-lg font-black text-maroon-900 dark:text-rose-300 font-mono">
                {formatQuantity(totalSaleable)} {t.pieces}
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
              <Button type="submit" variant="primary" isLoading={createBatch.isPending}>
                {t.save}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit Draft Batch Modal */}
      <Modal
        isOpen={Boolean(editingDraftBatch)}
        onClose={() => setEditingDraftBatch(null)}
        title={`${t.editDraft}: ${editingDraftBatch?.batch_number}`}
        subtitle="ड्राफ्ट बैच की मात्रा और लागत संशोधित करें"
        maxWidth="lg"
      >
        <form onSubmit={handleUpdateDraftSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="date"
              label={t.productionDate}
              value={productionDate}
              onChange={(e) => setProductionDate(e.target.value)}
              required
            />

            <Input
              type="number"
              step="0.01"
              label={t.totalIngredientCost}
              prefixSymbol="₹"
              value={totalIngredientCost}
              onChange={(e) => setTotalIngredientCost(e.target.value)}
              required
            />
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              उत्पाद मात्रा संशोधन (Pieces)
            </h4>

            <div className="space-y-3">
              {products.map((prod) => {
                const item = itemsState[prod.id] || { produced: 0, damaged: 0, notes: '' };
                const saleable = Math.max(0, item.produced - item.damaged);

                return (
                  <div
                    key={prod.id}
                    className="p-3.5 rounded-2xl bg-cream-50 dark:bg-gray-800/40 border border-cream-200 dark:border-gray-700 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                        {language === 'hi' ? prod.name_hi : prod.name_en}
                      </span>
                      <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                        बिक्री योग्य: <strong className="font-mono text-base">{saleable}</strong>{' '}
                        {t.pieces}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        label={t.producedQty}
                        isPieceQuantity
                        value={item.produced}
                        onChange={(e) =>
                          handleItemChange(prod.id, 'produced', parseInt(e.target.value, 10) || 0)
                        }
                      />
                      <Input
                        type="number"
                        label={t.damagedQty}
                        isPieceQuantity
                        value={item.damaged}
                        onChange={(e) =>
                          handleItemChange(prod.id, 'damaged', parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Input
            label="अतिरिक्त टिप्पणी (Notes)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
            <div>
              <span className="text-xs text-gray-500 block">कुल बिक्री योग्य</span>
              <span className="text-lg font-black text-maroon-900 dark:text-rose-300 font-mono">
                {formatQuantity(totalSaleable)} {t.pieces}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditingDraftBatch(null)}>
                {t.cancel}
              </Button>
              <Button type="submit" variant="primary" isLoading={updateDraftBatch.isPending}>
                {t.save}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Correct Completed Batch Modal (Owner Only) */}
      <Modal
        isOpen={Boolean(correctingBatch)}
        onClose={() => setCorrectingBatch(null)}
        title={`${t.correctRecord}: ${correctingBatch?.batch_number}`}
        subtitle="पुराना डेटा प्रतिस्थापित होगा और रिवर्सल स्टॉक मूवमेंट स्वतः दर्ज होगी"
        maxWidth="lg"
      >
        <form onSubmit={handleCorrectionSubmit} className="space-y-4">
          {isDayClosed(correctingBatch?.production_date || '') && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <Lock className="w-4 h-4 text-amber-700" />
                <span>{t.closedDayWarning}</span>
              </div>
              <p>
                तारीख {formatDate(correctingBatch?.production_date || '')} का दिन क्लोज हो चुका है।
                सुधार के लिए पहले क्लोजिंग पेज पर जाकर दिन को पुनः खोलें।
              </p>
              <Link to="/closing">
                <Button size="sm" variant="outline" className="mt-1" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                  दैनिक क्लोजिंग खोलें (Daily Closing)
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
              <p className="font-bold">सुरक्षित सुधार नीति (Safe Correction Policy):</p>
              <p className="text-blue-800">
                पुराने स्टॉक मूवमेंट हटाए नहीं जाएंगे। उनकी जगह रिवर्सल मूवमेंट और नए संस्करण (V
                {(correctingBatch?.version_number || 1) + 1}) के मूवमेंट बनेंगे।
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="date"
              label={t.productionDate}
              value={productionDate}
              onChange={(e) => setProductionDate(e.target.value)}
              required
            />

            <Input
              type="number"
              step="0.01"
              label={`${t.totalIngredientCost} (₹)`}
              prefixSymbol="₹"
              value={totalIngredientCost}
              onChange={(e) => setTotalIngredientCost(e.target.value)}
              required
            />
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              उत्पाद मात्रा तुलना व संशोधन (Old vs New)
            </h4>

            <div className="space-y-3">
              {products.map((prod) => {
                const item = itemsState[prod.id] || { produced: 0, damaged: 0, notes: '' };
                const oldItem = correctingBatch?.items.find((i) => i.product_id === prod.id);
                const oldSaleable = oldItem ? oldItem.saleable_quantity : 0;
                const newSaleable = Math.max(0, item.produced - item.damaged);
                const diff = newSaleable - oldSaleable;

                return (
                  <div
                    key={prod.id}
                    className="p-3.5 rounded-2xl bg-cream-50 dark:bg-gray-800/40 border border-cream-200 dark:border-gray-700 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                          {language === 'hi' ? prod.name_hi : prod.name_en}
                        </span>
                        <span className="text-xs text-gray-500 block">
                          पुराना बिक्री योग्य: {oldSaleable} pcs
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 block">
                          नया बिक्री योग्य: <strong className="font-mono text-base">{newSaleable}</strong> {t.pieces}
                        </span>
                        {diff !== 0 && (
                          <span
                            className={`text-xs font-bold ${
                              diff > 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            प्रभाव: {diff > 0 ? `+${diff}` : diff} pcs
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        label={t.producedQty}
                        isPieceQuantity
                        value={item.produced}
                        onChange={(e) =>
                          handleItemChange(prod.id, 'produced', parseInt(e.target.value, 10) || 0)
                        }
                      />
                      <Input
                        type="number"
                        label={t.damagedQty}
                        isPieceQuantity
                        value={item.damaged}
                        onChange={(e) =>
                          handleItemChange(prod.id, 'damaged', parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Input
            label={`${t.correctionReason} (अनिवार्य)`}
            placeholder="जैसे: दूध की लागत में भूल सुधार, शाम की अतिरिक्त ट्रे..."
            value={correctionReason}
            onChange={(e) => setCorrectionReason(e.target.value)}
            helperText="कम से कम 5 अक्षर का स्पष्ट कारण दर्ज करें"
            required
          />

          <Input
            label="अतिरिक्त टिप्पणी (Notes)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
            <div>
              <span className="text-xs text-gray-500 block">नया कुल बिक्री योग्य</span>
              <span className="text-lg font-black text-maroon-900 dark:text-rose-300 font-mono">
                {formatQuantity(totalSaleable)} {t.pieces}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setCorrectingBatch(null)}>
                {t.cancel}
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={correctBatch.isPending}
                disabled={isDayClosed(correctingBatch?.production_date || '')}
              >
                {t.correctRecord}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Revision History Modal */}
      <RevisionHistoryModal
        isOpen={Boolean(historyBatchId)}
        onClose={() => setHistoryBatchId(null)}
        title={`${t.revisionHistory}: ${batches.find((b) => b.id === historyBatchId)?.batch_number || ''}`}
        revisions={revisionHistory}
        isLoading={isHistoryLoading}
      />

      {/* Complete Batch Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(batchToComplete)}
        onClose={() => setBatchToComplete(null)}
        onConfirm={handleConfirmComplete}
        title={t.completeBatch}
        description="इस बैच को पूरा करने पर तैयार कुल्फी स्वतः मुख्य कोल्ड स्टोरेज फ्रीजर में जुड़ जाएगी।"
        confirmText="हाँ, बैच पूरा करें"
        cancelText={t.cancel}
        variant="primary"
        isLoading={completeBatch.isPending}
      />

      {/* Cancel Draft Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(batchToCancel)}
        onClose={() => setBatchToCancel(null)}
        onConfirm={handleConfirmCancel}
        title={t.cancelDraft}
        description="क्या आप वाकई इस ड्राफ्ट बैच को रद्द करना चाहते हैं?"
        confirmText="हाँ, रद्द करें"
        cancelText="नहीं"
        variant="danger"
        isLoading={cancelBatch.isPending}
      />
    </div>
  );
};
