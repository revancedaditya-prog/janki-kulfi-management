import React from 'react';
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
  Boxes,
} from 'lucide-react';

export const DesktopSidebar: React.FC = () => {
  const { t } = useLanguage();
  const { isOwner, isProduction, user } = useAuth();

  const navGroups = [
    {
      title: 'Operations / संचालन',
      items: [
        { to: '/', label: t.navDashboard, icon: LayoutDashboard, show: true },
        { to: '/production', label: t.navProduction, icon: Factory, show: isProduction },
        { to: '/issues', label: t.navStockIssues, icon: Truck, show: isProduction || isOwner },
        { to: '/settlements', label: t.navSettlements, icon: Receipt, show: true },
        { to: '/stock', label: t.navStock, icon: Boxes, show: isProduction || isOwner },
      ],
    },
    {
      title: 'Financials & Control / हिसाब व नियंत्रण',
      items: [
        { to: '/expenses', label: t.navExpenses, icon: Wallet, show: isOwner },
        { to: '/closing', label: t.navClosing, icon: CalendarCheck, show: isOwner },
        { to: '/reports', label: t.navReports, icon: BarChart3, show: isOwner },
      ],
    },
    {
      title: 'Master Data / मास्टर डेटा',
      items: [
        { to: '/products', label: t.navProducts, icon: Package, show: isOwner },
        { to: '/sellers', label: t.navSellers, icon: Users, show: isOwner },
        { to: '/audit', label: t.navAudit, icon: History, show: isOwner },
        { to: '/settings', label: t.navSettings, icon: Settings, show: true },
      ],
    },
  ];

  return (
    <aside className="hidden sm:flex flex-col w-64 bg-white border-r border-cream-300 min-h-screen py-5 px-3 flex-shrink-0">
      {/* User Info Card */}
      <div className="mb-6 px-3 py-3 rounded-2xl bg-cream-100/70 border border-cream-200">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-maroon-800 text-white font-bold flex items-center justify-center text-sm shadow-sm">
            {user?.full_name?.charAt(0) || 'J'}
          </div>
          <div className="overflow-hidden">
            <h4 className="text-sm font-bold text-gray-900 truncate">{user?.full_name}</h4>
            <span className="inline-block text-[11px] font-semibold text-maroon-800 bg-maroon-100/60 px-2 py-0.5 rounded-full capitalize">
              {user?.role === 'owner' ? t.roleOwner : user?.role === 'production_worker' ? t.roleProduction : t.roleSeller}
            </span>
          </div>
        </div>
      </div>

      {/* Nav Groups */}
      <div className="space-y-6 flex-1">
        {navGroups.map((group, gIdx) => {
          const visibleItems = group.items.filter((it) => it.show);
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx} className="space-y-1">
              <h5 className="px-3 text-[11px] font-bold text-gray-600 tracking-wider">
                {group.title}
              </h5>
              <div className="space-y-0.5 pt-1">
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                        isActive
                          ? 'bg-maroon-800 text-white shadow-sm shadow-maroon-900/20'
                          : 'text-gray-700 hover:bg-cream-100 hover:text-maroon-950'
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-cream-200 px-3 text-center text-xs text-gray-600">
        <p className="font-bold text-maroon-950">Janki Kulfi v1.0</p>
        <p className="text-[11px] mt-0.5">Mirehchi, Etah, UP</p>
      </div>
    </aside>
  );
};
