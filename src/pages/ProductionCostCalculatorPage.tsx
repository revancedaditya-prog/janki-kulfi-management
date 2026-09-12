import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useProducts, useUpdateProduct, usePriceHistory } from '@/hooks/useProducts';
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
  ProductWithPrice,
  CommissionType,
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
  Edit,
  X,
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
  const updateProductMutation = useUpdateProduct();

  // Dirty State Flag: Protects unsaved edits from background refetches
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const loadedRecipeKeyRef = useRef<string>('');

  // Form State
  const [currentRecipeId, setCurrentRecipeId] = useState<string | null>(null);
  const [currentVersionNumber, setCurrentVersionNumber] = useState<number | null>(null);
  const [standardOutputPieces, setStandardOutputPieces] = useState<number>(100);
  const [recipeName, setRecipeName] = useState<string>('');
  const [recipeNotes, setRecipeNotes] = useState<string>('');
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

  // Active Recipe Items Rows (Only rows included in this recipe)
  const [recipeRows, setRecipeRows] = useState<CostingIngredientRow[]>([]);
  const [selectedIngredientToAdd, setSelectedIngredientToAdd] = useState<string>('');

  // Scaling State
  const [requiredQuantity, setRequiredQuantity] = useState<number | ''>('');
  const [showScalingDrawer, setShowScalingDrawer] = useState<boolean>(false);

  // Modal UI States
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [recipeToDelete, setRecipeToDelete] = useState<RecipeWithItems | null>(null);
  const [isAddIngredientModalOpen, setIsAddIngredientModalOpen] = useState<boolean>(false);
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState<boolean>(false);

  // Custom Ingredient Form
  const [customIngNameEn, setCustomIngNameEn] = useState<string>('');
  const [customIngNameHi, setCustomIngNameHi] = useState<string>('');
  const [customIngCategory, setCustomIngCategory] = useState<IngredientCategory>('other');
  const [customIngUnit, setCustomIngUnit] = useState<UnitType>('kg');
  const [customIngRate, setCustomIngRate] = useState<string>('0');

  // Edit Product Form State
  const [editProdNameHi, setEditProdNameHi] = useState<string>('');
  const [editProdNameEn, setEditProdNameEn] = useState<string>('');
  const [editProdSku, setEditProdSku] = useState<string>('');
  const [editProdPrice, setEditProdPrice] = useState<string>('');
  const [editProdCommType, setEditProdCommType] = useState<CommissionType>('fixed');
  const [editProdCommVal, setEditProdCommVal] = useState<string>('');
  const [editProdDesc, setEditProdDesc] = useState<string>('');
  const [editProdIsActive, setEditProdIsActive] = useState<boolean>(true);
  const [editProdError, setEditProdError] = useState<string | null>(null);

  // Notification banners
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Price history query for active product modal
  const { data: priceHistory = [] } = usePriceHistory(activeProduct?.id || '');

  // Sync selected product with search params / product list
  useEffect(() => {
    if (products.length > 0 && !products.some((p) => p.id === selectedProductId)) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  // Helper to construct ingredient rows from a recipe
  const populateFormFromRecipe = (recipe: RecipeWithItems | null | undefined, prod: ProductWithPrice | undefined) => {
    if (!prod) return;

    if (recipe) {
      setCurrentRecipeId(recipe.id);
      setCurrentVersionNumber(recipe.version_number);
      setStandardOutputPieces(recipe.expected_yield_pieces || recipe.standard_output_pieces || 100);
      setRecipeName(recipe.name || `${prod.name_hi || prod.name_en} Standard Recipe`);
      setRecipeNotes(recipe.notes || '');
      setSaveAsStatus((recipe.status as 'active' | 'draft') || 'active');
      if (recipe.default_overheads) {
        setOverheads({ ...recipe.default_overheads });
      }

      // Populate items that exist in the recipe
      const rows: CostingIngredientRow[] = (recipe.items || []).map((it) => {
        const ingMaster = allIngredients.find((ing) => ing.id === it.ingredient_id);
        const nameEn = (it as any).ingredient_name_en || it.ingredient?.name_en || ingMaster?.name_en || 'Ingredient';
        const nameHi = (it as any).ingredient_name_hi || it.ingredient?.name_hi || ingMaster?.name_hi || nameEn;
        const category = ingMaster?.category || 'other';
        const rate = Number((it as any).rate || ingMaster?.current_rate || 0);
        const rateUnit = (ingMaster?.rate_unit || (it as any).rate_unit || it.unit || 'kg') as UnitType;
        const calculated_cost = calculateIngredientRowCost(it.quantity, it.unit, rate, rateUnit);

        return {
          ingredient_id: it.ingredient_id,
          name_en: nameEn,
          name_hi: nameHi,
          category,
          is_selected: true,
          quantity: it.quantity,
          unit: it.unit,
          rate,
          rate_unit: rateUnit,
          calculated_cost,
          save_rate_to_master: false,
        };
      });

      setRecipeRows(rows);
    } else {
      // Default empty template for product
      setCurrentRecipeId(null);
      setCurrentVersionNumber(null);
      setStandardOutputPieces(100);
      setRecipeName(`${prod.name_hi || prod.name_en} Standard Recipe`);
      setRecipeNotes('');
      setSaveAsStatus('active');
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

      // Default with milk and sugar if available in master
      const defaultRows: CostingIngredientRow[] = [];
      const milk = allIngredients.find((i) => i.code?.includes('MILK') || i.name_en.toLowerCase().includes('milk'));
      const sugar = allIngredients.find((i) => i.code?.includes('SUGAR') || i.name_en.toLowerCase().includes('sugar'));

      if (milk) {
        const rate = Number(milk.current_rate || 0);
        defaultRows.push({
          ingredient_id: milk.id,
          name_en: milk.name_en,
          name_hi: milk.name_hi,
          category: milk.category,
          is_selected: true,
          quantity: 10,
          unit: milk.base_unit || 'litre',
          rate,
          rate_unit: milk.rate_unit || milk.base_unit || 'litre',
          calculated_cost: calculateIngredientRowCost(10, milk.base_unit || 'litre', rate, milk.rate_unit || milk.base_unit || 'litre'),
          save_rate_to_master: false,
        });
      }
      if (sugar) {
        const rate = Number(sugar.current_rate || 0);
        defaultRows.push({
          ingredient_id: sugar.id,
          name_en: sugar.name_en,
          name_hi: sugar.name_hi,
          category: sugar.category,
          is_selected: true,
          quantity: 1.5,
          unit: sugar.base_unit || 'kg',
          rate,
          rate_unit: sugar.rate_unit || sugar.base_unit || 'kg',
          calculated_cost: calculateIngredientRowCost(1.5, sugar.base_unit || 'kg', rate, sugar.rate_unit || sugar.base_unit || 'kg'),
          save_rate_to_master: false,
        });
      }

      setRecipeRows(defaultRows);
    }
    setIsDirty(false);
    setFormError(null);
  };

  // Synchronize Form State only when activeRecipe / selectedProductId changes, respecting isDirty
  useEffect(() => {
    if (!activeProduct) return;
    const currentKey = `${activeProduct.id}:${activeRecipe?.id || 'none'}:${activeRecipe?.version_number || 0}`;

    // If product/recipe changed or we haven't loaded yet, or form is NOT dirty, initialize
    if (loadedRecipeKeyRef.current !== currentKey) {
      loadedRecipeKeyRef.current = currentKey;
      populateFormFromRecipe(activeRecipe, activeProduct);
    }
  }, [activeRecipe, activeProduct, allIngredients]);

  // Handle Product Tab Click
  const handleProductSelect = (productId: string) => {
    if (productId === selectedProductId) return;
    if (isDirty) {
      const confirmDiscard = window.confirm(
        'आपके पास बिना सहेजे गए बदलाव हैं। क्या आप उत्पाद बदलना चाहते हैं? (Unsaved changes will be discarded)'
      );
      if (!confirmDiscard) return;
    }
    setSelectedProductId(productId);
    setSearchParams({ product: productId });
    setShowScalingDrawer(false);
    setRequiredQuantity('');
    setIsDirty(false);
    setFormError(null);
    setSuccessMessage(null);
  };

  // Load a historical recipe version into editor
  const handleLoadRecipeVersion = (recipe: RecipeWithItems) => {
    populateFormFromRecipe(recipe, activeProduct);
    setIsHistoryModalOpen(false);
    setIsDirty(false);
    setSuccessMessage(`संस्करण v${recipe.version_number} संपादक में लोड किया गया!`);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Row Manipulation Handlers
  const handleQuantityChange = (index: number, val: number) => {
    setIsDirty(true);
    setRecipeRows((prev) => {
      const copy = [...prev];
      const validVal = Math.max(0, val);
      copy[index] = {
        ...copy[index],
        quantity: validVal,
        calculated_cost: calculateIngredientRowCost(
          validVal,
          copy[index].unit,
          copy[index].rate,
          copy[index].rate_unit
        ),
      };
      return copy;
    });
  };

  const handleUnitChange = (index: number, newUnit: UnitType) => {
    setIsDirty(true);
    setRecipeRows((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        unit: newUnit,
        calculated_cost: calculateIngredientRowCost(
          copy[index].quantity,
          newUnit,
          copy[index].rate,
          copy[index].rate_unit
        ),
      };
      return copy;
    });
  };

  const handleRateChange = (index: number, newRate: number) => {
    setIsDirty(true);
    setRecipeRows((prev) => {
      const copy = [...prev];
      const validRate = Math.max(0, newRate);
      copy[index] = {
        ...copy[index],
        rate: validRate,
        calculated_cost: calculateIngredientRowCost(
          copy[index].quantity,
          copy[index].unit,
          validRate,
          copy[index].rate_unit
        ),
      };
      return copy;
    });
  };

  const handleRemoveRow = (index: number) => {
    setIsDirty(true);
    setRecipeRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddIngredientToRecipe = () => {
    if (!selectedIngredientToAdd) return;
    const ingMaster = allIngredients.find((i) => i.id === selectedIngredientToAdd);
    if (!ingMaster) return;

    // Prevent duplicate ingredient
    if (recipeRows.some((r) => r.ingredient_id === ingMaster.id)) {
      setFormError(`"${language === 'hi' ? ingMaster.name_hi : ingMaster.name_en}" पहले से ही रेसिपी में शामिल है।`);
      return;
    }

    setIsDirty(true);
    setFormError(null);

    const rate = Number(ingMaster.current_rate || 0);
    const rateUnit = (ingMaster.rate_unit || ingMaster.base_unit || 'kg') as UnitType;
    const initialQty = 1;

    setRecipeRows((prev) => [
      ...prev,
      {
        ingredient_id: ingMaster.id,
        name_en: ingMaster.name_en,
        name_hi: ingMaster.name_hi,
        category: ingMaster.category,
        is_selected: true,
        quantity: initialQty,
        unit: ingMaster.base_unit || 'kg',
        rate,
        rate_unit: rateUnit,
        calculated_cost: calculateIngredientRowCost(initialQty, ingMaster.base_unit || 'kg', rate, rateUnit),
        save_rate_to_master: false,
      },
    ]);

    setSelectedIngredientToAdd('');
  };

  // Overhead change handler
  const handleOverheadChange = (field: keyof AdditionalOverheads, val: number) => {
    setIsDirty(true);
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
        recipeRows,
        overheads,
        standardOutputPieces || 100,
        0,
        activeProduct.current_price || 0
      );
    } catch {
      return null;
    }
  }, [recipeRows, overheads, standardOutputPieces, activeProduct]);

  // Scaled Ingredients calculation
  const scaledResults = useMemo(() => {
    if (!requiredQuantity || requiredQuantity <= 0 || !activeRecipe) return null;
    return scaleProductionRecipe(activeRecipe, Number(requiredQuantity));
  }, [requiredQuantity, activeRecipe]);

  // Ingredients available to add (not yet in recipeRows)
  const availableIngredientsToAdd = useMemo(() => {
    const currentIds = new Set(recipeRows.map((r) => r.ingredient_id));
    return allIngredients.filter((i) => i.is_active && !currentIds.has(i.id));
  }, [allIngredients, recipeRows]);

  // Save Recipe Version Handler
  const handleSaveRecipe = async (asNewVersionOverride = false) => {
    setFormError(null);
    setSuccessMessage(null);

    if (!isOwner) {
      setFormError('केवल मालिक ही रेसिपी सुरक्षित कर सकते हैं। (Owner role required)');
      return;
    }

    if (!standardOutputPieces || standardOutputPieces <= 0) {
      setFormError('मानक उत्पादन उपज (Expected Yield) 0 से अधिक होनी चाहिए।');
      return;
    }

    if (recipeRows.length === 0) {
      setFormError('रेसिपी में कम से कम एक सामग्री (Ingredient) जोड़ें।');
      return;
    }

    // Validate quantities
    const invalidQuantityRow = recipeRows.find((r) => !r.quantity || r.quantity <= 0);
    if (invalidQuantityRow) {
      setFormError(`सामग्री "${invalidQuantityRow.name_hi || invalidQuantityRow.name_en}" की मात्रा 0 से अधिक होनी चाहिए।`);
      return;
    }

    // Check duplicate ingredient IDs
    const idSet = new Set<string>();
    for (const row of recipeRows) {
      if (idSet.has(row.ingredient_id)) {
        setFormError(`रेसिपी में डुप्लिकेट सामग्री पाई गई: ${row.name_hi || row.name_en}`);
        return;
      }
      idSet.add(row.ingredient_id);
    }

    const payloadItems = recipeRows.map((r) => ({
      ingredient_id: r.ingredient_id,
      quantity: r.quantity,
      unit: r.unit,
      rate: r.rate,
      rate_unit: r.rate_unit,
      save_rate_to_master: false,
    }));

    try {
      const result = await saveRecipeMutation.mutateAsync({
        product_id: selectedProductId,
        recipe_id: asNewVersionOverride ? undefined : (currentRecipeId || undefined),
        name: recipeName.trim() || `${activeProduct?.name_hi || activeProduct?.name_en} Standard Recipe`,
        standard_output_pieces: standardOutputPieces,
        expected_yield_pieces: standardOutputPieces,
        default_overheads: overheads,
        notes: recipeNotes.trim(),
        status: saveAsStatus,
        items: payloadItems,
        idempotency_key: `rec-save-${Date.now()}`,
      });

      setIsDirty(false);
      if (result?.id) {
        setCurrentRecipeId(result.id);
      }
      if (result?.version_number) {
        setCurrentVersionNumber(result.version_number);
      }

      setSuccessMessage(
        `रेसिपी संस्करण v${result?.version_number || currentVersionNumber || 1} सफलतापूर्वक सुरक्षित हो गया! (${
          result?.status === 'draft' ? 'ड्राफ्ट' : 'सक्रिय'
        })`
      );
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err: any) {
      console.error('[Recipe Save Error]:', err);
      setFormError(err.message || 'रेसिपी सुरक्षित करने में त्रुटि हुई। कृपया पुनः प्रयास करें।');
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

  // Reset Form to Stored Supabase Recipe
  const handleResetForm = () => {
    populateFormFromRecipe(activeRecipe, activeProduct);
    setIsDirty(false);
    setFormError(null);
    setSuccessMessage('रेसिपी फॉर्म को सहेजे गए डेटा से रीसेट किया गया।');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Open Edit Product Modal
  const handleOpenEditProductModal = () => {
    if (!activeProduct) return;
    setEditProdNameHi(activeProduct.name_hi || '');
    setEditProdNameEn(activeProduct.name_en || '');
    setEditProdSku(activeProduct.sku || '');
    setEditProdPrice(String(activeProduct.current_price || 0));
    setEditProdCommType((activeProduct.commission_type as CommissionType) || 'fixed');
    setEditProdCommVal(String(activeProduct.commission_value || 0));
    setEditProdDesc(activeProduct.description || '');
    setEditProdIsActive(activeProduct.is_active !== false);
    setEditProdError(null);
    setIsEditProductModalOpen(true);
  };

  // Submit Edit Product
  const handleEditProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditProdError(null);

    const priceNum = parseFloat(editProdPrice);
    const commNum = parseFloat(editProdCommVal);

    if (!editProdNameHi.trim() && !editProdNameEn.trim()) {
      setEditProdError('उत्पाद का नाम आवश्यक है।');
      return;
    }
    if (isNaN(priceNum) || priceNum <= 0) {
      setEditProdError('बिक्री मूल्य (Selling Price) 0 से अधिक होना चाहिए।');
      return;
    }
    if (isNaN(commNum) || commNum < 0) {
      setEditProdError('कमीशन 0 या उससे अधिक होना चाहिए।');
      return;
    }

    try {
      await updateProductMutation.mutateAsync({
        productId: activeProduct.id,
        data: {
          name_hi: editProdNameHi.trim(),
          name_en: editProdNameEn.trim(),
          sku: editProdSku.trim() || undefined,
          selling_price: priceNum,
          commission_type: editProdCommType,
          commission_value: commNum,
          description: editProdDesc.trim(),
          is_active: editProdIsActive,
        },
      });

      setIsEditProductModalOpen(false);
      setSuccessMessage(`उत्पाद "${editProdNameHi || editProdNameEn}" का विवरण सफलतापूर्वक अपडेट किया गया!`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setEditProdError(err.message || 'उत्पाद अपडेट करने में त्रुटि हुई');
    }
  };

  // Add Custom Ingredient Form submit
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
      
      // Auto-add new ingredient to recipe table
      const rate = Number(newIng.current_rate || 0);
      setIsDirty(true);
      setRecipeRows((prev) => [
        ...prev,
        {
          ingredient_id: newIng.id,
          name_en: newIng.name_en,
          name_hi: newIng.name_hi,
          category: newIng.category,
          is_selected: true,
          quantity: 1,
          unit: newIng.base_unit || 'kg',
          rate,
          rate_unit: newIng.rate_unit || newIng.base_unit || 'kg',
          calculated_cost: calculateIngredientRowCost(1, newIng.base_unit || 'kg', rate, newIng.rate_unit || newIng.base_unit || 'kg'),
          save_rate_to_master: false,
        },
      ]);

      setSuccessMessage(`नई सामग्री "${newIng.name_hi}" सफलतापूर्वक जोड़ी गई और रेसिपी में शामिल की गई!`);
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
            <span className="text-maroon-800 font-extrabold">रेसिपी व लागत कैलकुलेटर</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Calculator className="w-6 h-6 text-maroon-800 flex-shrink-0" />
            <span>रेसिपी मास्टर और उत्पादन लागत कैलकुलेटर</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            कुल्फी उत्पाद रेसिपी सामग्री अनुपात, संस्करण प्रबंधन (Versions) और प्रति-पीस शुद्ध लागत विश्लेषण
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isOwner && activeProduct && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Edit className="w-4 h-4 text-maroon-800" />}
              onClick={handleOpenEditProductModal}
              className="border-maroon-200 text-maroon-900 hover:bg-maroon-50"
            >
              उत्पाद संपादित करें (Edit Product)
            </Button>
          )}

          {activeRecipe && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<History className="w-4 h-4 text-gray-600" />}
              onClick={() => setIsHistoryModalOpen(true)}
            >
              संस्करण इतिहास ({recipeHistory.length})
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
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
            <span>{formError}</span>
          </div>
          <button onClick={() => setFormError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dirty Form Warning Badge */}
      {isDirty && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>आपके पास बिना सहेजे गए बदलाव हैं (Unsaved Changes)। 'रेसिपी सुरक्षित करें' दबाएं।</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleResetForm} className="text-amber-800 hover:bg-amber-100 py-0.5 px-2 h-auto text-xs">
            रद्द करें (Discard)
          </Button>
        </div>
      )}

      {/* 1. Dynamic Product Tabs Bar */}
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

      {/* 2. Recipe Version & Header Card */}
      <Card className="border-cream-300 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-600" />
                <span>मानक रेसिपी विवरण (Recipe Template)</span>
              </h2>
              {currentVersionNumber ? (
                <Badge variant={saveAsStatus === 'active' ? 'success' : 'warning'} className="text-xs">
                  {saveAsStatus === 'active' ? `सक्रिय: v${currentVersionNumber}` : `ड्राफ्ट: v${currentVersionNumber}`}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-gray-500">
                  नया संस्करण (New Version)
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              उत्पाद: <strong>{language === 'hi' ? activeProduct?.name_hi : activeProduct?.name_en}</strong> | वर्तमान बिक्री मूल्य: <strong>{formatCurrency(activeProduct?.current_price)}</strong> / पीस
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
            placeholder="जैसे: सादा कुल्फी मानक रेसिपी"
            value={recipeName}
            onChange={(e) => {
              setIsDirty(true);
              setRecipeName(e.target.value);
            }}
            required
          />

          <Input
            label="मानक उत्पादन उपज (Expected Yield Pieces) *"
            type="number"
            inputMode="numeric"
            value={standardOutputPieces}
            onChange={(e) => {
              setIsDirty(true);
              setStandardOutputPieces(Math.max(1, parseInt(e.target.value, 10) || 0));
            }}
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
              onChange={(e) => {
                setIsDirty(true);
                setSaveAsStatus(e.target.value as 'active' | 'draft');
              }}
              className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-maroon-800"
            >
              <option value="active">सक्रिय (Active — उत्पादन में उपयोग होगा)</option>
              <option value="draft">ड्राफ्ट (Draft — केवल परीक्षण हेतु)</option>
            </select>
          </div>

          <Input
            label="रेसिपी नोट्स / बदलाव का कारण (Notes)"
            placeholder="जैसे: इलायची की मात्रा बढ़ाई गई..."
            value={recipeNotes}
            onChange={(e) => {
              setIsDirty(true);
              setRecipeNotes(e.target.value);
            }}
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

      {/* 3. Recipe Ingredients Table & Add Selector */}
      <Card className="border-cream-300 divide-y divide-gray-100 shadow-sm">
        <div className="pb-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Milk className="w-5 h-5 text-amber-700" />
                <span>3. सामग्री विवरण (Ingredient Quantities & Rates)</span>
              </h2>
              <p className="text-xs text-gray-500">
                रेसिपी में शामिल सामग्री जोड़ें, मात्रा व इकाई बदलें। लागत दर मास्टर से स्वतः लोड होती है।
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setIsAddIngredientModalOpen(true)}
              >
                कस्टम सामग्री बनाएं (New Custom Material)
              </Button>
            </div>
          </div>

          {/* Quick Add Ingredient from Master Selector */}
          <div className="p-3 bg-cream-50/80 rounded-2xl border border-cream-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <span className="text-xs font-bold text-gray-700 whitespace-nowrap">
              सामग्री जोड़ें (Add to Recipe):
            </span>
            <select
              value={selectedIngredientToAdd}
              onChange={(e) => setSelectedIngredientToAdd(e.target.value)}
              className="flex-1 bg-white border border-cream-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-800"
            >
              <option value="">-- सामग्री का चयन करें --</option>
              {availableIngredientsToAdd.map((ing) => (
                <option key={ing.id} value={ing.id}>
                  {language === 'hi' ? ing.name_hi : ing.name_en} ({ing.category}) — {formatCurrency(ing.current_rate)} / {ing.rate_unit || ing.base_unit}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!selectedIngredientToAdd}
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={handleAddIngredientToRecipe}
            >
              रेसिपी में जोड़ें
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-cream-300 bg-cream-100/60 text-gray-700 uppercase font-bold">
                  <th className="py-2.5 px-3">सामग्री (Ingredient)</th>
                  <th className="py-2.5 px-3 w-32">मात्रा (Quantity)</th>
                  <th className="py-2.5 px-3 w-36">इकाई (Unit)</th>
                  <th className="py-2.5 px-3 w-36">लागत दर (₹/Unit)</th>
                  <th className="py-2.5 px-3 w-32 text-right">कुल लागत (₹)</th>
                  <th className="py-2.5 px-3 w-16 text-center">हटाएं</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recipeRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400 font-semibold">
                      कोई सामग्री नहीं जोड़ी गई। ऊपर दिए गए ड्रॉपडाउन से सामग्री जोड़ें।
                    </td>
                  </tr>
                ) : (
                  recipeRows.map((row, idx) => (
                    <tr key={row.ingredient_id} className="hover:bg-cream-50/40 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-gray-900 text-xs">
                            {language === 'hi' ? row.name_hi : row.name_en}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-cream-200 text-gray-700 capitalize font-medium">
                            {row.category}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          value={row.quantity || ''}
                          placeholder="0"
                          onChange={(e) => handleQuantityChange(idx, parseFloat(e.target.value) || 0)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-maroon-800"
                        />
                      </td>

                      <td className="py-2.5 px-3">
                        <select
                          value={row.unit}
                          onChange={(e) => handleUnitChange(idx, e.target.value as UnitType)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-maroon-800 font-semibold"
                        >
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u.value} value={u.value}>
                              {language === 'hi' ? u.labelHi : u.labelEn}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-xs">₹</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.rate || ''}
                            onChange={(e) => handleRateChange(idx, parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1.5 text-xs font-mono bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-maroon-800"
                          />
                          <span className="text-[10px] text-gray-500 font-semibold">/{row.rate_unit}</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-black text-gray-900 text-xs">
                        {formatCurrency(row.calculated_cost)}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                          title="सामग्री हटाएं (Remove Ingredient)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
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
              value={overheads.other}
              onChange={(e) => handleOverheadChange('other', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* 5. Summary & Live Cost per Kulfi */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-cream-50/70 -mx-6 -mb-6 p-6 rounded-b-2xl border-t border-cream-200">
          <div>
            <span className="text-xs text-gray-500 block font-semibold">
              कुल बैच लागत ({standardOutputPieces} पीस)
            </span>
            <span className="text-2xl font-black text-maroon-950 font-mono">
              {formatCurrency(costingBreakdown?.total_batch_cost || 0)}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-emerald-800 font-extrabold">
                प्रति कुल्फी लागत: ₹{costingBreakdown?.cost_per_saleable_kulfi?.toFixed(2) || '0.00'} / पीस
              </span>
              <span className="text-[11px] text-gray-500">
                (बिक्री मूल्य: {formatCurrency(activeProduct?.current_price)} | मार्जिन: {costingBreakdown?.gross_margin_percentage?.toFixed(1) || 0}%)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
              <>
                <Button
                  variant="primary"
                  size="md"
                  leftIcon={<Save className="w-4 h-4" />}
                  onClick={() => handleSaveRecipe(false)}
                  isLoading={saveRecipeMutation.isPending}
                  className="w-full sm:w-auto font-extrabold shadow-md shadow-maroon-900/20"
                >
                  रेसिपी सुरक्षित करें (Save)
                </Button>

                {currentRecipeId && (
                  <Button
                    variant="outline"
                    size="md"
                    leftIcon={<Sparkles className="w-4 h-4 text-amber-600" />}
                    onClick={() => handleSaveRecipe(true)}
                    isLoading={saveRecipeMutation.isPending}
                    className="w-full sm:w-auto text-xs"
                    title="इस रेसिपी को एक नए संस्करण के रूप में सहेजें"
                  >
                    नया संस्करण बनाएं (Save as New Version)
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Edit Product Modal */}
      {activeProduct && (
        <Modal
          isOpen={isEditProductModalOpen}
          onClose={() => setIsEditProductModalOpen(false)}
          title={`उत्पाद विवरण संपादित करें (${language === 'hi' ? activeProduct.name_hi : activeProduct.name_en})`}
          maxWidth="lg"
        >
          <form onSubmit={handleEditProductSubmit} className="space-y-4 py-2">
            {editProdError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{editProdError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="हिंदी नाम (Product Name Hindi) *"
                placeholder="जैसे: ₹10 सादा कुल्फी"
                value={editProdNameHi}
                onChange={(e) => setEditProdNameHi(e.target.value)}
                required
              />

              <Input
                label="English Name *"
                placeholder="e.g. ₹10 Sada Kulfi"
                value={editProdNameEn}
                onChange={(e) => setEditProdNameEn(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="SKU / प्रोडक्ट कोड *"
                value={editProdSku}
                onChange={(e) => setEditProdSku(e.target.value)}
                required
              />

              <Input
                type="number"
                step="0.01"
                min="0.01"
                label="बिक्री मूल्य (Selling Price ₹) *"
                prefixSymbol="₹"
                value={editProdPrice}
                onChange={(e) => setEditProdPrice(e.target.value)}
                required
              />

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700">
                  सक्रिय स्थिति (Status)
                </label>
                <select
                  value={editProdIsActive ? 'active' : 'inactive'}
                  onChange={(e) => setEditProdIsActive(e.target.value === 'active')}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-800"
                >
                  <option value="active">सक्रिय (Active)</option>
                  <option value="inactive">निष्क्रिय (Inactive)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700">
                  कमीशन प्रकार (Commission Type)
                </label>
                <select
                  value={editProdCommType}
                  onChange={(e) => setEditProdCommType(e.target.value as CommissionType)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-800"
                >
                  <option value="fixed">निश्चित (Fixed ₹/piece)</option>
                  <option value="percentage">प्रतिशत (Percentage %)</option>
                </select>
              </div>

              <Input
                type="number"
                step="0.01"
                label="कमीशन राशि / दर *"
                prefixSymbol={editProdCommType === 'fixed' ? '₹' : undefined}
                suffixSymbol={editProdCommType === 'percentage' ? '%' : undefined}
                value={editProdCommVal}
                onChange={(e) => setEditProdCommVal(e.target.value)}
                required
              />
            </div>

            <Input
              label="विवरण (Description)"
              placeholder="उत्पाद के स्वाद व पैकेजिंग की जानकारी"
              value={editProdDesc}
              onChange={(e) => setEditProdDesc(e.target.value)}
            />

            {/* Price History Preview inside Product Modal */}
            <div className="pt-2 border-t border-gray-100">
              <h4 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-maroon-800" />
                <span>मूल्य इतिहास (Price History)</span>
              </h4>
              <div className="max-h-36 overflow-y-auto border border-cream-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-cream-100/70 border-b border-cream-200 font-bold text-gray-600">
                    <tr>
                      <th className="py-1.5 px-2.5">बिक्री दर</th>
                      <th className="py-1.5 px-2.5">कमीशन</th>
                      <th className="py-1.5 px-2.5">प्रभावी तिथि</th>
                      <th className="py-1.5 px-2.5">समाप्ति</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
                    {priceHistory.map((ph) => (
                      <tr key={ph.id}>
                        <td className="py-1.5 px-2.5 font-bold text-gray-900">{formatCurrency(ph.selling_price)}</td>
                        <td className="py-1.5 px-2.5">
                          {ph.commission_type === 'percentage' ? `${ph.commission_value}%` : formatCurrency(ph.commission_value)}
                        </td>
                        <td className="py-1.5 px-2.5 font-sans text-gray-600">{formatDate(ph.effective_from)}</td>
                        <td className="py-1.5 px-2.5 font-sans text-gray-600">
                          {ph.effective_to ? formatDate(ph.effective_to) : <span className="text-emerald-700 font-bold">वर्तमान ✓</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsEditProductModalOpen(false)}
              >
                रद्द करें (Cancel)
              </Button>
              <Button type="submit" variant="primary" isLoading={updateProductMutation.isPending}>
                उत्पाद अपडेट करें (Save Product)
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Recipe Version History Modal */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={`${activeProduct?.name_hi || activeProduct?.name_en} - रेसिपी संस्करण इतिहास (Recipe Versions)`}
        maxWidth="lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {recipeHistory.length === 0 ? (
            <p className="text-center py-8 text-gray-500 font-semibold">कोई पूर्व रेसिपी संस्करण नहीं मिला।</p>
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
                  <span className="text-gray-500 font-mono">{formatDate(rec.created_at)}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-700">
                  <div>मानक उपज: <strong>{rec.expected_yield_pieces || rec.standard_output_pieces} पीस</strong></div>
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
                    संपादक में लोड करें (Load to Editor)
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
