import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Card, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { isSupabaseConfigured } from '@/lib/supabase';
import { mockStore } from '@/lib/mockStore';
import { Settings, RefreshCw, Trash2, Database, Wifi, ShieldCheck } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();
  const { user, role, isOwner } = useAuth();
  const { isOnline, pendingCount, syncNow, isSyncing } = useSync();
  const navigate = useNavigate();

  const handleResetData = () => {
    if (window.confirm('क्या आप स्थानीय डेटा को रीसेट कर प्रारंभिक अवस्था (Default Seed Data) में लाना चाहते हैं?')) {
      mockStore.resetToDefault();
      window.location.reload();
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-maroon-800" />
          {t.navSettings}
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
          भाषा, प्रोफ़ाइल एवं सिस्टम सेटिंग्स
        </p>
      </div>

      {/* Language Settings Card */}
      <Card>
        <CardHeader
          title="भाषा चयन / Application Language"
          subtitle="एप्लिकेशन की भाषा हिंदी या अंग्रेजी में बदलें"
        />
        <div className="flex items-center gap-3 my-2">
          <button
            onClick={() => setLanguage('hi')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${
              language === 'hi'
                ? 'bg-maroon-800 text-white border-maroon-900 shadow-md'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-cream-100'
            }`}
          >
            <span>🇮🇳 हिन्दी (Hindi)</span>
          </button>

          <button
            onClick={() => setLanguage('en')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${
              language === 'en'
                ? 'bg-maroon-800 text-white border-maroon-900 shadow-md'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-cream-100'
            }`}
          >
            <span>🌐 English</span>
          </button>
        </div>
      </Card>

      {/* Profile & Role Card */}
      <Card>
        <CardHeader title="वर्तमान उपयोगकर्ता प्रोफ़ाइल (User Profile)" />
        <div className="p-3.5 rounded-2xl bg-cream-50 border border-cream-200 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">नाम (Full Name):</span>
            <span className="font-bold text-gray-900">{user?.full_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">मोबाइल (Phone):</span>
            <span className="font-mono font-bold text-gray-900">{user?.phone || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">भूमिका (Role):</span>
            <span className="font-bold text-maroon-900 capitalize">{role}</span>
          </div>
        </div>
      </Card>

      {/* Supabase & Network Status Card */}
      <Card>
        <CardHeader title="डेटाबेस एवं सिंक स्थिति (System Status)" />
        <div className="space-y-3 my-2 text-xs">
          <div className="flex items-center justify-between p-3 rounded-xl bg-cream-50 border border-cream-200">
            <div className="flex items-center gap-2.5">
              <Database className="w-5 h-5 text-maroon-800" />
              <div>
                <span className="font-bold text-gray-900 block">Supabase PostgreSQL Database</span>
                <span className="text-gray-500 text-[11px]">
                  {isSupabaseConfigured
                    ? 'Connected with Row Level Security & RPC'
                    : 'Running in high-fidelity local IndexedDB/Mock mode'}
                </span>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full font-bold ${
                isSupabaseConfigured
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {isSupabaseConfigured ? 'Supabase Live' : 'Local Mock Active'}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-cream-50 border border-cream-200">
            <div className="flex items-center gap-2.5">
              <Wifi className="w-5 h-5 text-maroon-800" />
              <div>
                <span className="font-bold text-gray-900 block">इंटरनेट कनेक्टिविटी</span>
                <span className="text-gray-500 text-[11px]">
                  {isOnline ? 'ऑनलाइन जुड़ा हुआ है' : 'ऑफ़लाइन ड्राफ्ट मोड'}
                </span>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full font-bold ${
                isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-900'
              }`}
            >
              {isOnline ? t.online : t.offline}
            </span>
          </div>
        </div>

        {/* Offline Queue Inspector */}
        {pendingCount > 0 && (
          <div className="mt-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-900">
                {pendingCount} ऑफ़लाइन ड्राफ्ट सिंक के लिए तैयार
              </span>
              <Button
                size="sm"
                variant="primary"
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={syncNow}
                isLoading={isSyncing}
              >
                {t.syncNow}
              </Button>
            </div>
            <p className="text-[11px] text-amber-800">
              इंटरनेट उपलब्ध होने पर ये ड्राफ्ट सर्वर पर सुरक्षित रूप से भेज दिए जाएंगे।
            </p>
          </div>
        )}
      </Card>

      {/* Backup Center Card (Owner Only) */}
      {isOwner && (
        <Card className="border-maroon-300 bg-gradient-to-br from-cream-50 to-white">
          <CardHeader
            title="डेटा बैकअप केंद्र (Backup & Disaster Recovery Center)"
            subtitle="सम्पूर्ण ऑफ़लाइन बैकअप, दिनांक-सीमा निर्यात, खर्च बिल बैकअप एवं सत्यापन"
          />
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-gray-600 max-w-md">
              व्यवसाय के सभी 16 टेबल्स का संपूर्ण ज़िप आर्काइव (JSON + CSV) डाउनलोड करें अथवा बैकअप फाइल सत्यापित करें।
            </p>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<ShieldCheck className="w-4 h-4" />}
              onClick={() => navigate('/settings/backup')}
            >
              बैकअप केंद्र खोलें (Open Backup Center)
            </Button>
          </div>
        </Card>
      )}

      {/* Reset Demo Data Card */}
      <Card className="border-rose-200 bg-rose-50/30">
        <CardHeader
          title="डेटा रीसेट (Reset Local Database)"
          subtitle="स्थानीय डेटा को प्रारंभिक सुरक्षित स्थिति (Default Products & Sellers) में रीसेट करें"
        />
        <div className="pt-2">
          <Button
            variant="danger"
            size="sm"
            leftIcon={<Trash2 className="w-4 h-4" />}
            onClick={handleResetData}
          >
            डेटा रीसेट करें (Reset Store)
          </Button>
        </div>
      </Card>
    </div>
  );
};
