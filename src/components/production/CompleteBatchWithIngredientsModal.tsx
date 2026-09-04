import React, { useState, useEffect } from 'react';
import { ProductionBatchWithItems, Ingredient, UnitType } from '@/types';
import { useIngredients } from '@/hooks/useInventory';
import { useCompleteProductionWithRawMaterials } from '@/hooks/useProduction';
import { api } from '@/lib/api';
import { formatIngredientQuantityWithUnit, convertQuantity } from '@/lib/inventoryService';
import { formatCurrency } from '@/lib/formatters';
import { useLanguage } from '@/i18n/LanguageContext';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { AlertCircle, ShieldAlert, Package } from 'lucide-react';

interface Props {
  batch: ProductionBatchWithItems | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface RawMaterialRequirement {
  ingredientId: string;
  ingredient: Ingredient;
  standardRequiredQuantity: number;
  actualQuantityUsed: number;
  unit: UnitType;
  availableStock: number;
  shortage: number;
  rate: number;
  totalCost: number;
}

export const CompleteBatchWithIngredientsModal: React.FC<Props> = ({
  batch,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useLanguage();
  const { data: allIngredients = [] } = useIngredients();
  const completeMutation = useCompleteProductionWithRawMaterials();

  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [requirements, setRequirements] = useState<RawMaterialRequirement[]>([]);
  const [allowEmergencyOverride, setAllowEmergencyOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Compute required recipe raw materials whenever the batch opens
  useEffect(() => {
    if (!isOpen || !batch) return;

    let isMounted = true;
    setLoadingRecipes(true);
    setError(null);
    setAllowEmergencyOverride(false);
    setOverrideReason('');

    async function loadRecipeRequirements() {
      try {
        const aggregatedMap = new Map<string, { qty: number; unit: UnitType }>();

        for (const item of batch?.items || []) {
          if (!item.produced_quantity || item.produced_quantity <= 0) continue;

          const recipe = await api.getRecipeForProduct(item.product_id);
          if (recipe && recipe.items && recipe.items.length > 0) {
            const stdOutput = recipe.standard_output_pieces || 100;
            const ratio = item.produced_quantity / stdOutput;

            for (const rit of recipe.items) {
              const current = aggregatedMap.get(rit.ingredient_id) || { qty: 0, unit: rit.unit };
              const reqQty = Number(rit.quantity) * ratio;
              aggregatedMap.set(rit.ingredient_id, {
                qty: current.qty + reqQty,
                unit: rit.unit,
              });
            }
          }
        }

        // If no recipes found, auto-suggest based on standard defaults (Milk, Sugar, Khoya, Sticks, Wrappers)
        if (aggregatedMap.size === 0) {
          const totalProduced = batch?.items.reduce((sum, it) => sum + (it.produced_quantity || 0), 0) || 0;
          const ratio = totalProduced / 100;

          const milkIng = allIngredients.find((i) => i.code === 'ING-MILK');
          const sugIng = allIngredients.find((i) => i.code === 'ING-SUGAR');
          const khoyIng = allIngredients.find((i) => i.code === 'ING-KHOYA');
          const stkIng = allIngredients.find((i) => i.code === 'ING-STICK');
          const wrpIng = allIngredients.find((i) => i.code === 'ING-WRAPPER');

          if (milkIng) aggregatedMap.set(milkIng.id, { qty: 15 * ratio, unit: milkIng.base_unit });
          if (sugIng) aggregatedMap.set(sugIng.id, { qty: 1.5 * ratio, unit: sugIng.base_unit });
          if (khoyIng) aggregatedMap.set(khoyIng.id, { qty: 1.0 * ratio, unit: khoyIng.base_unit });
          if (stkIng) aggregatedMap.set(stkIng.id, { qty: totalProduced, unit: 'piece' });
          if (wrpIng) aggregatedMap.set(wrpIng.id, { qty: totalProduced, unit: 'piece' });
        }

        const reqList: RawMaterialRequirement[] = [];
        aggregatedMap.forEach((req, ingId) => {
          const ing = allIngredients.find((i) => i.id === ingId);
          if (!ing) return;

          const stdQty = Number(req.qty.toFixed(3));
          const baseStdQty = convertQuantity(stdQty, req.unit, ing.base_unit, ing.conversion_factor || 1);
          const available = ing.available_base_quantity || 0;
          const shortage = available < baseStdQty ? Number((baseStdQty - available).toFixed(3)) : 0;
          const rate = ing.weighted_average_rate || ing.current_rate;
          const cost = Number((baseStdQty * rate).toFixed(2));

          reqList.push({
            ingredientId: ing.id,
            ingredient: ing,
            standardRequiredQuantity: stdQty,
            actualQuantityUsed: stdQty,
            unit: req.unit,
            availableStock: available,
            shortage,
            rate,
            totalCost: cost,
          });
        });

        if (isMounted) {
          setRequirements(reqList);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'सामग्री आवश्यकता लोड करने में विफल');
      } finally {
        if (isMounted) setLoadingRecipes(false);
      }
    }

    loadRecipeRequirements();

    return () => {
      isMounted = false;
    };
  }, [isOpen, batch, allIngredients]);

  const handleActualQtyChange = (ingredientId: string, val: number) => {
    setRequirements((prev) =>
      prev.map((r) => {
        if (r.ingredientId === ingredientId) {
          const actual = Math.max(0, val);
          const baseActual = convertQuantity(actual, r.unit, r.ingredient.base_unit, r.ingredient.conversion_factor || 1);
          const shortage = r.availableStock < baseActual ? Number((baseActual - r.availableStock).toFixed(3)) : 0;
          const cost = Number((baseActual * r.rate).toFixed(2));
          return {
            ...r,
            actualQuantityUsed: actual,
            shortage,
            totalCost: cost,
          };
        }
        return r;
      })
    );
  };

  const hasAnyShortage = requirements.some((r) => r.shortage > 0);
  const totalRawCost = requirements.reduce((sum, r) => sum + r.totalCost, 0);

  const handleSubmit = async () => {
    if (!batch) return;
    setError(null);

    if (hasAnyShortage && !allowEmergencyOverride) {
      setError('कच्ची सामग्री का स्टॉक कम है। आगे बढ़ने के लिए आपातकालीन ओवरराइड चुनें अथवा स्टॉक जोड़ें।');
      return;
    }

    if (hasAnyShortage && allowEmergencyOverride && !overrideReason.trim()) {
      setError('आपातकालीन ओवरराइड का कारण दर्ज करना अनिवार्य है।');
      return;
    }

    const payload = requirements.map((r) => ({
      ingredient_id: r.ingredientId,
      quantity_used: r.actualQuantityUsed,
      unit: r.unit,
    }));

    try {
      await completeMutation.mutateAsync({
        batchId: batch.id,
        rawMaterials: payload,
        allowEmergencyOverride,
        overrideReason: overrideReason.trim() || undefined,
      });

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'बैच पूरा करने में विफल');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`बैच पूरा करें और कच्ची सामग्री घटाएं: ${batch?.batch_number || ''}`}
      maxWidth="xl"
    >
      <div className="space-y-5">
        {/* Batch Produced Summary */}
        <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-amber-800">तैयार उत्पादन (Production Output)</p>
            <p className="text-sm font-bold text-amber-950">
              {batch?.items.map((it) => `${it.product?.name_hi || it.product?.name_en || 'कुल्फी'}: ${it.produced_quantity} पीस`).join(' • ')}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
              कुल: {batch?.items.reduce((s, it) => s + (it.saleable_quantity || 0), 0)} बिक्री योग्य पीस
            </span>
          </div>
        </div>

        {/* Shortage Warning Banner */}
        {hasAnyShortage && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800 space-y-1">
              <p className="font-bold text-rose-900">कच्ची सामग्री का स्टॉक कम है (Raw Material Shortage Alert)</p>
              <p>
                कुछ सामग्रियों का उपलब्ध स्टॉक इस बैच के लिए पर्याप्त नहीं है। आप आपातकालीन ओवरराइड के साथ आगे बढ़ सकते हैं अथवा पहले स्टॉक खरीद दर्ज कर सकते हैं।
              </p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Raw Material Requirements Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-4 h-4 text-amber-600" />
              कच्ची सामग्री की खपत (Raw Material Consumption)
            </h4>
            <span className="text-xs text-stone-500 font-medium">
              अनुमानित सामग्री लागत: <strong className="text-stone-800">{formatCurrency(totalRawCost)}</strong>
            </span>
          </div>

          <div className="border border-stone-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-50 text-stone-600 border-b border-stone-200">
                <tr>
                  <th className="p-2.5 font-semibold">सामग्री (Ingredient)</th>
                  <th className="p-2.5 font-semibold text-right">रेसिपी आवश्यकता</th>
                  <th className="p-2.5 font-semibold text-right">उपलब्ध स्टॉक</th>
                  <th className="p-2.5 font-semibold text-center">वास्तविक उपयोग</th>
                  <th className="p-2.5 font-semibold text-right">लागत (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {loadingRecipes ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-stone-500">
                      रेसिपी सामग्री की गणना हो रही है...
                    </td>
                  </tr>
                ) : requirements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-stone-500">
                      कोई सामग्री आवश्यकता नहीं मिली।
                    </td>
                  </tr>
                ) : (
                  requirements.map((req) => {
                    const isShort = req.shortage > 0;
                    return (
                      <tr key={req.ingredientId} className={isShort ? 'bg-rose-50/50' : 'hover:bg-stone-50/50'}>
                        <td className="p-2.5 font-medium text-stone-900">
                          <div>
                            <span>{req.ingredient.name_hi}</span>
                            <span className="text-[10px] text-stone-500 block">{req.ingredient.name_en}</span>
                          </div>
                        </td>
                        <td className="p-2.5 text-right font-semibold text-stone-700">
                          {req.standardRequiredQuantity} {req.unit}
                        </td>
                        <td className="p-2.5 text-right font-medium">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[11px] ${
                              isShort ? 'bg-rose-100 text-rose-800 font-bold' : 'text-emerald-700 bg-emerald-50'
                            }`}
                          >
                            {formatIngredientQuantityWithUnit(req.availableStock, req.ingredient.base_unit)}
                          </span>
                          {isShort && (
                            <span className="text-[10px] text-rose-600 block font-semibold">
                              (कमी: {req.shortage} {req.ingredient.base_unit})
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={req.actualQuantityUsed}
                              onChange={(e) => handleActualQtyChange(req.ingredientId, parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 border border-stone-300 rounded text-center text-xs font-bold text-stone-900 focus:ring-1 focus:ring-amber-500"
                            />
                            <span className="text-[11px] text-stone-500">{req.unit}</span>
                          </div>
                        </td>
                        <td className="p-2.5 text-right font-bold text-stone-900">
                          {formatCurrency(req.totalCost)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Emergency Negative Stock Override Section */}
        {hasAnyShortage && (
          <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-bold text-stone-900 cursor-pointer">
              <input
                type="checkbox"
                checked={allowEmergencyOverride}
                onChange={(e) => setAllowEmergencyOverride(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded border-stone-300 focus:ring-amber-500"
              />
              <span>आपातकालीन स्टॉक ओवरराइड की अनुमति दें (Allow Negative Stock Override)</span>
            </label>
            {allowEmergencyOverride && (
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  ओवरराइड का कारण (Reason for Emergency Override) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  placeholder="उदा. बिल बाद में आएगा, भौतिक सामग्री दुकान में उपलब्ध थी"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-amber-500"
                />
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
          <Button variant="outline" size="sm" onClick={onClose} disabled={completeMutation.isPending}>
            {t.cancel}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            isLoading={completeMutation.isPending}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
          >
            हाँ, सामग्री घटाएं व बैच पूरा करें
          </Button>
        </div>
      </div>
    </Modal>
  );
};
