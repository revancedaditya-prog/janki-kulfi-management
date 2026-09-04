import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useIngredient, useRawMaterialMovements } from '@/hooks/useInventory';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { formatIngredientQuantityWithUnit } from '@/lib/inventoryService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import {
  ArrowLeft,
  Plus,
  History,
} from 'lucide-react';

export const IngredientDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { language } = useLanguage();

  const { data: ingredient, isLoading } = useIngredient(id);
  const { data: movements = [] } = useRawMaterialMovements(id);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-stone-500">
        {language === 'hi' ? 'सामग्री लोड हो रही है...' : 'Loading ingredient details...'}
      </div>
    );
  }

  if (!ingredient) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-stone-700 font-bold">{language === 'hi' ? 'सामग्री नहीं मिली' : 'Ingredient not found'}</p>
        <Link to="/inventory">
          <Button variant="outline" size="sm">
            ← {language === 'hi' ? 'इन्वेंटरी पर वापस जाएं' : 'Back to Inventory'}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/inventory">
            <button className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 cursor-pointer">
              <ArrowLeft className="w-4 h-4 text-stone-700" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-stone-900">
                {ingredient.name_hi} <span className="text-stone-500 font-normal">({ingredient.name_en})</span>
              </h1>
              <span className="font-mono text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded">
                {ingredient.code}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              {language === 'hi' ? 'श्रेणी:' : 'Category:'} <span className="capitalize">{ingredient.category.replace('_', ' ')}</span> • {ingredient.storage_location || 'General Store'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to={`/inventory/purchases/new?ingredient_id=${ingredient.id}`}>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              + {language === 'hi' ? 'खरीद दर्ज करें' : 'Stock In'}
            </Button>
          </Link>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-linear-to-br from-amber-500/10 to-transparent border-amber-200">
          <span className="text-xs font-semibold text-amber-900">
            {language === 'hi' ? 'उपलब्ध स्टॉक' : 'Available Stock'}
          </span>
          <p className="text-2xl font-black text-stone-900 mt-2">
            {formatIngredientQuantityWithUnit(ingredient.available_base_quantity || 0, ingredient.base_unit)}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {language === 'hi' ? 'न्यूनतम सीमा:' : 'Min Threshold:'} {ingredient.min_stock_level || 0} {ingredient.base_unit}
          </p>
        </Card>

        <Card className="p-4 bg-white border-stone-200">
          <span className="text-xs font-semibold text-stone-600">
            {language === 'hi' ? 'भारित औसत दर (WAC)' : 'Avg Cost (WAC)'}
          </span>
          <p className="text-2xl font-black text-stone-900 mt-2">
            {formatCurrency(ingredient.weighted_average_rate || ingredient.current_rate)}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">प्रति {ingredient.rate_unit}</p>
        </Card>

        <Card className="p-4 bg-white border-stone-200">
          <span className="text-xs font-semibold text-stone-600">
            {language === 'hi' ? 'कुल स्टॉक मूल्य' : 'Total Valuation'}
          </span>
          <p className="text-2xl font-black text-stone-900 mt-2">
            {formatCurrency(ingredient.total_stock_value || 0)}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {ingredient.available_base_quantity || 0} × {formatCurrency(ingredient.weighted_average_rate || ingredient.current_rate)}
          </p>
        </Card>

        <Card className="p-4 bg-white border-stone-200">
          <span className="text-xs font-semibold text-stone-600">
            {language === 'hi' ? 'प्राथमिक सप्लायर' : 'Preferred Supplier'}
          </span>
          <p className="text-sm font-bold text-stone-900 mt-2 truncate">
            {ingredient.preferred_supplier_name || '—'}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {language === 'hi' ? 'पुनःऑर्डर मात्रा:' : 'Reorder Qty:'} {ingredient.reorder_quantity || 0} {ingredient.base_unit}
          </p>
        </Card>
      </div>

      {/* Ledger History Card */}
      <Card className="p-5 border-stone-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <History className="w-4 h-4 text-amber-600" />
            {language === 'hi' ? 'सामग्री स्टॉक बहीखाता (Stock Movement Ledger)' : 'Stock Movement Ledger'}
          </h3>
          <span className="text-xs font-semibold text-stone-500">
            {movements.length} {language === 'hi' ? 'प्रविष्टियां' : 'records'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-50 text-stone-600 font-semibold border-b border-stone-200">
              <tr>
                <th className="p-3">{language === 'hi' ? 'दिनांक' : 'Date'}</th>
                <th className="p-3">{language === 'hi' ? 'प्रकार' : 'Type'}</th>
                <th className="p-3">{language === 'hi' ? 'विवरण / स्रोत' : 'Details / Source'}</th>
                <th className="p-3 text-right">{language === 'hi' ? 'मात्रा (Quantity)' : 'Quantity'}</th>
                <th className="p-3 text-right">{language === 'hi' ? 'दर (Rate)' : 'Unit Cost'}</th>
                <th className="p-3 text-right">{language === 'hi' ? 'कुल मूल्य' : 'Total Value'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-stone-500">
                    {language === 'hi' ? 'अभी कोई लेन-देन नहीं है।' : 'No stock movements recorded yet.'}
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const isInflow = Number(m.quantity) > 0;
                  return (
                    <tr key={m.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="p-3 whitespace-nowrap text-stone-600">
                        {formatDate(m.movement_date)}
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.movement_type === 'purchase_received'
                              ? 'bg-emerald-100 text-emerald-800'
                              : m.movement_type === 'production_consumption'
                              ? 'bg-sky-100 text-sky-800'
                              : m.movement_type === 'wastage' || m.movement_type === 'damage_spillage'
                              ? 'bg-rose-100 text-rose-800'
                              : m.movement_type === 'physical_count_correction'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-stone-100 text-stone-800'
                          }`}
                        >
                          {m.movement_type.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="p-3 text-stone-800 font-medium">
                        <p>{m.reason || m.source_location}</p>
                        <span className="text-[10px] text-stone-400">
                          {m.source_location} → {m.destination_location}
                        </span>
                      </td>

                      <td
                        className={`p-3 text-right font-bold text-sm whitespace-nowrap ${
                          isInflow ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isInflow ? '+' : ''}
                        {m.quantity} {m.base_unit}
                      </td>

                      <td className="p-3 text-right text-stone-600 font-medium">
                        {formatCurrency(m.unit_cost_snapshot)} / {m.base_unit}
                      </td>

                      <td className="p-3 text-right font-bold text-stone-900">
                        {formatCurrency(m.total_value_snapshot)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
