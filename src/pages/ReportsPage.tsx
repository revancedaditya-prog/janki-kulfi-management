import React, { useState } from 'react';
import { useSellerSettlements } from '@/hooks/useSettlements';
import { useSellers } from '@/hooks/useSellers';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import {
  formatCurrency,
  formatQuantity,
  formatDate,
  getTodayDateString,
} from '@/lib/formatters';
import { BarChart3, Download, Filter } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { data: settlements = [] } = useSellerSettlements();
  const { data: sellers = [] } = useSellers();
  const { t } = useLanguage();

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(getTodayDateString());
  const [selectedSeller, setSelectedSeller] = useState('all');

  const filteredSettlements = settlements.filter((s) => {
    if (s.settlement_date < fromDate || s.settlement_date > toDate) return false;
    if (selectedSeller !== 'all' && s.seller_id !== selectedSeller) return false;
    if (s.status !== 'approved') return false;
    return true;
  });

  // Export to CSV helper
  const exportToCSV = () => {
    const headers = ['Settlement Number', 'Date', 'Seller', 'Gross Sales', 'Commission', 'Received', 'Shortage'];
    const rows = filteredSettlements.map((s) => [
      s.settlement_number,
      s.settlement_date,
      s.seller?.full_name || '',
      s.gross_sales,
      s.total_commission,
      s.total_received,
      s.shortage_amount,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `janki_sales_report_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Aggregations
  const totalGross = filteredSettlements.reduce((sum, s) => sum + s.gross_sales, 0);
  const totalCommission = filteredSettlements.reduce((sum, s) => sum + s.total_commission, 0);
  const totalReceived = filteredSettlements.reduce((sum, s) => sum + s.total_received, 0);
  const totalSoldPieces = filteredSettlements.reduce(
    (sum, s) => sum + s.items.reduce((is, it) => is + it.sold_quantity, 0),
    0
  );

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-maroon-800" />
            {t.reports}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            बिक्री, कमीशन, उत्पाद-वार प्रदर्शन एवं बर्बादी की विस्तृत रिपोर्ट्स
          </p>
        </div>

        <Button
          variant="outline"
          leftIcon={<Download className="w-4 h-4" />}
          onClick={exportToCSV}
        >
          {t.exportCsv}
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 bg-white border-cream-300 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
          <Filter className="w-4 h-4 text-maroon-800" />
          <span>{t.dateRange} एवं फ़िल्टर</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            type="date"
            label={t.from}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <Input
            type="date"
            label={t.to}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-800">
              विक्रेता फ़िल्टर
            </label>
            <select
              value={selectedSeller}
              onChange={(e) => setSelectedSeller(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
            >
              <option value="all">{t.allSellers}</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3.5">
          <span className="text-[11px] font-bold text-gray-500 block">कुल बिकी पीस</span>
          <span className="text-2xl font-black text-maroon-900 font-mono mt-0.5 block">
            {formatQuantity(totalSoldPieces)}
          </span>
          <span className="text-[10px] text-gray-400">{t.pieces}</span>
        </Card>

        <Card className="p-3.5">
          <span className="text-[11px] font-bold text-gray-500 block">{t.grossSales}</span>
          <span className="text-2xl font-black text-gray-900 font-mono mt-0.5 block">
            {formatCurrency(totalGross)}
          </span>
          <span className="text-[10px] text-gray-400">सकल बिक्री</span>
        </Card>

        <Card className="p-3.5">
          <span className="text-[11px] font-bold text-gray-500 block">{t.sellerCommission}</span>
          <span className="text-2xl font-black text-maroon-800 font-mono mt-0.5 block">
            {formatCurrency(totalCommission)}
          </span>
          <span className="text-[10px] text-gray-400">कमीशन भुगतान</span>
        </Card>

        <Card className="p-3.5">
          <span className="text-[11px] font-bold text-gray-500 block">{t.totalCollection}</span>
          <span className="text-2xl font-black text-emerald-800 font-mono mt-0.5 block">
            {formatCurrency(totalReceived)}
          </span>
          <span className="text-[10px] text-gray-400">नकद + UPI</span>
        </Card>
      </div>

      {/* Report Tables */}
      <Card>
        <CardHeader
          title={t.reportDailySales}
          subtitle={`${formatDate(fromDate)} से ${formatDate(toDate)} तक के स्वीकृत हिसाब`}
        />

        {filteredSettlements.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center">{t.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 font-bold">
                  <th className="py-2.5">पर्ची सं.</th>
                  <th className="py-2.5">तारीख</th>
                  <th className="py-2.5">विक्रेता</th>
                  <th className="py-2.5 text-right">सकल बिक्री</th>
                  <th className="py-2.5 text-right">कमीशन</th>
                  <th className="py-2.5 text-right">अपेक्षित वसूली</th>
                  <th className="py-2.5 text-right">प्राप्त राशि</th>
                  <th className="py-2.5 text-right">कमी / उधार</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {filteredSettlements.map((s) => (
                  <tr key={s.id} className="hover:bg-cream-50/50">
                    <td className="py-2.5 font-bold text-maroon-900">{s.settlement_number}</td>
                    <td className="py-2.5 font-sans">{formatDate(s.settlement_date)}</td>
                    <td className="py-2.5 font-sans font-semibold">{s.seller?.full_name}</td>
                    <td className="py-2.5 text-right font-bold">{formatCurrency(s.gross_sales)}</td>
                    <td className="py-2.5 text-right text-maroon-800">{formatCurrency(s.total_commission)}</td>
                    <td className="py-2.5 text-right">{formatCurrency(s.expected_collection)}</td>
                    <td className="py-2.5 text-right font-bold text-emerald-800">{formatCurrency(s.total_received)}</td>
                    <td className="py-2.5 text-right text-rose-700">
                      {s.shortage_amount > 0 ? formatCurrency(s.shortage_amount) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
