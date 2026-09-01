import React from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Globe } from 'lucide-react';

export const LanguageToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      type="button"
      onClick={() => setLanguage(language === 'hi' ? 'en' : 'hi')}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border shadow-sm ${
        language === 'hi'
          ? 'bg-maroon-800 text-white border-maroon-900'
          : 'bg-white text-maroon-900 border-gray-300 hover:bg-cream-100'
      } ${className || ''}`}
      title="Switch Language / भाषा बदलें"
    >
      <Globe className="w-3.5 h-3.5" />
      <span>{language === 'hi' ? 'हिन्दी' : 'English'}</span>
    </button>
  );
};
