import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '@/hooks/useDashboard';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { formatCurrency, formatQuantity, formatDate } from '@/lib/formatters';
import {
  Factory,
  Truck,
  Receipt,
  Wallet,
  CalendarCheck,
  AlertTriangle,
  Boxes,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

export const DashboardPage: React.FC = () => {
  const { data: summary, isLoading } = useDashboard();
  const { t, language } = useLanguage();
  const { isOwner, isProduction } = useAuth();
  const navigate = useNavigate();

  if (isLoading || !summary) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-gray-600">{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Banner / Greetings */}
      <div className="bg-gradient-to-br from-maroon-900 via-maroon-850 to-maroon-950 text-white rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-saffron-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-saffron-500 text-maroon-950 uppercase tracking-wider">
                {summary.is_day_closed ? t.closed : t.active}
              </span>
              <span className="text-cream-300 text-xs font-medium">
                {formatDate(summary.today_date)}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {t.todaySummary}
            </h2>
            <p className="text-xs sm:text-sm text-cream-200 mt-1 max-w-lg">
              {summary.is_day_closed ? t.dayClosedMessage : t.taglineShort}
            </p>
          </div>

          {/* Daily estimated profit card (Owner only) */}
          {isOwner && (
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/15 min-w-[200px] text-right sm:text-right">
              <span className="text-[11px] font-semibold text-cream-200 block">
                {t.estimatedProfit}
              </span>
              <span className="text-2xl sm:text-3xl font-black text-saffron-400 block tracking-tight mt-0.5">
                {formatCurrency(summary.estimated_profit)}
              </span>
              <span className="text-[10px] text-cream-300">
                {t.grossSales}: {formatCurrency(summary.gross_sales)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Warnings & Alerts */}
      <div className="space-y-2">
        {summary.unsettled_issues_count > 0 && (
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span className="font-semibold">
                {summary.unsettled_issues_count} {t.unsettledIssuesWarning}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/settlements')}>
              {t.settleSeller}
            </Button>
          </div>
        )}

        {summary.pending_approvals_count > 0 && isOwner && (
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 text-sm">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-sky-600 flex-shrink-0" />
              <span className="font-semibold">
                {summary.pending_approvals_count} {t.pendingApprovalWarning}
              </span>
            </div>
            <Button size="sm" variant="primary" onClick={() => navigate('/settlements')}>
              {t.approveSettlement}
            </Button>
          </div>
        )}
      </div>

      {/* Quick Action Shortcuts */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
          {t.quickActions}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {isProduction && (
            <button
              onClick={() => navigate('/production?new=true')}
              className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-cream-300 hover:border-maroon-700 hover:bg-maroon-50/50 shadow-sm transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-maroon-100 text-maroon-800 flex items-center justify-center flex-shrink-0">
                <Factory className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-gray-900 block leading-tight">
                  {t.addProduction}
                </span>
                <span className="text-[10px] text-gray-500">कारखाना</span>
              </div>
            </button>
          )}

          {(isProduction || isOwner) && (
            <button
              onClick={() => navigate('/issues?new=true')}
              className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-cream-300 hover:border-maroon-700 hover:bg-maroon-50/50 shadow-sm transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center flex-shrink-0">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-gray-900 block leading-tight">
                  {t.issueStock}
                </span>
                <span className="text-[10px] text-gray-500">ठेला निकासी</span>
              </div>
            </button>
          )}

          <button
            onClick={() => navigate('/settlements?new=true')}
            className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-cream-300 hover:border-maroon-700 hover:bg-maroon-50/50 shadow-sm transition-all text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center flex-shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-gray-900 block leading-tight">
                {t.settleSeller}
              </span>
              <span className="text-[10px] text-gray-500">शाम का हिसाब</span>
            </div>
          </button>

          {isOwner && (
            <button
              onClick={() => navigate('/expenses?new=true')}
              className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-cream-300 hover:border-maroon-700 hover:bg-maroon-50/50 shadow-sm transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-gray-900 block leading-tight">
                  {t.addExpense}
                </span>
                <span className="text-[10px] text-gray-500">खर्चा पर्ची</span>
              </div>
            </button>
          )}

          {isOwner && (
            <button
              onClick={() => navigate('/closing')}
              className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-cream-300 hover:border-maroon-700 hover:bg-maroon-50/50 shadow-sm transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center flex-shrink-0">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-gray-900 block leading-tight">
                  {t.closeDayAction}
                </span>
                <span className="text-[10px] text-gray-500">दैनिक बंदी</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Main Stock & Pieces Quantity Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-white to-cream-50">
          <span className="text-[11px] font-bold text-gray-600 block">{t.producedToday}</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-maroon-900 font-mono">
              {formatQuantity(summary.total_produced)}
            </span>
            <span className="text-xs font-semibold text-gray-500">{t.pieces}</span>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-white to-sky-50/50">
          <span className="text-[11px] font-bold text-sky-800 block">{t.issuedToday}</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-sky-950 font-mono">
              {formatQuantity(summary.total_issued)}
            </span>
            <span className="text-xs font-semibold text-gray-500">{t.pieces}</span>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-white to-emerald-50/50">
          <span className="text-[11px] font-bold text-emerald-800 block">{t.soldToday}</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-emerald-900 font-mono">
              {formatQuantity(summary.total_sold)}
            </span>
            <span className="text-xs font-semibold text-gray-500">{t.pieces}</span>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-white to-rose-50/50">
          <span className="text-[11px] font-bold text-rose-800 block">{t.damagedToday}</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-rose-900 font-mono">
              {formatQuantity(summary.total_damaged)}
            </span>
            <span className="text-xs font-semibold text-gray-500">{t.pieces}</span>
          </div>
        </Card>
      </div>

      {/* Financial Accounting Cards (Owner/Staff overview) */}
      {isOwner && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <span className="text-[11px] font-bold text-gray-500 block">{t.grossSales}</span>
            <span className="text-xl font-extrabold text-gray-900 block mt-1">
              {formatCurrency(summary.gross_sales)}
            </span>
            <span className="text-[10px] text-gray-500 mt-0.5 block">
              {t.sellerCommission}: {formatCurrency(summary.total_commission)}
            </span>
          </Card>

          <Card>
            <span className="text-[11px] font-bold text-emerald-700 block">{t.totalCollection}</span>
            <span className="text-xl font-extrabold text-emerald-800 block mt-1">
              {formatCurrency(summary.total_received)}
            </span>
            <span className="text-[10px] text-gray-600 mt-0.5 block">
              Cash: {formatCurrency(summary.cash_received, false)} | UPI: {formatCurrency(summary.upi_received, false)}
            </span>
          </Card>

          <Card>
            <span className="text-[11px] font-bold text-amber-700 block">{t.creditSales}</span>
            <span className="text-xl font-extrabold text-amber-900 block mt-1">
              {formatCurrency(summary.credit_sales)}
            </span>
            <span className="text-[10px] text-gray-500 mt-0.5 block">
              {t.outstandingShortage}: {formatCurrency(summary.outstanding_collection)}
            </span>
          </Card>

          <Card>
            <span className="text-[11px] font-bold text-rose-700 block">{t.todayExpenses}</span>
            <span className="text-xl font-extrabold text-rose-900 block mt-1">
              {formatCurrency(summary.today_expenses)}
            </span>
            <span className="text-[10px] text-gray-500 mt-0.5 block">
              {t.closingChecklist}
            </span>
          </Card>
        </div>
      )}

      {/* Ready Freezer Stock Cards */}
      <Card>
        <CardHeader
          title={t.freezerStock}
          subtitle="मुख्य कोल्ड स्टोरेज फ्रीजर में उपलब्ध वर्तमान स्टॉक"
          action={
            <Button size="sm" variant="ghost" onClick={() => navigate('/stock')}>
              <Boxes className="w-4 h-4 mr-1" />
              {t.view}
            </Button>
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {summary.low_stock_products.length === 0 && (
            <p className="text-sm text-gray-500">{t.noData}</p>
          )}
          {summary.low_stock_products.map((prod) => (
            <div
              key={prod.id}
              className="p-3 rounded-xl bg-cream-50 border border-cream-200 flex items-center justify-between"
            >
              <div>
                <span className="font-bold text-sm text-gray-900 block">
                  {language === 'hi' ? prod.name_hi : prod.name_en}
                </span>
                <span className="text-xs text-gray-500">
                  {formatCurrency(prod.current_price)} / piece
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono font-black text-xl text-maroon-900 block">
                  {formatQuantity(prod.available_quantity)}
                </span>
                <span className="text-[10px] font-bold text-emerald-700 uppercase">
                  Ready Pieces
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 7-Day Sales Trend (Recharts) */}
      {isOwner && summary.seven_day_sales.length > 0 && (
        <Card>
          <CardHeader
            title={t.sevenDaySales}
            subtitle="दैनिक सकल एवं शुद्ध बिक्री का ग्राफ़"
          />
          <div className="h-64 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.seven_day_sales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0E6D8" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => formatDate(val).slice(0, 5)}
                  tick={{ fontSize: 11, fill: '#666' }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#666' }} />
                <Tooltip
                  formatter={(val: any) => [formatCurrency(val), '']}
                  labelFormatter={(val) => formatDate(val)}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', borderColor: '#E5E7EB' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="gross_sales" name={t.grossSales} fill="#8E1F3C" radius={[4, 4, 0, 0]} />
                <Bar dataKey="net_sales" name={t.netSales} fill="#D97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
};
