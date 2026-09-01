import React, { useState } from 'react';
import {
  useSellers,
  useCarts,
  useCreateSeller,
  useUpdateSeller,
  useDeleteSeller,
  useCreateCart,
  useUpdateCart,
  useDeleteCart,
} from '@/hooks/useSellers';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { formatQuantity, formatCurrency } from '@/lib/formatters';
import {
  Users,
  Plus,
  Truck,
  Phone,
  MapPin,
  AlertCircle,
  Edit2,
  Trash2,
  DollarSign,
} from 'lucide-react';
import { Seller, Cart } from '@/types';

export const SellersPage: React.FC = () => {
  const { data: sellers = [], isLoading: isSellersLoading } = useSellers();
  const { data: carts = [], isLoading: isCartsLoading } = useCarts();
  const { t } = useLanguage();
  const { isOwner } = useAuth();

  const createSeller = useCreateSeller();
  const updateSeller = useUpdateSeller();
  const deleteSeller = useDeleteSeller();

  const createCart = useCreateCart();
  const updateCart = useUpdateCart();
  const deleteCart = useDeleteCart();

  const [activeTab, setActiveTab] = useState<'sellers' | 'carts'>('sellers');
  const [isAddSellerOpen, setIsAddSellerOpen] = useState(false);
  const [isAddCartOpen, setIsAddCartOpen] = useState(false);

  // Edit & Delete state
  const [sellerToEdit, setSellerToEdit] = useState<Seller | null>(null);
  const [sellerToDelete, setSellerToDelete] = useState<Seller | null>(null);
  const [cartToEdit, setCartToEdit] = useState<Cart | null>(null);
  const [cartToDelete, setCartToDelete] = useState<Cart | null>(null);

  // Add Seller Form
  const [sellerCode, setSellerCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [defaultCartId, setDefaultCartId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [sellerError, setSellerError] = useState<string | null>(null);

  // Edit Seller Form
  const [editSellerCode, setEditSellerCode] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDefaultCartId, setEditDefaultCartId] = useState('');
  const [editOpeningBalance, setEditOpeningBalance] = useState('0');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editSellerError, setEditSellerError] = useState<string | null>(null);

  // Add Cart Form
  const [cartCode, setCartCode] = useState('');
  const [cartName, setCartName] = useState('');
  const [cartLocation, setCartLocation] = useState('');
  const [cartError, setCartError] = useState<string | null>(null);

  // Edit Cart Form
  const [editCartCode, setEditCartCode] = useState('');
  const [editCartName, setEditCartName] = useState('');
  const [editCartLocation, setEditCartLocation] = useState('');
  const [editCartIsActive, setEditCartIsActive] = useState(true);
  const [editCartError, setEditCartError] = useState<string | null>(null);

  // Status message
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  // --- Seller Handlers ---
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

  const handleOpenEditSeller = (seller: Seller) => {
    setSellerToEdit(seller);
    setEditSellerCode(seller.seller_code);
    setEditFullName(seller.full_name);
    setEditPhone(seller.phone || '');
    setEditAddress(seller.address || '');
    setEditDefaultCartId(seller.default_cart_id || '');
    setEditOpeningBalance(String(seller.opening_balance || 0));
    setEditIsActive(seller.is_active);
    setEditSellerError(null);
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
      showSuccess(`विक्रेता "${fullName}" सफलतापूर्वक जोड़ दिया गया।`);
    } catch (err: any) {
      setSellerError(err.message || 'विक्रेता जोड़ने में त्रुटि');
    }
  };

  const handleEditSellerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerToEdit) return;
    setEditSellerError(null);

    if (!editFullName.trim()) {
      setEditSellerError('कृपया विक्रेता का नाम दर्ज करें');
      return;
    }

    try {
      await updateSeller.mutateAsync({
        id: sellerToEdit.id,
        updates: {
          seller_code: editSellerCode,
          full_name: editFullName,
          phone: editPhone || undefined,
          address: editAddress || undefined,
          default_cart_id: editDefaultCartId || null,
          opening_balance: parseFloat(editOpeningBalance) || 0,
          is_active: editIsActive,
        },
      });
      setSellerToEdit(null);
      showSuccess(`विक्रेता "${editFullName}" का विवरण अपडेट हो गया।`);
    } catch (err: any) {
      setEditSellerError(err.message || 'विक्रेता अपडेट करने में त्रुटि');
    }
  };

  const handleConfirmDeleteSeller = async () => {
    if (!sellerToDelete) return;
    try {
      const res = await deleteSeller.mutateAsync(sellerToDelete.id);
      showSuccess(res.message || 'विक्रेता प्रक्रिया पूर्ण हुई।');
      setSellerToDelete(null);
    } catch (err: any) {
      alert(err.message || 'विक्रेता हटाने में त्रुटि');
    }
  };

  // --- Cart Handlers ---
  const handleOpenAddCart = () => {
    const nextSeq = String(carts.length + 1).padStart(2, '0');
    setCartCode(`CART-${nextSeq}`);
    setCartName('');
    setCartLocation('');
    setCartError(null);
    setIsAddCartOpen(true);
  };

  const handleOpenEditCart = (cart: Cart) => {
    setCartToEdit(cart);
    setEditCartCode(cart.cart_code);
    setEditCartName(cart.cart_name);
    setEditCartLocation(cart.location || '');
    setEditCartIsActive(cart.is_active);
    setEditCartError(null);
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
      showSuccess(`ठेला "${cartName}" सफलतापूर्वक जोड़ दिया गया।`);
    } catch (err: any) {
      setCartError(err.message || 'ठेला जोड़ने में त्रुटि');
    }
  };

  const handleEditCartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartToEdit) return;
    setEditCartError(null);

    if (!editCartName.trim()) {
      setEditCartError('कृपया ठेले का नाम दर्ज करें');
      return;
    }

    try {
      await updateCart.mutateAsync({
        id: cartToEdit.id,
        updates: {
          cart_code: editCartCode,
          cart_name: editCartName,
          location: editCartLocation || undefined,
          is_active: editCartIsActive,
        },
      });
      setCartToEdit(null);
      showSuccess(`ठेला "${editCartName}" का विवरण अपडेट हो गया।`);
    } catch (err: any) {
      setEditCartError(err.message || 'ठेला अपडेट करने में त्रुटि');
    }
  };

  const handleConfirmDeleteCart = async () => {
    if (!cartToDelete) return;
    try {
      const res = await deleteCart.mutateAsync(cartToDelete.id);
      showSuccess(res.message || 'ठेला प्रक्रिया पूर्ण हुई।');
      setCartToDelete(null);
    } catch (err: any) {
      alert(err.message || 'ठेला हटाने में त्रुटि');
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

      {/* Action Notification Alert */}
      {actionSuccessMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between shadow-sm animate-fade-in">
          <span>{actionSuccessMsg}</span>
          <button
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-900 ml-2"
          >
            ✕
          </button>
        </div>
      )}

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
        isSellersLoading ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-gray-500 mt-3">{t.loading}</p>
          </div>
        ) : sellers.length === 0 ? (
          <Card className="text-center py-12">
            <div className="w-14 h-14 bg-cream-100 text-maroon-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-gray-900">कोई विक्रेता नहीं मिला</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              दैनिक स्टॉक वितरण और बिक्री के लिए नया विक्रेता जोड़ें।
            </p>
            {isOwner && (
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={handleOpenAddSeller}
              >
                {t.addSeller}
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sellers.map((s) => (
              <Card
                key={s.id}
                className={`border-cream-300 transition-all ${
                  !s.is_active ? 'bg-gray-50/80 opacity-80' : ''
                }`}
              >
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
                    <span className="text-[10px] font-bold text-gray-500 block">फील्ड में स्टॉक</span>
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
                  {s.opening_balance !== undefined && s.opening_balance !== 0 && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                      <span>प्रारंभिक शेष: {formatCurrency(s.opening_balance)}</span>
                    </div>
                  )}
                </div>

                {/* Owner Actions */}
                {isOwner && (
                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-maroon-800 hover:bg-cream-100 h-8 px-2.5"
                      onClick={() => handleOpenEditSeller(s)}
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1" />
                      {t.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-700 hover:bg-rose-50 h-8 px-2.5"
                      onClick={() => setSellerToDelete(s)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      {t.delete}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )
      ) : (
        isCartsLoading ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-gray-500 mt-3">{t.loading}</p>
          </div>
        ) : carts.length === 0 ? (
          <Card className="text-center py-12">
            <div className="w-14 h-14 bg-cream-100 text-maroon-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Truck className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-gray-900">कोई ठेला नहीं मिला</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              विक्रेताओं को आवंटित करने के लिए नया ठेला जोड़ें।
            </p>
            {isOwner && (
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={handleOpenAddCart}
              >
                {t.addCart}
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {carts.map((c) => (
              <Card
                key={c.id}
                className={`border-cream-300 transition-all ${
                  !c.is_active ? 'bg-gray-50/80 opacity-80' : ''
                }`}
              >
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
                    <span>स्थान: {c.location}</span>
                  </div>
                )}

                {/* Owner Actions for Cart */}
                {isOwner && (
                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-maroon-800 hover:bg-cream-100 h-8 px-2.5"
                      onClick={() => handleOpenEditCart(c)}
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1" />
                      {t.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-700 hover:bg-rose-50 h-8 px-2.5"
                      onClick={() => setCartToDelete(c)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      {t.delete}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )
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
                    {c.cart_name} ({c.cart_code})
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

      {/* Edit Seller Modal */}
      <Modal
        isOpen={Boolean(sellerToEdit)}
        onClose={() => setSellerToEdit(null)}
        title={t.editSeller}
        maxWidth="md"
      >
        <form onSubmit={handleEditSellerSubmit} className="space-y-4 py-2">
          {editSellerError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{editSellerError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t.sellerCode}
              value={editSellerCode}
              onChange={(e) => setEditSellerCode(e.target.value)}
              required
            />
            <Input
              label={t.sellerName}
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t.phone}
              placeholder="10 अंकों का मोबाइल नंबर"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                {t.defaultCart}
              </label>
              <select
                value={editDefaultCartId}
                onChange={(e) => setEditDefaultCartId(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
              >
                <option value="">-- कोई ठेला नहीं --</option>
                {carts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cart_name} ({c.cart_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label={t.address}
            placeholder="पता, गांव या मोहल्ला"
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-800">
              {t.status} (Active / Inactive)
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="sellerStatus"
                  checked={editIsActive}
                  onChange={() => setEditIsActive(true)}
                  className="text-maroon-800 focus:ring-maroon-700 h-4 w-4"
                />
                <span>सक्रिय (Active)</span>
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="sellerStatus"
                  checked={!editIsActive}
                  onChange={() => setEditIsActive(false)}
                  className="text-maroon-800 focus:ring-maroon-700 h-4 w-4"
                />
                <span>निष्क्रिय (Inactive)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSellerToEdit(null)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={updateSeller.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete / Deactivate Seller Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(sellerToDelete)}
        onClose={() => setSellerToDelete(null)}
        onConfirm={handleConfirmDeleteSeller}
        title={t.deleteSeller}
        description={`क्या आप "${sellerToDelete?.full_name}" (${sellerToDelete?.seller_code}) को हटाना या निष्क्रिय करना चाहते हैं? यदि इस विक्रेता का पिछला स्टॉक इतिहास है तो यह सुरक्षित रूप से निष्क्रिय कर दिया जाएगा।`}
        confirmText="हाँ, हटाएं / निष्क्रिय करें"
        cancelText={t.cancel}
        variant="danger"
        isLoading={deleteSeller.isPending}
      />

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

      {/* Edit Cart Modal */}
      <Modal
        isOpen={Boolean(cartToEdit)}
        onClose={() => setCartToEdit(null)}
        title={t.editCart}
        maxWidth="sm"
      >
        <form onSubmit={handleEditCartSubmit} className="space-y-4 py-2">
          {editCartError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {editCartError}
            </div>
          )}

          <Input
            label={t.cartCode}
            value={editCartCode}
            onChange={(e) => setEditCartCode(e.target.value)}
            required
          />

          <Input
            label={t.cartName}
            value={editCartName}
            onChange={(e) => setEditCartName(e.target.value)}
            required
          />

          <Input
            label="स्थान / पॉइंट (Location)"
            placeholder="जैसे: बस स्टैंड, मुख्य बाजार"
            value={editCartLocation}
            onChange={(e) => setEditCartLocation(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-800">
              {t.status}
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="cartStatus"
                  checked={editCartIsActive}
                  onChange={() => setEditCartIsActive(true)}
                  className="text-maroon-800 focus:ring-maroon-700 h-4 w-4"
                />
                <span>सक्रिय (Active)</span>
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="cartStatus"
                  checked={!editCartIsActive}
                  onChange={() => setEditCartIsActive(false)}
                  className="text-maroon-800 focus:ring-maroon-700 h-4 w-4"
                />
                <span>निष्क्रिय (Inactive)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCartToEdit(null)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={updateCart.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete / Deactivate Cart Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(cartToDelete)}
        onClose={() => setCartToDelete(null)}
        onConfirm={handleConfirmDeleteCart}
        title={t.deleteCart}
        description={`क्या आप ठेला "${cartToDelete?.cart_name}" (${cartToDelete?.cart_code}) को हटाना या निष्क्रिय करना चाहते हैं?`}
        confirmText="हाँ, हटाएं / निष्क्रिय करें"
        cancelText={t.cancel}
        variant="danger"
        isLoading={deleteCart.isPending}
      />
    </div>
  );
};
