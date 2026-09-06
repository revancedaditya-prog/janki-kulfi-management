import React, { useState } from 'react';
import { useSellerSettlements } from '@/hooks/useSettlements';
import { useSellers } from '@/hooks/useSellers';
import { useProfitLossReport } from '@/hooks/useExpenseMaster';
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
import {
  BarChart3,
  Download,
  Filter,
  TrendingUp,
  Calendar,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { data: settlements = [] } = useSellerSettlements();
  const { data: sellers = [] } = useSellers();
  const { t } = useLanguage();

  const [activeReportTab, setActiveReportTab] = useState<'sales' | 'profit_loss'>('profit_loss');

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // Start of current month
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(getTodayDateString());
  const [selectedSeller, setSelectedSeller] = useState('all');

  const { data: pnl, isLoading: isLoadingPnl } = useProfitLossReport(fromDate, toDate);

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

  // Aggregations for Sales Tab
  const totalGross = filteredSettlements.reduce((sum, s) => sum + s.gross_sales, 0);
  const totalCommission = filteredSettlements.reduce((sum, s) => sum + s.total_commission, 0);
  const totalReceived = filteredSettlements.reduce((sum, s) => sum + s.total_received, 0);
  const totalSoldPieces = filteredSettlements.reduce(
    (sum, s) => sum + s.items.reduce((is, it) => is + it.sold_quantity, 0),
    0
  );

  return (
    <div className="space-y-5 pb-20 sm:pb-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-maroon-900 via-maroon-850 to-maroon-800 p-4 sm:p-6 rounded-2xl text-white shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-white/10 backdrop-blur-sm">
              <TrendingUp className="w-6 h-6 text-amber-300" />
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                वित्तीय व लाभ-हानि रिपोर्ट्स (Financial Reports)
              </h2>
              <p className="text-xs sm:text-sm text-cream-200 mt-0.5">
                बिक्री, लागत, मासिक स्थायी खर्च व शुद्ध परिचालन लाभ का सटीक बहीखाता
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="secondary"
          className="bg-amber-400 hover:bg-amber-300 text-maroon-950 font-black shadow-sm min-h-[44px]"
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
          <span>तारीख सीमा एवं फ़िल्टर (Date Range Filter)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            type="date"
            label="तारीख से (From Date)"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <Input
            type="date"
            label="तारीख तक (To Date)"
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

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs sm:text-sm font-bold">
        <button
          onClick={() => setActiveReportTab('profit_loss')}
          className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap min-h-[44px] flex items-center gap-2 ${
            activeReportTab === 'profit_loss'
              ? 'bg-maroon-800 text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-cream-100 border border-cream-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>शुद्ध लाभ-हानि विवरण (Profit & Loss Statement)</span>
        </button>

        <button
          onClick={() => setActiveReportTab('sales')}
          className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap min-h-[44px] flex items-center gap-2 ${
            activeReportTab === 'sales'
              ? 'bg-maroon-800 text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-cream-100 border border-cream-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>दैनिक बिक्री व कमीशन (Sales & Commission)</span>
        </button>
      </div>

      {/* Tab 1: Profit & Loss Statement */}
      {activeReportTab === 'profit_loss' && (
        <div className="space-y-4">
          {isLoadingPnl ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !pnl ? (
            <Card className="p-8 text-center bg-white border-cream-300">
              <AlertCircle className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-gray-700">रिपोर्ट डेटा लोड नहीं हो सका</p>
            </Card>
          ) : (
            <>
              {/* Core Profit Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Revenue */}
                <Card className="p-4 bg-white border-cream-300">
                  <span className="text-[11px] font-bold text-gray-500 block">सकल बिक्री (Gross Sales)</span>
                  <span className="text-2xl font-black text-gray-900 font-mono mt-0.5 block">
                    {formatCurrency(pnl.gross_sales)}
                  </span>
                  <span className="text-[10px] text-gray-400">स्वीकृत ठेला हिसाब</span>
                </Card>

                {/* Direct Production Cost */}
                <Card className="p-4 bg-white border-cream-300">
                  <span className="text-[11px] font-bold text-gray-500 block">उत्पादन खपत लागत (Direct Cost)</span>
                  <span className="text-2xl font-black text-amber-700 font-mono mt-0.5 block">
                    {formatCurrency(pnl.total_production_cost)}
                  </span>
                  <span className="text-[10px] text-amber-600">दूध, खोया, ड्राई फ्रूट्स, LPG</span>
                </Card>

                {/* Operating Fixed Cost */}
                <Card className="p-4 bg-white border-cream-300">
                  <span className="text-[11px] font-bold text-gray-500 block">मासिक स्थायी खर्च (Fixed Exp.)</span>
                  <span className="text-2xl font-black text-rose-700 font-mono mt-0.5 block">
                    {formatCurrency(pnl.confirmed_monthly_fixed_expenses)}
                  </span>
                  <span className="text-[10px] text-rose-600">किराया, वेतन (पुष्टीकृत)</span>
                </Card>

                {/* Net Operating Profit */}
                <Card
                  className={`p-4 border ${
                    pnl.net_operating_profit >= 0
                      ? 'bg-emerald-50/50 border-emerald-300'
                      : 'bg-rose-50/50 border-rose-300'
                  }`}
                >
                  <span className="text-[11px] font-bold text-gray-600 block">
                    शुद्ध परिचालन लाभ (Net Profit)
                  </span>
                  <span
                    className={`text-2xl font-black font-mono mt-0.5 block ${
                      pnl.net_operating_profit >= 0 ? 'text-emerald-900' : 'text-rose-900'
                    }`}
                  >
                    {formatCurrency(pnl.net_operating_profit)}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700">
                    मार्जिन: {pnl.profit_margin_percentage}%
                  </span>
                </Card>
              </div>

              {/* Daily Allocated Fixed Cost & Calculation Formula Box */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card className="p-4 bg-cream-100/60 border-cream-200 md:col-span-1">
                  <span className="text-[11px] font-bold text-maroon-900 block flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-maroon-800" />
                    दैनिक आवंटित स्थायी खर्च (Allocated Fixed Cost)
                  </span>
                  <span className="text-2xl font-black text-maroon-950 font-mono mt-1 block">
                    {formatCurrency(pnl.daily_allocated_fixed_cost)} / दिन
                  </span>
                  <p className="text-[11px] text-gray-600 mt-1">
                    सूत्र: {formatCurrency(pnl.confirmed_monthly_fixed_expenses)} ÷ {pnl.days_in_month} दिन
                  </p>
                </Card>

                <Card className="p-4 bg-white border-cream-300 md:col-span-2 space-y-1.5 text-xs text-gray-700">
                  <div className="flex items-center gap-1.5 font-bold text-gray-900">
                    <HelpCircle className="w-4 h-4 text-maroon-800" />
                    <span>लाभ गणना का नियम (Profit Calculation Transparency):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-gray-600">
                    <li>
                      <strong>सामग्री लागत:</strong> कच्ची सामग्री खरीद और उत्पादन खपत को कभी भी दो बार नहीं गिना जाता (केवल वास्तविक बैच उत्पादन खपत ली जाती है)।
                    </li>
                    <li>
                      <strong>बकाया टेम्पलेट:</strong> जब तक मालिक द्वारा मासिक खर्च का भुगतान दर्ज नहीं किया जाता, वह लाभ से नहीं घटता।
                    </li>
                    <li>
                      <strong>रद्द (Voided) खर्च:</strong> रद्द किए गए रिकॉर्ड लाभ हानि से पूरी तरह बाहर रहते हैं।
                    </li>
                  </ul>
                </Card>
              </div>

              {/* Itemized P&L Table */}
              <Card className="overflow-hidden">
                <CardHeader
                  title="लाभ व हानि विस्तृत ब्योरा (Detailed Statement)"
                  subtitle={`${formatDate(fromDate)} से ${formatDate(toDate)}`}
                />

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 font-bold bg-cream-50/50">
                        <th className="py-3 px-4 text-left">मद (Description)</th>
                        <th className="py-3 px-4 text-left">श्रेणी (Category)</th>
                        <th className="py-3 px-4 text-right">राशि (₹ Amount)</th>
                        <th className="py-3 px-4 text-right">कुल का प्रतिशत</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-mono">
                      {/* Income */}
                      <tr className="bg-emerald-50/20 font-bold">
                        <td className="py-2.5 px-4 font-sans text-gray-900">1. सकल बिक्री आय (Gross Sales Revenue)</td>
                        <td className="py-2.5 px-4 font-sans text-emerald-800">बिक्री (Income)</td>
                        <td className="py-2.5 px-4 text-right text-emerald-900">{formatCurrency(pnl.gross_sales)}</td>
                        <td className="py-2.5 px-4 text-right">100.0%</td>
                      </tr>

                      {/* Direct Costs */}
                      <tr>
                        <td className="py-2.5 px-4 font-sans text-gray-700 pl-8">• सामग्री उत्पादन खपत (Ingredients Consumption)</td>
                        <td className="py-2.5 px-4 font-sans text-gray-500">प्रत्यक्ष उत्पादन लागत</td>
                        <td className="py-2.5 px-4 text-right text-amber-800">
                          - {formatCurrency(pnl.production_ingredient_cost)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-gray-500">
                          {pnl.gross_sales > 0 ? ((pnl.production_ingredient_cost / pnl.gross_sales) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-sans text-gray-700 pl-8">• पैकेजिंग खपत (Packaging Materials)</td>
                        <td className="py-2.5 px-4 font-sans text-gray-500">प्रत्यक्ष उत्पादन लागत</td>
                        <td className="py-2.5 px-4 text-right text-amber-800">
                          - {formatCurrency(pnl.packaging_cost)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-gray-500">
                          {pnl.gross_sales > 0 ? ((pnl.packaging_cost / pnl.gross_sales) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-sans text-gray-700 pl-8">• LPG व ऊर्जा लागत (LPG & Energy Consumption)</td>
                        <td className="py-2.5 px-4 font-sans text-gray-500">प्रत्यक्ष ऊर्जा लागत</td>
                        <td className="py-2.5 px-4 text-right text-amber-800">
                          - {formatCurrency(pnl.lpg_energy_cost)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-gray-500">
                          {pnl.gross_sales > 0 ? ((pnl.lpg_energy_cost / pnl.gross_sales) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>

                      {/* Gross Profit */}
                      <tr className="bg-cream-100/50 font-bold">
                        <td className="py-2.5 px-4 font-sans text-gray-900">2. सकल लाभ (Gross Profit = Revenue − Production Cost)</td>
                        <td className="py-2.5 px-4 font-sans text-gray-700">सकल मार्जिन</td>
                        <td className="py-2.5 px-4 text-right text-gray-900">{formatCurrency(pnl.gross_profit)}</td>
                        <td className="py-2.5 px-4 text-right">
                          {pnl.gross_sales > 0 ? ((pnl.gross_profit / pnl.gross_sales) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>

                      {/* Fixed & Other Expenses */}
                      <tr>
                        <td className="py-2.5 px-4 font-sans text-gray-700 pl-8">• पुष्टीकृत मासिक स्थायी खर्च (Confirmed Fixed Expenses)</td>
                        <td className="py-2.5 px-4 font-sans text-gray-500">किराया, वेतन आदि</td>
                        <td className="py-2.5 px-4 text-right text-rose-700">
                          - {formatCurrency(pnl.confirmed_monthly_fixed_expenses)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-gray-500">
                          {pnl.gross_sales > 0 ? ((pnl.confirmed_monthly_fixed_expenses / pnl.gross_sales) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-sans text-gray-700 pl-8">• अन्य दैनिक परिचालन खर्चे (Other Operating Expenses)</td>
                        <td className="py-2.5 px-4 font-sans text-gray-500">दैनिक खर्चे</td>
                        <td className="py-2.5 px-4 text-right text-rose-700">
                          - {formatCurrency(pnl.other_manual_expenses)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-gray-500">
                          {pnl.gross_sales > 0 ? ((pnl.other_manual_expenses / pnl.gross_sales) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>

                      {/* Net Operating Profit */}
                      <tr className="bg-emerald-100/60 font-black text-sm">
                        <td className="py-3 px-4 font-sans text-emerald-950">
                          3. शुद्ध परिचालन लाभ (Net Operating Profit)
                        </td>
                        <td className="py-3 px-4 font-sans text-emerald-900">अंतिम शुद्ध लाभ</td>
                        <td className="py-3 px-4 text-right text-emerald-950 font-mono">
                          {formatCurrency(pnl.net_operating_profit)}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-900 font-mono">
                          {pnl.profit_margin_percentage}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Tab 2: Sales & Commission Breakdown */}
      {activeReportTab === 'sales' && (
        <div className="space-y-4">
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
      )}
    </div>
  );
};
export default ReportsPage;
