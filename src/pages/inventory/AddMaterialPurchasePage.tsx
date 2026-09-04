import React, { useState, useEffect } from 'react';
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

  // If ingredient preselected from query params, sync its default unit and supplier
  useEffect(() => {
    const preselectedId = searchParams.get('ingredient_id');
    if (preselectedId && ingredients.length > 0) {
      const ing = ingredients.find((i) => i.id === preselectedId);
      if (ing) {
        if (ing.preferred_supplier_id) setSupplierId(ing.preferred_supplier_id);
        setItems([
          {
            id: 'item-1',
            ingredient_id: ing.id,
            purchased_quantity: ing.reorder_quantity || 10,
            purchase_unit: ing.purchase_unit || ing.base_unit,
            free_quantity: 0,
            unit_price: ing.current_rate,
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
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        ingredient_id: defaultIng?.id || '',
        purchased_quantity: defaultIng?.reorder_quantity || 10,
        purchase_unit: defaultIng?.purchase_unit || defaultIng?.base_unit || 'kg',
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
              updated.purchase_unit = ing.purchase_unit || ing.base_unit;
              updated.unit_price = ing.current_rate;
            }
          }
          return updated;
        }
        return it;
      })
    );
  };

  // Calculations
  const calculateItemSummary = (it: PurchaseLineItem) => {
    const ing = ingredients.find((i) => i.id === it.ingredient_id);
    const purchasedQty = Number(it.purchased_quantity) || 0;
    const freeQty = Number(it.free_quantity) || 0;
    const totalRecQty = purchasedQty + freeQty;
    const unitPrice = Number(it.unit_price) || 0;
    const itemPrice = Number((purchasedQty * unitPrice).toFixed(2));
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
      itemPrice,
      netCost,
      baseQty,
      unitAcqCost,
      newWac,
      baseUnit: ing?.base_unit || 'kg',
    };
  };

  const totalBillAmount = items.reduce((sum, it) => sum + calculateItemSummary(it).netCost, 0);
  const effectivePaidAmount = paidAmount !== '' ? parseFloat(paidAmount) || 0 : totalBillAmount;
  const creditAmount = Math.max(0, Number((totalBillAmount - effectivePaidAmount).toFixed(2)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validItems = items.filter((it) => it.ingredient_id && it.purchased_quantity > 0);
    if (validItems.length === 0) {
      setFormError('कम से कम एक सामग्री और मान्य मात्रा दर्ज करें।');
      return;
    }

    try {
      await createPurchase.mutateAsync({
        purchase_date: purchaseDate,
        supplier_id: supplierId || null,
        invoice_number: invoiceNumber.trim() || null,
        payment_method: paymentMethod,
        paid_amount: effectivePaidAmount,
        credit_amount: creditAmount,
        notes: notes.trim() || null,
        items: validItems.map((it) => ({
          ingredient_id: it.ingredient_id,
          purchased_quantity: it.purchased_quantity,
          purchase_unit: it.purchase_unit,
          free_quantity: it.free_quantity,
          unit_price: it.unit_price,
          discount: it.discount,
          tax: it.tax,
          allocated_charge: it.allocated_charge,
          lot_number: it.lot_number || null,
          manufacturing_date: it.manufacturing_date || null,
          expiry_date: it.expiry_date || null,
        })),
      });

      navigate('/inventory');
    } catch (err: any) {
      setFormError(err.message || 'खरीद सहेजने में विफल');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/inventory">
            <button className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 cursor-pointer">
              <ArrowLeft className="w-4 h-4 text-stone-700" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">
              {language === 'hi' ? 'सामग्री खरीद व स्टॉक-इन' : 'New Material Purchase (Stock-In)'}
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              {language === 'hi'
                ? 'कच्चा माल प्राप्त करें, बहीखाता अपडेट करें व भारित औसत दर की गणना करें'
                : 'Receive materials, update ledger balances & recalculate weighted-average cost'}
            </p>
          </div>
        </div>
      </div>

      {formError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Purchase Header Card */}
        <Card className="p-5 border-stone-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-stone-100">
            <Truck className="w-4 h-4 text-amber-600" />
            खरीद व सप्लायर विवरण (Supplier & Invoice Info)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                खरीद दिनांक (Date) <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                सप्लायर (Supplier)
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500"
              >
                <option value="">-- सप्लायर चुनें (या नकद खरीद) --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                चालान / बिल नंबर (Invoice No)
              </label>
              <input
                type="text"
                placeholder="उदा. INV-2026-089"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                भुगतान विधि (Payment Method)
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500"
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
        <Card className="p-5 border-stone-200 shadow-sm space-y-4">
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
              className="text-xs font-bold"
            >
              + और सामग्री जोड़ें
            </Button>
          </div>

          <div className="space-y-4">
            {items.map((it, idx) => {
              const summary = calculateItemSummary(it);
              const ing = ingredients.find((i) => i.id === it.ingredient_id);

              return (
                <div
                  key={it.id}
                  className="p-4 bg-stone-50/80 border border-stone-200 rounded-xl space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-800">
                      #{idx + 1} सामग्री प्रविष्टि
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.id)}
                        className="text-rose-600 hover:text-rose-800 p-1 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        हटाएं
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                        सामग्री चुनें <span className="text-rose-600">*</span>
                      </label>
                      <select
                        required
                        value={it.ingredient_id}
                        onChange={(e) => handleItemChange(it.id, 'ingredient_id', e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg bg-white font-bold text-stone-900 focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="">-- सामग्री चुनें --</option>
                        {ingredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name_hi} ({ing.name_en}) — स्टॉक: {ing.available_base_quantity || 0} {ing.base_unit}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                        खरीद मात्रा (Purchased Qty) <span className="text-rose-600">*</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          required
                          value={it.purchased_quantity}
                          onChange={(e) =>
                            handleItemChange(it.id, 'purchased_quantity', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-2 py-1.5 text-xs font-bold text-stone-900 border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
                        />
                        <select
                          value={it.purchase_unit}
                          onChange={(e) => handleItemChange(it.id, 'purchase_unit', e.target.value as any)}
                          className="w-24 px-1.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white"
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
                      <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                        दर प्रति {it.purchase_unit} (₹) <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={it.unit_price}
                        onChange={(e) =>
                          handleItemChange(it.id, 'unit_price', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-xs font-bold text-stone-900 border border-stone-300 rounded-lg text-right focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-stone-600 mb-1">
                        मुफ्त / बोनस मात्रा (Free Qty)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={it.free_quantity}
                        onChange={(e) =>
                          handleItemChange(it.id, 'free_quantity', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg"
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
                        value={it.discount}
                        onChange={(e) =>
                          handleItemChange(it.id, 'discount', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg text-right"
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
                        value={it.tax}
                        onChange={(e) =>
                          handleItemChange(it.id, 'tax', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg text-right"
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
                        value={it.allocated_charge}
                        onChange={(e) =>
                          handleItemChange(it.id, 'allocated_charge', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg text-right"
                      />
                    </div>
                  </div>

                  {/* Lot / Expiry Fields if enabled */}
                  {ing && (ing.track_expiry || ing.track_lots) && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60">
                      <div>
                        <label className="block text-[10px] font-bold text-amber-900 mb-1">
                          लॉट / बैच नंबर (Lot Number)
                        </label>
                        <input
                          type="text"
                          placeholder="उदा. LOT-2026-A1"
                          value={it.lot_number}
                          onChange={(e) => handleItemChange(it.id, 'lot_number', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-stone-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-amber-900 mb-1">
                          उत्पादन तिथि (Mfg Date)
                        </label>
                        <input
                          type="date"
                          value={it.manufacturing_date}
                          onChange={(e) => handleItemChange(it.id, 'manufacturing_date', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-stone-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-amber-900 mb-1">
                          एक्सपायरी तिथि (Expiry Date)
                        </label>
                        <input
                          type="date"
                          value={it.expiry_date}
                          onChange={(e) => handleItemChange(it.id, 'expiry_date', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-stone-300 rounded bg-white"
                        />
                      </div>
                    </div>
                  )}

                  {/* Real-time Calculation Summary Bar */}
                  <div className="p-2.5 bg-stone-100 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-stone-600">
                        स्टॉक में वृद्धि: <strong className="text-emerald-700">+{summary.baseQty} {summary.baseUnit}</strong>
                      </span>
                      <span className="text-stone-400">|</span>
                      <span className="text-stone-600">
                        इकाई अधिग्रहण लागत: <strong className="text-stone-900">{formatCurrency(summary.unitAcqCost)} / {summary.baseUnit}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-amber-800 font-semibold">
                        नई औसत दर (WAC): {formatCurrency(summary.newWac)} / {summary.baseUnit}
                      </span>
                      <span className="text-stone-400">|</span>
                      <span className="text-stone-900 font-bold">
                        नेट लागत: {formatCurrency(summary.netCost)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Bill Summary & Payment Settlement */}
        <Card className="p-5 border-stone-200 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                अतिरिक्त नोट्स / विवरण (Notes)
              </label>
              <textarea
                rows={3}
                placeholder="उदा. सामान चेक कर के लिया गया, बिल संलग्न है"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="bg-stone-50 p-4 rounded-xl space-y-3">
              <div className="flex justify-between items-center text-xs text-stone-600">
                <span>कुल सामग्री लागत (Gross Total):</span>
                <span className="font-bold text-stone-900">{formatCurrency(totalBillAmount)}</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-stone-700">भुगतान की गई राशि (Paid Amount ₹):</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max={totalBillAmount}
                  placeholder={String(totalBillAmount)}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="w-32 px-2 py-1 text-xs font-bold text-right border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {creditAmount > 0 && (
                <div className="flex justify-between items-center text-xs text-amber-800 font-semibold pt-1 border-t border-stone-200">
                  <span>सप्लायर का बकाया / उधार (Credit):</span>
                  <span>{formatCurrency(creditAmount)}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-sm font-black text-stone-900 pt-2 border-t border-stone-200">
                <span>अंतिम देय बिल राशि:</span>
                <span className="text-lg text-emerald-800">{formatCurrency(totalBillAmount)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
            <Link to="/inventory">
              <Button variant="outline" size="sm">
                रद्द करें
              </Button>
            </Link>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={createPurchase.isPending}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6"
            >
              ✓ स्टॉक-इन व खरीद दर्ज करें
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
};
