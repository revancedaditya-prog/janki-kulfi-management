import React, { useState } from 'react';
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  usePriceHistory,
} from '@/hooks/useProducts';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { Package, Plus, History, Edit, AlertCircle } from 'lucide-react';
import { ProductWithPrice, CommissionType } from '@/types';

export const ProductsPage: React.FC = () => {
  const { data: products = [], isLoading } = useProducts();
  const { t, language } = useLanguage();
  const { isOwner } = useAuth();

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<ProductWithPrice | null>(null);

  // Add Product Form State
  const [nameEn, setNameEn] = useState('');
  const [nameHi, setNameHi] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [commissionType, setCommissionType] = useState<CommissionType>('fixed');
  const [commissionValue, setCommissionValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Product Form State
  const [editNameEn, setEditNameEn] = useState('');
  const [editNameHi, setEditNameHi] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSellingPrice, setEditSellingPrice] = useState('');
  const [editCommissionType, setEditCommissionType] = useState<CommissionType>('fixed');
  const [editCommissionValue, setEditCommissionValue] = useState('');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  // Price history query
  const { data: priceHistory = [] } = usePriceHistory(selectedProductForEdit?.id || '');

  const handleOpenAddModal = () => {
    setNameEn('');
    setNameHi('');
    setSku(`JK-${Date.now().toString().slice(-4)}`);
    setDescription('');
    setSellingPrice('10');
    setCommissionType('fixed');
    setCommissionValue('2');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (prod: ProductWithPrice) => {
    setSelectedProductForEdit(prod);
    setEditNameEn(prod.name_en || '');
    setEditNameHi(prod.name_hi || '');
    setEditSku(prod.sku || '');
    setEditDescription(prod.description || '');
    setEditSellingPrice(String(prod.current_price || 0));
    setEditCommissionType((prod.commission_type as CommissionType) || 'fixed');
    setEditCommissionValue(String(prod.commission_value || 0));
    setEditIsActive(prod.is_active !== false);
    setEditFormError(null);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const priceNum = parseFloat(sellingPrice);
    const commNum = parseFloat(commissionValue);

    if (isNaN(priceNum) || priceNum <= 0) {
      setFormError('कृपया सही बिक्री मूल्य दर्ज करें');
      return;
    }
    if (isNaN(commNum) || commNum < 0) {
      setFormError('कमीशन 0 या उससे अधिक होना चाहिए');
      return;
    }

    try {
      await createProduct.mutateAsync({
        product: { name_en: nameEn, name_hi: nameHi, sku, description },
        sellingPrice: priceNum,
        commissionType,
        commissionValue: commNum,
      });
      setIsAddModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'उत्पाद जोड़ने में त्रुटि');
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditFormError(null);

    if (!selectedProductForEdit) return;
    const priceNum = parseFloat(editSellingPrice);
    const commNum = parseFloat(editCommissionValue);

    if (isNaN(priceNum) || priceNum <= 0) {
      setEditFormError('कृपया सही बिक्री मूल्य दर्ज करें');
      return;
    }
    if (isNaN(commNum) || commNum < 0) {
      setEditFormError('कमीशन 0 या उससे अधिक होना चाहिए');
      return;
    }

    try {
      await updateProduct.mutateAsync({
        productId: selectedProductForEdit.id,
        data: {
          name_en: editNameEn.trim(),
          name_hi: editNameHi.trim(),
          sku: editSku.trim(),
          description: editDescription.trim(),
          selling_price: priceNum,
          commission_type: editCommissionType,
          commission_value: commNum,
          is_active: editIsActive,
        },
      });
      setSelectedProductForEdit(null);
    } catch (err: any) {
      setEditFormError(err.message || 'उत्पाद अपडेट करने में त्रुटि');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-maroon-800" />
            {t.productsList}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            कुल्फी उत्पाद सूची, वर्तमान बिक्री दरें, मूल्य इतिहास एवं विक्रेता कमीशन दरें
          </p>
        </div>

        {isOwner && (
          <Button
            variant="primary"
            leftIcon={<Plus className="w-5 h-5" />}
            onClick={handleOpenAddModal}
          >
            {t.addProduct}
          </Button>
        )}
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-gray-500 mt-3">{t.loading}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {products.map((prod) => (
            <Card key={prod.id} className="border-cream-300 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-gray-500">
                    {prod.sku}
                  </span>
                  <Badge variant={prod.is_active ? 'active' : 'inactive'}>
                    {prod.is_active ? t.active : t.inactive}
                  </Badge>
                </div>

                <h3 className="text-base font-black text-maroon-950 tracking-tight">
                  {language === 'hi' ? prod.name_hi : prod.name_en}
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  {language === 'hi' ? prod.name_en : prod.name_hi}
                </p>

                {prod.description && (
                  <p className="text-xs text-gray-600 mb-4 bg-cream-50 p-2.5 rounded-xl border border-cream-200">
                    {prod.description}
                  </p>
                )}

                <div className="space-y-1.5 p-3 rounded-2xl bg-cream-100/60 border border-cream-200 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t.sellingPrice}:</span>
                    <span className="font-mono font-black text-sm text-gray-900">
                      {formatCurrency(prod.current_price)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t.commissionValue}:</span>
                    <span className="font-mono font-bold text-maroon-800">
                      {prod.commission_type === 'percentage'
                        ? `${prod.commission_value}%`
                        : `${formatCurrency(prod.commission_value)} / pc`}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-cream-200 pt-1">
                    <span className="text-gray-600">{t.availableInFreezer}:</span>
                    <span className="font-mono font-black text-emerald-800">
                      {prod.available_quantity || 0} {t.pieces}
                    </span>
                  </div>
                </div>
              </div>

              {isOwner && (
                <div className="pt-4 border-t border-gray-100 mt-4 flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Edit className="w-4 h-4" />}
                    onClick={() => handleOpenEditModal(prod)}
                  >
                    उत्पाद संपादित करें (Edit Product)
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add Product Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t.addProduct}
        maxWidth="md"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4 py-2">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t.productNameEn}
              placeholder="e.g. Kesar Pista Kulfi"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              required
            />
            <Input
              label={t.productNameHi}
              placeholder="जैसे: केसर पिस्ता कुल्फी"
              value={nameHi}
              onChange={(e) => setNameHi(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t.sku}
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              required
            />
            <Input
              type="number"
              step="0.01"
              label={t.sellingPrice}
              prefixSymbol="₹"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                {t.commissionType}
              </label>
              <select
                value={commissionType}
                onChange={(e) => setCommissionType(e.target.value as CommissionType)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
              >
                <option value="fixed">{t.commissionFixed}</option>
                <option value="percentage">{t.commissionPercentage}</option>
              </select>
            </div>

            <Input
              type="number"
              step="0.01"
              label={t.commissionValue}
              prefixSymbol={commissionType === 'fixed' ? '₹' : undefined}
              suffixSymbol={commissionType === 'percentage' ? '%' : undefined}
              value={commissionValue}
              onChange={(e) => setCommissionValue(e.target.value)}
              required
            />
          </div>

          <Input
            label="विवरण (Description)"
            placeholder="उत्पाद के स्वाद व सामग्री की जानकारी"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAddModalOpen(false)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={createProduct.isPending}>
              {t.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Product & Price History Modal */}
      <Modal
        isOpen={Boolean(selectedProductForEdit)}
        onClose={() => setSelectedProductForEdit(null)}
        title="उत्पाद संपादित करें (Edit Product)"
        subtitle={
          selectedProductForEdit
            ? language === 'hi'
              ? selectedProductForEdit.name_hi
              : selectedProductForEdit.name_en
            : ''
        }
        maxWidth="lg"
      >
        <div className="space-y-5 py-2">
          {/* Edit Form */}
          <form onSubmit={handleUpdateProduct} className="space-y-4 p-4 rounded-2xl bg-cream-50 border border-cream-200">
            {editFormError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {editFormError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="हिंदी नाम (Product Name Hindi) *"
                placeholder="जैसे: ₹10 सादा कुल्फी"
                value={editNameHi}
                onChange={(e) => setEditNameHi(e.target.value)}
                required
              />
              <Input
                label="English Name *"
                placeholder="e.g. ₹10 Sada Kulfi"
                value={editNameEn}
                onChange={(e) => setEditNameEn(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="SKU / प्रोडक्ट कोड *"
                value={editSku}
                onChange={(e) => setEditSku(e.target.value)}
                required
              />

              <Input
                type="number"
                step="0.01"
                min="0.01"
                label="बिक्री मूल्य (Selling Price ₹) *"
                prefixSymbol="₹"
                value={editSellingPrice}
                onChange={(e) => setEditSellingPrice(e.target.value)}
                required
              />

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700">
                  सक्रिय स्थिति (Status)
                </label>
                <select
                  value={editIsActive ? 'active' : 'inactive'}
                  onChange={(e) => setEditIsActive(e.target.value === 'active')}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-800"
                >
                  <option value="active">सक्रिय (Active)</option>
                  <option value="inactive">निष्क्रिय (Inactive)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700">
                  {t.commissionType}
                </label>
                <select
                  value={editCommissionType}
                  onChange={(e) => setEditCommissionType(e.target.value as CommissionType)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
                >
                  <option value="fixed">{t.commissionFixed}</option>
                  <option value="percentage">{t.commissionPercentage}</option>
                </select>
              </div>

              <Input
                type="number"
                step="0.01"
                label={t.commissionValue}
                prefixSymbol={editCommissionType === 'fixed' ? '₹' : undefined}
                suffixSymbol={editCommissionType === 'percentage' ? '%' : undefined}
                value={editCommissionValue}
                onChange={(e) => setEditCommissionValue(e.target.value)}
                required
              />
            </div>

            <Input
              label="विवरण (Description)"
              placeholder="उत्पाद के स्वाद व पैकेजिंग की जानकारी"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSelectedProductForEdit(null)}
              >
                {t.cancel}
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={updateProduct.isPending}>
                उत्पाद अपडेट करें (Save Product)
              </Button>
            </div>
          </form>

          {/* Price History Table */}
          <div>
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <History className="w-4 h-4 text-maroon-800" />
              {t.priceHistory}
            </h4>

            <div className="overflow-x-auto border border-gray-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-cream-100/70 border-b border-gray-200 text-gray-600 font-bold">
                    <th className="py-2.5 px-3">बिक्री मूल्य</th>
                    <th className="py-2.5 px-3">कमीशन</th>
                    <th className="py-2.5 px-3">प्रभावी तिथि (From)</th>
                    <th className="py-2.5 px-3">समाप्ति (To)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono">
                  {priceHistory.map((ph) => (
                    <tr key={ph.id} className="hover:bg-cream-50/50">
                      <td className="py-2 px-3 font-bold text-gray-900">
                        {formatCurrency(ph.selling_price)}
                      </td>
                      <td className="py-2 px-3">
                        {ph.commission_type === 'percentage'
                          ? `${ph.commission_value}%`
                          : formatCurrency(ph.commission_value)}
                      </td>
                      <td className="py-2 px-3 font-sans text-gray-600">
                        {formatDateTime(ph.effective_from)}
                      </td>
                      <td className="py-2 px-3 font-sans text-gray-600">
                        {ph.effective_to ? formatDateTime(ph.effective_to) : (
                          <span className="text-emerald-700 font-bold">वर्तमान सक्रिय ✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
