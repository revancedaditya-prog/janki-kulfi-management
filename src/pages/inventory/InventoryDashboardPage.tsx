import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useRawMaterialDashboardKPIs,
  useIngredients,
  useMaterialPurchases,
  useCreateIngredient,
  useUpdateIngredient,
  useDeactivateIngredient,
  useReactivateIngredient,
  useDeleteIngredient,
  useCorrectRawMaterialStock,
  useReverseMaterialPurchase,
} from '@/hooks/useInventory';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Ingredient, IngredientCategory, UnitType, MaterialPurchaseWithItems } from '@/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { formatIngredientQuantityWithUnit } from '@/lib/inventoryService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import {
  Package,
  Plus,
  AlertTriangle,
  Truck,
  RotateCcw,
  Search,
  Eye,
  Edit2,
  Trash2,
  Power,
  PowerOff,
  Scale,
  CalendarCheck,
  Layers,
  Sparkles,
  XCircle,
  FileText,
} from 'lucide-react';
import { InventorySetupWizardModal } from '@/components/inventory/InventorySetupWizardModal';

type ActiveTab = 'stock' | 'purchases' | 'master';

export const InventoryDashboardPage: React.FC = () => {
  const { language } = useLanguage();
  const { isOwner } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab Management from query param (defaults to 'stock')
  const activeTab: ActiveTab = (searchParams.get('tab') as ActiveTab) || 'stock';
  const setActiveTab = (tab: ActiveTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  // Queries
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data: kpis } = useRawMaterialDashboardKPIs();
  const { data: ingredients = [] } = useIngredients(activeTab === 'master' ? includeInactive : true);
  const { data: purchases = [] } = useMaterialPurchases();

  // Mutations
  const createIngMutation = useCreateIngredient();
  const updateIngMutation = useUpdateIngredient();
  const deactivateIngMutation = useDeactivateIngredient();
  const reactivateIngMutation = useReactivateIngredient();
  const deleteIngMutation = useDeleteIngredient();
  const correctStockMutation = useCorrectRawMaterialStock();
  const reversePurchaseMutation = useReverseMaterialPurchase();

  // Filter & Search states for Tab 1 (Stock)
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<string>('all');

  // Filter & Search states for Tab 2 (Purchases)
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<MaterialPurchaseWithItems | null>(null);
  const [purchaseToReverse, setPurchaseToReverse] = useState<MaterialPurchaseWithItems | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseError, setReverseError] = useState<string | null>(null);

  // Filter & Search states for Tab 3 (Master)
  const [masterSearch, setMasterSearch] = useState('');
  const [masterCategory, setMasterCategory] = useState<string>('all');

  // Modals state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [itemToCorrect, setItemToCorrect] = useState<Ingredient | null>(null);
  const [newPhysicalStock, setNewPhysicalStock] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const [isMasterFormOpen, setIsMasterFormOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [itemToDeactivate, setItemToDeactivate] = useState<Ingredient | null>(null);
  const [itemToDelete, setItemToDelete] = useState<Ingredient | null>(null);
  const [deleteWarningMessage, setDeleteWarningMessage] = useState<string | null>(null);
  const [masterFormError, setMasterFormError] = useState<string | null>(null);

  // Master Form Data
  const [masterFormData, setMasterFormData] = useState<{
    code: string;
    name_hi: string;
    name_en: string;
    category: IngredientCategory;
    base_unit: UnitType;
    purchase_unit: UnitType;
    conversion_factor: number;
    current_rate: number;
    rate_unit: UnitType;
    min_stock_level: number;
    reorder_quantity: number;
    preferred_supplier_id: string;
    storage_location: string;
    track_inventory: boolean;
    track_expiry: boolean;
    track_lots: boolean;
    opening_stock: number;
    opening_stock_rate: number;
    opening_stock_reason: string;
  }>({
    code: '',
    name_hi: '',
    name_en: '',
    category: 'dairy',
    base_unit: 'kg',
    purchase_unit: 'kg',
    conversion_factor: 1,
    current_rate: 0,
    rate_unit: 'kg',
    min_stock_level: 5,
    reorder_quantity: 10,
    preferred_supplier_id: '',
    storage_location: 'Main Store',
    track_inventory: true,
    track_expiry: false,
    track_lots: false,
    opening_stock: 0,
    opening_stock_rate: 0,
    opening_stock_reason: 'आरंभिक स्टॉक प्रविष्टि (Opening Stock)',
  });

  // Filter Categories
  const stockFilters = [
    { key: 'all', labelHi: 'सभी', labelEn: 'All' },
    { key: 'low_stock', labelHi: 'कम स्टॉक', labelEn: 'Low Stock' },
    { key: 'out_of_stock', labelHi: 'स्टॉक खत्म', labelEn: 'Out of Stock' },
    { key: 'dairy', labelHi: 'दूध व डेयरी', labelEn: 'Milk & Dairy' },
    { key: 'sweetener', labelHi: 'चीनी व मीठा', labelEn: 'Sugar' },
    { key: 'dry_fruit', labelHi: 'ड्राई फ्रूट्स', labelEn: 'Dry Fruits' },
    { key: 'spice', labelHi: 'केसर व इलायची', labelEn: 'Spices' },
    { key: 'flavoring', labelHi: 'फ्लेवर व रंग', labelEn: 'Flavours' },
    { key: 'packaging', labelHi: 'पैकिंग सामग्री', labelEn: 'Packaging' },
    { key: 'fuel', labelHi: 'LPG / ईंधन', labelEn: 'LPG Fuel' },
    { key: 'other', labelHi: 'अन्य', labelEn: 'Other' },
  ];

  // Tab 1: Filtered Stock Items
  const filteredStockIngredients = useMemo(() => {
    return ingredients.filter((ing) => {
      // Exclude inactive from stock inventory tab
      if (ing.is_active === false) return false;

      // Status / Category Filter
      let matchesFilter = true;
      if (stockFilter === 'low_stock') {
        matchesFilter = (ing.available_base_quantity || 0) > 0 && (ing.available_base_quantity || 0) <= (ing.min_stock_level || 0);
      } else if (stockFilter === 'out_of_stock') {
        matchesFilter = (ing.available_base_quantity || 0) <= 0;
      } else if (stockFilter !== 'all') {
        matchesFilter = ing.category === stockFilter;
      }

      // Search matching (Hindi, English, Code)
      const q = stockSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (ing.name_hi || '').toLowerCase().includes(q) ||
        (ing.name_en || '').toLowerCase().includes(q) ||
        (ing.code || '').toLowerCase().includes(q);

      return matchesFilter && matchesSearch;
    });
  }, [ingredients, stockFilter, stockSearch]);

  // Tab 2: Filtered Purchases
  const filteredPurchases = useMemo(() => {
    const q = purchaseSearch.trim().toLowerCase();
    return purchases.filter((p) => {
      if (!q) return true;
      const matchNum = (p.purchase_number || '').toLowerCase().includes(q);
      const matchSupp = (p.supplier?.name || '').toLowerCase().includes(q);
      const matchInv = (p.invoice_number || '').toLowerCase().includes(q);
      const matchItems = (p.items || []).some(
        (it) =>
          (it.ingredient?.name_hi || '').toLowerCase().includes(q) ||
          (it.ingredient?.name_en || '').toLowerCase().includes(q)
      );
      return matchNum || matchSupp || matchInv || matchItems;
    });
  }, [purchases, purchaseSearch]);

  // Tab 3: Filtered Master Items
  const filteredMasterIngredients = useMemo(() => {
    const q = masterSearch.trim().toLowerCase();
    return ingredients.filter((ing) => {
      const matchesCat = masterCategory === 'all' || ing.category === masterCategory;
      const matchesSearch =
        !q ||
        (ing.name_hi || '').toLowerCase().includes(q) ||
        (ing.name_en || '').toLowerCase().includes(q) ||
        (ing.code || '').toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [ingredients, masterCategory, masterSearch]);

  // Stock status calculation helper
  const getStockStatusInfo = (ing: Ingredient) => {
    const qty = Number(ing.available_base_quantity) || 0;
    const min = Number(ing.min_stock_level) || 0;

    if (qty <= 0) {
      return {
        status: 'out_of_stock',
        labelHi: 'स्टॉक खत्म (0)',
        labelEn: 'Out of Stock',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
        cardBorder: 'border-rose-300/80 bg-rose-50/20',
      };
    }
    if (qty <= min) {
      return {
        status: 'low_stock',
        labelHi: 'कम स्टॉक',
        labelEn: 'Low Stock',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
        cardBorder: 'border-amber-300/80 bg-amber-50/20',
      };
    }
    return {
      status: 'available',
      labelHi: 'उपलब्ध',
      labelEn: 'Available',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      cardBorder: 'border-stone-200 bg-white',
    };
  };

  // Handlers for Stock Correction Modal
  const handleOpenCorrectStock = (ing: Ingredient) => {
    setItemToCorrect(ing);
    setNewPhysicalStock(String(ing.available_base_quantity || 0));
    setCorrectionReason('');
    setCorrectionError(null);
  };

  const handleCorrectStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToCorrect) return;
    setCorrectionError(null);

    if (!correctionReason || correctionReason.trim().length < 3) {
      setCorrectionError('संशोधन का स्पष्ट कारण दर्ज करना अनिवार्य है (कम से कम 3 अक्षर)।');
      return;
    }

    try {
      await correctStockMutation.mutateAsync({
        ingredientId: itemToCorrect.id,
        newQuantity: parseFloat(newPhysicalStock) || 0,
        reason: correctionReason.trim(),
      });
      setItemToCorrect(null);
    } catch (err: any) {
      setCorrectionError(err.message || 'स्टॉक संशोधन दर्ज करने में त्रुटि हुई');
    }
  };

  // Handlers for Purchase Reversal
  const handleConfirmReversePurchase = async () => {
    if (!purchaseToReverse) return;
    setReverseError(null);

    if (!reverseReason.trim()) {
      setReverseError('रिवर्सल का कारण दर्ज करना अनिवार्य है।');
      return;
    }

    try {
      await reversePurchaseMutation.mutateAsync({
        purchaseId: purchaseToReverse.id,
        reason: reverseReason.trim(),
      });
      setPurchaseToReverse(null);
      setReverseReason('');
    } catch (err: any) {
      setReverseError(err.message || 'खरीद रिवर्स करने में त्रुटि हुई');
    }
  };

  // Handlers for Master Modal
  const handleOpenAddMaster = () => {
    setEditingIngredient(null);
    setMasterFormData({
      code: `ING-${Math.floor(100 + Math.random() * 900)}`,
      name_hi: '',
      name_en: '',
      category: 'dairy',
      base_unit: 'kg',
      purchase_unit: 'kg',
      conversion_factor: 1,
      current_rate: 0,
      rate_unit: 'kg',
      min_stock_level: 5,
      reorder_quantity: 10,
      preferred_supplier_id: '',
      storage_location: 'Main Store',
      track_inventory: true,
      track_expiry: false,
      track_lots: false,
      opening_stock: 0,
      opening_stock_rate: 0,
      opening_stock_reason: 'आरंभिक स्टॉक प्रविष्टि (Opening Stock)',
    });
    setMasterFormError(null);
    setIsMasterFormOpen(true);
  };

  const handleOpenEditMaster = (ing: Ingredient) => {
    setEditingIngredient(ing);
    setMasterFormData({
      code: ing.code,
      name_hi: ing.name_hi,
      name_en: ing.name_en,
      category: ing.category,
      base_unit: ing.base_unit,
      purchase_unit: ing.purchase_unit || ing.base_unit,
      conversion_factor: ing.conversion_factor || 1,
      current_rate: ing.current_rate,
      rate_unit: ing.rate_unit || ing.base_unit,
      min_stock_level: ing.min_stock_level || 0,
      reorder_quantity: ing.reorder_quantity || 0,
      preferred_supplier_id: ing.preferred_supplier_id || '',
      storage_location: ing.storage_location || 'Main Store',
      track_inventory: true,
      track_expiry: Boolean(ing.track_expiry),
      track_lots: Boolean(ing.track_lots),
      opening_stock: 0,
      opening_stock_rate: ing.current_rate || 0,
      opening_stock_reason: '',
    });
    setMasterFormError(null);
    setIsMasterFormOpen(true);
  };

  const handleMasterFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMasterFormError(null);

    if (!masterFormData.name_hi.trim() || !masterFormData.name_en.trim()) {
      setMasterFormError('सामग्री का हिंदी और अंग्रेजी नाम दर्ज करना अनिवार्य है।');
      return;
    }

    try {
      if (editingIngredient) {
        await updateIngMutation.mutateAsync({
          id: editingIngredient.id,
          updates: {
            code: masterFormData.code,
            name_hi: masterFormData.name_hi.trim(),
            name_en: masterFormData.name_en.trim(),
            category: masterFormData.category,
            base_unit: masterFormData.base_unit,
            purchase_unit: masterFormData.purchase_unit,
            conversion_factor: masterFormData.conversion_factor,
            current_rate: masterFormData.current_rate,
            rate_unit: masterFormData.rate_unit,
            min_stock_level: masterFormData.min_stock_level,
            reorder_quantity: masterFormData.reorder_quantity,
            preferred_supplier_id: masterFormData.preferred_supplier_id || null,
            storage_location: masterFormData.storage_location,
            track_expiry: masterFormData.track_expiry,
            track_lots: masterFormData.track_lots,
          },
          reason: 'Updated Master Data Details',
        });
      } else {
        await createIngMutation.mutateAsync({
          code: masterFormData.code,
          name_hi: masterFormData.name_hi.trim(),
          name_en: masterFormData.name_en.trim(),
          category: masterFormData.category,
          base_unit: masterFormData.base_unit,
          purchase_unit: masterFormData.purchase_unit,
          conversion_factor: masterFormData.conversion_factor,
          current_rate: masterFormData.current_rate,
          rate_unit: masterFormData.rate_unit,
          min_stock_level: masterFormData.min_stock_level,
          reorder_quantity: masterFormData.reorder_quantity,
          preferred_supplier_id: masterFormData.preferred_supplier_id || null,
          storage_location: masterFormData.storage_location,
          is_active: true,
          track_expiry: masterFormData.track_expiry,
          track_lots: masterFormData.track_lots,
          opening_stock: Number(masterFormData.opening_stock) || 0,
          opening_stock_rate: Number(masterFormData.opening_stock_rate) || Number(masterFormData.current_rate) || 0,
          opening_stock_reason: masterFormData.opening_stock_reason || 'Initial Opening Stock Entry',
        });
      }
      setIsMasterFormOpen(false);
    } catch (err: any) {
      setMasterFormError(err.message || 'सामग्री सहेजने में विफल');
    }
  };

  const handleDeleteMasterItem = async () => {
    if (!itemToDelete) return;
    setDeleteWarningMessage(null);

    try {
      const res = await deleteIngMutation.mutateAsync({
        ingredientId: itemToDelete.id,
        reason: 'Deleted by Owner',
      });
      if (res && res.deactivated) {
        setDeleteWarningMessage(
          res.message || 'यह सामग्री पुराने रिकॉर्ड में उपयोग हो चुकी है। इसे हटाया नहीं जा सकता; केवल Inactive किया गया है।'
        );
      } else {
        setItemToDelete(null);
      }
    } catch (err: any) {
      setDeleteWarningMessage(
        'यह सामग्री पुराने रिकॉर्ड (खरीद, रेसिपी, उत्पादन या बहीखाता) में उपयोग हो चुकी है। इसे हटाया नहीं जा सकता; केवल Inactive किया जा सकता है।'
      );
    }
  };

  return (
    <div className="space-y-5 pb-20 max-w-7xl mx-auto">
      {/* Top Header: Unified Raw Material Management Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
              <Layers className="w-6 h-6 text-amber-600" />
              <span>{language === 'hi' ? 'कच्चा माल प्रबंधन' : 'Raw Material Management'}</span>
            </h1>
            <Badge variant="primary" className="font-bold text-xs bg-amber-100 text-amber-900 border-amber-200">
              {activeTab === 'stock'
                ? `${ingredients.filter((i) => i.is_active !== false).length} सामग्रियां`
                : activeTab === 'purchases'
                ? `${purchases.length} खरीद रिकॉर्ड`
                : `${ingredients.length} मास्टर आइटम`}
            </Badge>
          </div>
          <p className="text-xs text-stone-600 mt-0.5">
            {language === 'hi'
              ? 'वर्तमान स्टॉक स्थिति, नई खरीद (Stock-In) एवं सामग्री मास्टर का सरल व एकीकृत प्रबंधन'
              : 'Unified workflow for live inventory, material purchases & master catalog'}
          </p>
        </div>

        {/* Quick Top Actions */}
        <div className="flex items-center gap-2">
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Sparkles className="w-4 h-4 text-amber-600" />}
              onClick={() => setIsWizardOpen(true)}
              className="text-stone-700 bg-white shadow-xs text-xs font-semibold"
            >
              {language === 'hi' ? 'सेटअप विज़ार्ड' : 'Setup Wizard'}
            </Button>
          )}

          <Link to="/inventory/check">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<CalendarCheck className="w-4 h-4 text-sky-600" />}
              className="text-stone-700 bg-white shadow-xs text-xs font-semibold"
            >
              {language === 'hi' ? 'स्टॉक सत्यापन' : 'Stock Check'}
            </Button>
          </Link>

          <Link to="/inventory/purchases/new">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm text-xs"
            >
              {language === 'hi' ? '+ नई खरीद' : '+ New Purchase'}
            </Button>
          </Link>
        </div>
      </div>

      {/* 3 Large Mobile-Friendly Tabs */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-stone-100/90 rounded-2xl border border-stone-200">
        <button
          type="button"
          onClick={() => setActiveTab('stock')}
          className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer min-h-[48px] ${
            activeTab === 'stock'
              ? 'bg-white text-maroon-950 shadow-sm border border-stone-200/80 font-black'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
          }`}
        >
          <Package className={`w-4 h-4 ${activeTab === 'stock' ? 'text-amber-600' : 'text-stone-500'}`} />
          <span className="truncate">वर्तमान स्टॉक</span>
          <span className="hidden md:inline text-[11px] font-normal text-stone-500">(Inventory)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('purchases')}
          className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer min-h-[48px] ${
            activeTab === 'purchases'
              ? 'bg-white text-maroon-950 shadow-sm border border-stone-200/80 font-black'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
          }`}
        >
          <Truck className={`w-4 h-4 ${activeTab === 'purchases' ? 'text-amber-600' : 'text-stone-500'}`} />
          <span className="truncate">सामग्री खरीद</span>
          <span className="hidden md:inline text-[11px] font-normal text-stone-500">(Purchases)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('master')}
          className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer min-h-[48px] ${
            activeTab === 'master'
              ? 'bg-white text-maroon-950 shadow-sm border border-stone-200/80 font-black'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
          }`}
        >
          <Edit2 className={`w-4 h-4 ${activeTab === 'master' ? 'text-amber-600' : 'text-stone-500'}`} />
          <span className="truncate">सामग्री मास्टर</span>
          <span className="hidden md:inline text-[11px] font-normal text-stone-500">(Master)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: वर्तमान स्टॉक (RAW MATERIAL INVENTORY DASHBOARD)                     */}
      {/* ========================================================================= */}
      {activeTab === 'stock' && (
        <div className="space-y-5">
          {/* 6 Authoritative KPI Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 1. Total Stock Value */}
            <Card className="p-3.5 bg-linear-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-200/80">
              <span className="text-[11px] font-bold text-amber-900 block truncate">
                {language === 'hi' ? 'कुल स्टॉक मूल्य' : 'Total Stock Value'}
              </span>
              <p className="text-lg font-black text-stone-900 mt-1.5">
                {formatCurrency(kpis?.total_stock_value || 0)}
              </p>
              <p className="text-[10px] text-stone-500 mt-0.5">बहीखाता मूल्यांकित</p>
            </Card>

            {/* 2. Total Active Materials */}
            <Card className="p-3.5 bg-white border-stone-200">
              <span className="text-[11px] font-bold text-stone-700 block truncate">
                {language === 'hi' ? 'सक्रिय सामग्रियां' : 'Active Materials'}
              </span>
              <p className="text-lg font-black text-stone-900 mt-1.5">
                {ingredients.filter((i) => i.is_active !== false).length}
              </p>
              <p className="text-[10px] text-stone-500 mt-0.5">कच्चा माल व पैकिंग</p>
            </Card>

            {/* 3. Low Stock Alert */}
            <button
              type="button"
              onClick={() => setStockFilter('low_stock')}
              className="text-left cursor-pointer"
            >
              <Card
                className={`p-3.5 h-full border transition-all hover:shadow-xs ${
                  (kpis?.low_stock_count || 0) > 0
                    ? 'bg-amber-50/80 border-amber-300'
                    : 'bg-white border-stone-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-950 truncate">
                    {language === 'hi' ? 'कम स्टॉक सामग्री' : 'Low Stock'}
                  </span>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                </div>
                <p className="text-lg font-black text-amber-950 mt-1.5">
                  {kpis?.low_stock_count || 0}
                </p>
                <p className="text-[10px] text-amber-800 font-semibold mt-0.5">फ़िल्टर करें →</p>
              </Card>
            </button>

            {/* 4. Out of Stock */}
            <button
              type="button"
              onClick={() => setStockFilter('out_of_stock')}
              className="text-left cursor-pointer"
            >
              <Card
                className={`p-3.5 h-full border transition-all hover:shadow-xs ${
                  (kpis?.out_of_stock_count || 0) > 0
                    ? 'bg-rose-50/80 border-rose-300'
                    : 'bg-white border-stone-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-rose-950 truncate">
                    {language === 'hi' ? 'स्टॉक खत्म (0)' : 'Out of Stock'}
                  </span>
                  <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                </div>
                <p className="text-lg font-black text-rose-950 mt-1.5">
                  {kpis?.out_of_stock_count || 0}
                </p>
                <p className="text-[10px] text-rose-800 font-semibold mt-0.5">तुरंत खरीदें →</p>
              </Card>
            </button>

            {/* 5. Purchases this month */}
            <Card className="p-3.5 bg-white border-stone-200">
              <span className="text-[11px] font-bold text-stone-700 block truncate">
                {language === 'hi' ? 'इस माह की खरीद' : 'Purchases (Mo)'}
              </span>
              <p className="text-lg font-black text-stone-900 mt-1.5">
                {formatCurrency(kpis?.purchases_this_month || 0)}
              </p>
              <p className="text-[10px] text-stone-500 mt-0.5">स्टॉक-इन प्रविष्टियां</p>
            </Card>

            {/* 6. Production Consumption this month */}
            <Card className="p-3.5 bg-white border-stone-200">
              <span className="text-[11px] font-bold text-stone-700 block truncate">
                {language === 'hi' ? 'इस माह खपत' : 'Consumption (Mo)'}
              </span>
              <p className="text-lg font-black text-stone-900 mt-1.5">
                {formatCurrency(kpis?.consumption_this_month || 0)}
              </p>
              <p className="text-[10px] text-stone-500 mt-0.5">उत्पादन में प्रयुक्त</p>
            </Card>
          </div>

          {/* Search Bar & Simple Filter Pills */}
          <Card className="p-4 border-stone-200 shadow-xs space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-stone-400" />
              <input
                type="text"
                placeholder="सामग्री खोजें / Search material (दूध, चीनी, काजू, पैकिंग)..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {stockFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStockFilter(f.key)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer min-h-[36px] ${
                    stockFilter === f.key
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {f.labelHi} <span className="opacity-80 font-normal">({f.labelEn})</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Mobile-First Material Cards (Single Column on Mobile, Responsive Grid on Desktop) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredStockIngredients.length === 0 ? (
              <div className="col-span-full p-10 bg-white rounded-2xl border border-stone-200 text-center text-stone-500 space-y-2">
                <Package className="w-8 h-8 text-stone-300 mx-auto" />
                <p className="text-sm font-bold text-stone-700">कोई कच्ची सामग्री नहीं मिली।</p>
                <p className="text-xs text-stone-500">कृपया खोज या फ़िल्टर बदल कर देखें।</p>
              </div>
            ) : (
              filteredStockIngredients.map((ing) => {
                const statusInfo = getStockStatusInfo(ing);
                const currentQty = Number(ing.available_base_quantity) || 0;
                const minLevel = Number(ing.min_stock_level) || 0;
                const currentRate = ing.weighted_average_rate || ing.current_rate || 0;
                const stockVal = ing.total_stock_value ?? Number((currentQty * currentRate).toFixed(2));

                return (
                  <div
                    key={ing.id}
                    className={`p-4 rounded-2xl border shadow-xs transition-all flex flex-col justify-between ${statusInfo.cardBorder}`}
                  >
                    <div>
                      {/* Top Header of Card: Name, Category, Stock Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-black text-stone-900 text-sm sm:text-base leading-tight">
                            {ing.name_hi}
                          </h3>
                          <p className="text-xs text-stone-500 font-medium">{ing.name_en}</p>
                        </div>
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black border uppercase tracking-wider shrink-0 ${statusInfo.badgeClass}`}
                        >
                          {statusInfo.labelHi}
                        </span>
                      </div>

                      {/* Category & Storage Location */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md">
                          {ing.category.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {ing.code}
                        </span>
                      </div>

                      {/* Primary Available Stock Highlight */}
                      <div className="mt-3.5 p-2.5 bg-stone-50/90 rounded-xl border border-stone-200/70 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-semibold text-stone-500 block">उपलब्ध स्टॉक (Available)</span>
                          <p className="text-base sm:text-lg font-black text-stone-900 leading-tight mt-0.5">
                            {formatIngredientQuantityWithUnit(currentQty, ing.base_unit)}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-semibold text-stone-500 block">न्यूनतम सीमा (Min Level)</span>
                          <p className="text-xs font-bold text-stone-700 mt-0.5">
                            {minLevel} {ing.base_unit}
                          </p>
                        </div>
                      </div>

                      {/* Valuation & Rate Details */}
                      <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs">
                        <div className="p-2 bg-white/80 rounded-lg border border-stone-200/50">
                          <span className="text-[10px] text-stone-500 block">वर्तमान खरीद दर</span>
                          <p className="font-bold text-stone-900 mt-0.5">
                            {formatCurrency(currentRate)} / {ing.rate_unit || ing.base_unit}
                          </p>
                        </div>
                        <div className="p-2 bg-white/80 rounded-lg border border-stone-200/50">
                          <span className="text-[10px] text-stone-500 block">कुल स्टॉक मूल्य</span>
                          <p className="font-bold text-stone-900 mt-0.5">
                            {formatCurrency(stockVal)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions: View Details (Ledger) & Correct Stock (Owner only) */}
                    <div className="flex items-center gap-2 pt-3.5 mt-3.5 border-t border-stone-200/60">
                      <Link to={`/inventory/items/${ing.id}`} className="flex-1">
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<FileText className="w-3.5 h-3.5 text-stone-600" />}
                          className="w-full justify-center text-xs font-bold text-stone-700 bg-white min-h-[44px]"
                        >
                          विवरण देखें (Ledger)
                        </Button>
                      </Link>

                      {isOwner && (
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Scale className="w-3.5 h-3.5 text-indigo-600" />}
                          onClick={() => handleOpenCorrectStock(ing)}
                          className="flex-1 justify-center text-xs font-bold text-indigo-700 bg-indigo-50/70 border-indigo-200 hover:bg-indigo-100 min-h-[44px]"
                        >
                          स्टॉक सुधारें
                        </Button>
                      )}

                      <Link to={`/inventory/purchases/new?ingredient_id=${ing.id}`}>
                        <Button
                          variant="primary"
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs min-h-[44px] px-3"
                          title="सामग्री खरीद"
                        >
                          + खरीद
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: सामग्री खरीद (MATERIAL PURCHASES & INCOMING STOCK)                    */}
      {/* ========================================================================= */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          {/* Purchases Search & Action Bar */}
          <Card className="p-4 border-stone-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full max-w-md">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-stone-400" />
                <input
                  type="text"
                  placeholder="खरीद बिल नंबर, सप्लायर या सामग्री से खोजें..."
                  value={purchaseSearch}
                  onChange={(e) => setPurchaseSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 text-xs sm:text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>

              <Link to="/inventory/purchases/new" className="w-full sm:w-auto">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold min-h-[44px]"
                >
                  + नई खरीद जोड़ें (Stock-In)
                </Button>
              </Link>
            </div>
          </Card>

          {/* Purchase History Cards (Mobile-first responsive list) */}
          <div className="space-y-3">
            {filteredPurchases.length === 0 ? (
              <Card className="p-10 text-center text-stone-500 space-y-2">
                <Truck className="w-8 h-8 text-stone-300 mx-auto" />
                <p className="text-sm font-bold text-stone-700">कोई खरीद रिकॉर्ड नहीं मिला।</p>
                <p className="text-xs text-stone-500">नई खरीद दर्ज करने के लिए ऊपर दिए गए बटन का उपयोग करें।</p>
              </Card>
            ) : (
              filteredPurchases.map((p) => {
                const isReversed = p.status === 'reversed';
                return (
                  <Card
                    key={p.id}
                    className={`p-4 border transition-all ${
                      isReversed ? 'bg-rose-50/40 border-rose-200 opacity-75' : 'bg-white border-stone-200 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm text-stone-900">{p.purchase_number}</span>
                          <span className="text-xs text-stone-500">{formatDate(p.purchase_date)}</span>
                          {isReversed ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              रिवर्स किया गया
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              प्राप्त (Stock-In)
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-stone-700 font-semibold mt-1">
                          सप्लायर: <span className="font-bold text-stone-900">{p.supplier?.name || 'नकद / डायरेक्ट खरीद'}</span>
                          {p.invoice_number && <span className="ml-2 text-stone-500 font-normal">| बिल: {p.invoice_number}</span>}
                        </p>

                        <p className="text-xs text-stone-600 mt-1">
                          सामग्रियां: {p.items?.map((it) => `${it.ingredient?.name_hi || 'सामग्री'} (${it.total_received_quantity} ${it.purchase_unit})`).join(', ')}
                        </p>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-stone-100">
                        <div>
                          <span className="text-[10px] text-stone-500 block sm:text-right">कुल बिल राशि</span>
                          <p className="text-base font-black text-stone-900">{formatCurrency(p.total_amount)}</p>
                        </div>

                        <div className="flex items-center gap-1.5 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                            onClick={() => setSelectedPurchase(p)}
                            className="text-xs font-semibold bg-white min-h-[38px]"
                          >
                            विवरण
                          </Button>

                          {isOwner && !isReversed && (
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<RotateCcw className="w-3.5 h-3.5 text-rose-600" />}
                              onClick={() => {
                                setPurchaseToReverse(p);
                                setReverseReason('');
                                setReverseError(null);
                              }}
                              className="text-xs font-semibold text-rose-700 bg-rose-50/50 border-rose-200 min-h-[38px]"
                            >
                              रिवर्स
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: सामग्री मास्टर (RAW MATERIAL MASTER CONFIGURATION)                   */}
      {/* ========================================================================= */}
      {activeTab === 'master' && (
        <div className="space-y-4">
          {/* Controls Bar: Search, Category & Add Button */}
          <Card className="p-4 border-stone-200">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full md:w-auto flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3.5 top-3 text-stone-400" />
                  <input
                    type="text"
                    placeholder="मास्टर सामग्री खोजें..."
                    value={masterSearch}
                    onChange={(e) => setMasterSearch(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 text-xs sm:text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>

                <select
                  value={masterCategory}
                  onChange={(e) => setMasterCategory(e.target.value)}
                  className="px-3 py-2 text-xs sm:text-sm border border-stone-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">सभी श्रेणियां</option>
                  <option value="dairy">दूध व डेयरी</option>
                  <option value="sweetener">चीनी व मीठा</option>
                  <option value="dry_fruit">काजू बादाम पिस्ता</option>
                  <option value="spice">इलायची केसर</option>
                  <option value="flavoring">फ्लेवर व रंग</option>
                  <option value="packaging">पैकिंग सामग्री</option>
                  <option value="fuel">LPG व ईंधन</option>
                  <option value="other">अन्य</option>
                </select>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(e) => setIncludeInactive(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-stone-300"
                  />
                  <span>निष्क्रिय (Inactive) दिखाएं</span>
                </label>

                {isOwner && (
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={handleOpenAddMaster}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold min-h-[44px]"
                  >
                    + नई सामग्री जोड़ें
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Master Materials List Cards (Mobile-first responsive cards) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredMasterIngredients.length === 0 ? (
              <div className="col-span-full p-10 bg-white rounded-2xl border border-stone-200 text-center text-stone-500">
                <Package className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-stone-700">कोई सामग्री नहीं मिली।</p>
              </div>
            ) : (
              filteredMasterIngredients.map((ing) => {
                const isDeactivated = ing.is_active === false;

                return (
                  <Card
                    key={ing.id}
                    className={`p-4 border transition-all flex flex-col justify-between ${
                      isDeactivated ? 'opacity-60 bg-stone-100/70 border-stone-300' : 'bg-white border-stone-200 shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-black text-stone-900 text-sm sm:text-base">
                            {ing.name_hi}
                          </h3>
                          <p className="text-xs text-stone-500 font-medium">{ing.name_en}</p>
                        </div>
                        {isDeactivated ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-200 text-stone-700">
                            निष्क्रिय
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            सक्रिय
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-bold uppercase bg-stone-100 text-stone-700 px-2 py-0.5 rounded">
                          {ing.category.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {ing.code}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs bg-stone-50/80 p-2.5 rounded-xl border border-stone-200/60">
                        <div>
                          <span className="text-[10px] text-stone-500 block">मूल इकाई (Base)</span>
                          <span className="font-bold text-stone-900">{ing.base_unit}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-stone-500 block">खरीद इकाई</span>
                          <span className="font-bold text-stone-900">{ing.purchase_unit || ing.base_unit}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-stone-500 block">मानक खरीद दर</span>
                          <span className="font-bold text-stone-900">
                            {formatCurrency(ing.current_rate)} / {ing.rate_unit || ing.base_unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-stone-500 block">न्यूनतम स्टॉक</span>
                          <span className="font-bold text-stone-900">
                            {ing.min_stock_level || 0} {ing.base_unit}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Master Action Buttons */}
                    {isOwner && (
                      <div className="flex items-center gap-2 pt-3 mt-3 border-t border-stone-200/70">
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Edit2 className="w-3.5 h-3.5 text-amber-700" />}
                          onClick={() => handleOpenEditMaster(ing)}
                          className="flex-1 justify-center text-xs font-bold text-amber-800 bg-amber-50/50 border-amber-200 min-h-[40px]"
                        >
                          संपादित करें
                        </Button>

                        {isDeactivated ? (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Power className="w-3.5 h-3.5 text-emerald-700" />}
                            onClick={() => reactivateIngMutation.mutate(ing.id)}
                            className="text-xs font-bold text-emerald-800 bg-emerald-50 border-emerald-200 min-h-[40px]"
                            title="सक्रिय करें"
                          >
                            सक्रिय
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<PowerOff className="w-3.5 h-3.5 text-stone-600" />}
                            onClick={() => setItemToDeactivate(ing)}
                            className="text-xs font-bold text-stone-700 bg-stone-100 border-stone-200 min-h-[40px]"
                            title="निष्क्रिय करें"
                          >
                            निष्क्रिय
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-600" />}
                          onClick={() => {
                            setItemToDelete(ing);
                            setDeleteWarningMessage(null);
                          }}
                          className="text-xs font-bold text-rose-700 bg-rose-50 border-rose-200 min-h-[40px]"
                          title="हटाएं"
                        >
                          हटाएं
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* OWNER STOCK CORRECTION MODAL                                               */}
      {/* ========================================================================= */}
      <Modal
        isOpen={Boolean(itemToCorrect)}
        onClose={() => setItemToCorrect(null)}
        title={`भौतिक स्टॉक सुधार: ${itemToCorrect?.name_hi || ''} (${itemToCorrect?.name_en || ''})`}
        maxWidth="md"
      >
        <form onSubmit={handleCorrectStockSubmit} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-1">
            <p className="font-black flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-amber-700 shrink-0" />
              <span>प्रमाणिक बहीखाता स्टॉक सुधार (Authoritative Correction):</span>
            </p>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              पुराने लेन-देन को बदला नहीं जाएगा। नया भौतिक स्टॉक दर्ज करने पर अंतर का एक नया{' '}
              <strong>physical_count_correction</strong> बहीखाता मूवमेंट बनाया जाएगा।
            </p>
          </div>

          {correctionError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold">
              {correctionError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-500 mb-1">
                सिस्टम में वर्तमान स्टॉक
              </label>
              <div className="px-3 py-2.5 bg-stone-100 rounded-xl text-sm font-black text-stone-900 font-mono">
                {itemToCorrect?.available_base_quantity || 0} {itemToCorrect?.base_unit}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-900 mb-1">
                वास्तविक भौतिक स्टॉक ({itemToCorrect?.base_unit}) <span className="text-rose-600">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                required
                value={newPhysicalStock}
                onChange={(e) => setNewPhysicalStock(e.target.value)}
                placeholder="नया स्टॉक दर्ज करें"
                className="w-full px-3 py-2 text-sm font-black font-mono border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>
          </div>

          {itemToCorrect && newPhysicalStock !== '' && (
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs flex justify-between items-center">
              <span className="font-semibold text-stone-600">अंतर (Difference):</span>
              <span
                className={`font-black font-mono text-sm ${
                  (parseFloat(newPhysicalStock) || 0) - (itemToCorrect.available_base_quantity || 0) >= 0
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {(parseFloat(newPhysicalStock) || 0) - (itemToCorrect.available_base_quantity || 0) >= 0 ? '+' : ''}
                {((parseFloat(newPhysicalStock) || 0) - (itemToCorrect.available_base_quantity || 0)).toFixed(3)}{' '}
                {itemToCorrect.base_unit}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-900 mb-1">
              संशोधन का अनिवार्य कारण (Mandatory Reason) <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="उदा. भौतिक गिनती में कमी पाई गई, रिसाव या स्पिलेज..."
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setItemToCorrect(null)}>
              रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={correctStockMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4"
            >
              ✓ सुधार बहीखाते में दर्ज करें
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* PURCHASE DETAILS MODAL                                                    */}
      {/* ========================================================================= */}
      <Modal
        isOpen={Boolean(selectedPurchase)}
        onClose={() => setSelectedPurchase(null)}
        title={`खरीद विवरण: ${selectedPurchase?.purchase_number || ''}`}
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-stone-50 rounded-xl grid grid-cols-2 gap-3">
            <div>
              <p className="text-stone-500">खरीद दिनांक</p>
              <p className="font-bold text-stone-900">{formatDate(selectedPurchase?.purchase_date || '')}</p>
            </div>
            <div>
              <p className="text-stone-500">सप्लायर</p>
              <p className="font-bold text-stone-900">{selectedPurchase?.supplier?.name || 'नकद / डायरेक्ट'}</p>
            </div>
            <div>
              <p className="text-stone-500">चालान / बिल नंबर</p>
              <p className="font-bold text-stone-900">{selectedPurchase?.invoice_number || 'N/A'}</p>
            </div>
            <div>
              <p className="text-stone-500">भुगतान विधि</p>
              <p className="font-bold text-stone-900 capitalize">{selectedPurchase?.payment_method}</p>
            </div>
          </div>

          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-stone-50 font-bold text-stone-700 border-b border-stone-200">
                <tr>
                  <th className="p-2.5">सामग्री</th>
                  <th className="p-2.5 text-right">मात्रा</th>
                  <th className="p-2.5 text-right">दर (₹)</th>
                  <th className="p-2.5 text-right">लागत (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {selectedPurchase?.items?.map((it) => (
                  <tr key={it.id}>
                    <td className="p-2.5 font-bold text-stone-900">
                      {it.ingredient?.name_hi} ({it.ingredient?.name_en})
                    </td>
                    <td className="p-2.5 text-right font-semibold text-stone-700">
                      {it.total_received_quantity} {it.purchase_unit}
                    </td>
                    <td className="p-2.5 text-right text-stone-600">
                      {formatCurrency(it.unit_price)} / {it.purchase_unit}
                    </td>
                    <td className="p-2.5 text-right font-black text-stone-900">
                      {formatCurrency(it.net_item_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-stone-200">
            <span className="font-bold text-stone-700">कुल बिल राशि:</span>
            <span className="text-base font-black text-emerald-800">
              {formatCurrency(selectedPurchase?.total_amount || 0)}
            </span>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedPurchase(null)}>
              बंद करें
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* PURCHASE REVERSAL MODAL                                                   */}
      {/* ========================================================================= */}
      <Modal
        isOpen={Boolean(purchaseToReverse)}
        onClose={() => setPurchaseToReverse(null)}
        title={`खरीद रिवर्स करें: ${purchaseToReverse?.purchase_number || ''}`}
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 space-y-1">
            <p className="font-bold">रिवर्सल चेतावनी (Reversal Warning):</p>
            <p className="text-[11px] leading-relaxed">
              इस खरीद को रिवर्स करने पर सामग्री स्टॉक लेजर से घट जाएगी। यदि प्राप्त सामग्री का उत्पादन में पहले ही उपयोग हो चुका है, तो सिस्टम शेष स्टॉक की जांच करेगा।
            </p>
          </div>

          {reverseError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl font-bold">
              {reverseError}
            </div>
          )}

          <div>
            <label className="block font-bold text-stone-800 mb-1">
              रिवर्स करने का कारण <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              placeholder="उदा. गलत बिल प्रविष्टि, सप्लायर को माल वापस..."
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setPurchaseToReverse(null)}>
              रद्द करें
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmReversePurchase}
              isLoading={reversePurchaseMutation.isPending}
            >
              हाँ, खरीद रिवर्स करें
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MASTER ADD / EDIT MODAL                                                    */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isMasterFormOpen}
        onClose={() => setIsMasterFormOpen(false)}
        title={
          editingIngredient
            ? `सामग्री संपादित करें: ${editingIngredient.name_hi}`
            : 'नई सामग्री जोड़ें (Add Raw Material)'
        }
        maxWidth="lg"
      >
        <form onSubmit={handleMasterFormSubmit} className="space-y-4">
          {masterFormError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-bold">
              {masterFormError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                सामग्री का नाम (हिंदी) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="उदा. भैंस का दूध, खोया, काजू, चीनी"
                value={masterFormData.name_hi}
                onChange={(e) => setMasterFormData({ ...masterFormData, name_hi: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                सामग्री का नाम (English) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Buffalo Milk, Khoya, Cashew"
                value={masterFormData.name_en}
                onChange={(e) => setMasterFormData({ ...masterFormData, name_en: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">कोड (Code)</label>
              <input
                type="text"
                value={masterFormData.code}
                onChange={(e) => setMasterFormData({ ...masterFormData, code: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono uppercase border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">श्रेणी (Category)</label>
              <select
                value={masterFormData.category}
                onChange={(e) => setMasterFormData({ ...masterFormData, category: e.target.value as any })}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
              >
                <option value="dairy">दूध व डेयरी (Milk & Dairy)</option>
                <option value="sweetener">चीनी व मीठा (Sugar & Sweeteners)</option>
                <option value="dry_fruit">ड्राई फ्रूट्स (Dry Fruits)</option>
                <option value="spice">इलायची व केसर (Spices)</option>
                <option value="flavoring">फ्लेवर व रंग (Flavours)</option>
                <option value="packaging">पैकिंग सामग्री (Packaging)</option>
                <option value="fuel">LPG व ईंधन (Fuel)</option>
                <option value="other">अन्य (Other)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">मूल इकाई (Base Unit)</label>
              <select
                value={masterFormData.base_unit}
                onChange={(e) => {
                  const newBase = e.target.value as UnitType;
                  setMasterFormData({
                    ...masterFormData,
                    base_unit: newBase,
                    rate_unit: newBase,
                  });
                }}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
              >
                <option value="kg">kg (किलोग्राम)</option>
                <option value="g">g (ग्राम)</option>
                <option value="litre">litre (लीटर)</option>
                <option value="ml">ml (मिलीलीटर)</option>
                <option value="piece">piece (पीस / नग)</option>
                <option value="cylinder">cylinder (सिलेंडर)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">पसंदीदा खरीद इकाई</label>
              <select
                value={masterFormData.purchase_unit}
                onChange={(e) => setMasterFormData({ ...masterFormData, purchase_unit: e.target.value as any })}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="litre">litre</option>
                <option value="ml">ml</option>
                <option value="piece">piece</option>
                <option value="packet">packet (पैकेट)</option>
                <option value="box">box (डिब्बा)</option>
                <option value="bottle">bottle (बोतल)</option>
                <option value="cylinder">cylinder</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                वर्तमान खरीद दर (₹)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={masterFormData.current_rate}
                onChange={(e) => setMasterFormData({ ...masterFormData, current_rate: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-xs font-bold border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                दर इकाई (Rate Unit)
              </label>
              <select
                value={masterFormData.rate_unit}
                onChange={(e) => setMasterFormData({ ...masterFormData, rate_unit: e.target.value as any })}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
              >
                <option value="kg">प्रति kg</option>
                <option value="g">प्रति g</option>
                <option value="litre">प्रति litre</option>
                <option value="ml">प्रति ml</option>
                <option value="piece">प्रति piece</option>
                <option value="cylinder">प्रति cylinder</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                न्यूनतम स्टॉक चेतावनी सीमा ({masterFormData.base_unit})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={masterFormData.min_stock_level}
                onChange={(e) => setMasterFormData({ ...masterFormData, min_stock_level: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">भंडारण स्थान (Location)</label>
              <input
                type="text"
                placeholder="उदा. कोल्ड स्टोरेज, सूखा गोदाम..."
                value={masterFormData.storage_location}
                onChange={(e) => setMasterFormData({ ...masterFormData, storage_location: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Optional Opening Stock (Only when creating a new material) */}
          {!editingIngredient && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2.5">
              <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-amber-700" />
                आरंभिक स्टॉक (Opening Stock - Optional)
              </h4>
              <p className="text-[11px] text-amber-900">
                आरंभिक स्टॉक दर्ज करने पर सिस्टम बहीखाते में एक <strong>opening_stock</strong> प्रविष्टि स्वतः बना देगा।
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-800 mb-1">
                    आरंभिक मात्रा ({masterFormData.base_unit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    value={masterFormData.opening_stock}
                    onChange={(e) => setMasterFormData({ ...masterFormData, opening_stock: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-xs font-bold border border-stone-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-800 mb-1">
                    आरंभिक दर (₹ / {masterFormData.rate_unit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    value={masterFormData.opening_stock_rate}
                    onChange={(e) => setMasterFormData({ ...masterFormData, opening_stock_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-xs font-bold border border-stone-300 rounded-xl bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setIsMasterFormOpen(false)}>
              रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={createIngMutation.isPending || updateIngMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-5"
            >
              {editingIngredient ? 'अपडेट करें' : 'सहेजें'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* DELETE / INACTIVATE SAFETY DIALOG                                         */}
      {/* ========================================================================= */}
      <Modal
        isOpen={Boolean(itemToDelete)}
        onClose={() => {
          setItemToDelete(null);
          setDeleteWarningMessage(null);
        }}
        title={`सामग्री हटाएं: ${itemToDelete?.name_hi || ''}`}
        maxWidth="md"
      >
        <div className="space-y-3.5 text-xs">
          {deleteWarningMessage ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-950 rounded-xl space-y-2">
              <p className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                सुरक्षा नियम (Safety Rule):
              </p>
              <p className="leading-relaxed">{deleteWarningMessage}</p>
            </div>
          ) : (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-950 rounded-xl space-y-1">
              <p className="font-bold">सावधानी (Delete Safety):</p>
              <p className="text-[11px] leading-relaxed">
                केवल वही सामग्री स्थायी रूप से हटाई जा सकती है जिसका कोई पूर्व खरीद, रेसिपी या उत्पादन बहीखाता न हो। उपयोग हो चुकी सामग्री को केवल <strong>Inactive</strong> किया जा सकता है।
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setItemToDelete(null);
                setDeleteWarningMessage(null);
              }}
            >
              बंद करें
            </Button>

            {!deleteWarningMessage && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteMasterItem}
                isLoading={deleteIngMutation.isPending}
              >
                स्थायी हटाएं
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* DEACTIVATE CONFIRMATION MODAL                                             */}
      {/* ========================================================================= */}
      <Modal
        isOpen={Boolean(itemToDeactivate)}
        onClose={() => setItemToDeactivate(null)}
        title={`सामग्री निष्क्रिय करें: ${itemToDeactivate?.name_hi || ''}`}
        maxWidth="md"
      >
        <div className="space-y-3 text-xs">
          <p className="text-stone-700">
            निष्क्रिय (Inactive) करने पर यह सामग्री नई खरीद व रेसिपी चयन में नहीं दिखाई देगी, लेकिन इसका पिछला बहीखाता सुरक्षित रहेगा।
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setItemToDeactivate(null)}>
              रद्द करें
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (!itemToDeactivate) return;
                await deactivateIngMutation.mutateAsync({
                  id: itemToDeactivate.id,
                  reason: 'Deactivated by Owner',
                });
                setItemToDeactivate(null);
              }}
              isLoading={deactivateIngMutation.isPending}
            >
              हाँ, निष्क्रिय करें
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* INVENTORY SETUP WIZARD MODAL                                              */}
      {/* ========================================================================= */}
      <InventorySetupWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
      />
    </div>
  );
};

export default InventoryDashboardPage;
