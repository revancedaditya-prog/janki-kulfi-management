import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useProducts } from '@/hooks/useProducts';
import {
  useIngredients,
  useAddIngredient,
  useRecipeForProduct,
  useRecipeHistory,
  useSaveRecipe,
  useActivateRecipeVersion,
  useDeleteRecipeVersion,
} from '@/hooks/useProductionCosting';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import {
  formatCurrency,
  formatDate,
} from '@/lib/formatters';
import {
  calculateProductionCosting,
  scaleProductionRecipe,
  calculateIngredientRowCost,
} from '@/lib/costCalculator';
import {
  CostingIngredientRow,
  AdditionalOverheads,
  UnitType,
  IngredientCategory,
  RecipeWithItems,
} from '@/types';
import {
  Calculator,
  Sparkles,
  Save,
  CheckCircle2,
  RotateCcw,
  Scale,
  History,
  Plus,
  Layers,
  Milk,
  AlertCircle,
  Factory,
  Trash2,
  Check,
} from 'lucide-react';

const UNIT_OPTIONS: { value: UnitType; labelEn: string; labelHi: string }[] = [
  { value: 'kg', labelEn: 'Kilogram (kg)', labelHi: 'किलोग्राम (kg)' },
  { value: 'g', labelEn: 'Gram (g)', labelHi: 'ग्राम (g)' },
  { value: 'litre', labelEn: 'Litre (l)', labelHi: 'लीटर (l)' },
  { value: 'ml', labelEn: 'Millilitre (ml)', labelHi: 'मिलीलीटर (ml)' },
  { value: 'piece', labelEn: 'Piece (pc)', labelHi: 'पीस (pc)' },
  { value: 'pack', labelEn: 'Pack', labelHi: 'पैकेट (pack)' },
];

