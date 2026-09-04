import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useIngredients,
  useInventoryWastages,
  useRecordInventoryWastage,
} from '@/hooks/useInventory';
import { useLanguage } from '@/i18n/LanguageContext';
import { UnitType, InventoryWastageType } from '@/types';
import { formatCurrency, formatDate, getTodayDateString } from '@/lib/formatters';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import {
  Plus,
  ArrowLeft,
  History,
} from 'lucide-react';

export const WastagePage: React.FC = () => {
  const { language } = useLanguage();

  const { data: ingredients = [] } = useIngredients();
  const { data: wastages = [] } = useInventoryWastages();
  const recordWastage = useRecordInventoryWastage();

  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [wastageDate, setWastageDate] = useState(getTodayDateString());
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unit, setUnit] = useState<UnitType>('kg');
  const [wastageType, setWastageType] = useState<InventoryWastageType>('spillage');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleOpenModal = () => {
    const defaultIng = ingredients[0];
    setIngredientId(defaultIng?.id || '');
    setUnit(defaultIng?.base_unit || 'kg');
    setQuantity('1');
    setWastageType('spillage');
    setReason('');
    setWastageDate(getTodayDateString());
    setFormError(null);
    setIsRecordModalOpen(true);
  };

  const handleIngredientChange = (id: string) => {
    setIngredientId(id);
    const ing = ingredients.find((i) => i.id === id);
    if (ing) setUnit(ing.base_unit);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setFormError('कृपया शून्य से अधिक मात्रा दर्ज करें।');
      return;
    }

    if (!reason.trim()) {
      setFormError('नुकसान / खराबी का स्पष्ट कारण दर्ज करना अनिवार्य है।');
      return;
    }

    try {
      await recordWastage.mutateAsync({
        wastage_date: wastageDate,
        ingredient_id: ingredientId,
        quantity: qtyNum,
        unit,
        wastage_type: wastageType,
        reason: reason.trim(),
      });
      setIsRecordModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'खराबी रिकॉर्ड दर्ज करने में विफल');
    }
  };

  const totalLossValue = wastages.reduce((sum, w) => sum + (w.total_loss_value || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/inventory">
            <button className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 cursor-pointer">
              <ArrowLeft className="w-4 h-4 text-stone-700" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-stone-900 tracking-tight">
                {language === 'hi' ? 'सामग्री खराबी व नुकसान (Wastage & Damage)' : 'Material Wastage & Loss'}
              </h1>
              <Badge variant="danger" className="font-bold">
                {wastages.length} {language === 'hi' ? 'प्रविष्टियां' : 'Records'}
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              {language === 'hi'
                ? 'दूध फटने, सामान गिरने, खराब पैकेजिंग व आंतरिक नमूना उपयोग का बहीखाता'
                : 'Accountability ledger for spillage, spoilage, damaged packaging & testing samples'}
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={handleOpenModal}
          className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
        >
          + {language === 'hi' ? 'खराबी / नुकसान दर्ज करें' : 'Record Wastage'}
        </Button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-rose-50/60 border-rose-200">
          <span className="text-xs font-semibold text-rose-900">
            {language === 'hi' ? 'कुल संचयी नुकसान (Total Loss Value)' : 'Total Loss Valuation'}
          </span>
          <p className="text-2xl font-black text-rose-900 mt-2">{formatCurrency(totalLossValue)}</p>
          <p className="text-[11px] text-rose-700 mt-0.5">
            {wastages.length} {language === 'hi' ? 'खराबी की घटनाएं दर्ज' : 'logged loss events'}
          </p>
        </Card>
      </div>

      {/* Wastage History Table */}
      <Card className="p-0 border-stone-200 overflow-hidden shadow-sm">
        <div className="p-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4 text-rose-600" />
            खराबी व नुकसान लॉग (Wastage Log)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-50 font-semibold text-stone-600 border-b border-stone-200">
              <tr>
                <th className="p-3">दिनांक व नंबर</th>
                <th className="p-3">सामग्री</th>
                <th className="p-3">प्रकार (Type)</th>
                <th className="p-3 text-right">खराब मात्रा</th>
                <th className="p-3 text-right">अनुमानित नुकसान (₹)</th>
                <th className="p-3">कारण (Reason)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {wastages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-stone-500">
                    {language === 'hi' ? 'कोई खराबी रिकॉर्ड नहीं मिला।' : 'No wastage recorded yet.'}
                  </td>
                </tr>
              ) : (
                wastages.map((w) => (
                  <tr key={w.id} className="hover:bg-stone-50">
                    <td className="p-3 whitespace-nowrap">
                      <span className="font-bold text-stone-900 block">{w.wastage_number}</span>
                      <span className="text-[10px] text-stone-500">{formatDate(w.wastage_date)}</span>
                    </td>

                    <td className="p-3 font-bold text-stone-900">
                      {w.ingredient?.name_hi} <span className="text-stone-500 font-normal">({w.ingredient?.name_en})</span>
                    </td>

                    <td className="p-3">
                      <span className="capitalize px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                        {w.wastage_type.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="p-3 text-right font-black text-rose-700 text-sm">
                      -{w.quantity} {w.base_unit}
                    </td>

                    <td className="p-3 text-right font-bold text-stone-900">
                      {formatCurrency(w.total_loss_value)}
                    </td>

                    <td className="p-3 text-stone-700 font-medium">{w.reason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Record Wastage Modal */}
      <Modal
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        title="सामग्री खराबी / नुकसान दर्ज करें (Record Wastage)"
        maxWidth="md"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              दिनांक (Date) <span className="text-rose-600">*</span>
            </label>
            <input
              type="date"
              required
              value={wastageDate}
              onChange={(e) => setWastageDate(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              सामग्री चुनें <span className="text-rose-600">*</span>
            </label>
            <select
              required
              value={ingredientId}
              onChange={(e) => handleIngredientChange(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold border border-stone-300 rounded-lg bg-white"
            >
              {ingredients.map((ing) => (
                <option key={ing.id} value={ing.id}>
                  {ing.name_hi} ({ing.name_en}) — उपलब्ध: {ing.available_base_quantity || 0} {ing.base_unit}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                खराब / प्रयुक्त मात्रा <span className="text-rose-600">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-bold border border-stone-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">इकाई (Unit)</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as any)}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg bg-white"
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="litre">litre</option>
                <option value="ml">ml</option>
                <option value="piece">piece</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              खराबी का प्रकार (Type) <span className="text-rose-600">*</span>
            </label>
            <select
              value={wastageType}
              onChange={(e) => setWastageType(e.target.value as any)}
              className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg bg-white"
            >
              <option value="spillage">स्पिलेज / गिरकर फैलना (Spillage)</option>
              <option value="expired">एक्सपायर / बासी होना (Expired)</option>
              <option value="damaged_packaging">क्षतिग्रस्त पैकेजिंग (Damaged Packaging)</option>
              <option value="cleaning_test">सफाई / टेस्टिंग में खपत (Cleaning / Quality Test)</option>
              <option value="personal_internal">आंतरिक उपभोग (Internal Staff Use)</option>
              <option value="sample_production">नमूना / टेस्टिंग उत्पादन (Sample Production)</option>
              <option value="other">अन्य (Other)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              कारण व विस्तृत विवरण <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={2}
              required
              placeholder="उदा. उबालते समय 2 लीटर दूध उफन कर गिर गया"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setIsRecordModalOpen(false)}>
              रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={recordWastage.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              ✓ नुकसान दर्ज करें व स्टॉक घटाएं
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
