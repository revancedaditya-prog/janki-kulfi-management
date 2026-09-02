import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useProducts } from '@/hooks/useProducts';
import {
  useIngredients,
  useAddIngredient,
  useRecipeForProduct,
  useRecipeHistory,
  useSaveRecipe,
  useCreateProductionCostingBatch,
} from '@/hooks/useProductionCosting';
import { useDailyClosings } from '@/hooks/useDailyClosing';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import {
  formatCurrency,
  formatDate,
  getTodayDateString,
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
  Factory,
  Sparkles,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Scale,
  History,
  Plus,
  Layers,
  ChevronDown,
  ChevronUp,
  Milk,
  PackageCheck,
  ShieldAlert,
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
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { isOwner, isProduction } = useAuth();
  const { isOnline, saveDraft } = useSync();

  const { data: products = [] } = useProducts();
  const { data: allIngredients = [] } = useIngredients();
  const { data: closings = [] } = useDailyClosings();

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
  const createBatchMutation = useCreateProductionCostingBatch();
  const addIngredientMutation = useAddIngredient();

  // Form State
  const [productionDate, setProductionDate] = useState(getTodayDateString());
  const [expectedPieces, setExpectedPieces] = useState<number>(100);
  const [producedQuantity, setProducedQuantity] = useState<number>(100);
  const [damagedQuantity, setDamagedQuantity] = useState<number>(0);
  const [notes, setNotes] = useState('');

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
      setExpectedPieces(activeRecipe.standard_output_pieces || 100);
      setProducedQuantity(activeRecipe.standard_output_pieces || 100);
      if (activeRecipe.default_overheads) {
        setOverheads({ ...activeRecipe.default_overheads });
      }
    } else {
      setExpectedPieces(100);
      setProducedQuantity(100);
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
      const rateUnit = ing.rate_unit || ing.base_unit;
      const calculated_cost = calculateIngredientRowCost(qty, unit, rate, rateUnit);

      return {
        ingredient_id: ing.id,
        name_en: ing.name_en,
        name_hi: ing.name_hi,
        category: ing.category,
        is_selected: isSelected,
        quantity: qty,
        unit,
        rate,
        rate_unit: rateUnit,
        calculated_cost,
        save_rate_to_master: false,
      };
    });

    setIngredientRows(rows);
    setDamagedQuantity(0);
    setFormError(null);
  }, [activeRecipe, allIngredients, selectedProductId]);

  // Product Switch Handler
  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    setSearchParams({ product: productId });
    setFormError(null);
    setSuccessMessage(null);
  };

  // Ingredient row updates
  const handleRowToggle = (index: number) => {
    setIngredientRows((prev) => {
      const copy = [...prev];
      copy[index].is_selected = !copy[index].is_selected;
      if (copy[index].is_selected && copy[index].quantity === 0) {
        copy[index].quantity = copy[index].unit === 'piece' ? expectedPieces : 1;
      }
      copy[index].calculated_cost = calculateIngredientRowCost(
        copy[index].quantity,
        copy[index].unit,
        copy[index].rate,
        copy[index].rate_unit
      );
      return copy;
    });
  };

  const handleRowQuantityChange = (index: number, val: number) => {
    setIngredientRows((prev) => {
      const copy = [...prev];
      copy[index].quantity = Math.max(0, val);
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

  // Live Costing Calculation Breakdown
  const costingBreakdown = useMemo(() => {
    try {
      const sellingPrice = activeProduct?.current_price || 0;
      return calculateProductionCosting(
        ingredientRows,
        overheads,
        producedQuantity,
        damagedQuantity,
        sellingPrice
      );
    } catch (err: any) {
      return null;
    }
  }, [ingredientRows, overheads, producedQuantity, damagedQuantity, activeProduct]);

  // Scaling Calculation
  const scalingResult = useMemo(() => {
    if (!activeRecipe || !requiredQuantity || Number(requiredQuantity) <= 0) return null;
    return scaleProductionRecipe(activeRecipe, Number(requiredQuantity));
  }, [activeRecipe, requiredQuantity]);

  // Is day closed check
  const isDayClosed = closings.find((c) => c.business_date === productionDate)?.status === 'closed';

  // Save As Default Recipe Handler
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
        save_rate_to_master: r.save_rate_to_master,
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
        standard_output_pieces: producedQuantity || 100,
        default_overheads: overheads,
        notes,
        items: selectedItems,
      });

      setSuccessMessage('डिफ़ॉल्ट रेसिपी सफलतापूर्वक सुरक्षित हो गई! नया संस्करण सक्रिय है।');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setFormError(err.message || 'रेसिपी सुरक्षित करने में त्रुटि हुई');
    }
  };

  // Complete Production Batch Handler
  const handleCompleteProduction = async () => {
    setFormError(null);
    setSuccessMessage(null);

    if (isDayClosed) {
      setFormError(`कार्य दिवस (${productionDate}) बंद है। उत्पादन दर्ज करने से पहले दिन पुनः खोलें।`);
      return;
    }

    if (producedQuantity <= 0) {
      setFormError('उत्पादित पीस की संख्या 0 से अधिक होनी चाहिए।');
      return;
    }

    if (damagedQuantity > producedQuantity) {
      setFormError('खराब मात्रा उत्पादित मात्रा से अधिक नहीं हो सकती।');
      return;
    }

    const saleablePieces = producedQuantity - damagedQuantity;
    if (saleablePieces <= 0) {
      setFormError('बिक्री योग्य मात्रा (Saleable quantity) कम से कम 1 होनी चाहिए।');
      return;
    }

    if (costingBreakdown && costingBreakdown.missing_rate_ingredients.length > 0) {
      setFormError(
        `निम्नलिखित सामग्रियों की खरीद दर दर्ज नहीं है: ${costingBreakdown.missing_rate_ingredients.join(', ')}`
      );
      return;
    }

    const selectedIngredients = ingredientRows
      .filter((r) => r.is_selected && r.quantity > 0)
      .map((r) => ({
        ingredient_id: r.ingredient_id,
        ingredient_name: `${r.name_hi} (${r.name_en})`,
        quantity_used: r.quantity,
        unit: r.unit,
        converted_base_quantity: r.quantity,
        rate_snapshot: r.rate,
        rate_unit: r.rate_unit,
        calculated_cost: r.calculated_cost,
        is_packaging: r.category === 'packaging',
      }));

    if (selectedIngredients.length === 0) {
      setFormError('कम से कम एक सामग्री चुनकर मात्रा दर्ज करें।');
      return;
    }

    const batchData = {
      productionDate,
      productId: selectedProductId,
      recipeId: activeRecipe?.id,
      producedQuantity,
      damagedQuantity,
      totalIngredientCost: costingBreakdown?.total_ingredient_cost || 0,
      overheadCosts: overheads,
      totalBatchCost: costingBreakdown?.total_batch_cost || 0,
      costPerPiece: costingBreakdown?.cost_per_saleable_kulfi || 0,
      expectedSales: costingBreakdown?.expected_total_sales || 0,
      estimatedGrossProfit: costingBreakdown?.estimated_total_gross_profit || 0,
      grossMarginPercentage: costingBreakdown?.gross_margin_percentage || 0,
      ingredients: selectedIngredients,
      notes,
    };

    try {
      if (!isOnline) {
        await saveDraft('production_batch', batchData);
        alert('ऑफ़लाइन ड्राफ्ट सुरक्षित हो गया! इंटरनेट कनेक्ट होने पर यह सिंक हो जाएगा।');
        navigate('/production');
      } else {
        await createBatchMutation.mutateAsync(batchData);
        alert(
          `उत्पादन बैच सफलतापूर्वक पूर्ण हुआ!\n${saleablePieces} पीस मुख्य फ्रीजर में जोड़ दिए गए हैं।\nप्रति कुल्फी लागत: ₹${costingBreakdown?.cost_per_saleable_kulfi}`
        );
        navigate('/production');
      }
    } catch (err: any) {
      setFormError(err.message || 'उत्पादन बैच पूर्ण करने में त्रुटि हुई');
    }
  };

  // Reset Form
  const handleResetForm = () => {
    if (confirm('क्या आप फॉर्म को रीसेट करके मूल रेसिपी लोड करना चाहते हैं?')) {
      if (activeRecipe) {
        setSelectedProductId(activeRecipe.product_id);
      }
      setDamagedQuantity(0);
      setNotes('');
      setRequiredQuantity('');
      setFormError(null);
      setSuccessMessage(null);
    }
  };

  // Add Custom Ingredient Modal Submit
  const handleAddCustomIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customIngNameEn.trim() || !customIngNameHi.trim()) {
      alert('कृपया अंग्रेजी व हिंदी दोनों नाम दर्ज करें।');
      return;
    }

    try {
      const rateNum = parseFloat(customIngRate) || 0;
      await addIngredientMutation.mutateAsync({
        code: `ING-${customIngNameEn.toUpperCase().replace(/\s+/g, '_').slice(0, 10)}`,
        name_en: customIngNameEn.trim(),
        name_hi: customIngNameHi.trim(),
        category: customIngCategory,
        base_unit: customIngUnit,
        current_rate: rateNum,
        rate_unit: customIngUnit,
        is_active: true,
      });

      setIsAddIngredientModalOpen(false);
      setCustomIngNameEn('');
      setCustomIngNameHi('');
      setCustomIngRate('0');
    } catch (err: any) {
      alert(err.message || 'सामग्री जोड़ने में त्रुटि हुई');
    }
  };

  // Seller Role Block
  if (!isProduction && !isOwner) {
    return (
      <Card className="py-12 text-center text-rose-700 max-w-lg mx-auto my-10">
        <ShieldAlert className="w-16 h-16 mx-auto mb-3 text-rose-600" />
        <h2 className="text-xl font-bold">अनुमति नहीं है (Access Denied)</h2>
        <p className="text-sm text-gray-600 mt-2">
          उत्पादन लागत कैलकुलेटर केवल कारखाने के प्रभारी और मालिक के लिए उपलब्ध है।
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-24 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 flex items-center gap-2.5">
            <Calculator className="w-8 h-8 text-maroon-800 flex-shrink-0" />
            <span>{language === 'hi' ? t.productionCostCalculatorHi : t.productionCostCalculator}</span>
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {language === 'hi' ? t.productCostingTagline : t.productCostingTagline}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<History className="w-4 h-4" />}
            onClick={() => setIsHistoryModalOpen(true)}
          >
            {t.recipeHistory} ({recipeHistory.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Factory className="w-4 h-4" />}
            onClick={() => navigate('/production')}
          >
            {t.productionBatches}
          </Button>
        </div>
      </div>

      {/* Success & Error Banners */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm font-semibold flex items-center gap-2 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {formError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-sm font-semibold flex items-center gap-2 shadow-sm animate-fadeIn">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* 1. Large Top Product / Type Selection Cards */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-600 block px-1">
          {language === 'hi' ? '1. उत्पाद / कुल्फी किस्म चुनें (Select Kulfi Variety)' : '1. Select Kulfi Product'}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {products.slice(0, 3).map((prod) => {
            const isSelected = prod.id === selectedProductId;
            return (
              <button
                key={prod.id}
                type="button"
                onClick={() => handleProductSelect(prod.id)}
                className={`flex flex-col text-left p-4 rounded-2xl border-2 transition-all shadow-sm ${
                  isSelected
                    ? 'border-maroon-800 bg-gradient-to-br from-amber-50 to-orange-50 ring-2 ring-maroon-800/30 text-gray-900 scale-[1.02]'
                    : 'border-cream-300 bg-white hover:border-maroon-400 text-gray-700'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-cream-200 text-maroon-900">
                    ₹{prod.current_price}
                  </span>
                  {isSelected && <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" />}
                </div>
                <span className="text-base font-extrabold text-gray-900 truncate">
                  {language === 'hi' ? prod.name_hi : prod.name_en}
                </span>
                <span className="text-xs text-gray-500 truncate">{prod.name_en}</span>
                <div className="mt-2 pt-2 border-t border-cream-200/80 flex items-center justify-between text-[11px] font-semibold text-gray-600">
                  <span>{prod.sku}</span>
                  {activeRecipe && activeRecipe.product_id === prod.id && (
                    <span className="text-emerald-700 font-bold">v{activeRecipe.version_number}</span>
                  )}
                </div>
              </button>
            );
          })}

          {/* Other Products Dropdown / Selector */}
          <div
            className={`flex flex-col justify-between p-4 rounded-2xl border-2 transition-all ${
              !products.slice(0, 3).some((p) => p.id === selectedProductId)
                ? 'border-maroon-800 bg-amber-50/70 ring-2 ring-maroon-800/30'
                : 'border-cream-300 bg-white'
            }`}
          >
            <span className="text-xs font-bold text-gray-600 mb-1">{t.otherProduct}</span>
            <select
              value={selectedProductId}
              onChange={(e) => handleProductSelect(e.target.value)}
              className="w-full bg-cream-50 border border-cream-300 rounded-xl px-2.5 py-2 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {language === 'hi' ? p.name_hi : p.name_en} (₹{p.current_price})
                </option>
              ))}
            </select>
            <span className="text-[11px] text-gray-500 mt-2 block truncate">
              {activeProduct?.description || 'अन्य विशेष कुल्फी किस्में'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Optional Production Scaling Drawer */}
      <Card className="border-amber-200 bg-gradient-to-r from-amber-50/80 to-cream-50">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowScalingDrawer(!showScalingDrawer)}
        >
          <div className="flex items-center gap-2.5">
            <Scale className="w-5 h-5 text-amber-700" />
            <div>
              <h3 className="text-sm font-bold text-gray-900">{t.scaleRecipeTitle}</h3>
              <p className="text-xs text-gray-600">
                {language === 'hi'
                  ? 'कुल्फी की आवश्यकता दर्ज करें और आवश्यक कच्चा माल देखें'
                  : 'Enter required kulfi count to compute material requirements'}
              </p>
            </div>
          </div>
          <button type="button" className="text-amber-800 p-1">
            {showScalingDrawer ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {showScalingDrawer && (
          <div className="mt-4 pt-4 border-t border-amber-200/80 space-y-4 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 max-w-sm">
                <Input
                  label={t.requiredKulfiQuantity}
                  type="number"
                  inputMode="numeric"
                  placeholder="उदा. 500"
                  value={requiredQuantity}
                  onChange={(e) => setRequiredQuantity(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                />
              </div>
              {scalingResult && (
                <div className="flex items-center gap-3 pt-2 text-xs font-semibold text-gray-700">
                  <Badge variant="info">
                    {t.scaleFactor}: {scalingResult.scale_factor}x
                  </Badge>
                  <Badge variant="warning">
                    {t.requiredBatches}: {scalingResult.required_batches}
                  </Badge>
                </div>
              )}
            </div>

            {scalingResult && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mt-3">
                {scalingResult.scaled_ingredients.map((sc, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-white/90 border border-amber-200 text-xs shadow-xs"
                  >
                    <span className="font-bold text-gray-900 block truncate">
                      {language === 'hi' ? sc.name_hi : sc.name_en}
                    </span>
                    <div className="flex justify-between items-center mt-1 text-gray-600 font-mono">
                      <span>{sc.quantity} {sc.unit}</span>
                      <span className="font-bold text-maroon-900">{formatCurrency(sc.estimated_cost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-500 italic">
              {language === 'hi' ? t.scalingDisclaimer : t.scalingDisclaimer}
            </p>
          </div>
        )}
      </Card>

      {/* 3. Single Consolidated Costing Form */}
      <Card className="border-cream-300 divide-y divide-gray-100 shadow-sm">
        {/* Basic Details Header */}
        <div className="pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Factory className="w-5 h-5 text-maroon-800" />
              <span>
                {language === 'hi' ? '2. बुनियादी विवरण (Basic Production Details)' : '2. Production Batch Details'}
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <Badge variant="info">
                {activeProduct?.name_en} (₹{activeProduct?.current_price})
              </Badge>
              {activeRecipe && (
                <Badge variant="success">
                  {t.recipeVersion} {activeRecipe.version_number}
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <Input
              label={t.productionDate}
              type="date"
              value={productionDate}
              onChange={(e) => setProductionDate(e.target.value)}
              required
            />
            <Input
              label={t.actualOutput}
              type="number"
              inputMode="numeric"
              value={producedQuantity}
              onChange={(e) => setProducedQuantity(Math.max(0, parseInt(e.target.value) || 0))}
              required
              min={1}
            />
            <Input
              label={t.damagedOutput}
              type="number"
              inputMode="numeric"
              value={damagedQuantity}
              onChange={(e) => setDamagedQuantity(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
            />
            <div className="flex flex-col justify-end">
              <label className="text-xs font-bold text-gray-700 mb-1">{t.saleableOutput}</label>
              <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-300 font-mono font-extrabold text-emerald-900 text-base">
                {Math.max(0, producedQuantity - damagedQuantity)} {t.pieces}
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Input
              label="बैच नोट्स / टिप्पणियाँ (Notes)"
              placeholder="उदा. सुबह की पहली शिफ्ट, विशेष मावा इस्तेमाल किया"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Ingredient Details Table / Mobile Responsive List */}
        <div className="py-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Milk className="w-5 h-5 text-amber-700" />
                <span>
                  {language === 'hi' ? '3. सामग्री विवरण (Ingredient Quantities & Rates)' : '3. Ingredient Rates & Costs'}
                </span>
              </h2>
              <p className="text-xs text-gray-500">
                {language === 'hi'
                  ? 'चयनित सामग्री का ही खर्च जोड़ा जाएगा। दर मास्टर से स्वतः लोड होती है।'
                  : 'Only checked ingredients are calculated. Rates loaded from master.'}
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIsAddIngredientModalOpen(true)}
            >
              {t.addIngredient}
            </Button>
          </div>

          {/* Ingredient Rows Container */}
          <div className="space-y-2.5">
            {ingredientRows.map((row, idx) => {
              const isMissingRate = row.is_selected && row.quantity > 0 && (row.rate <= 0 || isNaN(row.rate));

              return (
                <div
                  key={row.ingredient_id}
                  className={`p-3 rounded-2xl border transition-all ${
                    row.is_selected
                      ? isMissingRate
                        ? 'border-rose-300 bg-rose-50/60 ring-1 ring-rose-300'
                        : 'border-cream-300 bg-white shadow-xs'
                      : 'border-gray-200 bg-gray-50/60 opacity-65'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Left: Checkbox + Name */}
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <input
                        type="checkbox"
                        checked={row.is_selected}
                        onChange={() => handleRowToggle(idx)}
                        className="w-5 h-5 text-maroon-800 rounded-lg border-cream-400 focus:ring-maroon-800 cursor-pointer"
                      />
                      <div>
                        <span className="font-extrabold text-sm text-gray-900 block">
                          {language === 'hi' ? row.name_hi : row.name_en}
                        </span>
                        <span className="text-xs text-gray-500">{row.name_en}</span>
                      </div>
                    </div>

                    {/* Middle: Quantity + Unit + Rate + RateUnit */}
                    {row.is_selected ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 items-center">
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
                                per {u.value}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 text-xs text-gray-400 italic py-2">
                        {language === 'hi' ? 'यह सामग्री इस बैच में शामिल नहीं है' : 'Unchecked (not included in costing)'}
                      </div>
                    )}

                    {/* Right: Calculated Cost & Save Rate Check */}
                    {row.is_selected && (
                      <div className="flex flex-col md:items-end justify-center min-w-[120px] pt-1 md:pt-0 border-t md:border-t-0 border-cream-100">
                        <span className="text-[11px] font-bold text-gray-500">{t.ingredientCost}</span>
                        <span className="font-mono font-extrabold text-base text-maroon-900">
                          {formatCurrency(row.calculated_cost)}
                        </span>
                        {row.save_rate_to_master && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded-md mt-0.5">
                            💾 Save to Master
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Additional Batch Costs (Overheads) */}
        <div className="py-5 space-y-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-700" />
              <span>{t.additionalBatchCosts}</span>
            </h2>
            <p className="text-xs text-gray-500">
              {language === 'hi'
                ? 'सभी अतिरिक्त खर्चे वैकल्पिक हैं (डिफ़ॉल्ट ₹0)। पैकिंग सामग्री पहले ही ऊपर गिनी गई है।'
                : 'All additional costs are optional (default 0). Packaging from recipe is auto-counted.'}
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
              <label className="text-xs font-semibold text-gray-700 block mb-1">{t.generatorFuel}</label>
              <input
                type="number"
                inputMode="decimal"
                value={overheads.generator_fuel || ''}
                onChange={(e) => handleOverheadChange('generator_fuel', parseFloat(e.target.value) || 0)}
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

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">{t.water}</label>
              <input
                type="number"
                inputMode="decimal"
                value={overheads.water || ''}
                onChange={(e) => handleOverheadChange('water', parseFloat(e.target.value) || 0)}
                className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                placeholder="₹ 0"
                min={0}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">{t.packagingExtra}</label>
              <input
                type="number"
                inputMode="decimal"
                value={overheads.packaging_extra || ''}
                onChange={(e) => handleOverheadChange('packaging_extra', parseFloat(e.target.value) || 0)}
                className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                placeholder="₹ 0"
                min={0}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">{t.otherExpense}</label>
              <input
                type="number"
                inputMode="decimal"
                value={overheads.other || ''}
                onChange={(e) => handleOverheadChange('other', parseFloat(e.target.value) || 0)}
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
                    {language === 'hi' ? 'अनुमानित उत्पादन परिणाम' : 'Live Calculation Result'}
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

              {/* Cost Breakdown Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-4 text-xs">
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs">
                  <span className="text-gray-300 block">दूध (Milk)</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatCurrency(costingBreakdown.milk_cost)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs">
                  <span className="text-gray-300 block">चीनी (Sugar)</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatCurrency(costingBreakdown.sugar_cost)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs">
                  <span className="text-gray-300 block">खोया (Khoya)</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatCurrency(costingBreakdown.khoya_cost)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs">
                  <span className="text-gray-300 block">मेवे (Dry Fruits)</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatCurrency(
                      costingBreakdown.cashew_cost +
                        costingBreakdown.pistachio_cost +
                        costingBreakdown.almond_cost
                    )}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs">
                  <span className="text-gray-300 block">मसाला व फ्लेवर</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatCurrency(
                      costingBreakdown.cardamom_cost +
                        costingBreakdown.saffron_cost +
                        costingBreakdown.flavour_cost +
                        costingBreakdown.custard_cost
                    )}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs">
                  <span className="text-gray-300 block">कुल पैकिंग (Packaging)</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatCurrency(costingBreakdown.total_packaging_cost)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs">
                  <span className="text-gray-300 block">ईंधन व गैस (Fuel/Gas)</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatCurrency(costingBreakdown.electricity_fuel_cost)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xs">
                  <span className="text-gray-300 block">मजदूरी (Labour)</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatCurrency(costingBreakdown.labour_cost)}
                  </span>
                </div>
              </div>

              {/* Highlight KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/15">
                <div className="p-3.5 rounded-2xl bg-white/15 backdrop-blur-sm">
                  <span className="text-xs text-amber-200 font-semibold block">कुल बैच लागत</span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-white block mt-0.5">
                    {formatCurrency(costingBreakdown.total_batch_cost)}
                  </span>
                  <span className="text-[11px] text-gray-300 mt-1 block">
                    सामग्री + ओवरहेड्स
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/15 backdrop-blur-sm">
                  <span className="text-xs text-amber-200 font-semibold block">{t.costPerKulfi}</span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-amber-300 block mt-0.5">
                    ₹{costingBreakdown.cost_per_saleable_kulfi.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-gray-300 mt-1 block">
                    {costingBreakdown.saleable_pieces} बिक्री योग्य पीस
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/15 backdrop-blur-sm">
                  <span className="text-xs text-emerald-300 font-semibold block">{t.profitPerKulfi}</span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-emerald-300 block mt-0.5">
                    ₹{costingBreakdown.estimated_profit_per_kulfi.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-emerald-200 mt-1 block">
                    मार्जिन: {costingBreakdown.gross_margin_percentage}%
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/15 backdrop-blur-sm">
                  <span className="text-xs text-emerald-300 font-semibold block">{t.estimatedGrossProfit}</span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-emerald-300 block mt-0.5">
                    {formatCurrency(costingBreakdown.estimated_total_gross_profit)}
                  </span>
                  <span className="text-[11px] text-gray-300 mt-1 block">
                    कुल बिक्री: {formatCurrency(costingBreakdown.expected_total_sales)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. Sticky Form Action Bar */}
        <div className="pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-cream-50 p-4 rounded-2xl border border-cream-200">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="md"
                leftIcon={<RotateCcw className="w-4 h-4" />}
                onClick={handleResetForm}
                className="w-full sm:w-auto"
              >
                {t.resetForm}
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
              {isOwner && (
                <Button
                  variant="outline"
                  size="md"
                  leftIcon={<Save className="w-4 h-4 text-maroon-800" />}
                  onClick={handleSaveDefaultRecipe}
                  isLoading={saveRecipeMutation.isPending}
                  className="w-full sm:w-auto border-maroon-800 text-maroon-900 font-bold"
                >
                  {t.saveDefaultRecipe}
                </Button>
              )}

              <Button
                variant="primary"
                size="lg"
                leftIcon={<PackageCheck className="w-5 h-5" />}
                onClick={handleCompleteProduction}
                isLoading={createBatchMutation.isPending}
                className="w-full sm:w-auto font-extrabold shadow-md shadow-maroon-900/20"
              >
                {t.completeProduction}
              </Button>
            </div>
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
                <div className="flex items-center justify-between pb-2 border-b border-cream-200">
                  <div className="flex items-center gap-2">
                    <Badge variant={rec.is_default ? 'success' : 'default'}>
                      v{rec.version_number} {rec.is_default && '(Active Default)'}
                    </Badge>
                    <span className="font-bold text-sm text-gray-900">{rec.name}</span>
                  </div>
                  <span className="text-gray-500 font-mono">
                    {formatDate(rec.created_at || rec.effective_from)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-1">
                  {rec.items.map((it, i) => (
                    <div key={i} className="p-2 rounded-lg bg-white border border-cream-200">
                      <span className="font-bold block text-gray-900">
                        {it.ingredient?.name_hi || it.ingredient?.name_en}
                      </span>
                      <span className="font-mono text-gray-600">
                        {it.quantity} {it.unit}
                      </span>
                    </div>
                  ))}
                </div>

                {rec.notes && <p className="text-gray-600 italic">टिप्पणी: {rec.notes}</p>}
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Add Custom Ingredient Modal */}
      <Modal
        isOpen={isAddIngredientModalOpen}
        onClose={() => setIsAddIngredientModalOpen(false)}
        title={t.addIngredient}
        maxWidth="md"
      >
        <form onSubmit={handleAddCustomIngredient} className="space-y-4">
          <Input
            label="Ingredient Name (English)"
            placeholder="e.g. Vanilla Extract"
            value={customIngNameEn}
            onChange={(e) => setCustomIngNameEn(e.target.value)}
            required
          />
          <Input
            label="सामग्री का नाम (हिंदी)"
            placeholder="उदा. वैनिला एसेंस"
            value={customIngNameHi}
            onChange={(e) => setCustomIngNameHi(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">श्रेणी (Category)</label>
              <select
                value={customIngCategory}
                onChange={(e) => setCustomIngCategory(e.target.value as IngredientCategory)}
                className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-800"
              >
                <option value="dairy">Dairy (दूध/मावा)</option>
                <option value="sweetener">Sweetener (मीठा/चीनी)</option>
                <option value="dry_fruit">Dry Fruit (मेवा)</option>
                <option value="spice">Spice (मसाला)</option>
                <option value="flavoring">Flavoring (फ्लेवर/रंग)</option>
                <option value="packaging">Packaging (पैकिंग/तीली)</option>
                <option value="other">Other (अन्य)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">{t.unit}</label>
              <select
                value={customIngUnit}
                onChange={(e) => setCustomIngUnit(e.target.value as UnitType)}
                className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-800"
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
            value={customIngRate}
            onChange={(e) => setCustomIngRate(e.target.value)}
            placeholder="0.00"
            min={0}
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsAddIngredientModalOpen(false)}
            >
              रद्द करें
            </Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={addIngredientMutation.isPending}
            >
              सामग्री जोड़ें
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
