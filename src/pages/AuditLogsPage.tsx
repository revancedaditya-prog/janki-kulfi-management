import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card } from '@/components/common/Card';
import { formatDateTime } from '@/lib/formatters';
import { History } from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit_logs'],
    queryFn: () => api.getAuditLogs(),
  });
  const { t } = useLanguage();
  const [filterModule, setFilterModule] = useState('all');

  const filteredLogs = logs.filter((l) => {
    if (filterModule !== 'all' && l.table_name !== filterModule) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-maroon-800" />
            {t.auditLogs}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            सभी संवेदनशील कार्यों, स्टॉक सुधारों व वित्तीय परिवर्तनों का पूर्ण इतिहास
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            className="bg-white border border-gray-300 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-800 focus:ring-2 focus:ring-maroon-700"
          >
            <option value="all">सभी मॉड्यूल (All Modules)</option>
            <option value="production_batches">Production</option>
            <option value="seller_issues">Stock Issues</option>
            <option value="seller_settlements">Settlements</option>
            <option value="expenses">Expenses</option>
            <option value="daily_closings">Daily Closings</option>
            <option value="product_prices">Price Changes</option>
          </select>
        </div>
      </div>

      {/* Audit Logs Table */}
      <Card>
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold text-gray-500 mt-2">{t.loading}</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center">{t.noData}</p>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 rounded-2xl bg-cream-50/70 border border-cream-200 text-xs space-y-1.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-maroon-900 bg-white px-2 py-0.5 rounded-md border border-cream-300">
                      {log.action}
                    </span>
                    <span className="font-bold text-gray-700">{log.table_name}</span>
                  </div>
                  <span className="text-[11px] text-gray-500">
                    🕒 {formatDateTime(log.performed_at)}
                  </span>
                </div>

                {log.reason && (
                  <p className="text-xs text-gray-800 font-medium">
                    <strong>कारण (Reason):</strong> {log.reason}
                  </p>
                )}

                {log.new_data && (
                  <div className="mt-1 pt-1 border-t border-cream-200">
                    <details className="text-[11px] text-gray-600 cursor-pointer">
                      <summary className="font-semibold text-maroon-800 hover:underline">
                        JSON डेटा विवरण देखें
                      </summary>
                      <pre className="mt-1 p-2 rounded-xl bg-gray-900 text-cream-200 overflow-x-auto text-[10px] font-mono">
                        {JSON.stringify(log.new_data, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
