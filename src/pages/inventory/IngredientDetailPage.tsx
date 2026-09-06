import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useIngredient, useRawMaterialMovements, useCorrectRawMaterialStock } from '@/hooks/useInventory';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { formatIngredientQuantityWithUnit, computeMovementRunningBalances } from '@/lib/inventoryService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import {
  ArrowLeft,
  Plus,
  History,
  Scale,
} from 'lucide-react';

type MovementFilterType = 'all' | 'stock_in' | 'production' | 'correction' | 'wastage' | 'supplier_return';

export const IngredientDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const { isOwner } = useAuth();

  const { data: ingredient, isLoading } = useIngredient(id);
  const { data: rawMovements = [] } = useRawMaterialMovements(id);
  const correctStockMutation = useCorrectRawMaterialStock();

  const [ledgerFilter, setLedgerFilter] = useState<MovementFilterType>('all');
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [newPhysicalStock, setNewPhysicalStock] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Compute running balance across all movements for this ingredient
  const movementsWithRunningBalance = useMemo(() => {
    return computeMovementRunningBalances(rawMovements);
  }, [rawMovements]);

  // Movement Ledger Filter
  const filteredMovements = useMemo(() => {
    return movementsWithRunningBalance.filter((m) => {
      if (ledgerFilter === 'all') return true;
      if (ledgerFilter === 'stock_in') {
        return m.movement_type === 'purchase_received' || m.movement_type === 'opening_stock';
      }
      if (ledgerFilter === 'production') {
        return m.movement_type === 'production_consumption';
      }
      if (ledgerFilter === 'correction') {
        return m.movement_type === 'physical_count_correction';
      }
      if (ledgerFilter === 'wastage') {
        return m.movement_type === 'wastage' || m.movement_type === 'damage_spillage';
      }
      if (ledgerFilter === 'supplier_return') {
        return m.movement_type === 'supplier_return' || m.movement_type === 'purchase_reversal';
      }
      return true;
    });
  }, [movementsWithRunningBalance, ledgerFilter]);

  // Calculate 10 Comprehensive Summary Stats from Master & Movement Ledger
  const stats = useMemo(() => {
    const currentBalance = Number(ingredient?.available_base_quantity) || 0;
    const avgRate = Number(ingredient?.weighted_average_rate || ingredient?.current_rate) || 0;
    const stockVal = Number(ingredient?.total_stock_value) || Number((currentBalance * avgRate).toFixed(2));
    const minStock = Number(ingredient?.min_stock_level) || 0;

    let totalPurchased = 0;
    let totalConsumed = 0;
    let totalWastage = 0;
    let totalReturned = 0;
    let totalCorrected = 0;
    let lastPurchaseRate = avgRate;

    for (const m of rawMovements) {
      const q = Number(m.quantity) || 0;
      if (m.movement_type === 'purchase_received' || m.movement_type === 'opening_stock') {
        if (q > 0) totalPurchased += q;
        if (m.unit_cost_snapshot > 0 && lastPurchaseRate === avgRate) {
          lastPurchaseRate = m.unit_cost_snapshot;
        }
      } else if (m.movement_type === 'production_consumption') {
        totalConsumed += Math.abs(q);
      } else if (m.movement_type === 'wastage' || m.movement_type === 'damage_spillage') {
        totalWastage += Math.abs(q);
      } else if (m.movement_type === 'supplier_return' || m.movement_type === 'purchase_reversal') {
        totalReturned += Math.abs(q);
      } else if (m.movement_type === 'physical_count_correction') {
        totalCorrected += q;
      }
    }

    return {
      currentBalance,
      stockVal,
      avgRate,
      lastPurchaseRate,
      minStock,
      totalPurchased: Number(totalPurchased.toFixed(3)),
      totalConsumed: Number(totalConsumed.toFixed(3)),
      totalWastage: Number(totalWastage.toFixed(3)),
      totalReturned: Number(totalReturned.toFixed(3)),
      totalCorrected: Number(totalCorrected.toFixed(3)),
    };
  }, [ingredient, rawMovements]);

  const handleOpenCorrectStock = () => {
    if (!ingredient) return;
    setNewPhysicalStock(String(ingredient.available_base_quantity || 0));
    setCorrectionReason('');
    setCorrectionError(null);
    setIsCorrectionModalOpen(true);
  };

  const handleCorrectStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingredient) return;
    setCorrectionError(null);

    if (!correctionReason || correctionReason.trim().length < 3) {
      setCorrectionError('संशोधन का स्पष्ट कारण दर्ज करना अनिवार्य है।');
      return;
    }

    try {
      await correctStockMutation.mutateAsync({
        ingredientId: ingredient.id,
        newQuantity: parseFloat(newPhysicalStock) || 0,
        reason: correctionReason.trim(),
      });
      setIsCorrectionModalOpen(false);
    } catch (err: any) {
      setCorrectionError(err.message || 'स्टॉक संशोधन दर्ज करने में त्रुटि हुई');
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-stone-500">
        <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs font-semibold">{language === 'hi' ? 'सामग्री लोड हो रही है...' : 'Loading ingredient details...'}</p>
      </div>
    );
  }

  if (!ingredient) {
    return (
      <div className="p-8 text-center space-y-3 max-w-md mx-auto">
        <p className="text-stone-700 font-bold">{language === 'hi' ? 'सामग्री नहीं मिली' : 'Ingredient not found'}</p>
        <Link to="/inventory">
          <Button variant="outline" size="sm">
            ← {language === 'hi' ? 'कच्चा माल प्रबंधन पर वापस जाएं' : 'Back to Raw Materials'}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16 max-w-7xl mx-auto">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/inventory">
            <button className="p-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 cursor-pointer shadow-xs min-h-[44px] min-w-[44px] flex items-center justify-center">
              <ArrowLeft className="w-4 h-4 text-stone-700" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-stone-900">
                {ingredient.name_hi}{' '}
                <span className="text-stone-500 font-medium text-sm sm:text-base">({ingredient.name_en})</span>
              </h1>
              <span className="font-mono text-xs font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                {ingredient.code}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              श्रेणी: <span className="capitalize font-bold text-stone-700">{ingredient.category.replace('_', ' ')}</span> • स्थान: {ingredient.storage_location || 'General Store'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Scale className="w-4 h-4 text-indigo-600" />}
              onClick={handleOpenCorrectStock}
              className="bg-indigo-50/70 border-indigo-200 text-indigo-800 font-bold text-xs min-h-[44px]"
            >
              स्टॉक सुधारें
            </Button>
          )}

          <Link to={`/inventory/purchases/new?ingredient_id=${ingredient.id}`}>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs min-h-[44px]"
            >
              + खरीद दर्ज करें (Stock In)
            </Button>
          </Link>
        </div>
      </div>

      {/* 10 Comprehensive Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* 1. Current Balance */}
        <Card className="p-3.5 bg-linear-to-br from-amber-500/10 to-transparent border-amber-200">
          <span className="text-[11px] font-bold text-amber-950 block truncate">वर्तमान स्टॉक बैलेंस</span>
          <p className="text-lg sm:text-xl font-black text-stone-900 mt-1">
            {formatIngredientQuantityWithUnit(stats.currentBalance, ingredient.base_unit)}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">बहीखाता शेष</p>
        </Card>

        {/* 2. Current Stock Value */}
        <Card className="p-3.5 bg-white border-stone-200">
          <span className="text-[11px] font-bold text-stone-700 block truncate">कुल स्टॉक मूल्य</span>
          <p className="text-lg sm:text-xl font-black text-stone-900 mt-1">
            {formatCurrency(stats.stockVal)}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">बैलेंस × औसत दर</p>
        </Card>

        {/* 3. Average Purchase Rate (WAC) */}
        <Card className="p-3.5 bg-white border-stone-200">
          <span className="text-[11px] font-bold text-stone-700 block truncate">औसत खरीद दर (WAC)</span>
          <p className="text-lg sm:text-xl font-black text-stone-900 mt-1">
            {formatCurrency(stats.avgRate)}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">प्रति {ingredient.rate_unit || ingredient.base_unit}</p>
        </Card>

        {/* 4. Last Purchase Rate */}
        <Card className="p-3.5 bg-white border-stone-200">
          <span className="text-[11px] font-bold text-stone-700 block truncate">अंतिम खरीद दर</span>
          <p className="text-lg sm:text-xl font-black text-stone-900 mt-1">
            {formatCurrency(stats.lastPurchaseRate)}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">प्रति {ingredient.rate_unit || ingredient.base_unit}</p>
        </Card>

        {/* 5. Minimum Stock */}
        <Card className="p-3.5 bg-white border-stone-200">
          <span className="text-[11px] font-bold text-stone-700 block truncate">न्यूनतम स्टॉक सीमा</span>
          <p className="text-lg sm:text-xl font-black text-stone-900 mt-1">
            {stats.minStock} {ingredient.base_unit}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">चेतावनी थ्रेशोल्ड</p>
        </Card>

        {/* 6. Total Purchased */}
        <Card className="p-3.5 bg-white border-stone-200">
          <span className="text-[11px] font-bold text-stone-700 block truncate">कुल खरीदा गया</span>
          <p className="text-lg sm:text-xl font-black text-emerald-700 mt-1">
            +{stats.totalPurchased} {ingredient.base_unit}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">Stock-In योग</p>
        </Card>

        {/* 7. Total Consumed in Production */}
        <Card className="p-3.5 bg-white border-stone-200">
          <span className="text-[11px] font-bold text-stone-700 block truncate">उत्पादन में कुल खपत</span>
          <p className="text-lg sm:text-xl font-black text-sky-700 mt-1">
            -{stats.totalConsumed} {ingredient.base_unit}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">रेसिपी व उत्पादन</p>
        </Card>

        {/* 8. Total Wastage */}
        <Card className="p-3.5 bg-white border-stone-200">
          <span className="text-[11px] font-bold text-stone-700 block truncate">कुल खराबी / नुकसान</span>
          <p className="text-lg sm:text-xl font-black text-rose-700 mt-1">
            -{stats.totalWastage} {ingredient.base_unit}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">स्पिलेज व डैमेज</p>
        </Card>

        {/* 9. Total Returned to Supplier */}
        <Card className="p-3.5 bg-white border-stone-200">
          <span className="text-[11px] font-bold text-stone-700 block truncate">सप्लायर को वापस</span>
          <p className="text-lg sm:text-xl font-black text-amber-800 mt-1">
            -{stats.totalReturned} {ingredient.base_unit}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">वापसी / रिवर्सल</p>
        </Card>

        {/* 10. Total Corrected */}
        <Card className="p-3.5 bg-white border-stone-200">
          <span className="text-[11px] font-bold text-stone-700 block truncate">कुल भौतिक सुधार</span>
          <p
            className={`text-lg sm:text-xl font-black mt-1 ${
              stats.totalCorrected >= 0 ? 'text-purple-700' : 'text-rose-700'
            }`}
          >
            {stats.totalCorrected >= 0 ? '+' : ''}
            {stats.totalCorrected} {ingredient.base_unit}
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5">स्टॉक समायोजन</p>
        </Card>
      </div>

      {/* Movement Ledger Card with Filter Pills */}
      <Card className="p-4 sm:p-5 border-stone-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
          <div>
            <h3 className="text-sm sm:text-base font-black text-stone-900 flex items-center gap-2">
              <History className="w-4 h-4 text-amber-600" />
              <span>सामग्री का पूर्ण बहीखाता (Stock Movement Ledger)</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              सभी स्टॉक-इन, उत्पादन खपत, खराबी, सुधार व रनिंग बैलेंस का सटीक लेखा
            </p>
          </div>
          <span className="text-xs font-bold text-stone-600 self-start sm:self-auto bg-stone-100 px-2.5 py-1 rounded-full">
            {filteredMovements.length} प्रविष्टियां
          </span>
        </div>

        {/* Ledger Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {[
            { key: 'all', label: 'सभी (All)' },
            { key: 'stock_in', label: 'खरीद (Stock-In)' },
            { key: 'production', label: 'उत्पादन खपत (Production)' },
            { key: 'correction', label: 'स्टॉक सुधार (Correction)' },
            { key: 'wastage', label: 'खराबी / नुकसान (Wastage)' },
            { key: 'supplier_return', label: 'सप्लायर वापसी (Returns)' },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setLedgerFilter(f.key as MovementFilterType)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer min-h-[36px] ${
                ledgerFilter === f.key
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Mobile View (<768px): Responsive Movement Cards */}
        <div className="block md:hidden space-y-3">
          {filteredMovements.length === 0 ? (
            <p className="p-8 text-center text-stone-500 text-xs font-semibold">
              कोई बहीखाता रिकॉर्ड नहीं मिला।
            </p>
          ) : (
            filteredMovements.map((m) => {
              const isInflow = Number(m.quantity) > 0;
              return (
                <div
                  key={m.id}
                  className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] text-stone-500 font-medium block">
                        {formatDate(m.movement_date)}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 ${
                          m.movement_type === 'purchase_received' || m.movement_type === 'opening_stock'
                            ? 'bg-emerald-100 text-emerald-800'
                            : m.movement_type === 'production_consumption'
                            ? 'bg-sky-100 text-sky-800'
                            : m.movement_type === 'physical_count_correction'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {m.movement_type.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-base font-black ${
                          isInflow ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isInflow ? '+' : ''}
                        {m.quantity} {m.base_unit}
                      </span>
                      <span className="text-[10px] text-stone-500 font-bold block mt-0.5">
                        शेष: {m.running_balance} {m.base_unit}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-stone-800 pt-1 border-t border-stone-200/60">
                    {m.reason || 'बहीखाता प्रविष्टि'}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1">
                    <span>दर: {formatCurrency(m.unit_cost_snapshot)} / {m.base_unit}</span>
                    <span className="font-bold text-stone-900">मूल्य: {formatCurrency(m.total_value_snapshot)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View (>=768px): Structured Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-50 font-bold text-stone-700 border-b border-stone-200">
              <tr>
                <th className="p-3">दिनांक व समय</th>
                <th className="p-3">प्रकार</th>
                <th className="p-3">विवरण / संदर्भ</th>
                <th className="p-3 text-right">मात्रा (+ / -)</th>
                <th className="p-3 text-right">रनिंग बैलेंस</th>
                <th className="p-3 text-right">दर (Snapshot)</th>
                <th className="p-3 text-right">कुल मूल्य</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-stone-500">
                    कोई बहीखाता रिकॉर्ड नहीं मिला।
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const isInflow = Number(m.quantity) > 0;
                  return (
                    <tr key={m.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="p-3 font-medium text-stone-600 whitespace-nowrap">
                        {formatDate(m.movement_date)}
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.movement_type === 'purchase_received' || m.movement_type === 'opening_stock'
                              ? 'bg-emerald-100 text-emerald-800'
                              : m.movement_type === 'production_consumption'
                              ? 'bg-sky-100 text-sky-800'
                              : m.movement_type === 'physical_count_correction'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {m.movement_type.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td className="p-3 font-medium text-stone-800">
                        <p>{m.reason || 'प्रविष्टि'}</p>
                        <span className="text-[10px] text-stone-400">
                          {m.source_location} → {m.destination_location}
                        </span>
                      </td>

                      <td
                        className={`p-3 text-right font-black text-sm whitespace-nowrap ${
                          isInflow ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isInflow ? '+' : ''}
                        {m.quantity} {m.base_unit}
                      </td>

                      <td className="p-3 text-right font-black text-stone-900 whitespace-nowrap">
                        {m.running_balance} {m.base_unit}
                      </td>

                      <td className="p-3 text-right text-stone-600 font-medium whitespace-nowrap">
                        {formatCurrency(m.unit_cost_snapshot)} / {m.base_unit}
                      </td>

                      <td className="p-3 text-right font-bold text-stone-900 whitespace-nowrap">
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

      {/* Owner Stock Correction Modal */}
      <Modal
        isOpen={isCorrectionModalOpen}
        onClose={() => setIsCorrectionModalOpen(false)}
        title={`स्टॉक सुधार: ${ingredient.name_hi} (${ingredient.name_en})`}
        maxWidth="md"
      >
        <form onSubmit={handleCorrectStockSubmit} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-amber-700 shrink-0" />
              <span>प्रमाणिक बहीखाता सुधार:</span>
            </p>
            <p className="text-[11px] leading-relaxed">
              यह प्रक्रिया सीधे बैलेंस को नहीं बदलती बल्कि बहीखाते में एक नया{' '}
              <strong>physical_count_correction</strong> मूवमेंट जोड़ती है।
            </p>
          </div>

          {correctionError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-bold">
              {correctionError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-500 mb-1">वर्तमान स्टॉक</label>
              <div className="px-3 py-2 bg-stone-100 rounded-lg text-xs font-black font-mono text-stone-900">
                {ingredient.available_base_quantity || 0} {ingredient.base_unit}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-900 mb-1">
                वास्तविक भौतिक स्टॉक ({ingredient.base_unit}) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                required
                value={newPhysicalStock}
                onChange={(e) => setNewPhysicalStock(e.target.value)}
                placeholder="नया स्टॉक"
                className="w-full px-3 py-2 text-xs font-black font-mono border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {newPhysicalStock !== '' && (
            <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-lg text-xs flex justify-between items-center">
              <span className="font-semibold text-stone-600">अंतर (Difference):</span>
              <span
                className={`font-black font-mono ${
                  (parseFloat(newPhysicalStock) || 0) - (ingredient.available_base_quantity || 0) >= 0
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {(parseFloat(newPhysicalStock) || 0) - (ingredient.available_base_quantity || 0) >= 0 ? '+' : ''}
                {((parseFloat(newPhysicalStock) || 0) - (ingredient.available_base_quantity || 0)).toFixed(3)}{' '}
                {ingredient.base_unit}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-900 mb-1">
              संशोधन का अनिवार्य कारण *
            </label>
            <input
              type="text"
              required
              placeholder="उदा. भौतिक गिनती में कमी पाई गई..."
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setIsCorrectionModalOpen(false)}>
              रद्द करें
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
    </div>
  );
};

export default IngredientDetailPage;
