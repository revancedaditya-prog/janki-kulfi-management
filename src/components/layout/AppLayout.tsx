import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { DesktopSidebar } from './DesktopSidebar';
import { MobileBottomNav } from './MobileBottomNav';

export const AppLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-cream-100 flex flex-col selection:bg-maroon-100 selection:text-maroon-900">
      <Header />
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <DesktopSidebar />
        <main className="flex-1 px-3.5 py-4 sm:px-6 sm:py-6 pb-24 sm:pb-8 max-w-5xl mx-auto w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
};
