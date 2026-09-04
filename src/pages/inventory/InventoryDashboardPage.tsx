import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useRawMaterialDashboardKPIs,
  useIngredients,
  useMaterialPurchases,
} from '@/hooks/useInventory';
import { useLpgCylinders } from '@/hooks/useLpg';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { formatIngredientQuantityWithUnit } from '@/lib/inventoryService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { InventorySetupWizardModal } from '@/components/inventory/InventorySetupWizardModal';
import {
  Package,
  Plus,
  AlertTriangle,
  Flame,
  ShoppingCart,
  ClipboardCheck,
  TrendingDown,
  ArrowRight,
  Sparkles,
  XCircle,
  Truck,
} from 'lucide-react';

export const InventoryDashboardPage: React.FC = () => {
  const { language } = useLanguage();
  const { isOwner } = useAuth();

  const { data: kpis } = useRawMaterialDashboardKPIs();
  const { data: ingredients = [] } = useIngredients();
  const { data: purchases = [] } = useMaterialPurchases();
  const { data: cylinders = [] } = useLpgCylinders();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const categories = [
    { key: 'all', labelEn: 'All Items', labelHi: 'सभी सामग्री' },
    { key: 'dairy', labelEn: 'Dairy & Base', labelHi: 'दूध व मावा' },
    { key: 'sweetener', labelEn: 'Sweeteners', labelHi: 'चीनी व मीठा' },
    { key: 'dry_fruit', labelEn: 'Dry Fruits', labelHi: 'काजू, बादाम, पिस्ता' },
    { key: 'spice', labelEn: 'Spices', labelHi: 'केसर व इलायची' },
    { key: 'packaging', labelEn: 'Packaging', labelHi: 'स्टिक व रैपर' },
    { key: 'fuel', labelEn: 'Fuel / LPG', labelHi: 'गैस / ईंधन' },
  ];

  const filteredIngredients = ingredients.filter((ing) => {
    const matchesCat = selectedCategory === 'all' || ing.category === selectedCategory;
    const matchesSearch =
      ing.name_hi.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ing.name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ing.code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const activeCylinder = cylinders.find((c) => c.status === 'in_use') || cylinders[0];

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">
              {language === 'hi' ? 'कच्ची सामग्री इन्वेंटरी' : 'Raw Material Inventory'}
            </h1>
            <Badge variant="primary" className="font-bold">
              {language === 'hi' ? 'सामग्री स्टॉक' : 'Live Stock'}
            </Badge>
          </div>
          <p className="text-xs text-stone-600 mt-1">
            {language === 'hi'
              ? 'दूध, खोया, ड्राई फ्रूट्स, पैकिंग व गैस सिलेंडर का सटीक बहीखाता'
              : 'Authoritative tracking of dairy, dry fruits, spices, packaging & LPG cylinders'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Sparkles className="w-4 h-4 text-amber-600" />}
              onClick={() => setIsWizardOpen(true)}
              className="text-stone-700 bg-white"
            >
              {language === 'hi' ? 'सेटअप विज़ार्ड' : 'Setup Wizard'}
            </Button>
          )}

          <Link to="/inventory/stock-check">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<ClipboardCheck className="w-4 h-4 text-sky-600" />}
              className="text-stone-700 bg-white"
            >
              {language === 'hi' ? 'स्टॉक मिलान' : 'Stock Check'}
            </Button>
          </Link>

          <Link to="/inventory/purchases/new">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm"
            >
              {language === 'hi' ? '+ नई खरीद (Stock-In)' : '+ New Purchase'}
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
        {/* Total Stock Value */}
        <Card className="p-4 bg-linear-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-200/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-900">
              {language === 'hi' ? 'कुल स्टॉक मूल्य' : 'Total Stock Value'}
            </span>
            <Package className="w-4 h-4 text-amber-700" />
          </div>
          <p className="text-xl font-black text-stone-900 mt-2">
            {formatCurrency(kpis?.total_stock_value || 0)}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {ingredients.length} {language === 'hi' ? 'सामग्रियां सक्रिय' : 'active ingredients'}
          </p>
        </Card>

        {/* Low Stock Alert */}
        <Link to="/inventory/shopping-list" className="block">
          <Card className={`p-4 h-full border transition-all hover:shadow-md ${
            (kpis?.low_stock_count || 0) > 0 ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-stone-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-900">
                {language === 'hi' ? 'कम स्टॉक सामग्री' : 'Low Stock Alert'}
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-xl font-black text-amber-900 mt-2">
              {kpis?.low_stock_count || 0}
            </p>
            <p className="text-[11px] text-amber-700 flex items-center gap-1 mt-0.5 font-medium">
              <span>{language === 'hi' ? 'खरीद सूची देखें' : 'View reorder list'}</span>
              <ArrowRight className="w-3 h-3" />
            </p>
          </Card>
        </Link>

        {/* Out of Stock */}
        <Card className={`p-4 border ${
          (kpis?.out_of_stock_count || 0) > 0 ? 'bg-rose-50/70 border-rose-300' : 'bg-white border-stone-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-900">
              {language === 'hi' ? 'स्टॉक खत्म (0 स्टॉक)' : 'Out of Stock'}
            </span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-xl font-black text-rose-900 mt-2">
            {kpis?.out_of_stock_count || 0}
          </p>
          <p className="text-[11px] text-rose-700 mt-0.5 font-medium">
            {language === 'hi' ? 'उत्पादन से पहले खरीदें' : 'Immediate purchase needed'}
          </p>
        </Card>

        {/* LPG Cylinder Remaining */}
        <Link to="/inventory/lpg" className="block">
          <Card className="p-4 h-full bg-linear-to-br from-orange-500/10 via-orange-500/5 to-transparent border-orange-200/80 transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-orange-950">
                {language === 'hi' ? 'LPG गैस सिलेंडर' : 'LPG Gas Status'}
              </span>
              <Flame className="w-4 h-4 text-orange-600" />
            </div>
            <div className="flex items-baseline gap-1.5 mt-2">
              <p className="text-xl font-black text-stone-900">
                {activeCylinder?.calculated_remaining_gas || 0} <span className="text-xs font-semibold text-stone-600">kg</span>
              </p>
              <span className="text-[11px] font-bold text-orange-700">
                ({activeCylinder?.remaining_percentage || 0}%)
              </span>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5 truncate">
              {activeCylinder?.cylinder_code || 'LPG-01'}: {activeCylinder?.status === 'in_use' ? (language === 'hi' ? 'भट्टी पर चालू' : 'In Use') : activeCylinder?.status}
            </p>
          </Card>
        </Link>

        {/* Monthly Purchases */}
        <Card className="p-4 col-span-2 sm:col-span-1 bg-white border-stone-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-600">
              {language === 'hi' ? 'इस महीने की खरीद' : 'Purchases (Month)'}
            </span>
            <Truck className="w-4 h-4 text-stone-500" />
          </div>
          <p className="text-xl font-black text-stone-900 mt-2">
            {formatCurrency(kpis?.purchases_this_month || 0)}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {language === 'hi' ? 'खपत:' : 'Used:'} {formatCurrency(kpis?.consumption_this_month || 0)}
          </p>
        </Card>
      </div>

      {/* Main Stock Table & Navigation Section */}
      <Card className="p-5 border-stone-200 shadow-sm">
        {/* Filter and Category Pills */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4 pb-4 border-b border-stone-100">
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat.key
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {language === 'hi' ? cat.labelHi : cat.labelEn}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder={language === 'hi' ? 'सामग्री खोजें (नाम / कोड)...' : 'Search raw material...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-64 px-3 py-1.5 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
            />
            <Link to="/inventory/items">
              <Button variant="outline" size="sm" className="whitespace-nowrap text-xs">
                {language === 'hi' ? 'सभी प्रबंधित करें' : 'Manage All'}
              </Button>
            </Link>
          </div>
        </div>

        {/* Live Stock Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-50 text-stone-600 font-semibold border-b border-stone-200">
              <tr>
                <th className="p-3">{language === 'hi' ? 'सामग्री' : 'Ingredient'}</th>
                <th className="p-3">{language === 'hi' ? 'श्रेणी' : 'Category'}</th>
                <th className="p-3 text-right">{language === 'hi' ? 'उपलब्ध स्टॉक' : 'Available Stock'}</th>
                <th className="p-3 text-right">{language === 'hi' ? 'वर्तमान दर (WAC)' : 'Avg Cost'}</th>
                <th className="p-3 text-right">{language === 'hi' ? 'स्टॉक मूल्य' : 'Total Value'}</th>
                <th className="p-3 text-center">{language === 'hi' ? 'स्थिति' : 'Status'}</th>
                <th className="p-3 text-right">{language === 'hi' ? 'कार्य' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredIngredients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-stone-500">
                    {language === 'hi' ? 'कोई सामग्री नहीं मिली।' : 'No raw materials found.'}
                  </td>
                </tr>
              ) : (
                filteredIngredients.map((ing) => {
                  const isLow = ing.stock_status === 'low_stock';
                  const isOut = ing.stock_status === 'out_of_stock';
                  return (
                    <tr
                      key={ing.id}
                      className={`hover:bg-stone-50/70 transition-colors ${
                        isOut ? 'bg-rose-50/30' : isLow ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="p-3">
                        <Link to={`/inventory/items/${ing.id}`} className="hover:underline font-bold text-stone-900 block">
                          {ing.name_hi}
                          <span className="text-stone-500 font-normal ml-1">({ing.name_en})</span>
                        </Link>
                        <span className="text-[10px] text-stone-400 font-mono">{ing.code}</span>
                      </td>

                      <td className="p-3">
                        <span className="capitalize text-stone-600 bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                          {ing.category.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="p-3 text-right font-bold text-stone-900 text-sm">
                        {formatIngredientQuantityWithUnit(ing.available_base_quantity || 0, ing.base_unit)}
                      </td>

                      <td className="p-3 text-right text-stone-700 font-medium">
                        {formatCurrency(ing.weighted_average_rate || ing.current_rate)} / {ing.rate_unit}
                      </td>

                      <td className="p-3 text-right font-bold text-stone-900">
                        {formatCurrency(ing.total_stock_value || 0)}
                      </td>

                      <td className="p-3 text-center">
                        {isOut ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            {language === 'hi' ? 'खत्म (0)' : 'Out of Stock'}
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            {language === 'hi' ? 'कम स्टॉक' : 'Low Stock'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            {language === 'hi' ? 'उपलब्ध' : 'In Stock'}
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Link to={`/inventory/purchases/new?ingredient_id=${ing.id}`}>
                            <button
                              title="खरीदें"
                              className="px-2 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 cursor-pointer"
                            >
                              + {language === 'hi' ? 'खरीद' : 'Buy'}
                            </button>
                          </Link>
                          <Link to={`/inventory/items/${ing.id}`}>
                            <button className="px-2 py-1 text-[11px] font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded cursor-pointer">
                              {language === 'hi' ? 'खाता' : 'Ledger'}
                            </button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Bottom Section: Recent Purchases & Wastage quick links */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Purchases */}
        <Card className="p-5 border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-100">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-600" />
              {language === 'hi' ? 'हालिया सामग्री खरीद (Recent Purchases)' : 'Recent Purchases'}
            </h3>
            <Link to="/inventory/purchases" className="text-xs font-semibold text-amber-700 hover:underline">
              {language === 'hi' ? 'सभी देखें →' : 'View All →'}
            </Link>
          </div>

          <div className="space-y-2.5">
            {purchases.slice(0, 4).length === 0 ? (
              <p className="text-xs text-stone-500 py-4 text-center">
                {language === 'hi' ? 'अभी कोई खरीद दर्ज नहीं है।' : 'No material purchases recorded yet.'}
              </p>
            ) : (
              purchases.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="p-3 bg-stone-50 rounded-xl flex items-center justify-between hover:bg-stone-100/70 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-stone-900">{p.purchase_number}</span>
                      <span className="text-[10px] text-stone-500 font-medium">{formatDate(p.purchase_date)}</span>
                    </div>
                    <p className="text-[11px] text-stone-600 mt-0.5">
                      {p.supplier?.name || (language === 'hi' ? 'सप्लायर' : 'Supplier')} • {p.items.length} {language === 'hi' ? 'सामग्री' : 'items'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-xs text-stone-900">{formatCurrency(p.total_amount)}</p>
                    <span className="text-[10px] uppercase font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      {p.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Quick Inventory Navigation Cards */}
        <div className="grid grid-cols-2 gap-3.5">
          <Link to="/inventory/shopping-list" className="block">
            <Card className="p-4 h-full bg-linear-to-br from-amber-50 to-white border-amber-200 hover:shadow-md transition-all">
              <ShoppingCart className="w-5 h-5 text-amber-600 mb-2" />
              <h4 className="text-xs font-bold text-stone-900">
                {language === 'hi' ? 'खरीद सूची (Shopping List)' : 'Shopping List'}
              </h4>
              <p className="text-[11px] text-stone-500 mt-1">
                {language === 'hi' ? 'कम स्टॉक सामग्री का सप्लायर-वाइज ऑर्डर बनाएं' : 'Low stock items grouped by supplier'}
              </p>
            </Card>
          </Link>

          <Link to="/inventory/lpg" className="block">
            <Card className="p-4 h-full bg-linear-to-br from-orange-50 to-white border-orange-200 hover:shadow-md transition-all">
              <Flame className="w-5 h-5 text-orange-600 mb-2" />
              <h4 className="text-xs font-bold text-stone-900">
                {language === 'hi' ? 'LPG गैस सिलेंडर' : 'LPG Cylinders'}
              </h4>
              <p className="text-[11px] text-stone-500 mt-1">
                {language === 'hi' ? 'वजन आधारित गैस खपत व रिफिल ट्रैकिंग' : 'Weight-based gas consumption & refills'}
              </p>
            </Card>
          </Link>

          <Link to="/inventory/stock-check" className="block">
            <Card className="p-4 h-full bg-linear-to-br from-sky-50 to-white border-sky-200 hover:shadow-md transition-all">
              <ClipboardCheck className="w-5 h-5 text-sky-600 mb-2" />
              <h4 className="text-xs font-bold text-stone-900">
                {language === 'hi' ? 'भौतिक स्टॉक जांच' : 'Physical Stock Check'}
              </h4>
              <p className="text-[11px] text-stone-500 mt-1">
                {language === 'hi' ? 'ऐप स्टॉक बनाम वास्तविक गिनती व सुधार' : 'App stock vs physical count corrections'}
              </p>
            </Card>
          </Link>

          <Link to="/inventory/wastage" className="block">
            <Card className="p-4 h-full bg-linear-to-br from-rose-50 to-white border-rose-200 hover:shadow-md transition-all">
              <TrendingDown className="w-5 h-5 text-rose-600 mb-2" />
              <h4 className="text-xs font-bold text-stone-900">
                {language === 'hi' ? 'खराबी व नुकसान' : 'Wastage & Damage'}
              </h4>
              <p className="text-[11px] text-stone-500 mt-1">
                {language === 'hi' ? 'दूध खराब होना, स्पिलेज व नमूना खपत' : 'Spillage, spoilage & internal testing loss'}
              </p>
            </Card>
          </Link>
        </div>
      </div>

      {/* Initial Setup Wizard Modal */}
      <InventorySetupWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
      />
    </div>
  );
};
