import React, { useState } from 'react';
import {
  useDailyClosings,
  useCloseBusinessDay,
  useReopenBusinessDay,
} from '@/hooks/useDailyClosing';
import { useDashboard } from '@/hooks/useDashboard';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import {
  formatCurrency,
  formatQuantity,
  formatDate,
  getTodayDateString,
} from '@/lib/formatters';
import {
  CalendarCheck,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
} from 'lucide-react';

export const DailyClosingPage: React.FC = () => {
  const [businessDate, setBusinessDate] = useState<string>(getTodayDateString());
  const { data: closings = [] } = useDailyClosings();
  const { data: summary } = useDashboard(businessDate);
  const { t } = useLanguage();
  const { isOwner } = useAuth();

  const closeDay = useCloseBusinessDay();
  const reopenDay = useReopenBusinessDay();

  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [closingNotes, setClosingNotes] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const existingClosing = closings.find((c) => c.business_date === businessDate);
  const isClosed = existingClosing?.status === 'closed';

  // Checklist conditions
  const hasUnsettledIssues = (summary?.unsettled_issues_count || 0) > 0;
  const hasPendingApprovals = (summary?.pending_approvals_count || 0) > 0;
  const canClose = !hasUnsettledIssues && !hasPendingApprovals;

  const handleConfirmClose = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!canClose) {
      setFormError(t.cannotCloseWarning);
      return;
    }

    try {
      await closeDay.mutateAsync({
        businessDate,
        notes: closingNotes,
      });
      setIsCloseModalOpen(false);
      setClosingNotes('');
    } catch (err: any) {
      setFormError(err.message || 'दैनिक बंदी में त्रुटि');
    }
  };

  const handleConfirmReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!reopenReason || reopenReason.trim().length < 5) {
      setFormError(t.reopenReasonRequired);
      return;
    }

    try {
      await reopenDay.mutateAsync({
        businessDate,
        reason: reopenReason,
      });
      setIsReopenModalOpen(false);
      setReopenReason('');
    } catch (err: any) {
      setFormError(err.message || 'दिन पुनः खोलने में त्रुटि');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-maroon-800" />
            {t.dailyClosing}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            दिन की कुल बिक्री, वसूली, खर्चों का मिलान व सुरक्षित खाता बंदी
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="w-auto py-1.5 text-xs font-bold"
          />
        </div>
      </div>

      {/* Date Status Banner */}
      <div
        className={`p-5 rounded-3xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isClosed
            ? 'bg-purple-900 text-white border-purple-950'
            : 'bg-cream-50 border-cream-300 text-gray-900'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold shadow-md ${
              isClosed ? 'bg-white/10 text-white' : 'bg-maroon-100 text-maroon-900'
            }`}
          >
            {isClosed ? <Lock className="w-6 h-6" /> : <Unlock className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black tracking-tight">
                {formatDate(businessDate)}: {isClosed ? 'कार्य दिवस बंद (Closed)' : 'कार्य दिवस खुला (Open)'}
              </h3>
              <Badge variant={isClosed ? 'closed' : 'active'}>
                {isClosed ? t.closed : t.active}
              </Badge>
            </div>
            <p className={`text-xs mt-0.5 ${isClosed ? 'text-purple-200' : 'text-gray-600'}`}>
              {isClosed
                ? 'यह दिन सुरक्षित रूप से बंद है और नए बदलाव से सुरक्षित है।'
                : 'दिन समाप्त होने पर सभी हिसाब पूरे कर इसे बंद करें।'}
            </p>
          </div>
        </div>

        {isOwner && (
          <div>
            {isClosed ? (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Unlock className="w-4 h-4" />}
                onClick={() => {
                  setReopenReason('');
                  setFormError(null);
                  setIsReopenModalOpen(true);
                }}
              >
                {t.reopenBusinessDay}
              </Button>
            ) : (
              <Button
                variant="primary"
                leftIcon={<Lock className="w-4 h-4" />}
                disabled={!canClose}
                onClick={() => {
                  setClosingNotes('');
                  setFormError(null);
                  setIsCloseModalOpen(true);
                }}
              >
                {t.closeBusinessDay}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Pre-closing Validation Checklist (if not closed) */}
      {!isClosed && summary && (
        <Card>
          <CardHeader
            title={t.closingChecklist}
            subtitle="दिन बंद करने के लिए निम्नलिखित सभी शर्तों का पूरा होना अनिवार्य है"
          />
          <div className="space-y-2.5 my-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-cream-50/70 border border-cream-200 text-xs font-semibold">
              <span className="flex items-center gap-2">
                {!hasUnsettledIssues ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-600" />
                )}
                <span>{t.allIssuesSettled}</span>
              </span>
              <span className={hasUnsettledIssues ? 'text-rose-700 font-bold' : 'text-emerald-700'}>
                {hasUnsettledIssues ? `${summary.unsettled_issues_count} बकाया` : 'पूर्ण ✓'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-cream-50/70 border border-cream-200 text-xs font-semibold">
              <span className="flex items-center gap-2">
                {!hasPendingApprovals ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-600" />
                )}
                <span>{t.allApprovalsCleared}</span>
              </span>
              <span className={hasPendingApprovals ? 'text-rose-700 font-bold' : 'text-emerald-700'}>
                {hasPendingApprovals ? `${summary.pending_approvals_count} प्रतीक्षारत` : 'पूर्ण ✓'}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Financial Breakdown & Estimated Profit */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="space-y-3">
            <CardHeader title="उत्पादन एवं बिक्री सारांश (Pieces & Sales)" />
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-600">{t.producedToday}:</span>
                <span className="font-mono font-bold">{formatQuantity(summary.total_produced)} {t.pieces}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-600">{t.soldToday}:</span>
                <span className="font-mono font-bold text-emerald-800">{formatQuantity(summary.total_sold)} {t.pieces}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-600">{t.returnedToday}:</span>
                <span className="font-mono font-bold">{formatQuantity(summary.total_returned)} {t.pieces}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-600">{t.damagedToday}:</span>
                <span className="font-mono font-bold text-rose-700">{formatQuantity(summary.total_damaged)} {t.pieces}</span>
              </div>
              <div className="flex justify-between py-1.5 font-bold text-sm">
                <span>{t.grossSales}:</span>
                <span className="font-mono">{formatCurrency(summary.gross_sales)}</span>
              </div>
              <div className="flex justify-between py-1 text-gray-600">
                <span>{t.sellerCommission} (-):</span>
                <span className="font-mono text-maroon-800">-{formatCurrency(summary.total_commission)}</span>
              </div>
              <div className="flex justify-between py-1.5 font-bold text-sm text-emerald-800 border-t border-gray-200">
                <span>{t.netSales}:</span>
                <span className="font-mono">{formatCurrency(summary.net_sales)}</span>
              </div>
            </div>
          </Card>

          <Card className="space-y-3 bg-gradient-to-br from-cream-50 to-white">
            <CardHeader title="लाभ एवं रोकड़ सारांश (Profit & Cash)" />
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-cream-200">
                <span className="text-gray-600">नकद वसूली (Cash):</span>
                <span className="font-mono font-bold">{formatCurrency(summary.cash_received)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-cream-200">
                <span className="text-gray-600">UPI वसूली:</span>
                <span className="font-mono font-bold">{formatCurrency(summary.upi_received)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-cream-200">
                <span className="text-gray-600">उधार बिक्री (Credit):</span>
                <span className="font-mono font-bold">{formatCurrency(summary.credit_sales)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-cream-200">
                <span className="text-gray-600">सक्रिय खर्चे (-):</span>
                <span className="font-mono font-bold text-rose-800">-{formatCurrency(summary.today_expenses)}</span>
              </div>
              <div className="p-3 rounded-2xl bg-maroon-900 text-white mt-3">
                <span className="text-[11px] font-semibold text-cream-200 block">{t.estimatedProfit}</span>
                <span className="text-2xl font-black text-saffron-400 block tracking-tight mt-0.5">
                  {formatCurrency(summary.estimated_profit)}
                </span>
                <span className="text-[10px] text-cream-300">
                  (सकल बिक्री - विक्रेता कमीशन - सामग्री लागत - दैनिक खर्चे)
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Past Closing Records Table */}
      <Card>
        <CardHeader title="दैनिक बंदी का इतिहास (Closing Records)" />
        {closings.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">{t.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 font-bold">
                  <th className="py-2.5">तारीख</th>
                  <th className="py-2.5">स्थिति</th>
                  <th className="py-2.5 text-right">बिकी पीस</th>
                  <th className="py-2.5 text-right">सकल बिक्री</th>
                  <th className="py-2.5 text-right">कमीशन</th>
                  <th className="py-2.5 text-right">खर्चे</th>
                  <th className="py-2.5 text-right">अनुमानित लाभ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {closings.map((c) => (
                  <tr key={c.id} className="hover:bg-cream-50/50">
                    <td className="py-2.5 font-sans font-semibold text-gray-900">
                      {formatDate(c.business_date)}
                    </td>
                    <td className="py-2.5 font-sans">
                      <Badge variant={c.status}>
                        {c.status === 'closed' ? t.closed : c.status === 'reopened' ? t.reopened : c.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right">{formatQuantity(c.total_sold)}</td>
                    <td className="py-2.5 text-right font-bold">{formatCurrency(c.gross_sales)}</td>
                    <td className="py-2.5 text-right text-maroon-800">{formatCurrency(c.total_commission)}</td>
                    <td className="py-2.5 text-right text-rose-800">{formatCurrency(c.total_expenses)}</td>
                    <td className="py-2.5 text-right font-black text-emerald-800">
                      {formatCurrency(c.estimated_profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Close Business Day Modal */}
      <Modal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        title={t.closeBusinessDay}
        maxWidth="sm"
      >
        <form onSubmit={handleConfirmClose} className="space-y-4 py-2">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {formError}
            </div>
          )}

          <p className="text-xs text-gray-600">
            {formatDate(businessDate)} का दिन बंद करने पर सभी बिक्री, कमीशन, खर्चों व लाभ का स्नैपशॉट रिकॉर्ड सुरक्षित हो जाएगा।
          </p>

          <Input
            label="अतिरिक्त टिप्पणी (वैकल्पिक)"
            placeholder="जैसे: मौसम अच्छा रहा, शाम को भारी बिक्री..."
            value={closingNotes}
            onChange={(e) => setClosingNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsCloseModalOpen(false)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={closeDay.isPending}>
              पुष्टि करें व दिन बंद करें
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reopen Closed Day Modal */}
      <Modal
        isOpen={isReopenModalOpen}
        onClose={() => setIsReopenModalOpen(false)}
        title={t.reopenBusinessDay}
        maxWidth="sm"
      >
        <form onSubmit={handleConfirmReopen} className="space-y-4 py-2">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {formError}
            </div>
          )}

          <p className="text-xs text-gray-600">
            बंद दिन को केवल मालिक द्वारा संशोधन या सुधार हेतु खोला जा सकता है। इसका कारण ऑडिट लॉग में दर्ज होगा।
          </p>

          <Input
            label={`${t.reopenReason} *`}
            placeholder="जैसे: शाम का ₹100 का खर्चा जोड़ना भूल गए थे..."
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsReopenModalOpen(false)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" variant="accent" isLoading={reopenDay.isPending}>
              दिन पुनः खोलें (Confirm Reopen)
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
