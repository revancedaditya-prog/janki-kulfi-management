import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSellerIssues, useIssueSellerStock } from '@/hooks/useSellers';
import { useSellers, useCarts } from '@/hooks/useSellers';
import { useProducts } from '@/hooks/useProducts';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import {
  formatCurrency,
  formatQuantity,
  formatDate,
  getTodayDateString,
} from '@/lib/formatters';
import { Truck, Plus, AlertCircle, CheckCircle } from 'lucide-react';

export const StockIssuesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: issues = [], isLoading } = useSellerIssues();
  const { data: sellers = [] } = useSellers();
  const { data: carts = [] } = useCarts();
  const { data: products = [] } = useProducts();
  const { t, language } = useLanguage();
  const { isProduction, isOwner } = useAuth();
  const { isOnline, saveDraft } = useSync();

  const issueStock = useIssueSellerStock();

  const [isNewModalOpen, setIsNewModalOpen] = useState(searchParams.get('new') === 'true');
  const [selectedSellerId, setSelectedSellerId] = useState<string>('');
  const [selectedCartId, setSelectedCartId] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>(getTodayDateString());
  const [notes, setNotes] = useState<string>('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleOpenNewModal = () => {
    const initialQty: Record<string, number> = {};
    products.forEach((p) => {
      initialQty[p.id] = 0;
    });
    setQuantities(initialQty);
    setSelectedSellerId(sellers[0]?.id || '');
    setSelectedCartId(sellers[0]?.default_cart_id || carts[0]?.id || '');
    setIssueDate(getTodayDateString());
    setFormError(null);
    setIsNewModalOpen(true);
  };

  const handleSellerChange = (sellerId: string) => {
    setSelectedSellerId(sellerId);
    const seller = sellers.find((s) => s.id === sellerId);
    if (seller?.default_cart_id) {
      setSelectedCartId(seller.default_cart_id);
    }
  };

  const handleQuantityChange = (productId: string, val: number) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(0, val),
    }));
  };

  const totalIssuedPieces = Object.values(quantities).reduce((sum, q) => sum + q, 0);

  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedSellerId) {
      setFormError('कृपया विक्रेता चुनें');
      return;
    }

    const items = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, qty]) => ({
        product_id: productId,
        issued_quantity: qty,
      }));

    if (items.length === 0) {
      setFormError('कम से कम एक उत्पाद की निकासी मात्रा दर्ज करें');
      return;
    }

    // Validate available freezer stock
    for (const it of items) {
      const prod = products.find((p) => p.id === it.product_id);
      const available = prod?.available_quantity || 0;
      if (it.issued_quantity > available) {
        setFormError(
          `${language === 'hi' ? prod?.name_hi : prod?.name_en}: फ्रीजर में केवल ${available} पीस उपलब्ध हैं, ${it.issued_quantity} जारी नहीं कर सकते!`
        );
        return;
      }
    }

    try {
      if (!isOnline) {
        await saveDraft('seller_issue', {
          seller_id: selectedSellerId,
          cart_id: selectedCartId || null,
          issue_date: issueDate,
          items,
          notes,
        });
        alert('ऑफ़लाइन ड्राफ्ट सुरक्षित हो गया! कनेक्शन आने पर स्वतः सिंक हो जाएगा।');
      } else {
        await issueStock.mutateAsync({
          sellerId: selectedSellerId,
          cartId: selectedCartId || null,
          issueDate,
          items,
          notes,
        });
      }

      setIsNewModalOpen(false);
      setSearchParams({});
    } catch (err: any) {
      setFormError(err.message || 'स्टॉक जारी करने में त्रुटि');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-maroon-800" />
            {t.stockIssues}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            विक्रेताओं व ठेलों को बिक्री हेतु कुल्फी स्टॉक निकासी
          </p>
        </div>

        {(isProduction || isOwner) && (
          <Button
            variant="primary"
            leftIcon={<Plus className="w-5 h-5" />}
            onClick={handleOpenNewModal}
          >
            {t.newStockIssue}
          </Button>
        )}
      </div>

      {/* Issues List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-gray-500 mt-3">{t.loading}</p>
        </div>
      ) : issues.length === 0 ? (
        <Card className="text-center py-12">
          <div className="w-14 h-14 bg-sky-100 text-sky-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Truck className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-900">कोई स्टॉक निकासी रिकॉर्ड नहीं मिला</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            ठेले या विक्रेता को माल देने के लिए नया स्टॉक जारी करें।
          </p>
          {(isProduction || isOwner) && (
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={handleOpenNewModal}
            >
              {t.newStockIssue}
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {issues.map((issue) => {
            const totalIssued = issue.items.reduce((s, it) => s + it.issued_quantity, 0);

            return (
              <Card key={issue.id} className="overflow-hidden border-cream-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-base text-maroon-950">
                        {issue.issue_number}
                      </span>
                      <Badge variant={issue.status}>
                        {issue.status === 'issued' ? t.issued : issue.status === 'settled' ? t.settled : issue.status}
                      </Badge>
                    </div>
                    <span className="text-xs font-bold text-gray-800 block mt-0.5">
                      👤 {issue.seller?.full_name} {issue.cart ? `| 🛒 ${issue.cart.cart_name}` : ''}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-gray-600">
                    <span>📅 {formatDate(issue.issue_date)}</span>
                  </div>
                </div>

                {/* Items Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 my-3">
                  {issue.items.map((it) => (
                    <div
                      key={it.id}
                      className="p-2.5 rounded-xl bg-cream-50/80 border border-cream-200 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-gray-900 block">
                          {language === 'hi' ? it.product?.name_hi : it.product?.name_en}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {formatCurrency(it.unit_selling_price_snapshot)} / pc
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-base text-maroon-900 block">
                          {formatQuantity(it.issued_quantity)}
                        </span>
                        <span className="text-[10px] text-gray-500">{t.pieces}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 bg-cream-50/30 -mx-4 -mb-4 px-4 py-2.5 text-xs">
                  <span className="font-semibold text-gray-700">
                    कुल निकासी:{' '}
                    <strong className="text-maroon-900 font-mono text-sm">{formatQuantity(totalIssued)} {t.pieces}</strong>
                  </span>
                  {issue.status === 'issued' && (
                    <span className="text-amber-800 font-bold">शाम का हिसाब बाकी</span>
                  )}
                  {issue.status === 'settled' && (
                    <span className="text-emerald-800 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> हिसाब पूर्ण
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Stock Issue Modal */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => {
          setIsNewModalOpen(false);
          setSearchParams({});
        }}
        title={t.newStockIssue}
        subtitle="फ्रीजर से विक्रेता या ठेले को कुल्फी स्टॉक जारी करें"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmitIssue} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                {t.selectSeller} *
              </label>
              <select
                value={selectedSellerId}
                onChange={(e) => handleSellerChange(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-maroon-700 focus:outline-none min-h-[44px]"
                required
              >
                <option value="" disabled>-- विक्रेता चुनें --</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.seller_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                {t.selectCart}
              </label>
              <select
                value={selectedCartId}
                onChange={(e) => setSelectedCartId(e.target.value)}
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

            <Input
              type="date"
              label={t.issueDate}
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              required
            />
          </div>

          {/* Product Quantities with Live Available Stock Indicators */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              उत्पाद निकासी मात्रा (Freezer Stock Check)
            </h4>

            <div className="space-y-3">
              {products.map((prod) => {
                const qty = quantities[prod.id] || 0;
                const available = prod.available_quantity || 0;
                const isOverStock = qty > available;

                return (
                  <div
                    key={prod.id}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      isOverStock
                        ? 'bg-rose-50/80 border-rose-300'
                        : 'bg-cream-50 border-cream-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-bold text-sm text-gray-900 block">
                          {language === 'hi' ? prod.name_hi : prod.name_en}
                        </span>
                        <span className="text-xs text-gray-500">
                          मूल्य: {formatCurrency(prod.current_price)} | कमीशन: {formatCurrency(prod.commission_value)}/pc
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-500 block">
                          फ्रीजर में उपलब्ध:
                        </span>
                        <span
                          className={`font-mono font-black text-sm px-2 py-0.5 rounded-md ${
                            available > 0
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-rose-100 text-rose-900'
                          }`}
                        >
                          {formatQuantity(available)} {t.pieces}
                        </span>
                      </div>
                    </div>

                    <Input
                      type="number"
                      label={t.issuedQty}
                      isPieceQuantity
                      value={qty}
                      onChange={(e) =>
                        handleQuantityChange(prod.id, parseInt(e.target.value, 10) || 0)
                      }
                      error={isOverStock ? `फ्रीजर में केवल ${available} उपलब्ध हैं!` : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <Input
            label="टिप्पणी (Notes)"
            placeholder="जैसे: सुबह 11 बजे का स्टॉक, एक्स्ट्रा ड्राई आइस..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div>
              <span className="text-xs text-gray-500 block">कुल जारी पीस</span>
              <span className="text-lg font-black text-maroon-900 font-mono">
                {formatQuantity(totalIssuedPieces)} {t.pieces}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsNewModalOpen(false);
                  setSearchParams({});
                }}
              >
                {t.cancel}
              </Button>
              <Button type="submit" variant="primary" isLoading={issueStock.isPending}>
                {t.confirmIssue}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
