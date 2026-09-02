import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useProducts } from '@/hooks/useProducts';
import {
  useIngredients,
  useAddIngredient,
  useRecipeForProduct,
  useRecipeHistory,
  useSaveRecipe,
} from '@/hooks/useProductionCosting';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
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
  ArrowRight,
  Factory,
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

  // Active Recipe Query
  const { data: activeRecipe } = useRecipeForProduct(activeProduct?.id);
  const { data: recipeHistory = [] } = useRecipeHistory(activeProduct?.id);

  // Mutations
  const saveRecipeMutation = useSaveRecipe();
  const addIngredientMutation = useAddIngredient();

  // Recipe Modeling Batch Size
  const [standardOutputPieces, setStandardOutputPieces] = useState<number>(100);
  const [recipeNotes, setRecipeNotes] = useState('');

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
      setStandardOutputPieces(activeRecipe.standard_output_pieces || 100);
      setRecipeNotes(activeRecipe.notes || '');
      if (activeRecipe.default_overheads) {
        setOverheads({ ...activeRecipe.default_overheads });
      }
    } else {
      setStandardOutputPieces(100);
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
      
      // If an ingredient is standard kg/litre (e.g. Cardamom, Sugar, Khoya, Cashew) but was stored as 'g'/'ml', default rate_unit to its master base_unit ('kg'/'litre')
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
  }, [activeRecipe, allIngredients, selectedProductId]);

  // Product Switch Handler
  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    setSearchParams({ product: productId });
    setShowScalingDrawer(false);
    setRequiredQuantity('');
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

  const handleRowRateUnitChange = (index: number, rateUnit: UnitType) => {
    setIngredientRows((prev) => {
      const copy = [...prev];
      copy[index].rate_unit = rateUnit;
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
        0, // No damaged for standard recipe modeling
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

  // Save Default Recipe (Owner only)
  const handleSaveDefaultRecipe = async () => {
    setFormError(null);
    setSuccessMessage(null);

    if (!isOwner) {
      setFormError('केवल मालिक ही डिफ़ॉल्ट रेसिपी सुरक्षित कर सकते हैं।');
      return;
    }

    const selectedItems = ingredientRows
      .filter((r) => r.is_selected && r.quantity > 0)
      .map((r) => ({
        ingredient_id: r.ingredient_id,
        quantity: r.quantity,
        unit: r.unit,
        save_rate_to_master: false, // Do not mutate master ingredient rate unit!
        rate: r.rate,
      }));

    if (selectedItems.length === 0) {
      setFormError('रेसिपी में कम से कम एक सामग्री का चयन करें।');
      return;
    }

    try {
      await saveRecipeMutation.mutateAsync({
        product_id: selectedProductId,
        name: `${activeProduct?.name_hi || activeProduct?.name_en} Standard Recipe`,
        standard_output_pieces: standardOutputPieces || 100,
        default_overheads: overheads,
        notes: recipeNotes,
        items: selectedItems,
      });

      setSuccessMessage('मानक रेसिपी सफलतापूर्वक सुरक्षित हो गई! नया संस्करण सक्रिय है।');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setFormError(err.message || 'रेसिपी सुरक्षित करने में त्रुटि हुई');
    }
  };

  // Reset Form to Default Recipe
  const handleResetForm = () => {
    if (activeRecipe) {
      setStandardOutputPieces(activeRecipe.standard_output_pieces || 100);
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
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Calculator className="w-6 h-6 text-maroon-800" />
            <span>{t.productionCostCalculator}</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            मानक कुल्फी रेसिपी लागत, सामग्री अनुपात और ग्रॉस मार्जिन (Gross Margin) मॉडलिंग टूल
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
              {t.recipeHistory}
            </Button>
          )}

          <Link to="/production?new=true">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Factory className="w-4 h-4" />}
            >
              दैनिक उत्पादन दर्ज करें (New Batch)
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Navigation Alert Banner */}
      <div className="p-3.5 bg-gradient-to-r from-cream-100 via-amber-50 to-cream-100 border border-amber-300/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5 text-xs text-maroon-950">
          <Factory className="w-5 h-5 text-maroon-800 flex-shrink-0" />
          <span>
            <strong>दैनिक उत्पादन प्रविष्टि (Daily Production):</strong> कारखाने में तैयार कुल्फी को फ्रीजर में दर्ज करने और स्टॉक निकासी के लिए उपलब्ध कराने हेतु <strong>उत्पादन (Production) पेज</strong> पर नया बैच बनाएं।
          </span>
        </div>
        <Link to="/production?new=true" className="self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-maroon-800 text-maroon-900 font-bold bg-white hover:bg-cream-50"
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            उत्पादन बैच बनाएं
          </Button>
        </Link>
      </div>

      {/* Messages */}
      {formError && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{formError}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
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

      {/* 2. Recipe Batch Size & Scaling Card */}
      <Card className="border-cream-300 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-600" />
              <span>मानक रेसिपी विवरण (Standard Recipe Template)</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              उत्पाद: <strong>{language === 'hi' ? activeProduct?.name_hi : activeProduct?.name_en}</strong> | दर: <strong>{formatCurrency(activeProduct?.current_price)}</strong> / piece
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Scale className="w-4 h-4 text-indigo-700" />}
              onClick={() => setShowScalingDrawer(!showScalingDrawer)}
            >
              {showScalingDrawer ? 'स्केलिंग कैलकुलेटर छिपाएं' : 'बैच स्केलिंग (Scaling)'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <Input
            label="मानक बैच साइज (Standard Output Pieces)"
            type="number"
            inputMode="numeric"
            value={standardOutputPieces}
            onChange={(e) => setStandardOutputPieces(Math.max(1, parseInt(e.target.value) || 0))}
            helperText="उदा. 100 पीस के लिए आवश्यक सामग्री का अनुपात"
            min={1}
            required
          />

          <div className="md:col-span-2">
            <Input
              label="रेसिपी विवरण / नोट्स (Recipe Notes)"
              placeholder="उदा. इलायची युक्त मानक खोया कुल्फी रेसिपी"
              value={recipeNotes}
              onChange={(e) => setRecipeNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Scaling Drawer */}
        {showScalingDrawer && (
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-indigo-700" />
                <span>आवश्यक उत्पादन के अनुसार सामग्री की गणना (Recipe Scaler)</span>
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
                  setRequiredQuantity(e.target.value === '' ? '' : parseInt(e.target.value) || 0)
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

          <div className="space-y-3">
            {ingredientRows.map((row, idx) => {
              const isMissingRate = row.is_selected && row.rate <= 0;

              return (
                <div
                  key={row.ingredient_id}
                  className={`p-3.5 rounded-2xl border transition-all duration-150 ${
                    row.is_selected
                      ? 'bg-cream-50/80 border-cream-300 shadow-xs'
                      : 'bg-white/60 border-gray-100 opacity-65'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Left: Checkbox & Ingredient Name */}
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <input
                        type="checkbox"
                        checked={row.is_selected}
                        onChange={(e) => handleRowCheckbox(idx, e.target.checked)}
                        className="w-4 h-4 text-maroon-800 rounded focus:ring-maroon-800 border-gray-300"
                      />
                      <div>
                        <span className="font-bold text-sm text-gray-900 block">
                          {language === 'hi' ? row.name_hi : row.name_en}
                        </span>
                        <span className="text-[11px] text-gray-500 block">
                          {language === 'hi' ? row.name_en : row.name_hi}
                        </span>
                      </div>
                    </div>

                    {/* Middle: Quantity, Unit, Rate, Rate Unit */}
                    {row.is_selected ? (
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {/* Quantity */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 block mb-0.5">
                            {t.quantityUsed}
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            value={row.quantity || ''}
                            onChange={(e) => handleRowQuantityChange(idx, parseFloat(e.target.value) || 0)}
                            className="w-full bg-cream-50 border border-cream-300 rounded-xl px-2.5 py-1.5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                            placeholder="0"
                            min={0}
                          />
                        </div>

                        {/* Unit */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 block mb-0.5">
                            {t.unit}
                          </label>
                          <select
                            value={row.unit}
                            onChange={(e) => handleRowUnitChange(idx, e.target.value as UnitType)}
                            className="w-full bg-cream-50 border border-cream-300 rounded-xl px-2 py-1.5 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u.value} value={u.value}>
                                {language === 'hi' ? u.labelHi : u.labelEn}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Rate */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 block mb-0.5">
                            {t.purchaseRate}
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            value={row.rate || ''}
                            onChange={(e) => handleRowRateChange(idx, parseFloat(e.target.value) || 0)}
                            className={`w-full rounded-xl px-2.5 py-1.5 text-sm font-bold focus:ring-2 focus:outline-none ${
                              isMissingRate
                                ? 'bg-rose-100 border-2 border-rose-500 text-rose-950 focus:ring-rose-600'
                                : 'bg-cream-50 border border-cream-300 text-gray-900 focus:ring-maroon-800'
                            }`}
                            placeholder="₹ 0.00"
                            min={0}
                          />
                        </div>

                        {/* Rate Unit */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 block mb-0.5">
                            {t.rateUnit}
                          </label>
                          <select
                            value={row.rate_unit}
                            onChange={(e) => handleRowRateUnitChange(idx, e.target.value as UnitType)}
                            className="w-full bg-cream-50 border border-cream-300 rounded-xl px-2 py-1.5 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u.value} value={u.value}>
                                {language === 'hi' ? `प्रति ${u.labelHi}` : `per ${u.labelEn}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 text-xs text-gray-400 italic py-2">
                        {language === 'hi' ? 'यह सामग्री इस रेसिपी में शामिल नहीं है' : 'Unchecked (not included in costing)'}
                      </div>
                    )}

                    {/* Right: Calculated Cost */}
                    {row.is_selected && (
                      <div className="flex flex-col md:items-end justify-center min-w-[140px] pt-1 md:pt-0 border-t md:border-t-0 border-cream-100 text-right">
                        <span className="text-[11px] font-bold text-gray-500">{t.ingredientCost}</span>
                        <span className="font-mono font-extrabold text-base text-maroon-900">
                          {formatCurrency(row.calculated_cost)}
                        </span>
                        {row.quantity > 0 && row.rate > 0 && row.unit !== row.rate_unit && (
                          <span className="text-[10px] text-gray-500 font-mono">
                            {row.unit === 'g' && row.rate_unit === 'kg'
                              ? `${row.quantity / 1000} kg × ₹${row.rate}`
                              : `${row.quantity} ${row.unit} @ ₹${row.rate}/${row.rate_unit}`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Warning and Quick-Fix if Rate is high and Rate Unit is erroneously set to 'per g' */}
                  {row.is_selected && row.rate > 400 && row.rate_unit === 'g' && (row.unit === 'g' || row.unit === 'kg') && (
                    <div className="mt-2 p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-amber-950">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
                        <span>
                          दर <strong>₹{row.rate}/g (प्रति ग्राम)</strong> चयनित है, जिससे 1 किलो की दर ₹{(row.rate * 1000).toLocaleString()} हो जाएगी। क्या यह दर <strong>प्रति किलो (per kg)</strong> है?
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRowRateUnitChange(idx, 'kg')}
                        className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold shadow-sm whitespace-nowrap self-end sm:self-auto"
                      >
                        दर को प्रति किलो (per kg) करें (लागत {formatCurrency(calculateIngredientRowCost(row.quantity, row.unit, row.rate, 'kg'))})
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Additional Recipe Overheads */}
        <div className="py-5 space-y-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-700" />
              <span>4. अतिरिक्त खर्चे (Overheads per Batch)</span>
            </h2>
            <p className="text-xs text-gray-500">
              मानक बैच के लिए ईंधन, मजदूरी व अन्य खर्चे (वैकल्पिक, डिफ़ॉल्ट ₹0)।
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">{t.gas}</label>
              <input
                type="number"
                inputMode="decimal"
                value={overheads.gas || ''}
                onChange={(e) => handleOverheadChange('gas', parseFloat(e.target.value) || 0)}
                className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                placeholder="₹ 0"
                min={0}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">{t.directLabour}</label>
              <input
                type="number"
                inputMode="decimal"
                value={overheads.direct_labour || ''}
                onChange={(e) => handleOverheadChange('direct_labour', parseFloat(e.target.value) || 0)}
                className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                placeholder="₹ 0"
                min={0}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">{t.electricity}</label>
              <input
                type="number"
                inputMode="decimal"
                value={overheads.electricity || ''}
                onChange={(e) => handleOverheadChange('electricity', parseFloat(e.target.value) || 0)}
                className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                placeholder="₹ 0"
                min={0}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">{t.transportExpense}</label>
              <input
                type="number"
                inputMode="decimal"
                value={overheads.transport || ''}
                onChange={(e) => handleOverheadChange('transport', parseFloat(e.target.value) || 0)}
                className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                placeholder="₹ 0"
                min={0}
              />
            </div>
          </div>
        </div>

        {/* 5. Live Costing & Profit Result Card */}
        {costingBreakdown && (
          <div className="pt-6 space-y-4">
            <div className="p-5 rounded-3xl bg-gradient-to-br from-maroon-950 via-maroon-900 to-amber-950 text-white shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/15">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    रेसिपी परिणाम ({standardOutputPieces} पीस बैच)
                  </span>
                  <h3 className="text-lg font-black text-white">
                    {t.estimatedProductionCostAndProfit}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="bg-amber-400 text-maroon-950 font-bold">
                    {activeProduct?.name_hi || activeProduct?.name_en}
                  </Badge>
                  <span className="text-xs font-bold text-amber-200">
                    बिक्री मूल्य: ₹{activeProduct?.current_price}
                  </span>
                </div>
              </div>

              {/* Summary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-4">
                <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm">
                  <span className="text-xs text-gray-300 font-semibold block">प्रति पीस लागत</span>
                  <span className="text-2xl sm:text-3xl font-black font-mono text-amber-300 block mt-0.5">
                    ₹{costingBreakdown.cost_per_saleable_kulfi.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-gray-300 mt-1 block">
                    कुल बैच लागत: {formatCurrency(costingBreakdown.total_batch_cost)}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm">
                  <span className="text-xs text-gray-300 font-semibold block">प्रति पीस मुनाफा</span>
                  <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-300 block mt-0.5">
                    ₹{costingBreakdown.estimated_profit_per_kulfi.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-emerald-200 mt-1 block">
                    ग्रॉस मार्जिन: <strong>{costingBreakdown.gross_margin_percentage}%</strong>
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/15 backdrop-blur-sm">
                  <span className="text-xs text-emerald-300 font-semibold block">कुल अनुमानित मुनाफा</span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-emerald-300 block mt-0.5">
                    {formatCurrency(costingBreakdown.estimated_total_gross_profit)}
                  </span>
                  <span className="text-[11px] text-gray-300 mt-1 block">
                    कुल बिक्री मूल्य: {formatCurrency(costingBreakdown.expected_total_sales)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. Form Action Bar */}
        <div className="pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-cream-50 p-4 rounded-2xl border border-cream-200">
            <Button
              variant="outline"
              size="md"
              leftIcon={<RotateCcw className="w-4 h-4" />}
              onClick={handleResetForm}
              className="w-full sm:w-auto"
            >
              {t.resetForm}
            </Button>

            {isOwner && (
              <Button
                variant="primary"
                size="lg"
                leftIcon={<Save className="w-4 h-4" />}
                onClick={handleSaveDefaultRecipe}
                isLoading={saveRecipeMutation.isPending}
                className="w-full sm:w-auto font-extrabold shadow-md shadow-maroon-900/20"
              >
                {t.saveDefaultRecipe}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Recipe History Modal */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={`${activeProduct?.name_hi || activeProduct?.name_en} - ${t.recipeHistory}`}
        maxWidth="lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {recipeHistory.length === 0 ? (
            <p className="text-center py-8 text-gray-500">कोई पूर्व रेसिपी संस्करण नहीं मिला।</p>
          ) : (
            recipeHistory.map((rec) => (
              <div
                key={rec.id}
                className="p-4 rounded-2xl border border-cream-200 bg-cream-50/70 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between border-b border-cream-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-900">
                      संस्करण v{rec.version_number}
                    </span>
                    {rec.is_default && <Badge variant="success">डिफ़ॉल्ट</Badge>}
                  </div>
                  <span className="text-gray-500">{formatDate(rec.created_at)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-gray-700">
                  <div>मानक उत्पादन: <strong>{rec.standard_output_pieces} pcs</strong></div>
                  <div>सामग्री प्रकार: <strong>{rec.items?.length || 0} आइटम्स</strong></div>
                </div>

                {rec.notes && <p className="text-gray-500 italic mt-1">{rec.notes}</p>}
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Add Custom Ingredient Modal */}
      <Modal
        isOpen={isAddIngredientModalOpen}
        onClose={() => setIsAddIngredientModalOpen(false)}
        title="कस्टम सामग्री जोड़ें (Add Custom Ingredient)"
      >
        <form onSubmit={handleAddCustomIngredientSubmit} className="space-y-4">
          <Input
            label="सामग्री का नाम (हिंदी)"
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
            label={t.purchaseRate}
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
