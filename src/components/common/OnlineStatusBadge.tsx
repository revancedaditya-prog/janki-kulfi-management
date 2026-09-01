import React from 'react';
import { useSync } from '@/context/SyncContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export const OnlineStatusBadge: React.FC = () => {
  const { isOnline, pendingCount, isSyncing, syncNow } = useSync();
  const { t } = useLanguage();

  if (isOnline && pendingCount === 0) {
    return (
      <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
        <Wifi className="w-3.5 h-3.5 text-emerald-600" />
        <span>{t.online}</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      {!isOnline && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
          <WifiOff className="w-3.5 h-3.5 text-rose-600" />
          <span>{t.offline}</span>
        </span>
      )}

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={syncNow}
          disabled={isSyncing || !isOnline}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 disabled:opacity-60 transition-colors"
          title={`${pendingCount} ${t.pendingSync}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 text-amber-800 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{pendingCount} {t.pendingSync}</span>
        </button>
      )}
    </div>
  );
};
