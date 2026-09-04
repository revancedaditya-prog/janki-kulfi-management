import React from 'react';
import { Link } from 'react-router-dom';
import { useReorderList, useUpdateReorderItemStatus } from '@/hooks/useInventory';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatIngredientQuantityWithUnit } from '@/lib/inventoryService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import {
  Plus,
  Truck,
  MessageSquare,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';

export const ShoppingListPage: React.FC = () => {
  const { language } = useLanguage();
  const { data: reorderItems = [] } = useReorderList();
  const { data: suppliers = [] } = useSuppliers();
  const updateStatus = useUpdateReorderItemStatus();

  // Group reorder items by supplier
  const supplierGroups = React.useMemo(() => {
    const map = new Map<string, { supplier: any; items: typeof reorderItems }>();

    for (const item of reorderItems) {
      const supId = item.supplier_id || 'unassigned';
      const sup = item.supplier || suppliers.find((s) => s.id === supId);
      const existing = map.get(supId) || {
        supplier: sup || { name: language === 'hi' ? 'अन्य / कोई सप्लायर नहीं' : 'Unassigned / Direct' },
        items: [],
      };
      existing.items.push(item);
      map.set(supId, existing);
    }

    return Array.from(map.values());
  }, [reorderItems, suppliers, language]);

  const handleSendWhatsAppOrder = (supplier: any, items: typeof reorderItems) => {
    const lines = items.map(
      (it) => `• ${it.ingredient?.name_hi || it.ingredient?.name_en}: ${it.suggested_quantity} ${it.base_unit}`
    );
    const text = `*जानकी कुल्फी - कच्चा माल ऑर्डर आवश्यकता*\n\nसप्लायर: ${supplier.name}\n\n${lines.join(
      '\n'
    )}\n\nकृपया जल्द डिलीवरी कराएं। धन्यवाद!`;

    const encoded = encodeURIComponent(text);
    const phone = supplier.phone ? supplier.phone.replace(/\D/g, '') : '';
    const url = phone ? `https://wa.me/91${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-stone-900 tracking-tight">
                {language === 'hi' ? 'पुनःऑर्डर खरीद सूची (Shopping List)' : 'Shopping & Reorder List'}
              </h1>
              <Badge variant="primary" className="font-bold bg-amber-600 text-white">
                {reorderItems.length} {language === 'hi' ? 'आइटम आवश्यक' : 'Items Needed'}
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              {language === 'hi'
                ? 'न्यूनतम स्टॉक सीमा से कम या खत्म सामग्रियों का सप्लायर-वार ऑर्डर'
                : 'Smart low-stock procurement list grouped by vendor with 1-click WhatsApp orders'}
            </p>
          </div>
        </div>

        <Link to="/inventory/purchases/new">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
          >
            + {language === 'hi' ? 'सीधे खरीद दर्ज करें' : 'Record Purchase'}
          </Button>
        </Link>
      </div>

      {reorderItems.length === 0 ? (
        <Card className="p-12 text-center border-stone-200">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-stone-900">
            {language === 'hi' ? 'स्टॉक पर्याप्त है!' : 'All Stock Levels are Healthy!'}
          </h3>
          <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
            {language === 'hi'
              ? 'वर्तमान में किसी भी कच्ची सामग्री का स्टॉक न्यूनतम सीमा से नीचे नहीं है।'
              : 'No ingredients are currently below minimum threshold levels.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {supplierGroups.map((group, idx) => (
            <Card key={idx} className="p-5 border-stone-200 shadow-sm space-y-4">
              {/* Supplier Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-stone-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">{group.supplier.name}</h3>
                    <p className="text-xs text-stone-500">
                      {group.supplier.contact_person && `${group.supplier.contact_person} • `}
                      {group.supplier.phone || 'No phone registered'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<MessageSquare className="w-3.5 h-3.5 text-emerald-600" />}
                    onClick={() => handleSendWhatsAppOrder(group.supplier, group.items)}
                    className="text-xs font-bold text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                  >
                    WhatsApp ऑर्डर भेजें
                  </Button>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-stone-50 font-semibold text-stone-600 border-b border-stone-200">
                    <tr>
                      <th className="p-2.5">सामग्री (Item)</th>
                      <th className="p-2.5 text-right">वर्तमान स्टॉक</th>
                      <th className="p-2.5 text-right">न्यूनतम सीमा</th>
                      <th className="p-2.5 text-right">सुझावित ऑर्डर मात्रा</th>
                      <th className="p-2.5 text-center">ऑर्डर स्थिति</th>
                      <th className="p-2.5 text-right">कार्य</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {group.items.map((it) => {
                      const isOrdered = it.status === 'ordered';
                      const isOut = it.ingredient?.stock_status === 'out_of_stock';

                      return (
                        <tr key={it.id} className="hover:bg-stone-50">
                          <td className="p-2.5">
                            <span className="font-bold text-stone-900 block">
                              {it.ingredient?.name_hi} ({it.ingredient?.name_en})
                            </span>
                            <span className="text-[10px] text-stone-400 font-mono">{it.ingredient?.code}</span>
                          </td>

                          <td className="p-2.5 text-right font-bold text-stone-800">
                            <span className={isOut ? 'text-rose-600' : 'text-amber-700'}>
                              {formatIngredientQuantityWithUnit(
                                it.ingredient?.available_base_quantity || 0,
                                it.base_unit
                              )}
                            </span>
                          </td>

                          <td className="p-2.5 text-right text-stone-500 font-medium">
                            {it.ingredient?.min_stock_level || 0} {it.base_unit}
                          </td>

                          <td className="p-2.5 text-right font-black text-amber-900 text-sm">
                            {it.suggested_quantity} {it.base_unit}
                          </td>

                          <td className="p-2.5 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isOrdered ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {isOrdered ? 'ऑर्डर दिया गया' : 'खरीदना आवश्यक'}
                            </span>
                          </td>

                          <td className="p-2.5 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {isOrdered ? (
                                <button
                                  onClick={() =>
                                    updateStatus.mutate({ ingredientId: it.ingredient_id, status: 'needed' })
                                  }
                                  className="px-2 py-1 text-[11px] font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded cursor-pointer"
                                >
                                  वापस बदलें
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    updateStatus.mutate({ ingredientId: it.ingredient_id, status: 'ordered' })
                                  }
                                  className="px-2 py-1 text-[11px] font-bold text-sky-800 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200 cursor-pointer"
                                >
                                  ✓ ऑर्डर मार्क करें
                                </button>
                              )}

                              <Link to={`/inventory/purchases/new?ingredient_id=${it.ingredient_id}`}>
                                <button className="px-2 py-1 text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 cursor-pointer">
                                  + खरीद
                                </button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