export const ProductionCostCalculatorPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const { isOwner } = useAuth();

  const { data: products = [] } = useProducts();
  const { data: allIngredients = [] } = useIngredients();

  // Selected Product State
  const defaultProductId = searchParams.get('product') || products[0]?.id || 'prod-sada-01';
  const [selectedProductId, setSelectedProductId] = useState<string>(defaultProductId);

  // Active product details
  const activeProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || products[0],
    [products, selectedProductId]
  );

  // Active Recipe & History Query
  const { data: activeRecipe } = useRecipeForProduct(activeProduct?.id);
  const { data: recipeHistory = [] } = useRecipeHistory(activeProduct?.id);

  // Mutations
  const saveRecipeMutation = useSaveRecipe();
  const activateRecipeMutation = useActivateRecipeVersion();
  const deleteRecipeMutation = useDeleteRecipeVersion();
  const addIngredientMutation = useAddIngredient();

  // Recipe Modeling Batch Size & Yield
  const [standardOutputPieces, setStandardOutputPieces] = useState<number>(100);
  const [recipeName, setRecipeName] = useState('');
  const [recipeNotes, setRecipeNotes] = useState('');
  const [saveAsStatus, setSaveAsStatus] = useState<'active' | 'draft'>('active');

  // Overheads State
  const [overheads, setOverheads] = useState<AdditionalOverheads>({
    electricity: 0,
    generator_fuel: 0,
    gas: 0,
    direct_labour: 0,
    water: 0,
    packaging_extra: 0,
    transport: 0,
    other: 0,
  });

  // Ingredient Rows State
  const [ingredientRows, setIngredientRows] = useState<CostingIngredientRow[]>([]);

  // Scaling State
  const [requiredQuantity, setRequiredQuantity] = useState<number | ''>('');
  const [showScalingDrawer, setShowScalingDrawer] = useState(false);

  // UI state
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [recipeToDelete, setRecipeToDelete] = useState<RecipeWithItems | null>(null);
  const [isAddIngredientModalOpen, setIsAddIngredientModalOpen] = useState(false);
  const [customIngNameEn, setCustomIngNameEn] = useState('');
  const [customIngNameHi, setCustomIngNameHi] = useState('');
  const [customIngCategory, setCustomIngCategory] = useState<IngredientCategory>('other');
  const [customIngUnit, setCustomIngUnit] = useState<UnitType>('kg');
  const [customIngRate, setCustomIngRate] = useState<string>('0');

  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync selected product with search params
  useEffect(() => {
    if (products.length > 0 && !products.some((p) => p.id === selectedProductId)) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  // Load Recipe and Ingredients into Form
  useEffect(() => {
    if (!allIngredients.length) return;

    // Create a map of recipe items if activeRecipe exists
    const recipeItemMap = new Map<string, { quantity: number; unit: UnitType }>();
    if (activeRecipe?.items) {
      activeRecipe.items.forEach((it) => {
        recipeItemMap.set(it.ingredient_id, { quantity: it.quantity, unit: it.unit });
      });
      setStandardOutputPieces(activeRecipe.expected_yield_pieces || activeRecipe.standard_output_pieces || 100);
      setRecipeName(activeRecipe.name || '');
      setRecipeNotes(activeRecipe.notes || '');
      if (activeRecipe.default_overheads) {
        setOverheads({ ...activeRecipe.default_overheads });
      }
    } else {
      setStandardOutputPieces(100);
      setRecipeName(`${activeProduct?.name_hi || activeProduct?.name_en || 'कुल्फी'} Standard Recipe`);
      setRecipeNotes('');
      setOverheads({
        electricity: 0,
        generator_fuel: 0,
        gas: 0,
        direct_labour: 0,
        water: 0,
        packaging_extra: 0,
        transport: 0,
        other: 0,
      });
    }

    // Build ingredient rows with all master ingredients
    const rows: CostingIngredientRow[] = allIngredients.map((ing) => {
      const recItem = recipeItemMap.get(ing.id);
      const isSelected = !!recItem;
      const qty = recItem ? recItem.quantity : 0;
      const unit = recItem ? recItem.unit : ing.base_unit;
      const rate = Number(ing.current_rate) || 0;
      
      const isKgBase = (ing.base_unit === 'kg' || ing.base_unit === 'litre') && ing.code !== 'ING-SAFFRON';
      const effectiveRateUnit: UnitType = isKgBase && (ing.rate_unit === 'g' || ing.rate_unit === 'ml')
        ? ing.base_unit
        : (ing.rate_unit || ing.base_unit || 'kg');
      const calculated_cost = calculateIngredientRowCost(qty, unit, rate, effectiveRateUnit);

      return {
        ingredient_id: ing.id,
        name_en: ing.name_en,
        name_hi: ing.name_hi,
        category: ing.category,
        is_selected: isSelected,
        quantity: qty,
        unit,
        rate,
        rate_unit: effectiveRateUnit,
        calculated_cost,
        save_rate_to_master: false,
      };
    });

    setIngredientRows(rows);
    setFormError(null);
  }, [activeRecipe, allIngredients, selectedProductId, activeProduct]);

  // Product Switch Handler
  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    setSearchParams({ product: productId });
    setShowScalingDrawer(false);
    setRequiredQuantity('');
  };

  // Load a specific historical recipe version into editor
  const handleLoadRecipeVersion = (recipe: RecipeWithItems) => {
    const recipeItemMap = new Map<string, { quantity: number; unit: UnitType }>();
    if (recipe.items) {
      recipe.items.forEach((it) => {
        recipeItemMap.set(it.ingredient_id, { quantity: it.quantity, unit: it.unit });
      });
    }

    setStandardOutputPieces(recipe.expected_yield_pieces || recipe.standard_output_pieces || 100);
    setRecipeName(recipe.name || '');
    setRecipeNotes(recipe.notes || '');
    if (recipe.default_overheads) {
      setOverheads({ ...recipe.default_overheads });
    }

    const rows: CostingIngredientRow[] = allIngredients.map((ing) => {
      const recItem = recipeItemMap.get(ing.id);
      const isSelected = !!recItem;
      const qty = recItem ? recItem.quantity : 0;
      const unit = recItem ? recItem.unit : ing.base_unit;
      const rate = Number(ing.current_rate) || 0;
      const effectiveRateUnit = ing.rate_unit || ing.base_unit || 'kg';
      const calculated_cost = calculateIngredientRowCost(qty, unit, rate, effectiveRateUnit);

      return {
        ingredient_id: ing.id,
        name_en: ing.name_en,
        name_hi: ing.name_hi,
        category: ing.category,
        is_selected: isSelected,
        quantity: qty,
        unit,
        rate,
        rate_unit: effectiveRateUnit,
        calculated_cost,
        save_rate_to_master: false,
      };
    });

    setIngredientRows(rows);
    setIsHistoryModalOpen(false);
    setSuccessMessage(`संस्करण v${recipe.version_number} संपादक में लोड किया गया!`);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Row change handlers
  const handleRowCheckbox = (index: number, checked: boolean) => {
    setIngredientRows((prev) => {
      const copy = [...prev];
      copy[index].is_selected = checked;
      if (!checked) {
        copy[index].quantity = 0;
        copy[index].calculated_cost = 0;
      }
      return copy;
    });
  };

  const handleRowQuantityChange = (index: number, qty: number) => {
    setIngredientRows((prev) => {
      const copy = [...prev];
      copy[index].quantity = Math.max(0, qty);
      copy[index].is_selected = copy[index].quantity > 0 || copy[index].is_selected;
      copy[index].calculated_cost = calculateIngredientRowCost(
        copy[index].quantity,
        copy[index].unit,
        copy[index].rate,
        copy[index].rate_unit
      );
      return copy;
    });
  };

  const handleRowUnitChange = (index: number, unit: UnitType) => {
    setIngredientRows((prev) => {
      const copy = [...prev];
      copy[index].unit = unit;
      copy[index].calculated_cost = calculateIngredientRowCost(
        copy[index].quantity,
        copy[index].unit,
        copy[index].rate,
        copy[index].rate_unit
      );
      return copy;
    });
  };

  const handleRowRateChange = (index: number, rateVal: number) => {
    setIngredientRows((prev) => {
      const copy = [...prev];
      copy[index].rate = Math.max(0, rateVal);
      copy[index].calculated_cost = calculateIngredientRowCost(
        copy[index].quantity,
        copy[index].unit,
        copy[index].rate,
        copy[index].rate_unit
      );
      return copy;
    });
  };



  // Overhead change handler
  const handleOverheadChange = (field: keyof AdditionalOverheads, val: number) => {
    setOverheads((prev) => ({
      ...prev,
      [field]: Math.max(0, val),
    }));
  };

  // Live Costing Calculation
  const costingBreakdown = useMemo(() => {
    if (!activeProduct) return null;
    try {
      return calculateProductionCosting(
        ingredientRows,
        overheads,
        standardOutputPieces || 100,
        0,
        activeProduct.current_price || 0
      );
    } catch {
      return null;
    }
  }, [ingredientRows, overheads, standardOutputPieces, activeProduct]);

  // Scaled Ingredients calculation
  const scaledResults = useMemo(() => {
    if (!requiredQuantity || requiredQuantity <= 0 || !activeRecipe) return null;
    return scaleProductionRecipe(activeRecipe, Number(requiredQuantity));
  }, [requiredQuantity, activeRecipe]);

  // Save Recipe Version (Owner only)
  const handleSaveRecipe = async () => {
    setFormError(null);
    setSuccessMessage(null);

    if (!isOwner) {
      setFormError('केवल मालिक ही रेसिपी सुरक्षित कर सकते हैं।');
      return;
    }

    if (!standardOutputPieces || standardOutputPieces <= 0) {
      setFormError('मानक उत्पादन (Expected Yield) शून्य से अधिक होना चाहिए।');
      return;
    }

    const selectedItems = ingredientRows
      .filter((r) => r.is_selected && r.quantity > 0)
      .map((r) => ({
        ingredient_id: r.ingredient_id,
        quantity: r.quantity,
        unit: r.unit,
        save_rate_to_master: false,
        rate: r.rate,
      }));

    if (selectedItems.length === 0) {
      setFormError('रेसिपी में कम से कम एक सामग्री का चयन करें।');
      return;
    }

    try {
      await saveRecipeMutation.mutateAsync({
        product_id: selectedProductId,
        name: recipeName.trim() || `${activeProduct?.name_hi || activeProduct?.name_en} Standard Recipe`,
        standard_output_pieces: standardOutputPieces || 100,
        expected_yield_pieces: standardOutputPieces || 100,
        default_overheads: overheads,
        notes: recipeNotes,
        status: saveAsStatus,
        items: selectedItems,
      });

      setSuccessMessage(`रेसिपी संस्करण सफलतापूर्वक सुरक्षित हो गया! (${saveAsStatus === 'active' ? 'सक्रिय' : 'ड्राफ्ट'})`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setFormError(err.message || 'रेसिपी सुरक्षित करने में त्रुटि हुई');
    }
  };

  // Activate Recipe Version Handler
  const handleActivateRecipe = async (recipeId: string) => {
    setFormError(null);
    try {
      const res = await activateRecipeMutation.mutateAsync(recipeId);
      setSuccessMessage(res.message || 'रेसिपी संस्करण सक्रिय किया गया!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'रेसिपी सक्रिय करने में त्रुटि हुई');
    }
  };

  // Delete / Archive Recipe Handler
  const handleConfirmDeleteRecipe = async () => {
    if (!recipeToDelete) return;
    setFormError(null);
    try {
      const res = await deleteRecipeMutation.mutateAsync(recipeToDelete.id);
      setRecipeToDelete(null);
      setSuccessMessage(res.message || 'रेसिपी संस्करण हटा दिया गया!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'रेसिपी हटाने में त्रुटि हुई');
      setRecipeToDelete(null);
    }
  };

  // Reset Form to Default Recipe
  const handleResetForm = () => {
    if (activeRecipe) {
      setStandardOutputPieces(activeRecipe.expected_yield_pieces || activeRecipe.standard_output_pieces || 100);
      setRecipeName(activeRecipe.name || '');
      setRecipeNotes(activeRecipe.notes || '');
      setOverheads(activeRecipe.default_overheads || {
        electricity: 0,
        generator_fuel: 0,
        gas: 0,
        direct_labour: 0,
        water: 0,
        packaging_extra: 0,
        transport: 0,
        other: 0,
      });
    }
    setFormError(null);
    setSuccessMessage(null);
  };

  // Add Custom Ingredient Modal submit
  const handleAddCustomIngredientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customIngNameEn.trim() && !customIngNameHi.trim()) {
      setFormError('सामग्री का नाम आवश्यक है।');
      return;
    }

    try {
      const newIng = await addIngredientMutation.mutateAsync({
        code: `ING-CUSTOM-${Date.now().toString().slice(-4)}`,
        name_en: customIngNameEn || customIngNameHi,
        name_hi: customIngNameHi || customIngNameEn,
        category: customIngCategory,
        base_unit: customIngUnit,
        rate_unit: customIngUnit,
        current_rate: parseFloat(customIngRate) || 0,
        is_active: true,
      });

      setIsAddIngredientModalOpen(false);
      setCustomIngNameEn('');
      setCustomIngNameHi('');
      setCustomIngRate('0');
      setSuccessMessage(`नई सामग्री "${newIng.name_hi}" सफलतापूर्वक जोड़ी गई!`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'सामग्री जोड़ने में त्रुटि हुई');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
            <span>मास्टर डेटा (Master Data)</span>
            <span>/</span>
            <span className="text-maroon-800">रेसिपी व लागत कैलकुलेटर</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Calculator className="w-6 h-6 text-maroon-800" />
            <span>रेसिपी मास्टर और उत्पादन लागत कैलकुलेटर</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            उत्पाद-वार मानक सामग्री अनुपात, संस्करण प्रबंधन (Versions) और प्रति-पीस लागत मॉडलिंग
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeRecipe && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<History className="w-4 h-4 text-gray-600" />}
              onClick={() => setIsHistoryModalOpen(true)}
            >
              रेसिपी संस्करण इतिहास ({recipeHistory.length})
            </Button>
          )}

          <Link to="/production?new=true">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Factory className="w-4 h-4" />}
            >
              दैनिक उत्पादन दर्ज करें
            </Button>
          </Link>
        </div>
      </div>

      {/* Messages */}
      {formError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{formError}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 1. Product Tabs Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {products.map((p) => {
          const isSelected = p.id === selectedProductId;
          return (
            <button
              key={p.id}
              onClick={() => handleProductSelect(p.id)}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all duration-150 flex items-center gap-2 ${
                isSelected
                  ? 'bg-maroon-900 text-white shadow-md shadow-maroon-900/20 scale-[1.02]'
                  : 'bg-white text-gray-700 hover:bg-cream-100/70 border border-cream-200'
              }`}
            >
              <span>{language === 'hi' ? p.name_hi : p.name_en}</span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-extrabold ${
                  isSelected ? 'bg-amber-400 text-maroon-950' : 'bg-cream-200 text-gray-800'
                }`}
              >
                {formatCurrency(p.current_price)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. Recipe Version & Batch Size Card */}
      <Card className="border-cream-300 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-600" />
                <span>मानक रेसिपी विवरण (Recipe Template)</span>
              </h2>
              {activeRecipe && (
                <Badge variant="success" className="text-xs">
                  सक्रिय: v{activeRecipe.version_number}
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              उत्पाद: <strong>{language === 'hi' ? activeProduct?.name_hi : activeProduct?.name_en}</strong> | विक्रय मूल्य: <strong>{formatCurrency(activeProduct?.current_price)}</strong> / piece
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Scale className="w-4 h-4 text-indigo-700" />}
              onClick={() => setShowScalingDrawer(!showScalingDrawer)}
            >
              {showScalingDrawer ? 'स्केलिंग छिपाएं' : 'बैच स्केलिंग (Scaler)'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Input
            label="रेसिपी का नाम (Recipe Name) *"
            placeholder="जैसे: ₹10 सादा कुल्फी मानक रेसिपी"
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            required
          />

          <Input
            label="मानक उत्पादन उपज (Expected Yield Pieces) *"
            type="number"
            inputMode="numeric"
            value={standardOutputPieces}
            onChange={(e) => setStandardOutputPieces(Math.max(1, parseInt(e.target.value, 10) || 0))}
            helperText="उदा. 100 पीस के लिए आवश्यक सामग्री"
            min={1}
            required
          />

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              स्थिति (Save Status)
            </label>
            <select
              value={saveAsStatus}
              onChange={(e) => setSaveAsStatus(e.target.value as 'active' | 'draft')}
              className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-maroon-800"
            >
              <option value="active">सक्रिय (Active — उत्पादन में उपयोग होगा)</option>
              <option value="draft">ड्राफ्ट (Draft — परीक्षण हेतु)</option>
            </select>
          </div>

          <Input
            label="रेसिपी नोट्स (Notes)"
            placeholder="विशेष सामग्री या विधि..."
            value={recipeNotes}
            onChange={(e) => setRecipeNotes(e.target.value)}
          />
        </div>

        {/* Scaling Drawer */}
        {showScalingDrawer && (
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-indigo-700" />
                <span>वांछित उत्पादन के अनुसार सामग्री की गणना (Recipe Scaler)</span>
              </h3>
            </div>

            <div className="max-w-xs">
              <Input
                label="वांछित कुल्फी पीस (Target Output Pieces)"
                type="number"
                inputMode="numeric"
                placeholder="उदा. 500 पीस"
                value={requiredQuantity}
                onChange={(e) =>
                  setRequiredQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)
                }
                min={1}
              />
            </div>

            {scaledResults && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                {scaledResults.scaled_ingredients.map((sc, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-white rounded-xl border border-indigo-100 text-xs flex justify-between items-center"
                  >
                    <span className="font-semibold text-gray-800">
                      {language === 'hi' ? sc.name_hi : sc.name_en}
                    </span>
                    <div className="text-right">
                      <span className="font-bold text-indigo-900 block">
                        {sc.quantity} {sc.unit}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {formatCurrency(sc.estimated_cost)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 3. Ingredient Details Table */}
      <Card className="border-cream-300 divide-y divide-gray-100 shadow-sm">
        <div className="pb-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Milk className="w-5 h-5 text-amber-700" />
                <span>3. सामग्री विवरण (Ingredient Quantities & Rates)</span>
              </h2>
              <p className="text-xs text-gray-500">
                चयनित सामग्री का ही खर्च जोड़ा जाएगा। दर मास्टर से स्वतः लोड होती है।
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIsAddIngredientModalOpen(true)}
            >
              कस्टम सामग्री जोड़ें
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-cream-300 bg-cream-100/50 text-gray-700 uppercase font-bold">
                  <th className="py-2.5 px-3 w-10">चुनें</th>
                  <th className="py-2.5 px-3">सामग्री (Ingredient)</th>
                  <th className="py-2.5 px-3 w-32">मात्रा (Qty)</th>
                  <th className="py-2.5 px-3 w-32">इकाई (Unit)</th>
                  <th className="py-2.5 px-3 w-32">दर (₹/Unit)</th>
                  <th className="py-2.5 px-3 w-28 text-right">लागत (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ingredientRows.map((row, idx) => (
                  <tr
                    key={row.ingredient_id}
                    className={`hover:bg-cream-50/50 transition-colors ${
                      row.is_selected ? 'bg-cream-50/30' : 'opacity-60'
                    }`}
                  >
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={row.is_selected}
                        onChange={(e) => handleRowCheckbox(idx, e.target.checked)}
                        className="w-4 h-4 rounded text-maroon-800 focus:ring-maroon-800 border-gray-300"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-bold text-gray-900 block">
                        {language === 'hi' ? row.name_hi : row.name_en}
                      </span>
                      <span className="text-[10px] text-gray-500 capitalize">{row.category}</span>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="any"
                        disabled={!row.is_selected}
                        value={row.quantity || ''}
                        placeholder="0"
                        onChange={(e) =>
                          handleRowQuantityChange(idx, parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-white border border-gray-200 rounded-lg focus:ring-1 focus:ring-maroon-800 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <select
                        disabled={!row.is_selected}
                        value={row.unit}
                        onChange={(e) => handleRowUnitChange(idx, e.target.value as UnitType)}
                        className="w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:ring-1 focus:ring-maroon-800 disabled:bg-gray-100"
                      >
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.value}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs">₹</span>
                        <input
                          type="number"
                          step="any"
                          disabled={!row.is_selected}
                          value={row.rate || ''}
                          onChange={(e) =>
                            handleRowRateChange(idx, parseFloat(e.target.value) || 0)
                          }
                          className="w-20 px-2 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-lg focus:ring-1 focus:ring-maroon-800 disabled:bg-gray-100"
                        />
                        <span className="text-[10px] text-gray-500">/{row.rate_unit}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-black text-gray-900">
                      {row.is_selected ? formatCurrency(row.calculated_cost) : '₹0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Overheads Section */}
        <div className="py-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-maroon-800" />
            <span>4. अतिरिक्त ओवरहेड खर्च (Additional Overheads for {standardOutputPieces} pcs)</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input
              label="बिजली (Electricity ₹)"
              type="number"
              prefixSymbol="₹"
              value={overheads.electricity}
              onChange={(e) => handleOverheadChange('electricity', parseFloat(e.target.value) || 0)}
            />
            <Input
              label="LPG गैस (Gas ₹)"
              type="number"
              prefixSymbol="₹"
              value={overheads.gas}
              onChange={(e) => handleOverheadChange('gas', parseFloat(e.target.value) || 0)}
            />
            <Input
              label="मजदूरी (Labour ₹)"
              type="number"
              prefixSymbol="₹"
              value={overheads.direct_labour}
              onChange={(e) => handleOverheadChange('direct_labour', parseFloat(e.target.value) || 0)}
            />
            <Input
              label="परिवहन व अन्य (Other ₹)"
              type="number"
              prefixSymbol="₹"
              value={overheads.transport + overheads.other}
              onChange={(e) => handleOverheadChange('other', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* 5. Summary & Cost Per Kulfi */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-cream-50/60 -mx-6 -mb-6 p-6 rounded-b-2xl border-t border-cream-200">
          <div>
            <span className="text-xs text-gray-500 block">कुल रेसिपी लागत ({standardOutputPieces} पीस)</span>
            <span className="text-2xl font-black text-maroon-950 font-mono">
              {formatCurrency(costingBreakdown?.total_batch_cost || 0)}
            </span>
            <span className="text-xs text-emerald-800 font-bold block mt-0.5">
              प्रति कुल्फी लागत: ₹{costingBreakdown?.cost_per_saleable_kulfi?.toFixed(2) || '0.00'} / piece
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="md"
              leftIcon={<RotateCcw className="w-4 h-4" />}
              onClick={handleResetForm}
              className="w-full sm:w-auto"
            >
              रीसेट (Reset)
            </Button>

            {isOwner && (
              <Button
                variant="primary"
                size="md"
                leftIcon={<Save className="w-4 h-4" />}
                onClick={handleSaveRecipe}
                isLoading={saveRecipeMutation.isPending}
                className="w-full sm:w-auto font-extrabold shadow-md shadow-maroon-900/20"
              >
                रेसिपी संस्करण सुरक्षित करें (Save Version)
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Recipe Version History Modal */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={`${activeProduct?.name_hi || activeProduct?.name_en} - रेसिपी संस्करण इतिहास (Recipe Versions)`}
        maxWidth="lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {recipeHistory.length === 0 ? (
            <p className="text-center py-8 text-gray-500">कोई पूर्व रेसिपी संस्करण नहीं मिला।</p>
          ) : (
            recipeHistory.map((rec) => (
              <div
                key={rec.id}
                className={`p-4 rounded-2xl border transition-all space-y-3 text-xs ${
                  rec.status === 'active' || rec.is_default
                    ? 'border-emerald-300 bg-emerald-50/40 shadow-xs'
                    : 'border-cream-200 bg-cream-50/70'
                }`}
              >
                <div className="flex items-center justify-between border-b border-cream-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-900">
                      {rec.name || `संस्करण v${rec.version_number}`}
                    </span>
                    {rec.status === 'active' || rec.is_default ? (
                      <Badge variant="success">सक्रिय (Active)</Badge>
                    ) : rec.status === 'draft' ? (
                      <Badge variant="warning">ड्राफ्ट (Draft)</Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500">संग्रहीत (Archived)</Badge>
                    )}
                  </div>
                  <span className="text-gray-500">{formatDate(rec.created_at)}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-700">
                  <div>मानक उपज: <strong>{rec.expected_yield_pieces || rec.standard_output_pieces} pcs</strong></div>
                  <div>सामग्री प्रकार: <strong>{rec.items?.length || 0} आइटम्स</strong></div>
                  <div>संस्करण: <strong>v{rec.version_number}</strong></div>
                </div>

                {rec.notes && <p className="text-gray-500 italic mt-1">{rec.notes}</p>}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-cream-200">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLoadRecipeVersion(rec)}
                  >
                    संपादक में लोड करें
                  </Button>

                  {isOwner && rec.status !== 'active' && !rec.is_default && (
                    <Button
                      size="sm"
                      variant="primary"
                      leftIcon={<Check className="w-3.5 h-3.5" />}
                      onClick={() => handleActivateRecipe(rec.id)}
                      isLoading={activateRecipeMutation.isPending}
                    >
                      सक्रिय करें (Activate)
                    </Button>
                  )}

                  {isOwner && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50"
                      leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                      onClick={() => setRecipeToDelete(rec)}
                    >
                      हटाएं / आर्काइव
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Delete / Archive Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(recipeToDelete)}
        onClose={() => setRecipeToDelete(null)}
        onConfirm={handleConfirmDeleteRecipe}
        title="रेसिपी संस्करण हटाएं (Delete Recipe Version)"
        description={`क्या आप वाकई रेसिपी संस्करण v${recipeToDelete?.version_number} को हटाना चाहते हैं? यदि यह उत्पादन इतिहास में प्रयुक्त है, तो डेटा सुरक्षा नियमों के तहत इसे स्थायी रूप से हटाने के बजाय स्वतः संग्रहीत (Archived) कर दिया जाएगा।`}
        confirmText="हाँ, हटाएं"
        cancelText="रद्द करें"
        variant="danger"
        isLoading={deleteRecipeMutation.isPending}
      />

      {/* Add Custom Ingredient Modal */}
      <Modal
        isOpen={isAddIngredientModalOpen}
        onClose={() => setIsAddIngredientModalOpen(false)}
        title="कस्टम सामग्री जोड़ें (Add Custom Ingredient)"
      >
        <form onSubmit={handleAddCustomIngredientSubmit} className="space-y-4">
          <Input
            label="सामग्री का नाम (हिंदी) *"
            placeholder="उदा. पिस्ता कतरन, बादाम गिरी"
            value={customIngNameHi}
            onChange={(e) => setCustomIngNameHi(e.target.value)}
            required
          />

          <Input
            label="Ingredient Name (English)"
            placeholder="e.g. Sliced Almonds, Vanilla Extract"
            value={customIngNameEn}
            onChange={(e) => setCustomIngNameEn(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                श्रेणी (Category)
              </label>
              <select
                value={customIngCategory}
                onChange={(e) => setCustomIngCategory(e.target.value as IngredientCategory)}
                className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
              >
                <option value="dairy">डेयरी उत्पाद (Dairy)</option>
                <option value="dry_fruit">मेवा / ड्राई फ्रूट (Dry Fruit)</option>
                <option value="sweetener">मीठा / चीनी (Sweetener)</option>
                <option value="flavoring">फ्लेवर / एसेंस (Flavoring)</option>
                <option value="spice">मसाला / इलायची (Spice)</option>
                <option value="packaging">पैकेजिंग सामग्री (Packaging)</option>
                <option value="other">अन्य (Other)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                {t.unit}
              </label>
              <select
                value={customIngUnit}
                onChange={(e) => setCustomIngUnit(e.target.value as UnitType)}
                className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {language === 'hi' ? u.labelHi : u.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label={`${t.purchaseRate} (₹)`}
            type="number"
            inputMode="decimal"
            step="any"
            prefixSymbol="₹"
            placeholder="0.00"
            value={customIngRate}
            onChange={(e) => setCustomIngRate(e.target.value)}
            required
            min={0}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddIngredientModalOpen(false)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={addIngredientMutation.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
