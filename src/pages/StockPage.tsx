import React, { useState } from 'react';
import { useProducts, useAdjustFreezerStock, useSyncFreezerStock, useResetAllFreezerStock } from '@/hooks/useProducts';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { formatCurrency, formatQuantity, formatDateTime } from '@/lib/formatters';
import { Boxes, Edit3, Trash2, ShieldAlert, AlertCircle, RefreshCw } from 'lucide-react';
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
  const { isOwner } = useAuth();
  const adjustStockMutation = useAdjustFreezerStock();
  const syncFreezerStock = useSyncFreezerStock();
  const resetAllStockMutation = useResetAllFreezerStock();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Reset All Stock State
  const [showResetAllModal, setShowResetAllModal] = useState(false);
  const [resetAllReason, setResetAllReason] = useState('कारखाने का भौतिक स्टॉक शून्य / नया प्रोडक्शन शुरू करने हेतु रीसेट');
  const [resetAllError, setResetAllError] = useState<string | null>(null);

  const handleSyncStock = async () => {
    try {
      setSyncMessage(language === 'hi' ? 'सिंक्रोनाइज़ हो रहा है...' : 'Syncing stock...');
      await syncFreezerStock.mutateAsync();
      setSyncMessage(language === 'hi' ? '✅ फ्रीजर स्टॉक और उत्पादन बैच पूर्णतः सिंक हो गए!' : '✅ Stock & Batches fully synced!');
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err: any) {
      setSyncMessage(`❌ ${err.message || 'Sync failed'}`);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const handleResetAllSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetAllReason.trim()) {
      setResetAllError('कृपया कारण दर्ज करें।');
      return;
    }
    try {
      await resetAllStockMutation.mutateAsync(resetAllReason.trim());
      setShowResetAllModal(false);
      setSyncMessage(language === 'hi' ? '✅ सभी उत्पादों का फ्रीजर स्टॉक सफलतापूर्वक 0 pcs कर दिया गया।' : '✅ All freezer stock reset to 0 pcs.');
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err: any) {
      setResetAllError(err.message || 'स्टॉक रीसेट करने में त्रुटि हुई');
    }
  };

  // Edit Stock State
  const [editingProduct, setEditingProduct] = useState<ProductWithPrice | null>(null);
  const [editNewQty, setEditNewQty] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  // Delete / Reset Stock State
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

  // Open Edit Modal
  const handleOpenEdit = (prod: ProductWithPrice) => {
    setEditingProduct(prod);
    setEditNewQty(String(prod.available_quantity || 0));
    setEditReason('');
    setEditError(null);
    setShowEditConfirm(false);
  };

  // Submit Edit Stock
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
    } catch (err: any) {
      setEditError(err.message || 'स्टॉक संशोधित करने में त्रुटि हुई');
    }
  };

  // Open Delete / Reset Modal
  const handleOpenDelete = (prod: ProductWithPrice) => {
    setDeletingProduct(prod);
    setDeleteReason('');
    setDeleteError(null);
  };

  // Submit Delete / Reset Stock
  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingProduct) return;

    if (!deleteReason.trim()) {
      setDeleteError('स्टॉक हटाने / शून्य करने का कारण (Reason) लिखना अनिवार्य है।');
      return;
    }

    try {
      await adjustStockMutation.mutateAsync({
        productId: deletingProduct.id,
        newQuantity: 0,
        reason: deleteReason.trim(),
      });
      setDeletingProduct(null);
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
          <Button
            variant="outline"
            leftIcon={<RefreshCw className={`w-4 h-4 text-emerald-800 ${syncFreezerStock.isPending ? 'animate-spin' : ''}`} />}
            className="border-emerald-700 text-emerald-900 font-bold hover:bg-emerald-50 text-xs py-2"
            onClick={handleSyncStock}
            disabled={syncFreezerStock.isPending}
          >
            {syncFreezerStock.isPending
              ? (language === 'hi' ? 'सिंक हो रहा है...' : 'Syncing...')
              : (language === 'hi' ? '🔄 स्टॉक सिंक करें' : '🔄 Sync Stock')}
          </Button>

          {isOwner && totalStockPieces > 0 && (
            <Button
              variant="outline"
              leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-700" />}
              className="border-rose-300 text-rose-800 font-bold hover:bg-rose-50 text-xs py-2"
              onClick={() => {
                setShowResetAllModal(true);
                setResetAllError(null);
              }}
              disabled={resetAllStockMutation.isPending}
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


      {/* Sync Status Banner */}
      {syncMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-900 flex items-center justify-between shadow-sm animate-fade-in">
          <span>{syncMessage}</span>
          <Button size="sm" variant="ghost" className="text-emerald-800 h-6 px-2 text-[10px]" onClick={() => setSyncMessage(null)}>
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
            <Card key={prod.id} className="bg-gradient-to-br from-white to-cream-50/50 border-cream-300 relative flex flex-col justify-between">
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
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${
                      isOutOfStock ? 'text-rose-700' : isLowStock ? 'text-amber-700' : 'text-emerald-800'
                    }`}>
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
                    variant="outline"
                    size="sm"
                    className="text-xs text-indigo-800 border-indigo-200 hover:bg-indigo-50"
                    leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                    onClick={() => handleOpenEdit(prod)}
                  >
                    संशोधन करें (Edit)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-rose-800 border-rose-200 hover:bg-rose-50"
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => handleOpenDelete(prod)}
                    disabled={availQty === 0}
                  >
                    हटाएं (Delete)
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

      {/* Owner Edit Stock Modal */}
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

            {/* Calculated Difference Badge */}
            {(() => {
              const current = editingProduct.available_quantity || 0;
              const next = parseInt(editNewQty, 10);
              if (!isNaN(next)) {
                const diff = next - current;
                return (
                  <div className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between ${
                    diff > 0 ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' :
                    diff < 0 ? 'bg-rose-50 text-rose-900 border border-rose-200' :
                    'bg-gray-50 text-gray-800 border border-gray-200'
                  }`}>
                    <span>स्टॉक समायोजन (Difference):</span>
                    <span className="text-sm font-mono font-black">
                      {diff > 0 ? `+${diff} pcs (स्टॉक वृद्धि)` : diff < 0 ? `${diff} pcs (स्टॉक कमी)` : '0 pcs (कोई बदलाव नहीं)'}
                    </span>
                  </div>
                );
              }
              return null;
            })()}

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
                placeholder="उदा. भौतिक गिनती में 20 पीस कम पाए गए / गलती से गलत संख्या दर्ज हो गई थी"
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
                  मुख्य फ्रीजर में <strong>{editingProduct.available_quantity || 0} pcs</strong> को बदलकर <strong>{editNewQty} pcs</strong> किया जाएगा। यह कार्रवाई स्टॉक बहीखाता (Ledger) में दर्ज होगी।
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

      {/* Owner Delete / Reset Stock Modal */}
      {deletingProduct && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingProduct(null)}
          title="फ्रीजर स्टॉक हटाएं / शून्य करें"
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
                <span>क्या आप यह स्टॉक हटाना चाहते हैं?</span>
              </div>
              <p>
                उत्पाद: <strong>{language === 'hi' ? deletingProduct.name_hi : deletingProduct.name_en} ({deletingProduct.sku})</strong>
              </p>
              <p>
                वर्तमान स्टॉक: <strong className="text-base text-rose-950 font-mono">{deletingProduct.available_quantity || 0} pcs</strong>
              </p>
              <p className="text-gray-600">
                यह कार्रवाई वर्तमान उपलब्ध स्टॉक को सुरक्षित रूप से घटाकर <strong>0 pcs</strong> कर देगी और बहीखाता (Ledger) में पूर्ण ऑडिट रिकॉर्ड रखेगी।
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                हटाने का कारण (Reason) <span className="text-rose-600">*</span>
              </label>
              <textarea
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-800 focus:outline-none"
                rows={2}
                placeholder="उदा. स्टॉक खराब होने के कारण फेंक दिया गया / बैच रद्द कर दिया गया"
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
                हाँ, स्टॉक 0 करें (Reset to 0)
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Owner Reset All Stock Modal */}
      {showResetAllModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowResetAllModal(false)}
          title="सभी उत्पादों का फ्रीजर स्टॉक 0 करें (Reset All Stock to 0)"
        >
          <form onSubmit={handleResetAllSubmit} className="space-y-4">
            {resetAllError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                <span>{resetAllError}</span>
              </div>
            )}

            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-950">
                <Trash2 className="w-5 h-5 text-rose-700" />
                <span>क्या आप सभी कुल्फी स्टॉक को 0 pcs करना चाहते हैं?</span>
              </div>
              <p>
                कुल वर्तमान स्टॉक: <strong className="text-base text-rose-950 font-mono">{formatQuantity(totalStockPieces)} pcs ({formatCurrency(totalStockValue)})</strong>
              </p>
              <div className="bg-white/80 p-2.5 rounded-lg border border-rose-200 space-y-1 font-mono text-[11px]">
                {products.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span className="font-sans font-medium">{language === 'hi' ? p.name_hi : p.name_en}:</span>
                    <span className="font-bold text-rose-900">{p.available_quantity || 0} pcs ➔ 0 pcs</span>
                  </div>
                ))}
              </div>
              <p className="text-gray-600">
                यह कार्रवाई सभी उत्पादों के उपलब्ध स्टॉक को बहीखाता (Ledger) में समायोजन (Adjustment) प्रविष्टियां डालकर <strong>0 pcs</strong> कर देगी।
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                रीसेट करने का कारण (Reason) <span className="text-rose-600">*</span>
              </label>
              <textarea
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-800 focus:outline-none"
                rows={2}
                placeholder="उदा. कारखाने का भौतिक स्टॉक शून्य / नया प्रोडक्शन शुरू करने हेतु रीसेट"
                value={resetAllReason}
                onChange={(e) => setResetAllReason(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowResetAllModal(false)}
              >
                रद्द करें
              </Button>
              <Button
                type="submit"
                variant="danger"
                isLoading={resetAllStockMutation.isPending}
              >
                हाँ, सभी स्टॉक 0 करें (Reset All to 0)
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
