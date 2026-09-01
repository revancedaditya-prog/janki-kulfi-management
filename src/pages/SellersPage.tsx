import React, { useState } from 'react';
import {
  useSellers,
  useCarts,
  useCreateSeller,
  useCreateCart,
} from '@/hooks/useSellers';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { formatQuantity } from '@/lib/formatters';
import { Users, Plus, Truck, Phone, MapPin, AlertCircle } from 'lucide-react';

export const SellersPage: React.FC = () => {
  const { data: sellers = [] } = useSellers();
  const { data: carts = [] } = useCarts();
  const { t } = useLanguage();
  const { isOwner } = useAuth();

  const createSeller = useCreateSeller();
  const createCart = useCreateCart();

  const [activeTab, setActiveTab] = useState<'sellers' | 'carts'>('sellers');
  const [isAddSellerOpen, setIsAddSellerOpen] = useState(false);
  const [isAddCartOpen, setIsAddCartOpen] = useState(false);

  // Seller Form
  const [sellerCode, setSellerCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [defaultCartId, setDefaultCartId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [sellerError, setSellerError] = useState<string | null>(null);

  // Cart Form
  const [cartCode, setCartCode] = useState('');
  const [cartName, setCartName] = useState('');
  const [cartLocation, setCartLocation] = useState('');
  const [cartError, setCartError] = useState<string | null>(null);

  const handleOpenAddSeller = () => {
    const nextSeq = String(sellers.length + 1).padStart(3, '0');
    setSellerCode(`SLR-${nextSeq}`);
    setFullName('');
    setPhone('');
    setAddress('');
    setDefaultCartId(carts[0]?.id || '');
    setOpeningBalance('0');
    setSellerError(null);
    setIsAddSellerOpen(true);
  };

  const handleOpenAddCart = () => {
    const nextSeq = String(carts.length + 1).padStart(2, '0');
    setCartCode(`CART-${nextSeq}`);
    setCartName('');
    setCartLocation('');
    setCartError(null);
    setIsAddCartOpen(true);
  };

  const handleCreateSellerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSellerError(null);

    if (!fullName.trim()) {
      setSellerError('कृपया विक्रेता का नाम दर्ज करें');
      return;
    }

    try {
      await createSeller.mutateAsync({
        seller_code: sellerCode,
        full_name: fullName,
        phone: phone || undefined,
        address: address || undefined,
        default_cart_id: defaultCartId || undefined,
        opening_balance: parseFloat(openingBalance) || 0,
      });
      setIsAddSellerOpen(false);
    } catch (err: any) {
      setSellerError(err.message || 'विक्रेता जोड़ने में त्रुटि');
    }
  };

  const handleCreateCartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCartError(null);

    if (!cartName.trim()) {
      setCartError('कृपया ठेले का नाम दर्ज करें');
      return;
    }

    try {
      await createCart.mutateAsync({
        cart_code: cartCode,
        cart_name: cartName,
        location: cartLocation || undefined,
      });
      setIsAddCartOpen(false);
    } catch (err: any) {
      setCartError(err.message || 'ठेला जोड़ने में त्रुटि');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-maroon-800" />
            {t.sellersList}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            कुल्फी बेचने वाले विक्रेता, ठेले एवं फील्ड स्टॉक का प्रबंधन
          </p>
        </div>

        {isOwner && (
          <div className="flex items-center gap-2">
            {activeTab === 'sellers' ? (
              <Button
                variant="primary"
                leftIcon={<Plus className="w-5 h-5" />}
                onClick={handleOpenAddSeller}
              >
                {t.addSeller}
              </Button>
            ) : (
              <Button
                variant="primary"
                leftIcon={<Plus className="w-5 h-5" />}
                onClick={handleOpenAddCart}
              >
                {t.addCart}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-cream-300 pb-2">
        <button
          onClick={() => setActiveTab('sellers')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'sellers'
              ? 'bg-maroon-800 text-white shadow-sm'
              : 'text-gray-600 hover:bg-cream-200'
          }`}
        >
          {t.sellersList} ({sellers.length})
        </button>
        <button
          onClick={() => setActiveTab('carts')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'carts'
              ? 'bg-maroon-800 text-white shadow-sm'
              : 'text-gray-600 hover:bg-cream-200'
          }`}
        >
          {t.cartsList} ({carts.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'sellers' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sellers.map((s) => (
            <Card key={s.id} className="border-cream-300">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-gray-500">
                      {s.seller_code}
                    </span>
                    <Badge variant={s.is_active ? 'active' : 'inactive'}>
                      {s.is_active ? t.active : t.inactive}
                    </Badge>
                  </div>
                  <h3 className="text-base font-black text-maroon-950 mt-1">{s.full_name}</h3>
                </div>

                <div className="text-right bg-cream-50 px-3 py-1.5 rounded-xl border border-cream-200">
                  <span className="text-[10px] font-bold text-gray-500 block">फील्ड में वर्तमान स्टॉक</span>
                  <span className="font-mono font-black text-base text-maroon-900">
                    {formatQuantity((s as any).current_held_stock || 0)} {t.pieces}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
                {s.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span>{s.phone}</span>
                  </div>
                )}
                {s.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span>{s.address}</span>
                  </div>
                )}
                {(s as any).default_cart && (
                  <div className="flex items-center gap-2 text-maroon-900 font-semibold">
                    <Truck className="w-3.5 h-3.5 text-maroon-700" />
                    <span>ठेला: {(s as any).default_cart.cart_name}</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {carts.map((c) => (
            <Card key={c.id} className="border-cream-300">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-xs font-bold text-gray-500">
                    {c.cart_code}
                  </span>
                  <h3 className="text-base font-black text-maroon-950 mt-1">{c.cart_name}</h3>
                </div>
                <Badge variant={c.is_active ? 'active' : 'inactive'}>
                  {c.is_active ? t.active : t.inactive}
                </Badge>
              </div>

              {c.location && (
                <div className="flex items-center gap-2 text-xs text-gray-600 mt-2">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  <span>{c.location}</span>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add Seller Modal */}
      <Modal
        isOpen={isAddSellerOpen}
        onClose={() => setIsAddSellerOpen(false)}
        title={t.addSeller}
        maxWidth="md"
      >
        <form onSubmit={handleCreateSellerSubmit} className="space-y-4 py-2">
          {sellerError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{sellerError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t.sellerCode}
              value={sellerCode}
              onChange={(e) => setSellerCode(e.target.value)}
              required
            />
            <Input
              label={t.sellerName}
              placeholder="जैसे: राम प्रसाद"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t.phone}
              placeholder="10 अंकों का मोबाइल नंबर"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                {t.defaultCart}
              </label>
              <select
                value={defaultCartId}
                onChange={(e) => setDefaultCartId(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
              >
                <option value="">-- ठेला चुनें (वैकल्पिक) --</option>
                {carts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cart_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label={t.address}
            placeholder="पता, गांव या मोहल्ला"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAddSellerOpen(false)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={createSeller.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Cart Modal */}
      <Modal
        isOpen={isAddCartOpen}
        onClose={() => setIsAddCartOpen(false)}
        title={t.addCart}
        maxWidth="sm"
      >
        <form onSubmit={handleCreateCartSubmit} className="space-y-4 py-2">
          {cartError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {cartError}
            </div>
          )}

          <Input
            label={t.cartCode}
            value={cartCode}
            onChange={(e) => setCartCode(e.target.value)}
            required
          />

          <Input
            label={t.cartName}
            placeholder="जैसे: मिरहची चौराहा ठेला"
            value={cartName}
            onChange={(e) => setCartName(e.target.value)}
            required
          />

          <Input
            label="स्थान / पॉइंट (Location)"
            placeholder="जैसे: बस स्टैंड, मुख्य बाजार"
            value={cartLocation}
            onChange={(e) => setCartLocation(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAddCartOpen(false)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={createCart.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
