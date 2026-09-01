import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  Factory,
  Truck,
  Receipt,
  Wallet,
  CalendarCheck,
  Package,
  Users,
  BarChart3,
  History,
  Settings,
  Menu,
  Boxes,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';

export const MobileBottomNav: React.FC = () => {
  const { t } = useLanguage();
  const { isOwner, isProduction } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const mainNavItems = [
    { to: '/', label: t.navDashboard, icon: LayoutDashboard, show: true },
    { to: '/production', label: t.navProduction, icon: Factory, show: isProduction },
    { to: '/issues', label: t.navStockIssues, icon: Truck, show: isProduction || isOwner },
    { to: '/settlements', label: t.navSettlements, icon: Receipt, show: true },
  ].filter((item) => item.show);

  const moreNavItems = [
    { to: '/expenses', label: t.navExpenses, icon: Wallet, show: isOwner },
    { to: '/closing', label: t.navClosing, icon: CalendarCheck, show: isOwner },
    { to: '/stock', label: t.navStock, icon: Boxes, show: isProduction || isOwner },
    { to: '/products', label: t.navProducts, icon: Package, show: isOwner },
    { to: '/sellers', label: t.navSellers, icon: Users, show: isOwner },
    { to: '/reports', label: t.navReports, icon: BarChart3, show: isOwner },
    { to: '/audit', label: t.navAudit, icon: History, show: isOwner },
    { to: '/settings', label: t.navSettings, icon: Settings, show: true },
  ].filter((item) => item.show);

  return (
    <>
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-cream-300 px-2 py-1 shadow-lg">
        <div className="flex items-center justify-around">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all min-w-[60px] min-h-[50px] ${
                  isActive
                    ? 'text-maroon-900 font-bold bg-maroon-50'
                    : 'text-gray-500 font-medium hover:text-gray-800'
                }`
              }
            >
              <item.icon className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight text-center">{item.label}</span>
            </NavLink>
          ))}

          {/* More menu button */}
          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            className="flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-gray-500 hover:text-gray-800 font-medium transition-all min-w-[60px] min-h-[50px]"
          >
            <Menu className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] leading-tight text-center">{t.navMore}</span>
          </button>
        </div>
      </nav>

      {/* More Options Modal for Mobile */}
      <Modal
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title={t.navMore}
        maxWidth="sm"
      >
        <div className="grid grid-cols-2 gap-2.5 py-2">
          {moreNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsMoreOpen(false)}
              className="flex items-center gap-3 p-3 rounded-2xl bg-cream-50 hover:bg-cream-100 border border-cream-200 text-maroon-900 font-semibold text-sm transition-all"
            >
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-maroon-800 shadow-sm border border-cream-300">
                <item.icon className="w-5 h-5" />
              </div>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </Modal>
    </>
  );
};
