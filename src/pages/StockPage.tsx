import React from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card, CardHeader } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { formatCurrency, formatQuantity, formatDateTime } from '@/lib/formatters';
import { Boxes } from 'lucide-react';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export const StockPage: React.FC = () => {
  const { data: products = [] } = useProducts();
  const { data: movements = [] } = useQuery({
    queryKey: ['stock_movements'],
    queryFn: () => api.getStockMovements(),
  });
  const { t, language } = useLanguage();

  const totalStockValue = products.reduce(
    (sum, p) => sum + (p.available_quantity || 0) * (p.current_price || 0),
    0
  );

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
            मुख्य कोल्ड स्टोरेज फ्रीजर में उपलब्ध कुल्फी स्टॉक एवं सम्पूर्ण स्टॉक बहीखाता (Ledger)
          </p>
        </div>

        <div className="bg-white px-4 py-2 rounded-2xl border border-cream-300 shadow-sm text-right">
          <span className="text-[10px] font-bold text-gray-500 block">कुल फ्रीजर स्टॉक मूल्य</span>
          <span className="text-lg font-black text-maroon-900 font-mono">
            {formatCurrency(totalStockValue)}
          </span>
        </div>
      </div>

      {/* Stock Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {products.map((prod) => (
          <Card key={prod.id} className="bg-gradient-to-br from-white to-cream-50/50 border-cream-300">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-xs font-bold text-gray-500">{prod.sku}</span>
                <h3 className="text-base font-black text-maroon-950 mt-0.5">
                  {language === 'hi' ? prod.name_hi : prod.name_en}
                </h3>
                <span className="text-xs text-gray-500">
                  {formatCurrency(prod.current_price)} / piece
                </span>
              </div>

              <div className="text-right">
                <span className="text-3xl font-black font-mono text-maroon-900 block tracking-tight">
                  {formatQuantity(prod.available_quantity || 0)}
                </span>
                <span className="text-[11px] font-bold text-emerald-800 uppercase">
                  {t.pieces} उपलब्ध
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-cream-200 flex justify-between text-xs font-semibold text-gray-600">
              <span>स्टॉक मूल्य:</span>
              <span className="font-mono font-bold text-gray-900">
                {formatCurrency((prod.available_quantity || 0) * (prod.current_price || 0))}
              </span>
            </div>
          </Card>
        ))}
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
                    m.movement_type === 'production_completed' || m.movement_type === 'seller_returned';

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
    </div>
  );
};
