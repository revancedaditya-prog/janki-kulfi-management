import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { LanguageToggle } from '@/components/common/LanguageToggle';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [identifier, setIdentifier] = useState('7906564964'); // Default Owner Phone
  const [password, setPassword] = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, availableProfiles, switchSimulatedUser } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(identifier, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'लॉग इन करने में त्रुटि हुई। कृपया विवरण पुनः जांचें।');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = (profileId: string) => {
    switchSimulatedUser(profileId);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-cream-100 flex flex-col justify-center items-center px-4 py-8 selection:bg-maroon-100 selection:text-maroon-900">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-maroon-800 to-maroon-950 flex items-center justify-center text-white text-3xl shadow-xl shadow-maroon-900/30 mx-auto">
            🍨
          </div>
          <h1 className="text-2xl font-black text-maroon-950 tracking-tight">
            {t.brandName}
          </h1>
          <p className="text-xs font-bold text-saffron-700 bg-saffron-100/70 inline-block px-3 py-1 rounded-full">
            {t.brandTagline}
          </p>
          <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1">
            {t.loginSubtitle}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-cream-300 space-y-5">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t.emailOrPhone}
              placeholder="7906564964"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                {t.password}
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-base text-gray-900 placeholder-gray-400 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-maroon-700 pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-gray-400 hover:text-gray-600 focus:outline-none"
                  title={showPassword ? t.hidePassword : t.showPassword}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              size="lg"
              isLoading={isSubmitting}
            >
              {t.login}
            </Button>
          </form>

          {/* Quick Demo Switcher */}
          <div className="pt-4 border-t border-gray-100 space-y-2.5">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block text-center">
              त्वरित भूमिका चयन (Quick Role Login)
            </span>
            <div className="grid grid-cols-1 gap-2">
              {availableProfiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleQuickLogin(p.id)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-cream-50 hover:bg-cream-100 border border-cream-200 text-xs font-bold text-gray-800 transition-all text-left"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-maroon-800 text-white flex items-center justify-center text-[10px]">
                      {p.full_name.charAt(0)}
                    </div>
                    <span>{p.full_name}</span>
                  </div>
                  <span className="text-[10px] text-maroon-900 bg-maroon-100/60 px-2 py-0.5 rounded-full capitalize">
                    {p.role === 'owner' ? 'Owner' : p.role === 'production_worker' ? 'Production' : 'Seller'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Janki Kulfi Mirehchi, Etah</p>
        </div>
      </div>
    </div>
  );
};
