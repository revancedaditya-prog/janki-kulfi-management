import React from 'react';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { RevisionRecord } from '@/types';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { User, Calendar, CheckCircle2 } from 'lucide-react';

interface RevisionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  revisions: RevisionRecord[];
  isLoading?: boolean;
}

export const RevisionHistoryModal: React.FC<RevisionHistoryModalProps> = ({
  isOpen,
  onClose,
  title,
  revisions,
  isLoading = false,
}) => {
  const { t, language } = useLanguage();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="lg">
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-8 text-center text-gray-500">{t.loading}</div>
        ) : revisions.length === 0 ? (
          <div className="py-8 text-center text-gray-500">{t.noData}</div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {language === 'hi'
                ? 'इस रिकॉर्ड के सभी पिछले और वर्तमान संस्करणों का इतिहास:'
                : 'Complete audit timeline of all previous and current versions of this record:'}
            </p>

            <div className="relative border-l-2 border-emerald-500/30 ml-4 space-y-6">
              {revisions.map((rev) => {
                const isCurrent = rev.is_current_version;

                return (
                  <div key={rev.id} className="relative pl-6">
                    {/* Node Dot */}
                    <div
                      className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-2 ${
                        isCurrent
                          ? 'bg-emerald-500 border-emerald-200 ring-4 ring-emerald-500/20'
                          : 'bg-gray-400 border-gray-200 dark:bg-gray-600'
                      }`}
                    />

                    <div
                      className={`p-4 rounded-xl border ${
                        isCurrent
                          ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40'
                          : 'bg-gray-50/80 border-gray-200 dark:bg-gray-800/40 dark:border-gray-700'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            {t.version} {rev.version_number}
                          </span>
                          {isCurrent ? (
                            <Badge variant="success">
                              <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                              {language === 'hi' ? 'वर्तमान संस्करण (Active)' : 'Current Version'}
                            </Badge>
                          ) : (
                            <Badge variant="warning">
                              {language === 'hi' ? 'प्रतिस्थापित (Superseded)' : 'Superseded'}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDate(rev.corrected_at || rev.created_at)}</span>
                        </div>
                      </div>

                      {/* Summary Info */}
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
                        {rev.summary_text}
                      </p>

                      {/* Reason if corrected */}
                      {rev.correction_reason && (
                        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-900 dark:text-amber-200 my-2">
                          <span className="font-semibold">{t.correctionReason}: </span>
                          <span>{rev.correction_reason}</span>
                        </div>
                      )}

                      {/* Meta footer */}
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200/60 dark:border-gray-700/60">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>{rev.corrected_by_name || 'Owner'}</span>
                        </div>
                        {rev.financial_effect?.cost !== undefined && (
                          <span className="font-semibold text-gray-700 dark:text-gray-300">
                            लागत: {formatCurrency(rev.financial_effect.cost)}
                          </span>
                        )}
                        {rev.financial_effect?.gross_sales !== undefined && (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            बिक्री: {formatCurrency(rev.financial_effect.gross_sales)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
