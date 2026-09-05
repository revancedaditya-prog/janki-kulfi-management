import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useIngredients,
  useCreateIngredient,
  useUpdateIngredient,
  useDeactivateIngredient,
  useReactivateIngredient,
  useDeleteIngredient,
  useCorrectRawMaterialStock,
} from '@/hooks/useInventory';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Ingredient, IngredientCategory, UnitType } from '@/types';
import { formatCurrency } from '@/lib/formatters';
import { formatIngredientQuantityWithUnit } from '@/lib/inventoryService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import {
  Plus,
  Edit2,
  Trash2,
  Power,
  PowerOff,
  Search,
  ArrowRight,
  Scale,
} from 'lucide-react';

export const InventoryItemsPage: React.FC = () => {
  const { t, language } = useLanguage();
  const { isOwner } = useAuth();

  const [includeInactive, setIncludeInactive] = useState(false);
  const { data: ingredients = [] } = useIngredients(includeInactive);
  const { data: suppliers = [] } = useSuppliers();

  const createMutation = useCreateIngredient();
  const updateMutation = useUpdateIngredient();
  const deactivateMutation = useDeactivateIngredient();
  const reactivateMutation = useReactivateIngredient();
  const deleteMutation = useDeleteIngredient();
  const correctStockMutation = useCorrectRawMaterialStock();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [itemToDeactivate, setItemToDeactivate] = useState<Ingredient | null>(null);
  const [itemToDelete, setItemToDelete] = useState<Ingredient | null>(null);
  const [itemToCorrect, setItemToCorrect] = useState<Ingredient | null>(null);
  const [newPhysicalStock, setNewPhysicalStock] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [formData, setFormData] = useState<{
    code: string;
    name_en: string;
    name_hi: string;
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
    track_expiry: boolean;
    track_lots: boolean;
  }>({
    code: '',
    name_en: '',
    name_hi: '',
    category: 'other',
    base_unit: 'kg',
    purchase_unit: 'kg',
    conversion_factor: 1,
    current_rate: 0,
    rate_unit: 'kg',
    min_stock_level: 5,
    reorder_quantity: 10,
    preferred_supplier_id: '',
    storage_location: 'Main Store',
    track_expiry: false,
    track_lots: false,
  });

  const categories: { key: IngredientCategory | 'all'; labelEn: string; labelHi: string }[] = [
    { key: 'all', labelEn: 'All Categories', labelHi: 'सभी श्रेणियां' },
    { key: 'dairy', labelEn: 'Dairy & Base', labelHi: 'दूध व मावा' },
    { key: 'sweetener', labelEn: 'Sweeteners', labelHi: 'चीनी व मीठा' },
    { key: 'dry_fruit', labelEn: 'Dry Fruits', labelHi: 'काजू, बादाम, पिस्ता' },
    { key: 'spice', labelEn: 'Spices', labelHi: 'केसर व इलायची' },
    { key: 'flavoring', labelEn: 'Flavors & Colors', labelHi: 'फ्लेवर व रंग' },
    { key: 'packaging', labelEn: 'Packaging', labelHi: 'स्टिक, रैपर, पाउच' },
    { key: 'fuel', labelEn: 'Fuel & Gas', labelHi: 'गैस व ईंधन' },
    { key: 'consumable', labelEn: 'Consumables', labelHi: 'अन्य उपभोग्य सामग्री' },
    { key: 'other', labelEn: 'Other', labelHi: 'अन्य' },
  ];

  const handleOpenNewModal = () => {
    setEditingIngredient(null);
    setFormData({
      code: `ING-${Math.floor(100 + Math.random() * 900)}`,
      name_en: '',
      name_hi: '',
      category: 'other',
      base_unit: 'kg',
      purchase_unit: 'kg',
      conversion_factor: 1,
      current_rate: 0,
      rate_unit: 'kg',
      min_stock_level: 5,
      reorder_quantity: 10,
      preferred_supplier_id: '',
      storage_location: 'Main Store',
      track_expiry: false,
      track_lots: false,
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (ing: Ingredient) => {
    setEditingIngredient(ing);
    setFormData({
      code: ing.code,
      name_en: ing.name_en,
      name_hi: ing.name_hi,
      category: ing.category,
      base_unit: ing.base_unit,
      purchase_unit: ing.purchase_unit || ing.base_unit,
      conversion_factor: ing.conversion_factor || 1,
      current_rate: ing.current_rate,
      rate_unit: ing.rate_unit,
      min_stock_level: ing.min_stock_level || 0,
      reorder_quantity: ing.reorder_quantity || 0,
      preferred_supplier_id: ing.preferred_supplier_id || '',
      storage_location: ing.storage_location || 'Main Store',
      track_expiry: Boolean(ing.track_expiry),
      track_lots: Boolean(ing.track_lots),
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name_hi.trim() || !formData.name_en.trim()) {
      setFormError('सामग्री का हिंदी और अंग्रेजी नाम दर्ज करना आवश्यक है।');
      return;
    }

    try {
      if (editingIngredient) {
        await updateMutation.mutateAsync({
          id: editingIngredient.id,
          updates: {
            ...formData,
            preferred_supplier_id: formData.preferred_supplier_id || null,
          },
          reason: 'Updated Item Master Details',
        });
      } else {
        await createMutation.mutateAsync({
          ...formData,
          preferred_supplier_id: formData.preferred_supplier_id || null,
          is_active: true,
        });
      }
      setIsFormModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'सामग्री सहेजने में विफल');
    }
  };

  const handleDeactivate = async () => {
    if (!itemToDeactivate) return;
    try {
      await deactivateMutation.mutateAsync({
        id: itemToDeactivate.id,
        reason: deactivateReason.trim() || 'Deactivated by Owner',
      });
      setItemToDeactivate(null);
      setDeactivateReason('');
    } catch (err: any) {
      alert(err.message || 'त्रुटि हुई');
    }
  };

  const handleOpenCorrectStock = (ing: Ingredient) => {
    setItemToCorrect(ing);
    setNewPhysicalStock(String(ing.available_base_quantity || 0));
    setCorrectionReason('');
    setFormError(null);
  };

  const handleCorrectStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToCorrect) return;
    if (!correctionReason || correctionReason.trim().length < 3) {
      setFormError('संशोधन का स्पष्ट कारण दर्ज करना अनिवार्य है।');
      return;
    }

    try {
      await correctStockMutation.mutateAsync({
        ingredientId: itemToCorrect.id,
        newQuantity: parseFloat(newPhysicalStock) || 0,
        reason: correctionReason.trim(),
      });
      setItemToCorrect(null);
      setNewPhysicalStock('');
      setCorrectionReason('');
    } catch (err: any) {
      setFormError(err.message || 'स्टॉक संशोधन में त्रुटि हुई');
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      const res = await deleteMutation.mutateAsync({
        ingredientId: itemToDelete.id,
        reason: deleteReason.trim() || 'Deleted Draft Item',
      });
      if (res && res.deactivated) {
        alert(res.message || 'सामग्री का इतिहास होने के कारण इसे निष्क्रिय किया गया।');
      }
      setItemToDelete(null);
      setDeleteReason('');
    } catch (err: any) {
      alert(err.message || 'त्रुटि हुई');
    }
  };

  const filteredIngredients = ingredients.filter((ing) => {
    const matchesCat = selectedCategory === 'all' || ing.category === selectedCategory;
    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'in_stock' && ing.stock_status === 'in_stock') ||
      (selectedStatus === 'low_stock' && ing.stock_status === 'low_stock') ||
      (selectedStatus === 'out_of_stock' && ing.stock_status === 'out_of_stock') ||
      (selectedStatus === 'inactive' && ing.is_active === false);
    const matchesSearch =
      ing.name_hi.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ing.name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ing.code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">
              {language === 'hi' ? 'सामग्री मास्टर (Raw Material Master)' : 'Raw Material Master'}
            </h1>
            <Badge variant="outline" className="font-bold">
              {filteredIngredients.length} {language === 'hi' ? 'आइटम' : 'Items'}
            </Badge>
          </div>
          <p className="text-xs text-stone-600 mt-1">
            {language === 'hi'
              ? 'कच्ची सामग्री का नाम, श्रेणियां, इकाइयाँ, न्यूनतम स्टॉक व खरीद दर विन्यास'
              : 'Master configuration of ingredients, categories, units, threshold levels & suppliers'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/inventory">
            <Button variant="outline" size="sm">
              ← {language === 'hi' ? 'डैशबोर्ड' : 'Dashboard'}
            </Button>
          </Link>
          {isOwner && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={handleOpenNewModal}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              + {language === 'hi' ? 'नई सामग्री जोड़ें' : 'Add Ingredient'}
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Control Card */}
      <Card className="p-4 border-stone-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
            <input
              type="text"
              placeholder={language === 'hi' ? 'नाम या कोड से खोजें...' : 'Search by name or code...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Category Dropdown */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500"
            >
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {language === 'hi' ? c.labelHi : c.labelEn}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500"
            >
              <option value="all">{language === 'hi' ? 'सभी स्थितियाँ (All Status)' : 'All Status'}</option>
              <option value="in_stock">{language === 'hi' ? 'उपलब्ध (In Stock)' : 'In Stock'}</option>
              <option value="low_stock">{language === 'hi' ? 'कम स्टॉक (Low Stock)' : 'Low Stock'}</option>
              <option value="out_of_stock">{language === 'hi' ? 'खत्म (0 Stock)' : 'Out of Stock'}</option>
              <option value="inactive">{language === 'hi' ? 'निष्क्रिय (Inactive)' : 'Inactive'}</option>
            </select>
          </div>

          {/* Toggle Inactive checkbox */}
          <div className="flex items-center gap-2 pt-1 md:justify-end">
            <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded border-stone-300"
              />
              <span>{language === 'hi' ? 'निष्क्रिय सामग्री भी दिखाएं' : 'Show Inactive Items'}</span>
            </label>
          </div>
        </div>
      </Card>

      {/* Items Table Card */}
      <Card className="p-0 border-stone-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-50 text-stone-600 font-semibold border-b border-stone-200">
              <tr>
                <th className="p-3">कोड व सामग्री</th>
                <th className="p-3">श्रेणी</th>
                <th className="p-3 text-right">उपलब्ध स्टॉक</th>
                <th className="p-3 text-right">न्यूनतम स्तर</th>
                <th className="p-3 text-right">खरीद दर (WAC)</th>
                <th className="p-3">सप्लायर व स्थान</th>
                <th className="p-3 text-center">स्थिति</th>
                <th className="p-3 text-right">कार्य</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredIngredients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-stone-500">
                    {language === 'hi' ? 'कोई सामग्री नहीं मिली।' : 'No ingredients match the filter.'}
                  </td>
                </tr>
              ) : (
                filteredIngredients.map((ing) => {
                  const isLow = ing.stock_status === 'low_stock';
                  const isOut = ing.stock_status === 'out_of_stock';
                  const isDeactivated = ing.is_active === false;

                  return (
                    <tr
                      key={ing.id}
                      className={`hover:bg-stone-50/70 transition-colors ${
                        isDeactivated
                          ? 'opacity-60 bg-stone-100/50'
                          : isOut
                          ? 'bg-rose-50/30'
                          : isLow
                          ? 'bg-amber-50/30'
                          : ''
                      }`}
                    >
                      <td className="p-3">
                        <Link
                          to={`/inventory/items/${ing.id}`}
                          className="font-bold text-stone-900 hover:underline block"
                        >
                          {ing.name_hi}
                          <span className="text-stone-500 font-normal ml-1">({ing.name_en})</span>
                        </Link>
                        <span className="text-[10px] text-stone-400 font-mono">{ing.code}</span>
                      </td>

                      <td className="p-3">
                        <span className="capitalize text-stone-700 bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                          {ing.category.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="p-3 text-right font-bold text-stone-900 text-sm">
                        {formatIngredientQuantityWithUnit(ing.available_base_quantity || 0, ing.base_unit)}
                      </td>

                      <td className="p-3 text-right text-stone-600 font-medium">
                        {ing.min_stock_level || 0} {ing.base_unit}
                      </td>

                      <td className="p-3 text-right text-stone-800 font-semibold">
                        {formatCurrency(ing.weighted_average_rate || ing.current_rate)} / {ing.rate_unit}
                      </td>

                      <td className="p-3 text-stone-600">
                        <p className="font-medium truncate max-w-[140px]">
                          {ing.preferred_supplier_name || '—'}
                        </p>
                        <p className="text-[10px] text-stone-400">{ing.storage_location || 'General Store'}</p>
                      </td>

                      <td className="p-3 text-center">
                        {isDeactivated ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-200 text-stone-700">
                            {language === 'hi' ? 'निष्क्रिय' : 'Inactive'}
                          </span>
                        ) : isOut ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            {language === 'hi' ? 'खत्म (0)' : 'Out of Stock'}
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            {language === 'hi' ? 'कम स्टॉक' : 'Low Stock'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            {language === 'hi' ? 'सक्रिय' : 'In Stock'}
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Link to={`/inventory/items/${ing.id}`}>
                            <button
                              title="बहीखाता देखें"
                              className="p-1.5 text-stone-600 hover:bg-stone-200 rounded cursor-pointer"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </Link>

                          {isOwner && (
                            <>
                              <button
                                title="भौतिक स्टॉक संशोधन (Correct Stock)"
                                onClick={() => handleOpenCorrectStock(ing)}
                                className="p-1.5 text-indigo-700 hover:bg-indigo-100 rounded cursor-pointer"
                              >
                                <Scale className="w-3.5 h-3.5" />
                              </button>

                              <button
                                title="संपादित करें"
                                onClick={() => handleOpenEditModal(ing)}
                                className="p-1.5 text-amber-700 hover:bg-amber-100 rounded cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {isDeactivated ? (
                                <button
                                  title="पुनः सक्रिय करें"
                                  onClick={() => reactivateMutation.mutate(ing.id)}
                                  className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded cursor-pointer"
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  title="निष्क्रिय करें"
                                  onClick={() => setItemToDeactivate(ing)}
                                  className="p-1.5 text-stone-500 hover:bg-stone-200 rounded cursor-pointer"
                                >
                                  <PowerOff className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                title="हटाएं"
                                onClick={() => setItemToDelete(ing)}
                                className="p-1.5 text-rose-600 hover:bg-rose-100 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add / Edit Ingredient Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={
          editingIngredient
            ? `${language === 'hi' ? 'सामग्री संपादित करें' : 'Edit Ingredient'}: ${editingIngredient.name_hi}`
            : language === 'hi'
            ? 'नई सामग्री जोड़ें (Add Raw Material)'
            : 'Add Raw Material'
        }
        maxWidth="lg"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                सामग्री का नाम (हिंदी) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="उदा. भैंस का दूध, खोया, काजू"
                value={formData.name_hi}
                onChange={(e) => setFormData({ ...formData, name_hi: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                सामग्री का नाम (English) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Buffalo Milk, Khoya, Cashew"
                value={formData.name_en}
                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">कोड (Item Code)</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-3 py-1.5 text-xs font-mono uppercase border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">श्रेणी (Category)</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500"
              >
                <option value="dairy">दूध व मावा (Dairy)</option>
                <option value="sweetener">चीनी व मीठा (Sweeteners)</option>
                <option value="dry_fruit">काजू, बादाम, पिस्ता (Dry Fruits)</option>
                <option value="spice">इलायची व केसर (Spices)</option>
                <option value="flavoring">फ्लेवर व रंग (Flavorings)</option>
                <option value="packaging">पैकिंग सामग्री (Packaging)</option>
                <option value="fuel">गैस व ईंधन (Fuel)</option>
                <option value="other">अन्य (Other)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">मूल इकाई (Base Unit)</label>
              <select
                value={formData.base_unit}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    base_unit: e.target.value as any,
                    rate_unit: e.target.value as any,
                  })
                }
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500"
              >
                <option value="kg">kg (किलोग्राम)</option>
                <option value="g">g (ग्राम)</option>
                <option value="litre">litre (लीटर)</option>
                <option value="ml">ml (मिलीलीटर)</option>
                <option value="piece">piece (पीस / नग)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">खरीद इकाई (Purchase Unit)</label>
              <select
                value={formData.purchase_unit}
                onChange={(e) => setFormData({ ...formData, purchase_unit: e.target.value as any })}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500"
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="litre">litre</option>
                <option value="ml">ml</option>
                <option value="piece">piece</option>
                <option value="packet">packet (पैकेट)</option>
                <option value="box">box (डिब्बा / पेटी)</option>
                <option value="bottle">bottle (बोतल)</option>
                <option value="cylinder">cylinder (सिलेंडर)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                कन्वर्जन गुणक (Factor to Base)
              </label>
              <input
                type="number"
                step="any"
                min="0.001"
                placeholder="1 खरीद इकाई = कितने बेस"
                value={formData.conversion_factor}
                onChange={(e) => setFormData({ ...formData, conversion_factor: parseFloat(e.target.value) || 1 })}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                वर्तमान खरीद दर (₹ / {formData.rate_unit})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={formData.current_rate}
                onChange={(e) => setFormData({ ...formData, current_rate: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-1.5 text-xs font-bold border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                न्यूनतम स्टॉक चेतावनी सीमा (Min Stock)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={formData.min_stock_level}
                onChange={(e) => setFormData({ ...formData, min_stock_level: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                सुझावित पुनःऑर्डर मात्रा (Reorder Qty)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={formData.reorder_quantity}
                onChange={(e) => setFormData({ ...formData, reorder_quantity: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">प्राथमिक सप्लायर (Supplier)</label>
              <select
                value={formData.preferred_supplier_id}
                onChange={(e) => setFormData({ ...formData, preferred_supplier_id: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500"
              >
                <option value="">-- कोई सप्लायर नहीं --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">भंडारण स्थान (Storage Location)</label>
              <input
                type="text"
                placeholder="उदा. कोल्ड स्टोरेज, सूखा गोदाम, मसाला सेफ"
                value={formData.storage_location}
                onChange={(e) => setFormData({ ...formData, storage_location: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-6 p-3 bg-stone-50 rounded-xl">
            <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.track_expiry}
                onChange={(e) => setFormData({ ...formData, track_expiry: e.target.checked })}
                className="w-4 h-4 text-amber-600 rounded border-stone-300"
              />
              <span>एक्सपायरी तिथि ट्रैक करें (Track Expiry)</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.track_lots}
                onChange={(e) => setFormData({ ...formData, track_lots: e.target.checked })}
                className="w-4 h-4 text-amber-600 rounded border-stone-300"
              />
              <span>बैच / लॉट नंबर ट्रैक करें (Track Lots)</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setIsFormModalOpen(false)}>
              {t.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={createMutation.isPending || updateMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              {editingIngredient ? 'अपडेट करें' : 'सहेजें'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Quick Physical Stock Correction Modal */}
      <Modal
        isOpen={Boolean(itemToCorrect)}
        onClose={() => setItemToCorrect(null)}
        title={`भौतिक स्टॉक संशोधन: ${itemToCorrect?.name_hi || ''} (${itemToCorrect?.name_en || ''})`}
        maxWidth="md"
      >
        <form onSubmit={handleCorrectStockSubmit} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
            <p className="font-bold">सुरक्षित स्टॉक संशोधन (Safe Correction):</p>
            <p>
              पिछला बहीखाता हटाया नहीं जाएगा। नया भौतिक स्टॉक दर्ज करने पर एक{' '}
              <strong>physical_count_correction</strong> एंट्री स्वतः बनाई जाएगी।
            </p>
          </div>

          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-500 mb-1">
                वर्तमान बहीखाता स्टॉक
              </label>
              <div className="px-3 py-2 bg-stone-100 rounded-lg text-xs font-bold font-mono text-stone-800">
                {itemToCorrect?.available_base_quantity || 0} {itemToCorrect?.base_unit}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-800 mb-1">
                नया भौतिक स्टॉक ({itemToCorrect?.base_unit}) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={newPhysicalStock}
                onChange={(e) => setNewPhysicalStock(e.target.value)}
                placeholder="नया स्टॉक"
                className="w-full px-3 py-2 text-xs font-bold font-mono border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
          </div>

          {itemToCorrect && newPhysicalStock !== '' && (
            <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-lg text-xs flex justify-between items-center">
              <span>अंतर (Difference):</span>
              <span className={`font-bold font-mono ${
                (parseFloat(newPhysicalStock) || 0) - (itemToCorrect.available_base_quantity || 0) >= 0
                  ? 'text-emerald-700'
                  : 'text-rose-700'
              }`}>
                {(parseFloat(newPhysicalStock) || 0) - (itemToCorrect.available_base_quantity || 0) >= 0 ? '+' : ''}
                {((parseFloat(newPhysicalStock) || 0) - (itemToCorrect.available_base_quantity || 0)).toFixed(3)} {itemToCorrect.base_unit}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-800 mb-1">
              संशोधन का अनिवार्य कारण (Reason) *
            </label>
            <input
              type="text"
              placeholder="जैसे: भौतिक गणना में पाया गया, रिसाव/नुकसान..."
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setItemToCorrect(null)}>
              {t.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={correctStockMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              संशोधन दर्ज करें
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Dialog */}
      <Modal
        isOpen={Boolean(itemToDeactivate)}
        onClose={() => setItemToDeactivate(null)}
        title={`सामग्री निष्क्रिय करें: ${itemToDeactivate?.name_hi || ''}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-600">
            निष्क्रिय करने पर यह सामग्री नए बैच व खरीद में नहीं दिखाई देगी, लेकिन इसका पिछला लेन-देन सुरक्षित रहेगा।
          </p>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">निष्क्रिय करने का कारण</label>
            <input
              type="text"
              placeholder="उदा. अब उपयोग में नहीं है"
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setItemToDeactivate(null)}>
              {t.cancel}
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeactivate} isLoading={deactivateMutation.isPending}>
              हाँ, निष्क्रिय करें
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Dialog */}
      <Modal
        isOpen={Boolean(itemToDelete)}
        onClose={() => setItemToDelete(null)}
        title={`सामग्री हटाएं: ${itemToDelete?.name_hi || ''}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-rose-700 font-semibold">
            ध्यान दें: केवल वही सामग्री स्थायी रूप से हटाई जा सकती है जिसका कोई खरीद या उत्पादन इतिहास न हो।
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setItemToDelete(null)}>
              {t.cancel}
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} isLoading={deleteMutation.isPending}>
              स्थायी हटाएं
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
