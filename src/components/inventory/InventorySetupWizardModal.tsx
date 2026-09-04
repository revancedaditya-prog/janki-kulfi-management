import React, { useState } from 'react';
import { useIngredients, useUpdateIngredient } from '@/hooks/useInventory';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useLpgCylinders, useRecordLpgReading } from '@/hooks/useLpg';
import { useLanguage } from '@/i18n/LanguageContext';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { CheckCircle2, Flame, Truck, ArrowRight, ArrowLeft } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const InventorySetupWizardModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { t, language } = useLanguage();
  const { data: ingredients = [] } = useIngredients();
  const { data: suppliers = [] } = useSuppliers();
  const { data: cylinders = [] } = useLpgCylinders();

  const updateIngredient = useUpdateIngredient();
  const recordLpg = useRecordLpgReading();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [openingRates, setOpeningRates] = useState<Record<string, { rate: number; stock: number }>>({});
  const [cylinderGross, setCylinderGross] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Initialize form state
  React.useEffect(() => {
    if (isOpen) {
      const rates: Record<string, { rate: number; stock: number }> = {};
      ingredients.forEach((ing) => {
        rates[ing.id] = {
          rate: ing.current_rate,
          stock: ing.available_base_quantity || 0,
        };
      });
      setOpeningRates(rates);

      const cyls: Record<string, number> = {};
      cylinders.forEach((c) => {
        cyls[c.id] = c.current_gross_weight;
      });
      setCylinderGross(cyls);
      setStep(1);
      setSuccessMsg(null);
    }
  }, [isOpen, ingredients, cylinders]);

  const handleRateChange = (id: string, field: 'rate' | 'stock', val: number) => {
    setOpeningRates((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: Math.max(0, val),
      },
    }));
  };

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      // 1. Update ingredient rates & master config
      for (const ing of ingredients) {
        const row = openingRates[ing.id];
        if (row && row.rate !== ing.current_rate) {
          await updateIngredient.mutateAsync({
            id: ing.id,
            updates: { current_rate: row.rate },
            reason: 'Setup Wizard Master Rate Calibration',
          });
        }
      }

      // 2. Update LPG cylinder gross weights
      for (const c of cylinders) {
        const gross = cylinderGross[c.id];
        if (gross && gross !== c.current_gross_weight) {
          await recordLpg.mutateAsync({
            cylinderId: c.id,
            grossWeight: gross,
            readingType: 'weighed',
            notes: 'Setup Wizard Initial Calibration',
          });
        }
      }

      setSuccessMsg(
        language === 'hi'
          ? 'कच्ची सामग्री इन्वेंटरी व दरें सफलतापूर्वक अपडेट हो गईं!'
          : 'Raw material inventory and rates initialized successfully!'
      );
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      alert(err.message || 'त्रुटि हुई');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        language === 'hi'
          ? 'कच्ची सामग्री इन्वेंटरी सेटअप विज़ार्ड'
          : 'Raw Material Inventory Setup Wizard'
      }
      maxWidth="xl"
    >
      <div className="space-y-5">
        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-stone-200 pb-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 1 ? 'bg-amber-600 text-white' : 'bg-stone-200 text-stone-700'
              }`}
            >
              1
            </span>
            <span className="text-xs font-bold text-stone-900">
              {language === 'hi' ? 'सामग्री दरें व स्टॉक' : 'Rates & Stock'}
            </span>
          </div>

          <div className="h-0.5 w-12 bg-stone-200" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 2 ? 'bg-amber-600 text-white' : 'bg-stone-200 text-stone-700'
              }`}
            >
              2
            </span>
            <span className="text-xs font-bold text-stone-900">
              {language === 'hi' ? 'सप्लायर जांच' : 'Suppliers'}
            </span>
          </div>

          <div className="h-0.5 w-12 bg-stone-200" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 3 ? 'bg-amber-600 text-white' : 'bg-stone-200 text-stone-700'
              }`}
            >
              3
            </span>
            <span className="text-xs font-bold text-stone-900">
              {language === 'hi' ? 'गैस सिलेंडर' : 'LPG Cylinders'}
            </span>
          </div>
        </div>

        {/* Success message banner */}
        {successMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Step 1: Ingredient rates and initial verification */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 rounded-xl text-xs text-amber-900">
              <p className="font-bold">
                {language === 'hi'
                  ? 'अपनी फैक्ट्री की वर्तमान खरीद दरें (Current Purchase Rates) सत्यापित करें:'
                  : 'Verify current market purchase rates for standard costing & inventory:'}
              </p>
            </div>

            <div className="max-h-80 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100">
              {ingredients.map((ing) => {
                const row = openingRates[ing.id] || { rate: ing.current_rate, stock: 0 };
                return (
                  <div key={ing.id} className="p-3 flex items-center justify-between hover:bg-stone-50/60">
                    <div>
                      <p className="font-bold text-xs text-stone-900">
                        {ing.name_hi} <span className="text-stone-500 font-normal">({ing.name_en})</span>
                      </p>
                      <p className="text-[10px] text-stone-500">
                        {language === 'hi' ? 'उपलब्ध स्टॉक:' : 'Stock:'} {ing.available_base_quantity || 0} {ing.base_unit}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-stone-500">₹</span>
                        <input
                          type="number"
                          step="any"
                          value={row.rate}
                          onChange={(e) => handleRateChange(ing.id, 'rate', parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 text-xs font-bold text-stone-900 border border-stone-300 rounded text-right focus:ring-1 focus:ring-amber-500"
                        />
                        <span className="text-[11px] text-stone-500 w-12">/ {ing.rate_unit}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Suppliers List */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3 bg-stone-50 rounded-xl text-xs text-stone-700">
              <p className="font-bold text-stone-900">
                {language === 'hi' ? 'पंजीकृत सप्लायर्स (Registered Suppliers):' : 'Registered Suppliers:'}
              </p>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {language === 'hi'
                  ? 'सामग्री खरीद दर्ज करते समय ये सप्लायर स्वतः उपलब्ध होंगे।'
                  : 'These vendors are pre-linked for automatic purchase recording.'}
              </p>
            </div>

            <div className="space-y-2.5">
              {suppliers.map((sup) => (
                <div key={sup.id} className="p-3 border border-stone-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Truck className="w-4 h-4 text-amber-600" />
                    <div>
                      <p className="text-xs font-bold text-stone-900">{sup.name}</p>
                      <p className="text-[11px] text-stone-500">
                        {sup.contact_person || 'Contact'} • {sup.phone || 'No Phone'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                    सक्रिय (Active)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: LPG Cylinders Calibration */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-950">
              <p className="font-bold">
                {language === 'hi'
                  ? 'वर्तमान LPG सिलेंडर वजन (Cylinder Weighing Calibration):'
                  : 'Enter current cylinder gross weight for accurate gas calculation:'}
              </p>
              <p className="text-[11px] text-orange-800 mt-1">
                {language === 'hi'
                  ? 'बची हुई गैस = वर्तमान कुल वजन (Gross) - खाली सिलेंडर वजन (Tare Weight)'
                  : 'Remaining Gas = Gross Weight - Tare Weight printed on cylinder'}
              </p>
            </div>

            <div className="space-y-3">
              {cylinders.map((cyl) => {
                const currentGross = cylinderGross[cyl.id] || cyl.current_gross_weight;
                const remaining = Math.max(0, currentGross - cyl.tare_weight);
                return (
                  <div key={cyl.id} className="p-3 border border-stone-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Flame className="w-4 h-4 text-orange-600" />
                        <span className="text-xs font-bold text-stone-900">{cyl.cylinder_code}</span>
                        <span className="text-[11px] text-stone-500">
                          (खाली वजन TW: {cyl.tare_weight} kg)
                        </span>
                      </div>
                      <span className="text-xs font-bold text-orange-700">
                        {remaining.toFixed(2)} kg गैस शेष
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-1">
                      <label className="text-[11px] text-stone-600 font-medium">
                        {language === 'hi' ? 'कांटे पर कुल वजन (Gross Weight kg):' : 'Current Gross Weight (kg):'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.1"
                          min={cyl.tare_weight}
                          max={cyl.tare_weight + cyl.rated_gas_capacity + 5}
                          value={currentGross}
                          onChange={(e) =>
                            setCylinderGross((prev) => ({
                              ...prev,
                              [cyl.id]: parseFloat(e.target.value) || cyl.tare_weight,
                            }))
                          }
                          className="w-24 px-2 py-1 text-xs font-bold text-stone-900 border border-stone-300 rounded text-right focus:ring-1 focus:ring-amber-500"
                        />
                        <span className="text-xs text-stone-500">kg</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal Bottom Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-stone-200">
          {step > 1 ? (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<ArrowLeft className="w-4 h-4" />}
              onClick={() => setStep((s) => (s - 1) as any)}
            >
              {language === 'hi' ? 'पीछे' : 'Back'}
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t.cancel}
            </Button>

            {step < 3 ? (
              <Button
                variant="primary"
                size="sm"
                rightIcon={<ArrowRight className="w-4 h-4" />}
                onClick={() => setStep((s) => (s + 1) as any)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                {language === 'hi' ? 'आगे बढ़ें' : 'Next'}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                isLoading={isSaving}
                onClick={handleFinish}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
              >
                {language === 'hi' ? 'सेव व समाप्त करें' : 'Save & Finish'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
