import React, { useState } from 'react';
import {
  useProducts,
  useAdjustFreezerStock,
  useSyncFreezerStock,
  useReconcileFreezerStockCounts,
} from '@/hooks/useProducts';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { formatCurrency, formatQuantity, formatDateTime } from '@/lib/formatters';
import {
  Boxes,
  Edit3,
  Trash2,
  ShieldAlert,
  AlertCircle,
  RefreshCw,
  Scale,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { ProductWithPrice } from '@/types';

export const StockPage: React.FC = () => {
  const { data: products = [] } = useProducts();
  const { data: movements = [] } = useQuery({
    queryKey: ['stock_movements'],
    queryFn: () => api.getStockMovements(),
  });
  const { t, language } = useLanguage();
  const { isOwner, user } = useAuth();
  const adjustStockMutation = useAdjustFreezerStock();
  const syncFreezerStock = useSyncFreezerStock();
  const reconcileMutation = useReconcileFreezerStockCounts();

  // Banner Messages
  const [bannerStatus, setBannerStatus] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string;
  } | null>(null);

  // Reconciliation Dialog State (Owner-Only)
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [reconcileCounts, setReconcileCounts] = useState<Record<string, string>>({});
  const [reconcileReason, setReconcileReason] = useState('दैनिक भौतिक स्टॉक मिलान / भौतिक गणना अनुसार संशोधन');
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [showReconcileConfirm, setShowReconcileConfirm] = useState(false);

  // Single Product Edit State
  const [editingProduct, setEditingProduct] = useState<ProductWithPrice | null>(null);
  const [editNewQty, setEditNewQty] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  // Single Product Reset/Delete State
  const [deletingProduct, setDeletingProduct] = useState<ProductWithPrice | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalStockValue = products.reduce(
    (sum, p) => sum + (p.available_quantity || 0) * (p.current_price || 0),
    0
  );
  const totalStockPieces = products.reduce(
    (sum, p) => sum + (p.available_quantity || 0),
    0
  );

  // 1. Handle Sync Stock
  const handleSyncStock = async () => {
    console.log('[Sync Stock] Started by user:', user?.id);
    try {
      setBannerStatus(null);
      const res = await syncFreezerStock.mutateAsync();
      console.log('[Sync Stock] RPC result:', res);
      const msg = language === 'hi' ? res.message_hi || res.message : res.message;
      setBannerStatus({
        type: 'success',
        message: msg,
      });
      setTimeout(() => setBannerStatus(null), 6000);
    } catch (err: any) {
      console.error('[Sync Stock] Error:', err);
      setBannerStatus({
        type: 'error',
        message: language === 'hi' ? 'स्टॉक सिंक विफल रहा' : 'Stock synchronization failed',
        details: err.message || 'Unknown database error',
      });
    }
  };

  // 2. Open Reconciliation Modal
  const handleOpenReconcileModal = (defaultToZero: boolean = false) => {
    const initialCounts: Record<string, string> = {};
    products.forEach((p) => {
      initialCounts[p.id] = defaultToZero ? '0' : String(p.available_quantity || 0);
    });
    setReconcileCounts(initialCounts);
    setReconcileReason(
      defaultToZero
        ? 'कारखाने का भौतिक स्टॉक शून्य / नया प्रोडक्शन सत्र शुरू करने हेतु रीसेट'
        : 'दैनिक भौतिक स्टॉक मिलान / भौतिक गणना अनुसार संशोधन'
    );
    setReconcileError(null);
    setShowReconcileConfirm(false);
    setShowReconcileModal(true);
  };

  // 3. Submit Multi-Product Reconciliation
  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReconcileError(null);

    if (!reconcileReason.trim()) {
      setReconcileError(language === 'hi' ? 'संशोधन का कारण लिखना अनिवार्य है।' : 'Reason is mandatory.');
      return;
    }

    const payloadCounts: Record<string, number> = {};
    for (const p of products) {
      const valStr = reconcileCounts[p.id];
      const val = parseInt(valStr, 10);
      if (isNaN(val) || val < 0) {
        setReconcileError(
          language === 'hi'
            ? `उत्पाद "${p.name_hi}" के लिए अमान्य संख्या दर्ज की गई है।`
            : `Invalid quantity for product "${p.name_en}".`
        );
        return;
      }
      payloadCounts[p.id] = val;
    }

    if (!showReconcileConfirm) {
      setShowReconcileConfirm(true);
      return;
    }

    console.log('[Stock Reconciliation] Starting RPC with:', {
      counts: payloadCounts,
      reason: reconcileReason,
      userId: user?.id,
    });

    try {
      const res = await reconcileMutation.mutateAsync({
        counts: payloadCounts,
        reason: reconcileReason.trim(),
      });
      console.log('[Stock Reconciliation] RPC Success:', res);
      setShowReconcileModal(false);
      setShowReconcileConfirm(false);
      setBannerStatus({
        type: 'success',
        message:
          language === 'hi'
            ? '✅ भौतिक स्टॉक सफलतापूर्वक मिलान व अपडेट कर दिया गया!'
            : '✅ Stock reconciliation successfully applied!',
        details: `${res.total_adjusted_products || 0} products adjusted.`,
      });
      setTimeout(() => setBannerStatus(null), 6000);
    } catch (err: any) {
      console.error('[Stock Reconciliation] Error:', err);
      setReconcileError(err.message || 'स्टॉक मिलान करने में त्रुटि हुई');
      setBannerStatus({
        type: 'error',
        message: language === 'hi' ? 'स्टॉक मिलान विफल रहा' : 'Stock reconciliation failed',
        details: err.message || 'Unknown database error',
      });
    }
  };

  // 4. Single Product Edit
  const handleOpenEdit = (prod: ProductWithPrice) => {
    setEditingProduct(prod);
    setEditNewQty(String(prod.available_quantity || 0));
    setEditReason('');
    setEditError(null);
    setShowEditConfirm(false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const newQty = parseInt(editNewQty, 10);
    if (isNaN(newQty) || newQty < 0) {
      setEditError('कृपया सही स्टॉक मात्रा (0 या अधिक) दर्ज करें।');
      return;
    }

    if (!editReason.trim()) {
      setEditError('स्टॉक में बदलाव का कारण (Reason / Remark) लिखना अनिवार्य है।');
      return;
    }

    if (!showEditConfirm) {
      setShowEditConfirm(true);
      return;
    }

    try {
      await adjustStockMutation.mutateAsync({
        productId: editingProduct.id,
        newQuantity: newQty,
        reason: editReason.trim(),
      });
      setEditingProduct(null);
      setShowEditConfirm(false);
      setBannerStatus({
        type: 'success',
        message: language === 'hi' ? '✅ स्टॉक सफलतापूर्वक अपडेट हुआ!' : '✅ Stock updated!',
      });
      setTimeout(() => setBannerStatus(null), 4000);
    } catch (err: any) {
      setEditError(err.message || 'स्टॉक संशोधित करने में त्रुटि हुई');
    }
  };

  // 5. Single Product Reset to 0
  const handleOpenDelete = (prod: ProductWithPrice) => {
    setDeletingProduct(prod);
    setDeleteReason('स्टॉक 0 किया गया');
    setDeleteError(null);
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingProduct) return;

    if (!deleteReason.trim()) {
      setDeleteError('स्टॉक 0 करने का कारण (Reason) लिखना अनिवार्य है।');
      return;
    }

    try {
      await adjustStockMutation.mutateAsync({
        productId: deletingProduct.id,
        newQuantity: 0,
        reason: deleteReason.trim(),
      });
      setDeletingProduct(null);
      setBannerStatus({
        type: 'success',
        message: language === 'hi' ? '✅ स्टॉक 0 pcs कर दिया गया!' : '✅ Stock set to 0 pcs!',
      });
      setTimeout(() => setBannerStatus(null), 4000);
    } catch (err: any) {
      setDeleteError(err.message || 'स्टॉक हटाने में त्रुटि हुई');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Boxes className="w-6 h-6 text-maroon-800" />
            {t.freezerStock}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            मुख्य कोल्ड स्टोरेज फ्रीजर (Main Cold Storage Freezer) में उपलब्ध कुल्फी स्टॉक एवं सम्पूर्ण स्टॉक बहीखाता (Ledger)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Sync Stock Button */}
          <Button
            type="button"
            variant="outline"
            leftIcon={
              <RefreshCw
                className={`w-4 h-4 text-emerald-800 ${syncFreezerStock.isPending ? 'animate-spin' : ''}`}
              />
            }
            className="border-emerald-700 text-emerald-900 font-bold hover:bg-emerald-50 text-xs py-2"
            onClick={handleSyncStock}
            disabled={syncFreezerStock.isPending}
          >
            {syncFreezerStock.isPending
              ? (language === 'hi' ? 'सिंक हो रहा है...' : 'Syncing...')
              : (language === 'hi' ? '🔄 स्टॉक सिंक करें' : '🔄 Sync Stock')}
          </Button>

          {/* Owner Stock Reconciliation & Reset Button */}
          {isOwner && (
            <Button
              type="button"
              variant="outline"
              leftIcon={<Scale className="w-3.5 h-3.5 text-indigo-700" />}
              className="border-indigo-300 text-indigo-900 font-bold hover:bg-indigo-50 text-xs py-2"
              onClick={() => handleOpenReconcileModal(false)}
              disabled={reconcileMutation.isPending}
            >
              {language === 'hi' ? '⚖️ स्टॉक मिलान / सुलह' : '⚖️ Reconcile Stock'}
            </Button>
          )}

          {isOwner && totalStockPieces > 0 && (
            <Button
              type="button"
              variant="outline"
              leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-700" />}
              className="border-rose-300 text-rose-800 font-bold hover:bg-rose-50 text-xs py-2"
              onClick={() => handleOpenReconcileModal(true)}
              disabled={reconcileMutation.isPending}
            >
              {language === 'hi' ? '🗑️ सभी स्टॉक 0 करें' : '🗑️ Reset All to 0'}
            </Button>
          )}

          <div className="bg-white px-4 py-2 rounded-2xl border border-cream-300 shadow-sm text-right">
            <span className="text-[10px] font-bold text-gray-500 block">कुल स्टॉक पीस</span>
            <span className="text-lg font-black text-emerald-800 font-mono">
              {formatQuantity(totalStockPieces)} pcs
            </span>
          </div>
          <div className="bg-white px-4 py-2 rounded-2xl border border-cream-300 shadow-sm text-right">
            <span className="text-[10px] font-bold text-gray-500 block">कुल फ्रीजर स्टॉक मूल्य</span>
            <span className="text-lg font-black text-maroon-900 font-mono">
              {formatCurrency(totalStockValue)}
            </span>
          </div>
        </div>
      </div>

      {/* Visible Status Banner (Bilingual) */}
      {bannerStatus && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-bold flex items-start justify-between shadow-sm animate-fade-in ${
            bannerStatus.type === 'success'
              ? 'bg-emerald-50 border border-emerald-300 text-emerald-950'
              : 'bg-rose-50 border border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {bannerStatus.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-700 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-sm font-black">{bannerStatus.message}</p>
              {bannerStatus.details && (
                <p className="font-mono text-[11px] font-normal text-gray-700 mt-0.5 break-all">
                  {bannerStatus.details}
                </p>
              )}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs font-bold"
            onClick={() => setBannerStatus(null)}
          >
            ✕
          </Button>
        </div>
      )}

      {/* Stock Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {products.map((prod) => {
          const availQty = prod.available_quantity || 0;
          const isLowStock = availQty < 50 && availQty > 0;
          const isOutOfStock = availQty === 0;

          return (
            <Card
              key={prod.id}
              className="bg-gradient-to-br from-white to-cream-50/50 border-cream-300 relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold text-gray-500">{prod.sku}</span>
                      <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        Main Freezer
                      </span>
                    </div>
                    <h3 className="text-base font-black text-maroon-950 mt-1">
                      {language === 'hi' ? prod.name_hi : prod.name_en}
                    </h3>
                    <span className="text-xs font-semibold text-gray-600 block mt-0.5">
                      दर: {formatCurrency(prod.current_price)} / piece
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-3xl font-black font-mono text-maroon-900 block tracking-tight">
                      {formatQuantity(availQty)}
                    </span>
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        isOutOfStock ? 'text-rose-700' : isLowStock ? 'text-amber-700' : 'text-emerald-800'
                      }`}
                    >
                      {isOutOfStock ? 'आउट ऑफ स्टॉक' : isLowStock ? 'कम स्टॉक' : `${t.pieces} उपलब्ध`}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-cream-200 flex justify-between text-xs font-semibold text-gray-600">
                  <span>स्टॉक मूल्य:</span>
                  <span className="font-mono font-bold text-gray-900">
                    {formatCurrency(availQty * (prod.current_price || 0))}
                  </span>
                </div>
              </div>

              {/* Owner Action Buttons */}
              {isOwner && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs text-indigo-800 border-indigo-200 hover:bg-indigo-50"
                    leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                    onClick={() => handleOpenEdit(prod)}
                  >
                    संशोधन करें (Edit)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs text-rose-800 border-rose-200 hover:bg-rose-50"
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => handleOpenDelete(prod)}
                    disabled={availQty === 0}
                  >
                    हटाएं (0 करें)
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Stock Movements Ledger Table */}
      <Card>
        <CardHeader
          title={t.reportStockLedger}
          subtitle="प्रत्येक आवक और जावक का आधिकारिक बहीखाता (Authoritative Inventory Ledger)"
        />

        {movements.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center">{t.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 font-bold">
                  <th className="py-2.5">समय व तारीख</th>
                  <th className="py-2.5">उत्पाद</th>
                  <th className="py-2.5">प्रकार (Type)</th>
                  <th className="py-2.5 text-right">मात्रा (Pieces)</th>
                  <th className="py-2.5">विवरण (Notes)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {movements.map((m) => {
                  const prod = products.find((p) => p.id === m.product_id);
                  const isIncoming =
                    m.movement_type === 'production_completed' ||
                    m.movement_type === 'seller_returned' ||
                    m.movement_type === ('issue_reversal' as any) ||
                    ((m.movement_type as any) === 'inventory_adjustment' && m.notes?.includes('(+')) ||
                    ((m.movement_type as any) === 'manual_adjustment' && m.notes?.includes('(+'));

                  return (
                    <tr key={m.id} className="hover:bg-cream-50/50">
                      <td className="py-2.5 font-sans text-gray-600">
                        {formatDateTime(m.movement_date)}
                      </td>
                      <td className="py-2.5 font-sans font-bold text-gray-900">
                        {prod ? (language === 'hi' ? prod.name_hi : prod.name_en) : 'Product'}
                      </td>
                      <td className="py-2.5 font-sans">
                        <Badge variant={isIncoming ? 'completed' : 'draft'}>
                          {m.movement_type}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right font-black">
                        <span className={isIncoming ? 'text-emerald-800' : 'text-rose-800'}>
                          {isIncoming ? `+${m.quantity}` : `-${m.quantity}`}
                        </span>
                      </td>
                      <td className="py-2.5 font-sans text-gray-600">{m.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Safe Owner-Only Stock Reconciliation Dialog */}
      {showReconcileModal && (
        <Modal
          isOpen={true}
          onClose={() => {
            if (!reconcileMutation.isPending) {
              setShowReconcileModal(false);
              setShowReconcileConfirm(false);
            }
          }}
          title={
            language === 'hi'
              ? '⚖️ भौतिक स्टॉक मिलान व सुलह (Physical Stock Reconciliation)'
              : '⚖️ Physical Stock Reconciliation'
          }
        >
          <form onSubmit={handleReconcileSubmit} className="space-y-4">
            {reconcileError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                <span>{reconcileError}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs bg-cream-50 p-2.5 rounded-xl border border-cream-200">
              <span className="font-bold text-gray-700">त्वरित विकल्प:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-2 py-1 bg-white border border-rose-300 rounded text-rose-800 font-bold hover:bg-rose-50"
                  onClick={() => {
                    const zeros: Record<string, string> = {};
                    products.forEach((p) => {
                      zeros[p.id] = '0';
                    });
                    setReconcileCounts(zeros);
                    setShowReconcileConfirm(false);
                  }}
                >
                  सबको 0 करें (Set All 0)
                </button>
                <button
                  type="button"
                  className="px-2 py-1 bg-white border border-indigo-300 rounded text-indigo-800 font-bold hover:bg-indigo-50"
                  onClick={() => {
                    const sys: Record<string, string> = {};
                    products.forEach((p) => {
                      sys[p.id] = String(p.available_quantity || 0);
                    });
                    setReconcileCounts(sys);
                    setShowReconcileConfirm(false);
                  }}
                >
                  सिस्टम स्टॉक भरें (Copy System)
                </button>
              </div>
            </div>

            {/* Product Stock Table / Rows */}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {products.map((prod) => {
                const currentQty = prod.available_quantity || 0;
                const enteredVal = parseInt(reconcileCounts[prod.id] ?? '', 10);
                const diff = !isNaN(enteredVal) ? enteredVal - currentQty : 0;

                return (
                  <div
                    key={prod.id}
                    className="p-3 bg-white rounded-xl border border-gray-200 space-y-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-mono font-bold text-gray-500 block">
                          {prod.sku}
                        </span>
                        <span className="text-sm font-black text-gray-900">
                          {language === 'hi' ? prod.name_hi : prod.name_en}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-gray-500 block">सिस्टम स्टॉक:</span>
                        <span className="text-sm font-black font-mono text-gray-800">
                          {currentQty} pcs
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 items-center pt-2 border-t border-gray-100">
                      <div>
                        <label className="text-[11px] font-bold text-gray-700 block mb-1">
                          वास्तविक भौतिक गिनती (Actual Pcs)
                        </label>
                        <input
                          type="number"
                          min="0"
                          className="w-full px-3 py-1.5 text-xs font-mono font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                          value={reconcileCounts[prod.id] ?? ''}
                          onChange={(e) => {
                            setReconcileCounts({
                              ...reconcileCounts,
                              [prod.id]: e.target.value,
                            });
                            setShowReconcileConfirm(false);
                          }}
                          required
                        />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-gray-500 block mb-1">
                          समायोजन अंतर (Difference)
                        </span>
                        <div
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-center ${
                            diff > 0
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : diff < 0
                              ? 'bg-rose-100 text-rose-900 border border-rose-300'
                              : 'bg-gray-100 text-gray-700 border border-gray-200'
                          }`}
                        >
                          {diff > 0 ? `+${diff} pcs (वृद्धि)` : diff < 0 ? `${diff} pcs (कमी)` : '0 pcs (समान)'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                संशोधन / मिलान का अनिवार्य कारण (Reason) <span className="text-rose-600">*</span>
              </label>
              <textarea
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                rows={2}
                placeholder="उदा. भौतिक गिनती में कमी पाई गई / नया उत्पादन सत्र शुरू करने हेतु रीसेट"
                value={reconcileReason}
                onChange={(e) => {
                  setReconcileReason(e.target.value);
                  setShowReconcileConfirm(false);
                }}
                required
              />
            </div>

            {/* Confirmation Alert */}
            {showReconcileConfirm && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-2">
                <p className="font-bold flex items-center gap-1.5 text-sm text-amber-900">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  कृपया स्टॉक समायोजन की पुष्टि करें:
                </p>
                <div className="bg-white/80 p-2 rounded-lg border border-amber-200 text-[11px] font-mono space-y-1">
                  {products.map((p) => {
                    const cur = p.available_quantity || 0;
                    const next = parseInt(reconcileCounts[p.id] ?? '', 10) || 0;
                    const diff = next - cur;
                    return (
                      <div key={p.id} className="flex justify-between">
                        <span className="font-sans font-medium">
                          {language === 'hi' ? p.name_hi : p.name_en}:
                        </span>
                        <span className="font-bold">
                          {cur} pcs ➔ {next} pcs ({diff >= 0 ? `+${diff}` : `${diff}`} pcs)
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-600">
                  पुराना रिकॉर्ड सुरक्षित रहेगा। बहीखाता (Ledger) में समायोजन प्रविष्टियां दर्ज की जाएंगी।
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowReconcileModal(false);
                  setShowReconcileConfirm(false);
                }}
                disabled={reconcileMutation.isPending}
              >
                रद्द करें
              </Button>
              <Button
                type="submit"
                variant={showReconcileConfirm ? 'danger' : 'primary'}
                isLoading={reconcileMutation.isPending}
                disabled={reconcileMutation.isPending}
              >
                {showReconcileConfirm ? 'हाँ, स्टॉक मिलान सुरक्षित करें' : 'समीक्षा व पुष्टि करें'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Owner Single Edit Stock Modal */}
      {editingProduct && (
        <Modal
          isOpen={true}
          onClose={() => {
            setEditingProduct(null);
            setShowEditConfirm(false);
          }}
          title={`फ्रीजर स्टॉक संशोधन - ${language === 'hi' ? editingProduct.name_hi : editingProduct.name_en}`}
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {editError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                <span>{editError}</span>
              </div>
            )}

            <div className="bg-cream-50 p-3 rounded-xl border border-cream-200 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500 font-medium block">वर्तमान फ्रीजर स्टॉक:</span>
                <span className="text-base font-black text-maroon-900 font-mono">
                  {editingProduct.available_quantity || 0} pcs
                </span>
              </div>
              <div>
                <span className="text-gray-500 font-medium block">नया प्रस्तावित स्टॉक:</span>
                <span className="text-base font-black text-indigo-900 font-mono">
                  {parseInt(editNewQty, 10) || 0} pcs
                </span>
              </div>
            </div>

            <Input
              label="नया स्टॉक (Pieces)"
              type="number"
              min="0"
              value={editNewQty}
              onChange={(e) => {
                setEditNewQty(e.target.value);
                setShowEditConfirm(false);
              }}
              required
            />

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                संशोधन का कारण (Reason / Remark) <span className="text-rose-600">*</span>
              </label>
              <textarea
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-maroon-800 focus:outline-none"
                rows={2}
                placeholder="उदा. भौतिक गणना अनुसार संशोधन"
                value={editReason}
                onChange={(e) => {
                  setEditReason(e.target.value);
                  setShowEditConfirm(false);
                }}
                required
              />
            </div>

            {showEditConfirm && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  कृपया संशोधन की पुष्टि करें:
                </p>
                <p className="mt-1">
                  मुख्य फ्रीजर में <strong>{editingProduct.available_quantity || 0} pcs</strong> को बदलकर <strong>{editNewQty} pcs</strong> किया जाएगा।
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingProduct(null);
                  setShowEditConfirm(false);
                }}
              >
                रद्द करें
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={adjustStockMutation.isPending}
              >
                {showEditConfirm ? 'हाँ, स्टॉक अपडेट करें' : 'समीक्षा व सुरक्षित करें'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Owner Single Product Delete Modal */}
      {deletingProduct && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingProduct(null)}
          title="फ्रीजर स्टॉक 0 करें"
        >
          <form onSubmit={handleDeleteSubmit} className="space-y-4">
            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-950">
                <Trash2 className="w-5 h-5 text-rose-700" />
                <span>क्या आप यह स्टॉक 0 pcs करना चाहते हैं?</span>
              </div>
              <p>
                उत्पाद: <strong>{language === 'hi' ? deletingProduct.name_hi : deletingProduct.name_en} ({deletingProduct.sku})</strong>
              </p>
              <p>
                वर्तमान स्टॉक: <strong className="text-base text-rose-950 font-mono">{deletingProduct.available_quantity || 0} pcs</strong>
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                कारण (Reason) <span className="text-rose-600">*</span>
              </label>
              <textarea
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-800 focus:outline-none"
                rows={2}
                placeholder="उदा. भौतिक स्टॉक शून्य किया गया"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingProduct(null)}
              >
                रद्द करें
              </Button>
              <Button
                type="submit"
                variant="danger"
                isLoading={adjustStockMutation.isPending}
              >
                हाँ, 0 pcs करें
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
