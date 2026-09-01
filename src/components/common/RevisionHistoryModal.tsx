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
            <p className="text-sm text-gray-600">
              {language === 'hi'
                ? 'इस रिकॉर्ड के सभी पिछले और वर्तमान संस्करणों का इतिहास:'
                : 'Complete audit timeline of all previous and current versions of this record:'}
            </p>

            <div className="relative border-l-2 border-cream-300 ml-4 space-y-5">
              {revisions.map((rev) => {
                const isCurrent = rev.is_current_version;

                return (
                  <div key={rev.id} className="relative pl-6">
                    {/* Node Dot */}
                    <div
                      className={`absolute -left-[9px] top-2 w-4 h-4 rounded-full border-2 ${
                        isCurrent
                          ? 'bg-emerald-600 border-white ring-4 ring-emerald-100 shadow-sm'
                          : 'bg-gray-300 border-white'
                      }`}
                    />

                    <div
                      className={`p-4 rounded-2xl border transition-all ${
                        isCurrent
                          ? 'bg-cream-50 border-emerald-300 shadow-sm'
                          : 'bg-white border-cream-200 opacity-90'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">
                            {t.version} {rev.version_number}
                          </span>
                          {isCurrent ? (
                            <Badge variant="success">
                              <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                              {language === 'hi' ? 'वर्तमान संस्करण (Active)' : 'Current Version'}
                            </Badge>
                          ) : (
                            <Badge variant="superseded">
                              {language === 'hi' ? 'प्रतिस्थापित (Superseded)' : 'Superseded'}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDate(rev.corrected_at || rev.created_at)}</span>
                        </div>
                      </div>

                      {/* Summary Info */}
                      <p className="text-sm font-semibold text-gray-800 mb-2">
                        {rev.summary_text}
                      </p>

                      {/* Reason if corrected */}
                      {rev.correction_reason && (
                        <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 my-2">
                          <span className="font-bold">{t.correctionReason}: </span>
                          <span>{rev.correction_reason}</span>
                        </div>
                      )}

                      {/* Meta footer */}
                      <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-cream-200">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span className="font-medium">{rev.corrected_by_name || 'Owner'}</span>
                        </div>
                        {rev.financial_effect?.cost !== undefined && (
                          <span className="font-bold text-gray-700">
                            लागत: {formatCurrency(rev.financial_effect.cost)}
                          </span>
                        )}
                        {rev.financial_effect?.gross_sales !== undefined && (
                          <span className="font-bold text-emerald-700">
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
