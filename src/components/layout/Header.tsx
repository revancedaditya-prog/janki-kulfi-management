import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { LanguageToggle } from '@/components/common/LanguageToggle';
import { OnlineStatusBadge } from '@/components/common/OnlineStatusBadge';
import { formatDate } from '@/lib/formatters';

export const Header: React.FC = () => {
  const { user, switchSimulatedUser, availableProfiles } = useAuth();
  const { t } = useLanguage();
  const today = new Date();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-cream-300 px-4 py-2.5 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Brand & Date */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-maroon-800 to-maroon-950 flex items-center justify-center text-white text-xl shadow-md shadow-maroon-900/20 flex-shrink-0">
            🍨
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-extrabold text-maroon-900 tracking-tight leading-none">
                {t.brandName}
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-saffron-100 text-saffron-800 font-bold text-[10px]">
                {t.brandTagline}
              </span>
            </div>
            <p className="text-[11px] font-medium text-gray-500 mt-0.5">
              📅 {formatDate(today)}
            </p>
          </div>
        </div>

        {/* Right Actions: Sync, Language, User Role Switcher */}
        <div className="flex items-center gap-2 sm:gap-3">
          <OnlineStatusBadge />
          <LanguageToggle />

          {/* Quick Role / User Switcher for testing */}
          <div className="relative">
            <select
              value={user?.id || ''}
              onChange={(e) => switchSimulatedUser(e.target.value)}
              className="bg-cream-100 hover:bg-cream-200 text-maroon-900 border border-cream-300 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-maroon-700 cursor-pointer max-w-[140px] sm:max-w-[200px] truncate"
              title="Switch user role for testing"
            >
              {availableProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.role === 'owner' ? 'Owner' : p.role === 'production_worker' ? 'Production' : 'Seller'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};
