import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useProductionBatches,
  useCompleteProductionWithRecipeTransaction,
  useCancelProductionBatch,
  useDeleteProductionBatch,
  useProductionRevisionHistory,
} from '@/hooks/useProduction';
import { useProducts, useSyncFreezerStock } from '@/hooks/useProducts';
import { useDailyClosings } from '@/hooks/useDailyClosing';
import { useRecipeForProduct } from '@/hooks/useProductionCosting';
import { useIngredients, useRawMaterialBalances } from '@/hooks/useInventory';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
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
  AlertTriangle,
  History,
  Lock,
  ShieldAlert,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
} from 'lucide-react';
import { ProductionBatchWithItems, UnitType } from '@/types';
import { CompleteBatchWithIngredientsModal } from '@/components/production/CompleteBatchWithIngredientsModal';

export const ProductionPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: batches = [], isLoading } = useProductionBatches();
  const { data: products = [] } = useProducts();
  const { data: closings = [] } = useDailyClosings();
  const { data: allIngredients = [] } = useIngredients();
  const { data: rawMaterialBalances = {} } = useRawMaterialBalances();
  const { t, language } = useLanguage();
  const { isOwner } = useAuth();

  const completeWithRecipe = useCompleteProductionWithRecipeTransaction();
  const cancelBatch = useCancelProductionBatch();
  const deleteBatch = useDeleteProductionBatch();
  const syncFreezerStock = useSyncFreezerStock();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSyncStock = async () => {
    try {
      setSyncMessage(language === 'hi' ? 'सिंक्रोनाइज़ हो रहा है...' : 'Syncing stock...');
      await syncFreezerStock.mutateAsync();
      setSyncMessage(language === 'hi' ? '✅ फ्रीजर स्टॉक और उत्पादन बैच पूर्णतः सिंक हो गए!' : '✅ Stock & Batches fully synced!');
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err: any) {
      setSyncMessage(`❌ ${err.message || 'Sync failed'}`);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(searchParams.get('new') === 'true');
  const [batchToComplete, setBatchToComplete] = useState<ProductionBatchWithItems | null>(null);
  const [batchToCancel, setBatchToCancel] = useState<string | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<ProductionBatchWithItems | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Revision History Modal
  const [historyBatchId, setHistoryBatchId] = useState<string | null>(null);
  const { data: revisionHistory = [], isLoading: isHistoryLoading } = useProductionRevisionHistory(
    historyBatchId || undefined
  );

  // --- Simplified New Production Form State ---
  const [prodDate, setProdDate] = useState(getTodayDateString());
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [producedQuantity, setProducedQuantity] = useState<number>(100);
  const [damagedQuantity, setDamagedQuantity] = useState<number>(0);
  const [lpgCost, setLpgCost] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [isActualUsageOpen, setIsActualUsageOpen] = useState(false);
  const [actualIngredientOverrides, setActualIngredientOverrides] = useState<
    Record<string, { actual_quantity: number; reason: string }>
  >({});
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-select first active product if not selected
  const activeProducts = useMemo(() => products.filter((p) => p.is_active !== false), [products]);

  const currentProductId = selectedProductId || activeProducts[0]?.id || '';

  // Fetch active recipe for selected product
  const { data: activeRecipe, isLoading: isRecipeLoading } = useRecipeForProduct(currentProductId);

  // Calculate live saleable pieces
  const saleableQuantity = Math.max(0, (producedQuantity || 0) - (damagedQuantity || 0));

  // Calculate standard required ingredients, available stock, shortages, and costing
  const calculatedRequirements = useMemo(() => {
    if (!activeRecipe || !activeRecipe.items || activeRecipe.items.length === 0) {
      return {
        items: [],
        totalIngredientCost: 0,
        costPerPiece: 0,
        hasShortages: false,
        shortageItems: [],
        expectedYield: 100,
      };
    }

    const expectedYield = activeRecipe.expected_yield_pieces || activeRecipe.standard_output_pieces || 100;
    const ratio = (producedQuantity || 0) / (expectedYield > 0 ? expectedYield : 100);

    let totalCost = 0;
    const shortageList: any[] = [];

    const items = activeRecipe.items.map((rItem) => {
      const ing = allIngredients.find((i) => i.id === rItem.ingredient_id) || rItem.ingredient;
      const stdRequired = Number((rItem.quantity * ratio).toFixed(3));
      const override = actualIngredientOverrides[rItem.ingredient_id];
      const actualQty = override ? override.actual_quantity : stdRequired;
      const varianceReason = override ? override.reason : '';

      const conversionFactor = ing?.conversion_factor || 1;
      const baseQty = Number((actualQty * conversionFactor).toFixed(3));
      const availStock = rawMaterialBalances[rItem.ingredient_id] ?? 0;
      const isShortage = availStock < baseQty;
      const shortageQty = isShortage ? Number((baseQty - availStock).toFixed(3)) : 0;

      const rate = Number(ing?.current_rate) || 0;
      const itemCost = Number((baseQty * rate).toFixed(2));
      totalCost += itemCost;

      const itemResult = {
        ingredientId: rItem.ingredient_id,
        name_hi: ing?.name_hi || 'सामग्री',
        name_en: ing?.name_en || 'Ingredient',
        recipeQty: rItem.quantity,
        stdRequired,
        actualQty,
        unit: rItem.unit,
        baseUnit: ing?.base_unit || rItem.unit,
        baseQty,
        availStock,
        isShortage,
        shortageQty,
        rate,
        rateUnit: ing?.rate_unit || rItem.unit,
        itemCost,
        varianceReason,
      };

      if (isShortage) {
        shortageList.push(itemResult);
      }

      return itemResult;
    });

    const lpgCostNum = parseFloat(lpgCost) || 0;
    const totalBatchCost = totalCost + lpgCostNum;
    const costPerPiece = (producedQuantity || 0) > 0 ? Number((totalBatchCost / producedQuantity).toFixed(2)) : 0;

    return {
      items,
      totalIngredientCost: Number(totalCost.toFixed(2)),
      totalBatchCost: Number(totalBatchCost.toFixed(2)),
      costPerPiece,
      hasShortages: shortageList.length > 0,
      shortageItems: shortageList,
      expectedYield,
    };
  }, [activeRecipe, producedQuantity, allIngredients, rawMaterialBalances, actualIngredientOverrides, lpgCost]);

  // Open New Production Modal
  const handleOpenNewModal = () => {
    setProdDate(getTodayDateString());
    if (activeProducts.length > 0) {
      setSelectedProductId(activeProducts[0].id);
    }
    setProducedQuantity(100);
    setDamagedQuantity(0);
    setLpgCost('0');
    setNotes('');
    setActualIngredientOverrides({});
    setIsActualUsageOpen(false);
    setFormError(null);
    setIsNewModalOpen(true);
  };

  const handleActualQtyChange = (ingredientId: string, actualQty: number, stdQty: number) => {
    setActualIngredientOverrides((prev) => {
      const current = prev[ingredientId] || { actual_quantity: stdQty, reason: '' };
      return {
        ...prev,
        [ingredientId]: {
          ...current,
          actual_quantity: Math.max(0, actualQty),
        },
      };
    });
  };

  const handleVarianceReasonChange = (ingredientId: string, reason: string, stdQty: number) => {
    setActualIngredientOverrides((prev) => {
      const current = prev[ingredientId] || { actual_quantity: stdQty, reason: '' };
      return {
        ...prev,
        [ingredientId]: {
          ...current,
          reason,
        },
      };
    });
  };

  // Submit Simplified New Production Batch
  const handleCompleteProductionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!currentProductId) {
      setFormError('कृपया कुल्फी का प्रकार (Product) चुनें।');
      return;
    }

    if (!producedQuantity || producedQuantity <= 0) {
      setFormError('उत्पादित मात्रा (Produced Quantity) शून्य से अधिक होनी चाहिए।');
      return;
    }

    if (damagedQuantity < 0) {
      setFormError('खराब मात्रा ऋणात्मक नहीं हो सकती।');
      return;
    }

    if (damagedQuantity > producedQuantity) {
      setFormError(`खराब मात्रा (${damagedQuantity}) उत्पादित मात्रा (${producedQuantity}) से अधिक नहीं हो सकती।`);
      return;
    }

    if (!activeRecipe) {
      setFormError(`इस उत्पाद के लिए कोई सक्रिय रेसिपी (Active Recipe) सेट नहीं है। कृपया पहले मास्टर में रेसिपी सक्रिय करें।`);
      return;
    }

    if (calculatedRequirements.hasShortages) {
      const shortageNames = calculatedRequirements.shortageItems.map((i) => i.name_hi).join(', ');
      setFormError(`कच्चा माल कम है! निम्नलिखित सामग्री का पर्याप्त स्टॉक नहीं है: ${shortageNames}`);
      return;
    }

    // Validate reasons for any actual overrides
    const actualOverridesPayload: { ingredient_id: string; actual_quantity: number; unit: UnitType; reason?: string }[] = [];
    for (const item of calculatedRequirements.items) {
      if (item.actualQty !== item.stdRequired) {
        if (!item.varianceReason || item.varianceReason.trim().length < 3) {
          setFormError(`सामग्री "${item.name_hi}" की वास्तविक खपत में अंतर के लिए स्पष्ट कारण अनिवार्य है।`);
          return;
        }
        actualOverridesPayload.push({
          ingredient_id: item.ingredientId,
          actual_quantity: item.actualQty,
          unit: item.unit,
          reason: item.varianceReason.trim(),
        });
      }
    }

    try {
      const idempotencyKey = crypto.randomUUID();
      const lpgCostNum = parseFloat(lpgCost) || 0;

      const res = await completeWithRecipe.mutateAsync({
        productionDate: prodDate,
        productId: currentProductId,
        producedQuantity,
        damagedQuantity,
        recipeId: activeRecipe.id,
        actualIngredients: actualOverridesPayload.length > 0 ? actualOverridesPayload : undefined,
        notes,
        lpgCost: lpgCostNum,
        idempotencyKey,
      });

      setIsNewModalOpen(false);
      setSearchParams({});
      setSyncMessage(`✅ ${res.message || 'उत्पादन सफलतापूर्वक दर्ज हुआ!'}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (err: any) {
      setFormError(err.message || 'उत्पादन बैच पूर्ण करने में त्रुटि हुई');
    }
  };

  const isDayClosed = (dateStr: string) =>
    closings.find((c) => c.business_date === dateStr)?.status === 'closed';

  const handleConfirmCancel = async () => {
    if (!batchToCancel) return;
    try {
      await cancelBatch.mutateAsync(batchToCancel);
      setBatchToCancel(null);
    } catch (err: any) {
      alert(err.message || 'बैच रद्द करने में त्रुटि हुई');
    }
  };

  const handleConfirmDelete = async () => {
    if (!batchToDelete) return;
    setDeleteError(null);
    try {
      await deleteBatch.mutateAsync({
        batchId: batchToDelete.id,
        reason: deleteReason.trim() || 'Deleted by Owner',
      });
      setBatchToDelete(null);
      setDeleteReason('');
    } catch (err: any) {
      setDeleteError(err.message || 'बैच हटाने में त्रुटि हुई');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Factory className="w-7 h-7 text-maroon-800" />
            {t.productionBatches}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            कारखाने में दैनिक कुल्फी निर्माण — सक्रिय रेसिपी से स्वचालित लागत व कच्चा माल कटौती
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            leftIcon={<RefreshCw className={`w-4 h-4 text-emerald-800 ${syncFreezerStock.isPending ? 'animate-spin' : ''}`} />}
            className="border-emerald-700 text-emerald-900 font-bold hover:bg-emerald-50"
            onClick={handleSyncStock}
            disabled={syncFreezerStock.isPending}
          >
            {syncFreezerStock.isPending
              ? (language === 'hi' ? 'सिंक हो रहा है...' : 'Syncing...')
              : (language === 'hi' ? '🔄 स्टॉक सिंक करें' : '🔄 Sync Stock')}
          </Button>

          <Button
            variant="primary"
            leftIcon={<Plus className="w-5 h-5" />}
            onClick={handleOpenNewModal}
            className="shadow-md shadow-maroon-900/20"
          >
            {t.newBatch}
          </Button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-900 flex items-center justify-between shadow-sm animate-fade-in">
          <span>{syncMessage}</span>
          <Button size="sm" variant="ghost" className="text-emerald-800 h-6 px-2 text-[10px]" onClick={() => setSyncMessage(null)}>
            ✕
          </Button>
        </div>
      )}

      {/* Batches List */}
      {isLoading ? (
        <Card className="py-12 text-center text-gray-500">{t.loading}</Card>
      ) : batches.length === 0 ? (
        <Card className="py-12 text-center text-gray-500">
          <Factory className="w-12 h-12 mx-auto text-gray-400 mb-3 opacity-50" />
          <p className="text-base font-semibold text-gray-700">
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
            const totalProduced = batch.items.reduce((s, it) => s + it.produced_quantity, 0);
            const closed = isDayClosed(batch.production_date);

            return (
              <Card key={batch.id} className="space-y-4 border border-cream-300">
                {/* Batch Top Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cream-200 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-base text-maroon-950">
                      {batch.batch_number}
                    </span>
                    <Badge variant={batch.status === 'completed' ? 'success' : batch.status === 'draft' ? 'warning' : 'danger'}>
                      {batch.status === 'completed' ? (t.completed || 'पूर्ण') : batch.status === 'draft' ? (t.draft || 'ड्राफ्ट') : (t.cancel || 'रद्द')}
                    </Badge>
                    {batch.costing_source === 'recipe_calculated' && (
                      <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-800 border-emerald-300">
                        <Sparkles className="w-3 h-3 mr-1" />
                        रेसिपी आधारित
                      </Badge>
                    )}
                    {batch.costing_source === 'actual_override' && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-800 border-blue-300">
                        वास्तविक खपत संशोधित
                      </Badge>
                    )}
                    {batch.costing_source === 'legacy_manual' && (
                      <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-300">
                        मैनुअल (Legacy)
                      </Badge>
                    )}
                    {closed && (
                      <Badge variant="danger" className="text-xs">
                        <Lock className="w-3 h-3 mr-1" /> {t.closed || 'बंद दिन'}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-medium">
                    {formatDate(batch.production_date)}
                  </div>
                </div>

                {/* Items Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {batch.items.map((it) => (
                    <div
                      key={it.id}
                      className="p-3 rounded-xl bg-cream-50/70 border border-cream-200 text-xs space-y-1.5"
                    >
                      <span className="font-bold text-gray-900 block text-sm">
                        {language === 'hi' ? it.product?.name_hi : it.product?.name_en}
                      </span>
                      <div className="flex justify-between text-gray-600">
                        <span>{t.producedQty}:</span>
                        <span className="font-mono font-bold text-gray-900">
                          {formatQuantity(it.produced_quantity)}
                        </span>
                      </div>
                      <div className="flex justify-between text-rose-700">
                        <span>{t.damagedQty}:</span>
                        <span className="font-mono font-bold">
                          {formatQuantity(it.damaged_quantity)}
                        </span>
                      </div>
                      <div className="flex justify-between text-emerald-800 font-bold border-t border-cream-200 pt-1">
                        <span>{t.saleableQty}:</span>
                        <span className="font-mono">
                          {formatQuantity(it.saleable_quantity)} {t.pieces}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-500 text-[10px] pt-0.5 font-mono">
                        <span>लागत / पीस:</span>
                        <span className="font-bold text-gray-800">
                          ₹{(it.unit_production_cost || (batch.cost_per_saleable_piece ?? 0)).toFixed(2)}/pc
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary & Action Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-100 bg-cream-50/30 -mx-4 -mb-4 px-4 py-3">
                  <div className="flex items-center gap-4 text-xs flex-wrap">
                    <span className="font-semibold text-gray-700">
                      बिक्री योग्य पीस:{' '}
                      <strong className="text-maroon-900 font-mono text-sm">
                        {formatQuantity(batchTotalSaleable)} {t.pieces}
                      </strong>
                    </span>
                    <span className="text-gray-600 font-mono text-xs">
                      कुल लागत: <strong>{formatCurrency(batch.total_batch_cost || batch.total_ingredient_cost)}</strong>
                    </span>
                    <span className="text-emerald-800 font-mono text-xs font-bold">
                      प्रति पीस: ₹{(batch.cost_per_saleable_piece ?? ((batch.total_ingredient_cost || 0) / (totalProduced || 1))).toFixed(2)}
                    </span>
                    {totalDamaged > 0 && (
                      <span className="text-rose-700 font-medium">
                        खराब: {formatQuantity(totalDamaged)} {t.pieces}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Draft Actions */}
                    {batch.status === 'draft' && (
                      <>
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
                          onClick={() => setBatchToComplete(batch)}
                        >
                          {t.completeBatch}
                        </Button>
                      </>
                    )}

                    {/* Completed Actions */}
                    {batch.status === 'completed' && (
                      <>
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

                    {/* Owner Delete Button */}
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                        onClick={() => {
                          setBatchToDelete(batch);
                          setDeleteReason('');
                          setDeleteError(null);
                        }}
                      >
                        {t.deleteBatch || 'हटाएं'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SIMPLIFIED NEW PRODUCTION BATCH MODAL (No Manual Total Cost Field)        */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => {
          setIsNewModalOpen(false);
          setSearchParams({});
        }}
        title="नया उत्पादन बैच दर्ज करें (New Production Batch)"
        subtitle="उत्पाद व मात्रा चुनें — रेसिपी से स्वचालित लागत व कच्चा माल कटौती होगी"
        maxWidth="lg"
      >
        <form onSubmit={handleCompleteProductionSubmit} className="space-y-4">
          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">कृपया निम्नलिखित त्रुटि ठीक करें:</p>
                <p>{formError}</p>
              </div>
            </div>
          )}

          {/* Form Top Row: Production Date & Product Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="date"
              label={t.productionDate}
              value={prodDate}
              onChange={(e) => setProdDate(e.target.value)}
              required
            />

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                कुल्फी का प्रकार (Kulfi Variety / Product) *
              </label>
              <select
                value={currentProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-cream-300 rounded-xl text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:border-maroon-800"
                required
              >
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name_hi} ({p.name_en}) — दर: ₹{p.current_price}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Recipe Banner / Indicator */}
          <div className="p-3.5 rounded-2xl bg-cream-100/80 border border-cream-300 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-maroon-800 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                  सक्रिय रेसिपी (Active Recipe Version)
                </span>
                <span className="text-sm font-bold text-maroon-950">
                  {isRecipeLoading
                    ? 'रेसिपी लोड हो रही है...'
                    : activeRecipe
                    ? `${activeRecipe.name} (v${activeRecipe.version_number})`
                    : 'कोई सक्रिय रेसिपी नहीं'}
                </span>
              </div>
            </div>
            {activeRecipe && (
              <div className="text-right">
                <span className="text-[11px] text-gray-500 block">मानक उपज (Yield)</span>
                <span className="text-sm font-black font-mono text-gray-900">
                  {activeRecipe.expected_yield_pieces || activeRecipe.standard_output_pieces || 100} {t.pieces}
                </span>
              </div>
            )}
          </div>

          {/* Quantities Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              type="number"
              label={`${t.producedQty} (पीस) *`}
              isPieceQuantity
              value={producedQuantity}
              onChange={(e) => setProducedQuantity(Math.max(1, parseInt(e.target.value, 10) || 0))}
              min={1}
              required
            />

            <Input
              type="number"
              label={`${t.damagedQty} (खराब पीस)`}
              isPieceQuantity
              value={damagedQuantity}
              onChange={(e) => setDamagedQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))}
              min={0}
            />

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {t.saleableQty} (बिक्री योग्य)
              </label>
              <div className="px-3.5 py-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 font-mono font-bold text-base flex items-center justify-between">
                <span>{formatQuantity(saleableQuantity)}</span>
                <span className="text-xs font-sans font-semibold text-emerald-800">{t.pieces}</span>
              </div>
            </div>
          </div>

          {/* Read-Only Live Costing & Raw Material Requirement Preview */}
          <div className="p-4 rounded-2xl bg-cream-50 border border-cream-200 space-y-3">
            <div className="flex items-center justify-between border-b border-cream-200 pb-2.5">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-maroon-800" />
                स्वचालित सामग्री आवश्यकता व लागत पूर्वावलोकन (Live Preview)
              </h4>
              <span className="text-[11px] font-semibold text-gray-500">
                {producedQuantity} पीस के आधार पर
              </span>
            </div>

            {/* Cost Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="p-2.5 bg-white rounded-xl border border-cream-200 shadow-sm">
                <span className="text-[11px] text-gray-500 block">1 कुल्फी लागत</span>
                <span className="text-base font-black font-mono text-emerald-900">
                  ₹{calculatedRequirements.costPerPiece.toFixed(2)}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-cream-200 shadow-sm">
                <span className="text-[11px] text-gray-500 block">अनुमानित सामग्री लागत</span>
                <span className="text-base font-black font-mono text-maroon-900">
                  {formatCurrency(calculatedRequirements.totalIngredientCost)}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-cream-200 shadow-sm">
                <span className="text-[11px] text-gray-500 block">कुल उत्पादन लागत</span>
                <span className="text-base font-black font-mono text-maroon-950">
                  {formatCurrency(calculatedRequirements.totalBatchCost)}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-cream-200 shadow-sm">
                <span className="text-[11px] text-gray-500 block">स्टॉक स्थिति</span>
                <span className={`text-xs font-bold block mt-1 ${calculatedRequirements.hasShortages ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {calculatedRequirements.hasShortages ? '⚠️ सामग्री की कमी' : '✅ पर्याप्त स्टॉक'}
                </span>
              </div>
            </div>

            {/* Ingredients Table */}
            <div className="space-y-2 pt-1">
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {calculatedRequirements.items.map((item) => (
                  <div
                    key={item.ingredientId}
                    className={`flex items-center justify-between p-2 rounded-xl text-xs border ${
                      item.isShortage ? 'bg-rose-50 border-rose-300' : 'bg-white border-cream-200'
                    }`}
                  >
                    <div className="flex-1">
                      <span className="font-bold text-gray-900 block">{item.name_hi}</span>
                      <span className="text-[10px] text-gray-500">
                        आवश्यक: <strong className="text-gray-800">{item.actualQty} {item.unit}</strong> | उपलब्ध: {item.availStock} {item.baseUnit}
                      </span>
                    </div>

                    <div className="text-right flex items-center gap-3">
                      {item.isShortage ? (
                        <span className="text-xs font-bold text-rose-700 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          कमी: {item.shortageQty} {item.baseUnit}
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono text-emerald-800 font-bold">
                          {formatCurrency(item.itemCost)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Shortage Warning Box */}
            {calculatedRequirements.hasShortages && (
              <div className="p-3 bg-rose-100/90 border border-rose-300 rounded-xl text-xs text-rose-900 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                <span>
                  सावधानी: कुछ सामग्रियों का पर्याप्त स्टॉक नहीं है। उत्पादन दर्ज करने से पहले कृपया स्टॉक दर्ज करें।
                </span>
              </div>
            )}
          </div>

          {/* Optional Owner-Only Actual Usage Correction Section */}
          {isOwner && (
            <div className="border border-cream-300 rounded-2xl overflow-hidden bg-cream-50/50">
              <button
                type="button"
                onClick={() => setIsActualUsageOpen(!isActualUsageOpen)}
                className="w-full px-4 py-3 text-left font-bold text-xs text-gray-800 flex items-center justify-between hover:bg-cream-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-maroon-800" />
                  <span>वास्तविक खपत संशोधन (Actual Usage Correction — मालिक केवल)</span>
                </div>
                {isActualUsageOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {isActualUsageOpen && (
                <div className="p-4 border-t border-cream-200 bg-white space-y-3">
                  <p className="text-xs text-gray-600">
                    यदि आज सामग्री की वास्तविक खपत रेसिपी मानक से भिन्न रही है, तो मालिक यहाँ संशोधन कर सकते हैं। अंतर होने पर कारण लिखना अनिवार्य है।
                  </p>

                  <div className="space-y-3">
                    {calculatedRequirements.items.map((item) => (
                      <div
                        key={item.ingredientId}
                        className="p-3 bg-cream-50 rounded-xl border border-cream-200 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-gray-900">
                          <span>{item.name_hi}</span>
                          <span className="text-gray-500 font-normal">मानक: {item.stdRequired} {item.unit}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            type="number"
                            step="any"
                            label={`वास्तविक खपत (${item.unit})`}
                            value={item.actualQty}
                            onChange={(e) =>
                              handleActualQtyChange(
                                item.ingredientId,
                                parseFloat(e.target.value) || 0,
                                item.stdRequired
                              )
                            }
                          />

                          {item.actualQty !== item.stdRequired && (
                            <Input
                              type="text"
                              label="अंतर का कारण (Mandatory Reason) *"
                              placeholder="जैसे: दूध ज्यादा उबाला, गाढ़ा किया..."
                              value={item.varianceReason}
                              onChange={(e) =>
                                handleVarianceReasonChange(
                                  item.ingredientId,
                                  e.target.value,
                                  item.stdRequired
                                )
                              }
                              required
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Optional Notes & LPG Cost */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="number"
              step="any"
              label="LPG गैस लागत (वैकल्पिक ओवरहेड ₹)"
              prefixSymbol="₹"
              value={lpgCost}
              onChange={(e) => setLpgCost(e.target.value)}
              min={0}
            />

            <Input
              label="अतिरिक्त टिप्पणी (Notes)"
              placeholder="जैसे: सुबह की पहली शिफ्ट..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Submit Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-cream-200">
            <div>
              <span className="text-xs text-gray-500 block">कुल बिक्री योग्य कुल्फी</span>
              <span className="text-lg font-black text-maroon-950 font-mono">
                {formatQuantity(saleableQuantity)} {t.pieces}
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
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={completeWithRecipe.isPending}
                disabled={calculatedRequirements.hasShortages}
                className="font-bold shadow-md shadow-maroon-900/20"
                leftIcon={<CheckCircle className="w-4 h-4" />}
              >
                उत्पादन पूर्ण करें एवं फ्रीजर में दर्ज करें
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

      {/* Complete Batch with Raw Material Deduction Modal (for Legacy Drafts) */}
      <CompleteBatchWithIngredientsModal
        batch={batchToComplete}
        isOpen={Boolean(batchToComplete)}
        onClose={() => setBatchToComplete(null)}
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

      {/* Delete Batch Modal */}
      <Modal
        isOpen={Boolean(batchToDelete)}
        onClose={() => {
          setBatchToDelete(null);
          setDeleteReason('');
          setDeleteError(null);
        }}
        title={`${t.deleteBatch || 'बैच हटाएं'}: ${batchToDelete?.batch_number || ''}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800 space-y-1">
              <p className="font-semibold text-rose-900">
                {t.deleteBatchConfirm || 'क्या आप वाकई इस उत्पादन बैच को स्थायी रूप से हटाना चाहते हैं?'}
              </p>
              <p>
                {batchToDelete?.status === 'completed'
                  ? 'यह क्रिया मुख्य फ्रीजर में से इस बैच द्वारा जोड़ी गई कुल्फी मात्रा को स्वतः घटा देगी।'
                  : 'यह ड्राफ्ट बैच स्थायी रूप से हटा दिया जाएगा।'}
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
              placeholder="जैसे: गलत प्रविष्टि, दोबारा बनाया गया"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <Button
              variant="secondary"
              onClick={() => {
                setBatchToDelete(null);
                setDeleteReason('');
                setDeleteError(null);
              }}
              disabled={deleteBatch.isPending}
            >
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              isLoading={deleteBatch.isPending}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              {t.deleteBatch || 'हाँ, बैच हटाएं'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
