import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useIngredients, useCreateMaterialPurchase } from '@/hooks/useInventory';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useLanguage } from '@/i18n/LanguageContext';
import { UnitType } from '@/types';
import { formatCurrency, getTodayDateString } from '@/lib/formatters';
import { convertQuantity, calculateWeightedAverageRate } from '@/lib/inventoryService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import {
  Truck,
  Plus,
  Trash2,
  ArrowLeft,
  AlertCircle,
  Package,
} from 'lucide-react';

interface PurchaseLineItem {
  id: string;
  ingredient_id: string;
  purchased_quantity: number;
  purchase_unit: UnitType;
  rate_unit: UnitType;
  free_quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  allocated_charge: number;
  lot_number: string;
  manufacturing_date: string;
  expiry_date: string;
}

export const AddMaterialPurchasePage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data: ingredients = [] } = useIngredients();
  const { data: suppliers = [] } = useSuppliers();
  const createPurchase = useCreateMaterialPurchase();

  const [purchaseDate, setPurchaseDate] = useState(getTodayDateString());
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'credit'>('cash');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Line items state
  const [items, setItems] = useState<PurchaseLineItem[]>([
    {
      id: 'item-1',
      ingredient_id: searchParams.get('ingredient_id') || '',
      purchased_quantity: 10,
      purchase_unit: 'kg',
      rate_unit: 'kg',
      free_quantity: 0,
      unit_price: 50,
      discount: 0,
      tax: 0,
      allocated_charge: 0,
      lot_number: '',
      manufacturing_date: '',
      expiry_date: '',
    },
  ]);

  // If ingredient preselected from query params, sync its default unit, rate and supplier
  useEffect(() => {
    const preselectedId = searchParams.get('ingredient_id');
    if (preselectedId && ingredients.length > 0) {
      const ing = ingredients.find((i) => i.id === preselectedId);
      if (ing) {
        if (ing.preferred_supplier_id) setSupplierId(ing.preferred_supplier_id);
        const pUnit = ing.purchase_unit || ing.base_unit || 'kg';
        const rUnit = ing.rate_unit || ing.base_unit || pUnit;
        setItems([
          {
            id: 'item-1',
            ingredient_id: ing.id,
            purchased_quantity: ing.reorder_quantity || 10,
            purchase_unit: pUnit,
            rate_unit: rUnit,
            free_quantity: 0,
            unit_price: ing.current_rate || 50,
            discount: 0,
            tax: 0,
            allocated_charge: 0,
            lot_number: '',
            manufacturing_date: '',
            expiry_date: '',
          },
        ]);
      }
    }
  }, [searchParams, ingredients]);

  const handleAddItem = () => {
    const defaultIng = ingredients[0];
    const pUnit = defaultIng?.purchase_unit || defaultIng?.base_unit || 'kg';
    const rUnit = defaultIng?.rate_unit || defaultIng?.base_unit || pUnit;

    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        ingredient_id: defaultIng?.id || '',
        purchased_quantity: defaultIng?.reorder_quantity || 10,
        purchase_unit: pUnit,
        rate_unit: rUnit,
        free_quantity: 0,
        unit_price: defaultIng?.current_rate || 50,
        discount: 0,
        tax: 0,
        allocated_charge: 0,
        lot_number: '',
        manufacturing_date: '',
        expiry_date: '',
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleItemChange = (id: string, field: keyof PurchaseLineItem, val: any) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === id) {
          const updated = { ...it, [field]: val };
          // If ingredient changed, auto-populate its standard unit and rate
          if (field === 'ingredient_id') {
            const ing = ingredients.find((i) => i.id === val);
            if (ing) {
              const pUnit = ing.purchase_unit || ing.base_unit || 'kg';
              const rUnit = ing.rate_unit || ing.base_unit || pUnit;
              updated.purchase_unit = pUnit;
              updated.rate_unit = rUnit;
              updated.unit_price = ing.current_rate;
            }
          }
          return updated;
        }
        return it;
      })
    );
  };

  // Calculations with unit normalization
  const calculateItemSummary = (it: PurchaseLineItem) => {
    const ing = ingredients.find((i) => i.id === it.ingredient_id);
    const purchasedQty = Number(it.purchased_quantity) || 0;
    const freeQty = Number(it.free_quantity) || 0;
    const totalRecQty = purchasedQty + freeQty;
    const unitPrice = Number(it.unit_price) || 0;

    // Unit-normalized quantity in rate unit
    const rateQty = convertQuantity(purchasedQty, it.purchase_unit, it.rate_unit || it.purchase_unit, ing?.conversion_factor || 1);
    const itemPrice = Number((rateQty * unitPrice).toFixed(2));

    const discount = Number(it.discount) || 0;
    const tax = Number(it.tax) || 0;
    const allocated = Number(it.allocated_charge) || 0;
    const netCost = Number((itemPrice - discount + tax + allocated).toFixed(2));

    const baseQty = ing
      ? convertQuantity(totalRecQty, it.purchase_unit, ing.base_unit, ing.conversion_factor || 1)
      : totalRecQty;

    const unitAcqCost = baseQty > 0 ? Number((netCost / baseQty).toFixed(2)) : 0;
    const currentStock = ing?.available_base_quantity || 0;
    const newWac = ing
      ? calculateWeightedAverageRate(currentStock, ing.current_rate, baseQty, unitAcqCost)
      : unitAcqCost;

    return {
      totalRecQty,
      rateQty,
      itemPrice,
      netCost,
      baseQty,
      unitAcqCost,
      newWac,
      baseUnit: ing?.base_unit || 'kg',
    };
  };

  // Grand total & credit calculations
  const totalSubtotal = useMemo(() => items.reduce((sum, it) => sum + calculateItemSummary(it).itemPrice, 0), [items, ingredients]);
  const totalDiscount = useMemo(() => items.reduce((sum, it) => sum + (Number(it.discount) || 0), 0), [items]);
  const totalTax = useMemo(() => items.reduce((sum, it) => sum + (Number(it.tax) || 0), 0), [items]);
  const totalTransportCharges = useMemo(() => items.reduce((sum, it) => sum + (Number(it.allocated_charge) || 0), 0), [items]);
  const totalBillAmount = useMemo(() => Number((totalSubtotal - totalDiscount + totalTax + totalTransportCharges).toFixed(2)), [totalSubtotal, totalDiscount, totalTax, totalTransportCharges]);

  const effectivePaidAmount = paidAmount !== '' ? Math.min(totalBillAmount, Math.max(0, parseFloat(paidAmount) || 0)) : totalBillAmount;
  const creditAmount = Math.max(0, Number((totalBillAmount - effectivePaidAmount).toFixed(2)));

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || createPurchase.isPending) return;

    setFormError(null);

    const validItems = items.filter((it) => it.ingredient_id && Number(it.purchased_quantity) > 0);
    if (validItems.length === 0) {
      setFormError('कम से कम एक सामग्री और मान्य मात्रा दर्ज करें (Quantity must be > 0)।');
      return;
    }

    const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined;

    setIsSubmitting(true);
    try {
      await createPurchase.mutateAsync({
        purchase_date: purchaseDate,
        supplier_id: supplierId || null,
        invoice_number: invoiceNumber.trim() || null,
        payment_method: paymentMethod,
        paid_amount: effectivePaidAmount,
        credit_amount: creditAmount,
        notes: notes.trim() || null,
        idempotency_key: idempotencyKey,
        items: validItems.map((it) => ({
          ingredient_id: it.ingredient_id,
          purchased_quantity: Number(it.purchased_quantity),
          purchase_unit: it.purchase_unit,
          free_quantity: Number(it.free_quantity || 0),
          unit_price: Number(it.unit_price || 0),
          discount: Number(it.discount || 0),
          tax: Number(it.tax || 0),
          allocated_charge: Number(it.allocated_charge || 0),
          lot_number: it.lot_number || null,
          manufacturing_date: it.manufacturing_date || null,
          expiry_date: it.expiry_date || null,
        })),
      });

      navigate('/inventory?tab=purchases');
    } catch (err: any) {
      console.error('[AddMaterialPurchase] Purchase creation failed:', err);
      setFormError(err.message || 'खरीद सहेजने में विफल। कृपया पुनः प्रयास करें।');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/inventory?tab=purchases">
            <button className="p-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center shadow-xs">
              <ArrowLeft className="w-4 h-4 text-stone-700" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              {language === 'hi' ? 'सामग्री खरीद जोड़ें (Stock-In)' : 'New Material Purchase'}
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              {language === 'hi'
                ? 'कच्चा माल प्राप्त करें, बहीखाता अपडेट करें व भारित औसत दर की गणना करें'
                : 'Receive materials, update stock ledger & recalculate weighted average cost'}
            </p>
          </div>
        </div>
      </div>

      {formError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Purchase Header Card */}
        <Card className="p-5 border-stone-200 shadow-xs space-y-4">
          <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-stone-100">
            <Truck className="w-4 h-4 text-amber-600" />
            खरीद व सप्लायर विवरण (Supplier & Invoice Info)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                खरीद दिनांक (Date) <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                सप्लायर (Supplier - Optional)
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
              >
                <option value="">-- सप्लायर चुनें (या डायरेक्ट नकद) --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                चालान / बिल नंबर (Invoice No)
              </label>
              <input
                type="text"
                placeholder="उदा. INV-2026-089"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                भुगतान विधि (Payment Method)
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
              >
                <option value="cash">नकद (Cash)</option>
                <option value="upi">UPI / GPay / PhonePe</option>
                <option value="bank_transfer">बैंक ट्रांसफर (Bank Transfer)</option>
                <option value="credit">उधार (Supplier Credit / Pay Later)</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Dynamic Line Items Section */}
        <Card className="p-5 border-stone-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-600" />
              प्राप्त सामग्री सूची (Received Items)
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={handleAddItem}
              className="text-xs font-bold min-h-[38px]"
            >
              + और सामग्री जोड़ें
            </Button>
          </div>

          <div className="space-y-4">
            {items.map((it, idx) => {
              const summary = calculateItemSummary(it);

              return (
                <div
                  key={it.id}
                  className="p-4 bg-stone-50/80 border border-stone-200 rounded-2xl space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-stone-900">
                      #{idx + 1} सामग्री प्रविष्टि
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.id)}
                        className="text-rose-600 hover:text-rose-800 p-1 text-xs font-bold flex items-center gap-1 cursor-pointer min-h-[36px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        हटाएं
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-bold text-stone-800 mb-1">
                        सामग्री चुनें <span className="text-rose-600">*</span>
                      </label>
                      <select
                        required
                        value={it.ingredient_id}
                        onChange={(e) => handleItemChange(it.id, 'ingredient_id', e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl bg-white font-bold text-stone-900 focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">-- सामग्री चुनें --</option>
                        {ingredients.map((ingItem) => (
                          <option key={ingItem.id} value={ingItem.id}>
                            {ingItem.name_hi} ({ingItem.name_en}) — वर्तमान स्टॉक: {ingItem.available_base_quantity || 0} {ingItem.base_unit}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-stone-800 mb-1">
                        खरीद मात्रा (Purchased Qty) <span className="text-rose-600">*</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          inputMode="decimal"
                          required
                          value={it.purchased_quantity}
                          onChange={(e) =>
                            handleItemChange(it.id, 'purchased_quantity', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-2.5 py-2 text-xs font-black text-stone-900 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                        <select
                          value={it.purchase_unit}
                          onChange={(e) => handleItemChange(it.id, 'purchase_unit', e.target.value as any)}
                          className="w-24 px-1.5 py-2 text-xs border border-stone-300 rounded-xl bg-white font-semibold"
                        >
                          <option value="kg">kg</option>
                          <option value="g">g</option>
                          <option value="litre">litre</option>
                          <option value="ml">ml</option>
                          <option value="piece">piece</option>
                          <option value="packet">packet</option>
                          <option value="box">box</option>
                          <option value="bottle">bottle</option>
                          <option value="cylinder">cylinder</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-stone-800 mb-1">
                        दर (₹) प्रति इकाई <span className="text-rose-600">*</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          inputMode="decimal"
                          required
                          value={it.unit_price}
                          onChange={(e) =>
                            handleItemChange(it.id, 'unit_price', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-2.5 py-2 text-xs font-black text-stone-900 border border-stone-300 rounded-xl text-right focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                        <select
                          value={it.rate_unit || it.purchase_unit}
                          onChange={(e) => handleItemChange(it.id, 'rate_unit', e.target.value as any)}
                          className="w-24 px-1.5 py-2 text-xs border border-stone-300 rounded-xl bg-white font-semibold"
                        >
                          <option value="kg">/ kg</option>
                          <option value="g">/ g</option>
                          <option value="litre">/ litre</option>
                          <option value="ml">/ ml</option>
                          <option value="piece">/ piece</option>
                          <option value="cylinder">/ cylinder</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 text-xs">
                    <div>
                      <label className="block text-[11px] font-medium text-stone-600 mb-1">
                        मुफ्त / बोनस मात्रा (Free Qty)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        value={it.free_quantity}
                        onChange={(e) =>
                          handleItemChange(it.id, 'free_quantity', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-xl bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-stone-600 mb-1">
                        छूट (Discount ₹)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        value={it.discount}
                        onChange={(e) =>
                          handleItemChange(it.id, 'discount', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-xl text-right bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-stone-600 mb-1">
                        टैक्स / GST (₹)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        value={it.tax}
                        onChange={(e) =>
                          handleItemChange(it.id, 'tax', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-xl text-right bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-stone-600 mb-1">
                        भाड़ा / लोडिंग (Freight ₹)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        value={it.allocated_charge}
                        onChange={(e) =>
                          handleItemChange(it.id, 'allocated_charge', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-xl text-right bg-white"
                      />
                    </div>
                  </div>

                  {/* Real-time Calculation Summary Bar */}
                  <div className="p-2.5 bg-stone-100 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-stone-600 font-medium">
                        स्टॉक वृद्धि: <strong className="text-emerald-700">+{summary.baseQty} {summary.baseUnit}</strong>
                      </span>
                      <span className="text-stone-300">|</span>
                      <span className="text-stone-600 font-medium">
                        अधिग्रहण दर: <strong className="text-stone-900">{formatCurrency(summary.unitAcqCost)} / {summary.baseUnit}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-amber-800 font-bold">
                        WAC औसत: {formatCurrency(summary.newWac)} / {summary.baseUnit}
                      </span>
                      <span className="text-stone-300">|</span>
                      <span className="text-stone-900 font-black">
                        आइटम नेट: {formatCurrency(summary.netCost)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Bill Summary & Payment Settlement */}
        <Card className="p-5 border-stone-200 shadow-xs space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                अतिरिक्त नोट्स / विवरण (Notes)
              </label>
              <textarea
                rows={3}
                placeholder="उदा. माल गुणवत्ता जांच कर प्राप्त किया गया, बिल प्रति संलग्न..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/70 space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-stone-600 font-medium">
                <span>सामग्री सबटोटल (Subtotal):</span>
                <span className="font-bold text-stone-900">{formatCurrency(totalSubtotal)}</span>
              </div>

              {totalDiscount > 0 && (
                <div className="flex justify-between items-center text-emerald-700 font-semibold">
                  <span>कुल छूट (Discount -):</span>
                  <span>-{formatCurrency(totalDiscount)}</span>
                </div>
              )}

              {totalTax > 0 && (
                <div className="flex justify-between items-center text-stone-600 font-medium">
                  <span>टैक्स / GST (+):</span>
                  <span className="font-bold text-stone-900">+{formatCurrency(totalTax)}</span>
                </div>
              )}

              {totalTransportCharges > 0 && (
                <div className="flex justify-between items-center text-stone-600 font-medium">
                  <span>भाड़ा / अन्य खर्चे (+):</span>
                  <span className="font-bold text-stone-900">+{formatCurrency(totalTransportCharges)}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-sm font-black text-stone-900 pt-2 border-t border-stone-200">
                <span>कुल देय बिल राशि (Grand Total):</span>
                <span className="text-base text-emerald-800 font-black">{formatCurrency(totalBillAmount)}</span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-stone-200">
                <span className="font-bold text-stone-700">भुगतान की गई राशि (Paid Amount ₹):</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max={totalBillAmount}
                  inputMode="decimal"
                  placeholder={String(totalBillAmount)}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="w-32 px-2.5 py-1.5 text-xs font-black text-right border border-stone-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {creditAmount > 0 && (
                <div className="flex justify-between items-center text-amber-900 font-bold pt-1 border-t border-stone-200">
                  <span>सप्लायर का बकाया / उधार (Credit):</span>
                  <span>{formatCurrency(creditAmount)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
            <Link to="/inventory?tab=purchases">
              <Button variant="outline" size="sm" className="min-h-[44px]">
                रद्द करें
              </Button>
            </Link>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={createPurchase.isPending}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6 min-h-[44px]"
            >
              ✓ खरीद व स्टॉक-इन दर्ज करें
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
};

export default AddMaterialPurchasePage;
