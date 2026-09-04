import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useIngredients,
  usePhysicalStockCounts,
  useCreatePhysicalStockCount,
} from '@/hooks/useInventory';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatDate, getTodayDateString } from '@/lib/formatters';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import {
  ClipboardCheck,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';

export const PhysicalStockCheckPage: React.FC = () => {
  const { language } = useLanguage();
  const { isOwner } = useAuth();

  const { data: ingredients = [] } = useIngredients();
  const { data: pastCounts = [] } = usePhysicalStockCounts();
  const createCountMutation = useCreatePhysicalStockCount();

  const [activeTab, setActiveTab] = useState<'new_audit' | 'history'>('new_audit');
  const [countDate, setCountDate] = useState(getTodayDateString());
  const [notes, setNotes] = useState('');
  const [counts, setCounts] = useState<Record<string, { physical: number; reason: string }>>({});
  const [selectedPastCount, setSelectedPastCount] = useState<any | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Initialize counted stock with current system stock
  React.useEffect(() => {
    if (ingredients.length > 0) {
      const initial: Record<string, { physical: number; reason: string }> = {};
      ingredients.forEach((ing) => {
        initial[ing.id] = {
          physical: ing.available_base_quantity || 0,
          reason: '',
        };
      });
      setCounts(initial);
    }
  }, [ingredients]);

  const handlePhysicalCountChange = (ingredientId: string, val: number) => {
    setCounts((prev) => ({
      ...prev,
      [ingredientId]: {
        ...prev[ingredientId],
        physical: Math.max(0, val),
      },
    }));
  };

  const handleReasonChange = (ingredientId: string, val: string) => {
    setCounts((prev) => ({
      ...prev,
      [ingredientId]: {
        ...prev[ingredientId],
        reason: val,
      },
    }));
  };

  // Variance calculations
  const auditRows = ingredients.map((ing) => {
    const appStock = ing.available_base_quantity || 0;
    const countRow = counts[ing.id] || { physical: appStock, reason: '' };
    const diff = Number((countRow.physical - appStock).toFixed(3));
    const rate = ing.weighted_average_rate || ing.current_rate;
    const diffVal = Number((diff * rate).toFixed(2));

    return {
      ingredient: ing,
      appStock,
      physicalStock: countRow.physical,
      difference: diff,
      differenceValue: diffVal,
      reason: countRow.reason,
    };
  });

  const totalVariances = auditRows.filter((r) => r.difference !== 0);
  const netVarianceValue = auditRows.reduce((sum, r) => sum + r.differenceValue, 0);

  const handleSaveAudit = async (status: 'draft' | 'approved') => {
    setSuccessMsg(null);
    const items = auditRows.map((r) => ({
      ingredient_id: r.ingredient.id,
      physical_stock: r.physicalStock,
      reason: r.reason.trim() || undefined,
    }));

    try {
      await createCountMutation.mutateAsync({
        count_date: countDate,
        notes: notes.trim() || undefined,
        items,
        status,
      });

      setSuccessMsg(
        status === 'approved'
          ? language === 'hi'
            ? 'भौतिक स्टॉक जांच स्वीकृत हो गई व स्टॉक अपडेट हो गया!'
            : 'Physical count approved and stock adjusted successfully!'
          : language === 'hi'
          ? 'ड्राफ्ट सुरक्षित हो गया!'
          : 'Draft audit saved!'
      );
    } catch (err: any) {
      alert(err.message || 'त्रुटि हुई');
    }
  };

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
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">
              {language === 'hi' ? 'भौतिक स्टॉक मिलान (Physical Stock Check)' : 'Physical Stock Check'}
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              {language === 'hi'
                ? 'ऐप स्टॉक व वास्तविक गिनती का मिलान करें और अंतर को स्वतः सुधारें'
                : 'Audit physical inventory vs app ledger and apply authorized corrections'}
            </p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl">
          <button
            onClick={() => setActiveTab('new_audit')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
              activeTab === 'new_audit' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
            }`}
          >
            {language === 'hi' ? 'नया स्टॉक मिलान' : 'New Audit Sheet'}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
              activeTab === 'history' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
            }`}
          >
            {language === 'hi' ? 'पिछला ऑडिट इतिहास' : 'Audit History'}
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === 'new_audit' ? (
        <div className="space-y-6">
          {/* Controls Card */}
          <Card className="p-4 border-stone-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                ऑडिट दिनांक (Audit Date) <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                value={countDate}
                onChange={(e) => setCountDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                ऑडिट नोट्स / विवरण (Audit Notes)
              </label>
              <input
                type="text"
                placeholder="उदा. मासिक भौतिक स्टॉक सत्यापन (मई माह)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </Card>

          {/* Variance Summary Bar */}
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="w-5 h-5 text-amber-700" />
              <div>
                <p className="text-xs font-bold text-amber-950">
                  कुल अंतर वाले आइटम: {totalVariances.length} / {ingredients.length}
                </p>
                <p className="text-[11px] text-amber-800">
                  {totalVariances.length > 0
                    ? 'कृपया अंतर वाले आइटम्स का कारण (Reason) अवश्य दर्ज करें।'
                    : 'सभी सामग्री सिस्टम स्टॉक से पूर्णतः मेल खा रही है।'}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-stone-500">कुल अंतर मूल्य प्रभाव:</span>
              <p
                className={`text-base font-black ${
                  netVarianceValue < 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {netVarianceValue > 0 ? '+' : ''}
                {formatCurrency(netVarianceValue)}
              </p>
            </div>
          </div>

          {/* Audit Sheet Table */}
          <Card className="p-0 border-stone-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-stone-50 text-stone-600 font-semibold border-b border-stone-200">
                  <tr>
                    <th className="p-3">सामग्री (Ingredient)</th>
                    <th className="p-3 text-right">ऐप स्टॉक (App Stock)</th>
                    <th className="p-3 text-center">वास्तविक गिनती (Physical Count)</th>
                    <th className="p-3 text-right">अंतर (Variance)</th>
                    <th className="p-3 text-right">मूल्य प्रभाव (₹)</th>
                    <th className="p-3">अंतर का कारण (Reason)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {auditRows.map((row) => {
                    const hasDiff = row.difference !== 0;
                    return (
                      <tr
                        key={row.ingredient.id}
                        className={hasDiff ? (row.difference < 0 ? 'bg-rose-50/40' : 'bg-emerald-50/40') : ''}
                      >
                        <td className="p-3 font-medium text-stone-900">
                          <span>{row.ingredient.name_hi}</span>
                          <span className="text-stone-500 ml-1">({row.ingredient.name_en})</span>
                        </td>

                        <td className="p-3 text-right font-bold text-stone-700">
                          {row.appStock} {row.ingredient.base_unit}
                        </td>

                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={row.physicalStock}
                              onChange={(e) =>
                                handlePhysicalCountChange(row.ingredient.id, parseFloat(e.target.value) || 0)
                              }
                              className="w-24 px-2 py-1 text-xs font-bold text-center border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500"
                            />
                            <span className="text-[11px] text-stone-500">{row.ingredient.base_unit}</span>
                          </div>
                        </td>

                        <td
                          className={`p-3 text-right font-black text-xs ${
                            row.difference < 0 ? 'text-rose-700' : row.difference > 0 ? 'text-emerald-700' : 'text-stone-400'
                          }`}
                        >
                          {row.difference > 0 ? '+' : ''}
                          {row.difference} {row.ingredient.base_unit}
                        </td>

                        <td
                          className={`p-3 text-right font-bold ${
                            row.difference < 0 ? 'text-rose-700' : row.difference > 0 ? 'text-emerald-700' : 'text-stone-400'
                          }`}
                        >
                          {formatCurrency(row.differenceValue)}
                        </td>

                        <td className="p-3">
                          <input
                            type="text"
                            placeholder={hasDiff ? 'अंतर का कारण दर्ज करें...' : '—'}
                            value={row.reason}
                            onChange={(e) => handleReasonChange(row.ingredient.id, e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-stone-200 rounded focus:ring-1 focus:ring-amber-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Actions Bar */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSaveAudit('draft')}
                isLoading={createCountMutation.isPending}
              >
                ड्राफ्ट के रूप में सहेजें (Save Draft)
              </Button>

              {isOwner && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSaveAudit('approved')}
                  isLoading={createCountMutation.isPending}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
                >
                  ✓ स्वीकृत करें व स्टॉक सुधारें (Approve & Correct)
                </Button>
              )}
            </div>
          </Card>
        </div>
      ) : (
        /* Past Audits History */
        <Card className="p-0 border-stone-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-50 font-semibold text-stone-600 border-b border-stone-200">
                <tr>
                  <th className="p-3">ऑडिट नंबर</th>
                  <th className="p-3">दिनांक</th>
                  <th className="p-3">विवरण</th>
                  <th className="p-3 text-center">स्थिति</th>
                  <th className="p-3 text-right">कार्य</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {pastCounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-stone-500">
                      अभी कोई पिछला स्टॉक मिलान रिकॉर्ड नहीं है।
                    </td>
                  </tr>
                ) : (
                  pastCounts.map((pc) => (
                    <tr key={pc.id} className="hover:bg-stone-50">
                      <td className="p-3 font-bold text-stone-900">{pc.count_number}</td>
                      <td className="p-3 text-stone-600">{formatDate(pc.count_date)}</td>
                      <td className="p-3 text-stone-700">{pc.notes || '—'}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            pc.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {pc.status === 'approved' ? 'स्वीकृत (Approved)' : 'ड्राफ्ट (Draft)'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[11px]"
                          onClick={() => setSelectedPastCount(pc)}
                        >
                          विवरण देखें
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* View Past Count Modal */}
      <Modal
        isOpen={Boolean(selectedPastCount)}
        onClose={() => setSelectedPastCount(null)}
        title={`ऑडिट विवरण: ${selectedPastCount?.count_number || ''}`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-50 font-semibold text-stone-600 border-b border-stone-200">
                <tr>
                  <th className="p-2.5">सामग्री</th>
                  <th className="p-2.5 text-right">ऐप स्टॉक</th>
                  <th className="p-2.5 text-right">भौतिक स्टॉक</th>
                  <th className="p-2.5 text-right">अंतर</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {selectedPastCount?.items.map((it: any) => (
                  <tr key={it.id}>
                    <td className="p-2.5 font-medium text-stone-900">{it.ingredient?.name_hi}</td>
                    <td className="p-2.5 text-right text-stone-600">{it.app_stock} {it.base_unit}</td>
                    <td className="p-2.5 text-right font-bold text-stone-900">{it.physical_stock} {it.base_unit}</td>
                    <td className={`p-2.5 text-right font-bold ${it.difference_quantity < 0 ? 'text-rose-700' : it.difference_quantity > 0 ? 'text-emerald-700' : 'text-stone-400'}`}>
                      {it.difference_quantity > 0 ? '+' : ''}{it.difference_quantity} {it.base_unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-3 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setSelectedPastCount(null)}>
              बंद करें
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
