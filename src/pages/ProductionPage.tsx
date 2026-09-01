import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useProductionBatches,
  useCreateProductionBatch,
  useCompleteProductionBatch,
  useCancelProductionBatch,
} from '@/hooks/useProduction';
import { useProducts } from '@/hooks/useProducts';
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
  formatQuantity,
  formatDate,
  getTodayDateString,
} from '@/lib/formatters';
import { Factory, Plus, CheckCircle, AlertCircle } from 'lucide-react';

export const ProductionPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: batches = [], isLoading } = useProductionBatches();
  const { data: products = [] } = useProducts();
  const { t, language } = useLanguage();
  const { isProduction } = useAuth();
  const { isOnline, saveDraft } = useSync();

  const createBatch = useCreateProductionBatch();
  const completeBatch = useCompleteProductionBatch();
  const cancelBatch = useCancelProductionBatch();

  const [isNewModalOpen, setIsNewModalOpen] = useState(searchParams.get('new') === 'true');
  const [batchToComplete, setBatchToComplete] = useState<string | null>(null);
  const [batchToCancel, setBatchToCancel] = useState<string | null>(null);

  // New Batch Form State
  const [productionDate, setProductionDate] = useState(getTodayDateString());
  const [totalIngredientCost, setTotalIngredientCost] = useState<string>('500');
  const [notes, setNotes] = useState('');
  const [itemsState, setItemsState] = useState<
    Record<string, { produced: number; damaged: number; notes: string }>
  >({});
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize form with active products
  const handleOpenNewModal = () => {
    const initial: Record<string, { produced: number; damaged: number; notes: string }> = {};
    products.forEach((p) => {
      initial[p.id] = { produced: 0, damaged: 0, notes: '' };
    });
    setItemsState(initial);
    setProductionDate(getTodayDateString());
    setFormError(null);
    setIsNewModalOpen(true);
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

    // Validate damage <= produced
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
      alert(err.message || 'रद्द करने में त्रुटि');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Factory className="w-6 h-6 text-maroon-800" />
            {t.productionBatches}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            कारखाने में दैनिक कुल्फी उत्पादन व सामग्री लागत का हिसाब
          </p>
        </div>

        {isProduction && (
          <Button
            variant="primary"
            leftIcon={<Plus className="w-5 h-5" />}
            onClick={handleOpenNewModal}
          >
            {t.newBatch}
          </Button>
        )}
      </div>

      {/* Batches List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-gray-500 mt-3">{t.loading}</p>
        </div>
      ) : batches.length === 0 ? (
        <Card className="text-center py-12">
          <div className="w-14 h-14 bg-cream-200 text-maroon-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Factory className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-900">{t.noBatchesFound}</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            नया उत्पादन बैच दर्ज करने के लिए ऊपर दिए गए बटन पर क्लिक करें।
          </p>
          {isProduction && (
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={handleOpenNewModal}
            >
              {t.newBatch}
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const totalDamaged = batch.items.reduce((s, it) => s + it.damaged_quantity, 0);
            const batchTotalSaleable = batch.items.reduce((s, it) => s + it.saleable_quantity, 0);

            return (
              <Card key={batch.id} className="overflow-hidden border-cream-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-base text-maroon-950">
                      {batch.batch_number}
                    </span>
                    <Badge variant={batch.status}>
                      {batch.status === 'completed' ? t.completed : batch.status === 'draft' ? t.draft : batch.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-semibold text-gray-600">
                    <span>📅 {formatDate(batch.production_date)}</span>
                    <span>💰 {t.totalIngredientCost}: {formatCurrency(batch.total_ingredient_cost)}</span>
                  </div>
                </div>

                {/* Items Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-3">
                  {batch.items.map((it) => (
                    <div
                      key={it.id}
                      className="p-2.5 rounded-xl bg-cream-50/70 border border-cream-200 text-xs"
                    >
                      <span className="font-bold text-gray-900 block text-sm mb-1">
                        {language === 'hi' ? it.product?.name_hi : it.product?.name_en}
                      </span>
                      <div className="flex justify-between text-gray-600">
                        <span>{t.producedQty}:</span>
                        <span className="font-mono font-bold text-gray-900">{formatQuantity(it.produced_quantity)}</span>
                      </div>
                      <div className="flex justify-between text-rose-700">
                        <span>{t.damagedQty}:</span>
                        <span className="font-mono font-bold">{formatQuantity(it.damaged_quantity)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-800 font-bold border-t border-cream-200 pt-1 mt-1">
                        <span>{t.saleableQty}:</span>
                        <span className="font-mono">{formatQuantity(it.saleable_quantity)} {t.pieces}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary & Action Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-100 bg-cream-50/30 -mx-4 -mb-4 px-4 py-3">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-semibold text-gray-700">
                      कुल बिक्री योग्य:{' '}
                      <strong className="text-maroon-900 font-mono text-sm">{formatQuantity(batchTotalSaleable)} {t.pieces}</strong>
                    </span>
                    {totalDamaged > 0 && (
                      <span className="text-rose-700 font-medium">
                        खराब: {formatQuantity(totalDamaged)} {t.pieces}
                      </span>
                    )}
                  </div>

                  {batch.status === 'draft' && isProduction && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-700 hover:bg-rose-50"
                        onClick={() => setBatchToCancel(batch.id)}
                      >
                        {t.cancel}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<CheckCircle className="w-4 h-4" />}
                        onClick={() => setBatchToComplete(batch.id)}
                      >
                        {t.completeBatch}
                      </Button>
                    </div>
                  )}

                  {batch.status === 'completed' && (
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      {t.batchCompletedSuccess}
                    </span>
                  )}
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
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              उत्पाद-वार उत्पादन विवरण (Pieces)
            </h4>

            <div className="space-y-3">
              {products.map((prod) => {
                const item = itemsState[prod.id] || { produced: 0, damaged: 0, notes: '' };
                const saleable = Math.max(0, item.produced - item.damaged);

                return (
                  <div
                    key={prod.id}
                    className="p-3.5 rounded-2xl bg-cream-50 border border-cream-200 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-sm text-gray-900">
                          {language === 'hi' ? prod.name_hi : prod.name_en}
                        </span>
                        <span className="text-xs text-gray-500 block">
                          SKU: {prod.sku} | दर: {formatCurrency(prod.current_price)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-emerald-800">
                          बिक्री योग्य: <strong className="font-mono text-base">{saleable}</strong> {t.pieces}
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

          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div>
              <span className="text-xs text-gray-500 block">कुल तैयार पीस</span>
              <span className="text-lg font-black text-maroon-900 font-mono">
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
        title={t.cancelBatch}
        description="क्या आप वाकई इस ड्राफ्ट बैच को रद्द करना चाहते हैं?"
        confirmText="हाँ, रद्द करें"
        cancelText="नहीं"
        variant="danger"
        isLoading={cancelBatch.isPending}
      />
    </div>
  );
};
