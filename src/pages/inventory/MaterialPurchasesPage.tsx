import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMaterialPurchases, useReverseMaterialPurchase } from '@/hooks/useInventory';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { MaterialPurchaseWithItems } from '@/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import {
  Plus,
  Search,
  Eye,
  RotateCcw,
} from 'lucide-react';

export const MaterialPurchasesPage: React.FC = () => {
  const { language } = useLanguage();
  const { isOwner } = useAuth();
  const { data: purchases = [] } = useMaterialPurchases();
  const reverseMutation = useReverseMaterialPurchase();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<MaterialPurchaseWithItems | null>(null);
  const [purchaseToReverse, setPurchaseToReverse] = useState<MaterialPurchaseWithItems | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseError, setReverseError] = useState<string | null>(null);

  const filteredPurchases = purchases.filter((p) => {
    const matchesSearch =
      p.purchase_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.supplier?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.invoice_number || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const handleConfirmReverse = async () => {
    if (!purchaseToReverse) return;
    setReverseError(null);

    if (!reverseReason.trim()) {
      setReverseError('रिवर्सल का कारण दर्ज करना अनिवार्य है।');
      return;
    }

    try {
      await reverseMutation.mutateAsync({
        purchaseId: purchaseToReverse.id,
        reason: reverseReason.trim(),
      });
      setPurchaseToReverse(null);
      setReverseReason('');
    } catch (err: any) {
      setReverseError(err.message || 'खरीद रिवर्स करने में त्रुटि हुई');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">
              {language === 'hi' ? 'कच्ची सामग्री खरीद (Material Purchases)' : 'Material Purchases'}
            </h1>
            <Badge variant="outline" className="font-bold">
              {purchases.length} {language === 'hi' ? 'खरीदें' : 'Purchases'}
            </Badge>
          </div>
          <p className="text-xs text-stone-600 mt-1">
            {language === 'hi'
              ? 'सप्लायर बिल, भुगतान प्रकार, प्राप्त मात्रा व स्टॉक-इन का विवरण'
              : 'Detailed history of stock-in purchases, supplier invoices & payments'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/inventory">
            <Button variant="outline" size="sm">
              ← {language === 'hi' ? 'इन्वेंटरी डैशबोर्ड' : 'Inventory'}
            </Button>
          </Link>
          <Link to="/inventory/purchases/new">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              + {language === 'hi' ? 'नई खरीद दर्ज करें' : 'New Purchase'}
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter and Search */}
      <Card className="p-4 border-stone-200">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
            <input
              type="text"
              placeholder={language === 'hi' ? 'बिल नंबर / सप्लायर से खोजें...' : 'Search purchase number or supplier...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>
      </Card>

      {/* Purchases Table */}
      <Card className="p-0 border-stone-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-50 text-stone-600 font-semibold border-b border-stone-200">
              <tr>
                <th className="p-3">खरीद नंबर व दिनांक</th>
                <th className="p-3">सप्लायर</th>
                <th className="p-3">सामग्री सूची</th>
                <th className="p-3">भुगतान विधि</th>
                <th className="p-3 text-right">कुल राशि (₹)</th>
                <th className="p-3 text-center">स्थिति</th>
                <th className="p-3 text-right">कार्य</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-stone-500">
                    {language === 'hi' ? 'कोई खरीद रिकॉर्ड नहीं मिला।' : 'No material purchases found.'}
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((p) => {
                  const isReversed = p.status === 'reversed';
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-stone-50/70 transition-colors ${
                        isReversed ? 'bg-rose-50/30 opacity-70' : ''
                      }`}
                    >
                      <td className="p-3">
                        <span className="font-bold text-stone-900 block">{p.purchase_number}</span>
                        <span className="text-[10px] text-stone-500">{formatDate(p.purchase_date)}</span>
                        {p.invoice_number && (
                          <span className="text-[10px] text-amber-800 font-medium block">
                            बिल: {p.invoice_number}
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        <span className="font-medium text-stone-800 block">
                          {p.supplier?.name || (language === 'hi' ? 'अज्ञात सप्लायर' : 'Direct Supplier')}
                        </span>
                        {p.supplier?.phone && (
                          <span className="text-[10px] text-stone-400">{p.supplier.phone}</span>
                        )}
                      </td>

                      <td className="p-3 text-stone-700">
                        <p className="font-medium">
                          {p.items.map((it) => `${it.ingredient?.name_hi || it.ingredient?.name_en || 'आइटम'} (${it.total_received_quantity} ${it.purchase_unit})`).join(', ')}
                        </p>
                      </td>

                      <td className="p-3">
                        <span className="capitalize font-semibold text-stone-700 bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                          {p.payment_method}
                        </span>
                      </td>

                      <td className="p-3 text-right font-black text-stone-900 text-sm">
                        {formatCurrency(p.total_amount)}
                      </td>

                      <td className="p-3 text-center">
                        {isReversed ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            रिवर्स किया गया
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            प्राप्त (Received)
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            title="विवरण देखें"
                            onClick={() => setSelectedPurchase(p)}
                            className="p-1.5 text-stone-700 hover:bg-stone-200 rounded cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {isOwner && !isReversed && (
                            <button
                              title="रिवर्स करें (गलती सुधारें)"
                              onClick={() => {
                                setPurchaseToReverse(p);
                                setReverseReason('');
                                setReverseError(null);
                              }}
                              className="p-1.5 text-rose-700 hover:bg-rose-100 rounded cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
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

      {/* View Purchase Details Modal */}
      <Modal
        isOpen={Boolean(selectedPurchase)}
        onClose={() => setSelectedPurchase(null)}
        title={`खरीद विवरण: ${selectedPurchase?.purchase_number || ''}`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-stone-50 rounded-xl grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-stone-500">दिनांक (Date)</p>
              <p className="font-bold text-stone-900">{formatDate(selectedPurchase?.purchase_date || '')}</p>
            </div>
            <div>
              <p className="text-stone-500">सप्लायर (Supplier)</p>
              <p className="font-bold text-stone-900">{selectedPurchase?.supplier?.name || '—'}</p>
            </div>
            <div>
              <p className="text-stone-500">चालान / बिल नंबर</p>
              <p className="font-bold text-stone-900">{selectedPurchase?.invoice_number || 'N/A'}</p>
            </div>
            <div>
              <p className="text-stone-500">भुगतान (Payment)</p>
              <p className="font-bold text-stone-900 capitalize">{selectedPurchase?.payment_method}</p>
            </div>
          </div>

          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-50 font-semibold text-stone-600 border-b border-stone-200">
                <tr>
                  <th className="p-2.5">सामग्री</th>
                  <th className="p-2.5 text-right">प्राप्त मात्रा</th>
                  <th className="p-2.5 text-right">दर (₹)</th>
                  <th className="p-2.5 text-right">लागत (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {selectedPurchase?.items.map((it) => (
                  <tr key={it.id}>
                    <td className="p-2.5 font-medium text-stone-900">
                      {it.ingredient?.name_hi} ({it.ingredient?.name_en})
                      {it.lot_number && <span className="text-[10px] text-stone-400 block font-mono">Lot: {it.lot_number}</span>}
                    </td>
                    <td className="p-2.5 text-right font-semibold text-stone-700">
                      {it.total_received_quantity} {it.purchase_unit}
                    </td>
                    <td className="p-2.5 text-right text-stone-600">
                      {formatCurrency(it.unit_price)} / {it.purchase_unit}
                    </td>
                    <td className="p-2.5 text-right font-bold text-stone-900">
                      {formatCurrency(it.net_item_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-semibold text-stone-600">कुल बिल राशि:</span>
            <span className="text-base font-black text-stone-900">
              {formatCurrency(selectedPurchase?.total_amount || 0)}
            </span>
          </div>

          <div className="flex justify-end pt-3 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setSelectedPurchase(null)}>
              बंद करें
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reverse Purchase Modal */}
      <Modal
        isOpen={Boolean(purchaseToReverse)}
        onClose={() => setPurchaseToReverse(null)}
        title={`खरीद रिवर्स करें: ${purchaseToReverse?.purchase_number || ''}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
            <p className="font-bold">सावधानी (Reversal Warning):</p>
            <p>
              इस खरीद को रिवर्स करने पर सभी संबंधित सामग्रियां स्टॉक लेजर से घट जाएंगी और संबंधित खर्च रिकॉर्ड निरस्त हो जाएगा।
            </p>
          </div>

          {reverseError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold">
              {reverseError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              रिवर्स करने का कारण <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              placeholder="उदा. गलत बिल प्रविष्टि, सप्लायर को माल वापस"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setPurchaseToReverse(null)}>
              रद्द करें
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmReverse}
              isLoading={reverseMutation.isPending}
            >
              हाँ, खरीद रिवर्स करें
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
