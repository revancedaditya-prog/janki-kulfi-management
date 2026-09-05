import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useLpgCylinders,
  useCreateLpgCylinder,
  useRecordLpgReading,
  useRecordLpgRefill,
  useConnectLpgCylinder,
  useDeleteLpgCylinder,
  useLpgReadings,
} from '@/hooks/useLpg';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { LpgCylinder } from '@/types';
import { formatDate } from '@/lib/formatters';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import {
  Flame,
  Plus,
  Scale,
  RefreshCw,
  ArrowLeft,
  History,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

export const LpgCylinderPage: React.FC = () => {
  const { language } = useLanguage();
  const { isOwner } = useAuth();

  const { data: cylinders = [] } = useLpgCylinders();
  const { data: suppliers = [] } = useSuppliers();
  const { data: readings = [] } = useLpgReadings();

  const createCylinderMutation = useCreateLpgCylinder();
  const recordReadingMutation = useRecordLpgReading();
  const recordRefillMutation = useRecordLpgRefill();
  const connectCylinderMutation = useConnectLpgCylinder();
  const deleteCylinderMutation = useDeleteLpgCylinder();

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [cylinderToWeigh, setCylinderToWeigh] = useState<LpgCylinder | null>(null);
  const [cylinderToRefill, setCylinderToRefill] = useState<LpgCylinder | null>(null);
  const [cylinderToDelete, setCylinderToDelete] = useState<LpgCylinder | null>(null);

  // Form states
  const [weighGross, setWeighGross] = useState<string>('');
  const [weighNotes, setWeighNotes] = useState('');
  const [refillCost, setRefillCost] = useState('1800');
  const [refillGross, setRefillGross] = useState('');

  // Add Cylinder Form
  const [addCode, setAddCode] = useState(`LPG-0${cylinders.length + 1}`);
  const [addSupplierId, setAddSupplierId] = useState('');
  const [addTareWeight, setAddTareWeight] = useState('15.2');
  const addRatedCapacity = '19.0';
  const [addLocation, setAddLocation] = useState('Main Kitchen');

  const handleOpenWeighModal = (cyl: LpgCylinder) => {
    setCylinderToWeigh(cyl);
    setWeighGross(String(cyl.current_gross_weight));
    setWeighNotes('');
  };

  const handleOpenRefillModal = (cyl: LpgCylinder) => {
    setCylinderToRefill(cyl);
    setRefillCost('1800');
    setRefillGross(String(cyl.tare_weight + cyl.rated_gas_capacity));
  };

  const handleWeighSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cylinderToWeigh) return;

    const gross = parseFloat(weighGross);
    if (isNaN(gross) || gross < cylinderToWeigh.tare_weight) {
      alert(`कुल वजन खाली वजन (TW: ${cylinderToWeigh.tare_weight} kg) से कम नहीं हो सकता।`);
      return;
    }

    try {
      await recordReadingMutation.mutateAsync({
        cylinderId: cylinderToWeigh.id,
        grossWeight: gross,
        readingType: 'weighed',
        notes: weighNotes.trim() || undefined,
      });
      setCylinderToWeigh(null);
    } catch (err: any) {
      alert(err.message || 'त्रुटि हुई');
    }
  };

  const handleRefillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cylinderToRefill) return;

    try {
      await recordRefillMutation.mutateAsync({
        cylinderId: cylinderToRefill.id,
        refillCost: parseFloat(refillCost) || 1800,
        fullGrossWeight: refillGross ? parseFloat(refillGross) : undefined,
      });
      setCylinderToRefill(null);
    } catch (err: any) {
      alert(err.message || 'त्रुटि हुई');
    }
  };

  const handleAddCylinderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tare = parseFloat(addTareWeight) || 15.2;
    const rated = parseFloat(addRatedCapacity) || 19.0;
    const full = tare + rated;
    const supplier = suppliers.find((s) => s.id === addSupplierId);

    try {
      await createCylinderMutation.mutateAsync({
        cylinder_code: addCode.trim().toUpperCase(),
        supplier_id: addSupplierId || null,
        supplier_name: supplier?.name || 'Bharat Gas Agency',
        cylinder_type: 'commercial_19kg',
        rated_gas_capacity: rated,
        tare_weight: tare,
        full_gross_weight: full,
        current_gross_weight: full,
        status: 'full',
        refill_cost: 1800,
        storage_location: addLocation,
        is_active: true,
      });
      setIsAddModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'सिलेंडर जोड़ने में त्रुटि');
    }
  };

  const handleDeleteSubmit = async () => {
    if (!cylinderToDelete) return;
    try {
      await deleteCylinderMutation.mutateAsync(cylinderToDelete.id);
      setCylinderToDelete(null);
    } catch (err: any) {
      alert(err.message || 'सिलेंडर हटाने में त्रुटि');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/inventory">
            <button className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 cursor-pointer">
              <ArrowLeft className="w-4 h-4 text-stone-700" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-stone-900 tracking-tight">
                {language === 'hi' ? 'LPG गैस सिलेंडर प्रबंधन' : 'LPG Cylinder Management'}
              </h1>
              <Badge variant="primary" className="font-bold bg-orange-600 text-white">
                19 kg Commercial
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              {language === 'hi'
                ? 'कांटे पर तौलकर सटीक बची हुई गैस व रिफिल का हिसाब रखें'
                : 'Accurate weight-based remaining gas calculation and refill expense tracking'}
            </p>
          </div>
        </div>

        {isOwner && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsAddModalOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold"
          >
            + {language === 'hi' ? 'नया सिलेंडर जोड़ें' : 'Add Cylinder'}
          </Button>
        )}
      </div>

      {/* Mandatory Accuracy Notice Banner */}
      <div className="p-4 bg-linear-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl flex items-start gap-3.5 shadow-xs">
        <Scale className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-bold text-orange-950 text-sm">
            {language === 'hi'
              ? 'सटीक गैस माप का नियम (Weight Accuracy Statement):'
              : 'Weight Accuracy Notice:'}
          </p>
          <p className="text-orange-900 font-medium leading-relaxed">
            {language === 'hi'
              ? 'बची हुई गैस का मान तभी 100% सटीक होता है जब सिलेंडर का वर्तमान वजन कांटे पर तौलकर दर्ज किया जाए। बिना वजन के यह केवल एक अनुमान है।'
              : 'Remaining gas is accurate only when current cylinder weight is entered. Without weighing, the value is an estimate.'}
          </p>
          <p className="text-[11px] text-orange-800 font-semibold pt-0.5">
            सूत्र: बची हुई गैस (kg) = कांटे पर कुल वजन (Gross Weight) − खाली सिलेंडर वजन (Tare Weight TW)
          </p>
        </div>
      </div>

      {/* Cylinders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {cylinders.map((cyl) => {
          const isConnected = cyl.status === 'in_use';
          const isFull = cyl.status === 'full';
          const pct = Math.min(100, Math.max(0, cyl.remaining_percentage || 0));

          return (
            <Card
              key={cyl.id}
              className={`p-5 border transition-all relative overflow-hidden ${
                isConnected
                  ? 'border-orange-400 bg-orange-50/20 shadow-md ring-1 ring-orange-300'
                  : 'border-stone-200 bg-white'
              }`}
            >
              {/* Active Connection Tag */}
              {isConnected && (
                <div className="absolute top-0 right-0 bg-orange-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-wider flex items-center gap-1">
                  <Flame className="w-3 h-3 fill-current animate-pulse" />
                  भट्टी चालू (In Use)
                </div>
              )}

              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black shrink-0 ${
                      isConnected
                        ? 'bg-orange-600 text-white'
                        : isFull
                        ? 'bg-emerald-600 text-white'
                        : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    <Flame className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-stone-900">{cyl.cylinder_code}</h3>
                    <p className="text-[11px] text-stone-500">{cyl.storage_location || 'Kitchen'}</p>
                  </div>
                </div>

                {isOwner && (
                  <button
                    type="button"
                    title={language === 'hi' ? 'सिलेंडर हटाएं' : 'Delete Cylinder'}
                    onClick={() => setCylinderToDelete(cyl)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Gas Gauge */}
              <div className="space-y-2 mb-4 bg-stone-50 p-3.5 rounded-xl border border-stone-100">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-stone-600 font-semibold">बची हुई गैस:</span>
                  <div className="text-right">
                    <span className="text-xl font-black text-stone-900">
                      {cyl.calculated_remaining_gas} <span className="text-xs font-bold text-stone-500">kg</span>
                    </span>
                    <span className="text-xs font-bold text-orange-700 ml-1.5">
                      ({pct}%)
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct > 50
                        ? 'bg-emerald-600'
                        : pct > 20
                        ? 'bg-amber-500'
                        : 'bg-rose-600'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-stone-500 pt-1 font-medium">
                  <span>खाली वजन (TW): {cyl.tare_weight} kg</span>
                  <span>कुल वजन: {cyl.current_gross_weight} kg</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Scale className="w-3.5 h-3.5 text-stone-700" />}
                    onClick={() => handleOpenWeighModal(cyl)}
                    className="text-xs font-bold w-full bg-white"
                  >
                    तौलें (Weigh)
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<RefreshCw className="w-3.5 h-3.5 text-emerald-700" />}
                    onClick={() => handleOpenRefillModal(cyl)}
                    className="text-xs font-bold w-full bg-white"
                  >
                    रिफिल (Refill)
                  </Button>
                </div>

                {!isConnected && (
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Flame className="w-3.5 h-3.5" />}
                    onClick={() => connectCylinderMutation.mutate(cyl.id)}
                    isLoading={connectCylinderMutation.isPending}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs"
                  >
                    भट्टी से जोड़ें (Connect)
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Weighing & Consumption History */}
      <Card className="p-5 border-stone-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2 pb-2 border-b border-stone-100">
          <History className="w-4 h-4 text-orange-600" />
          गैस सिलेंडर वजन व रिफिल इतिहास (LPG Readings Log)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-50 text-stone-600 font-semibold border-b border-stone-200">
              <tr>
                <th className="p-3">दिनांक व समय</th>
                <th className="p-3">सिलेंडर</th>
                <th className="p-3">प्रकार</th>
                <th className="p-3 text-right">कांटे पर वजन (Gross)</th>
                <th className="p-3 text-right">बची हुई गैस (kg)</th>
                <th className="p-3 text-right">गैस खपत (kg)</th>
                <th className="p-3">विवरण / नोट्स</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {readings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-stone-500">
                    अभी कोई वजन रिकॉर्ड नहीं है।
                  </td>
                </tr>
              ) : (
                readings.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="p-3 text-stone-600">{formatDate(r.reading_date)}</td>
                    <td className="p-3 font-bold text-stone-900">
                      {cylinders.find((c) => c.id === r.cylinder_id)?.cylinder_code || 'LPG'}
                    </td>
                    <td className="p-3">
                      <span className="capitalize px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-800">
                        {r.reading_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-right font-semibold text-stone-700">{r.gross_weight} kg</td>
                    <td className="p-3 text-right font-black text-stone-900">{r.remaining_gas_kg} kg</td>
                    <td className="p-3 text-right font-bold text-rose-700">
                      {r.gas_consumed_kg > 0 ? `-${r.gas_consumed_kg} kg` : '—'}
                    </td>
                    <td className="p-3 text-stone-600">{r.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Weigh Cylinder Modal */}
      <Modal
        isOpen={Boolean(cylinderToWeigh)}
        onClose={() => setCylinderToWeigh(null)}
        title={`सिलेंडर तौलें (Weigh Cylinder): ${cylinderToWeigh?.cylinder_code || ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleWeighSubmit} className="space-y-4">
          <div className="p-3 bg-stone-50 rounded-xl text-xs space-y-1">
            <p className="text-stone-600">
              सिलेंडर बॉडी पर मुद्रित खाली वजन (TW): <strong>{cylinderToWeigh?.tare_weight} kg</strong>
            </p>
            <p className="text-stone-600">
              पिछला दर्ज वजन: <strong>{cylinderToWeigh?.current_gross_weight} kg</strong>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              कांटे पर वर्तमान कुल वजन (Current Gross Weight kg) <span className="text-rose-600">*</span>
            </label>
            <input
              type="number"
              step="0.05"
              required
              min={cylinderToWeigh?.tare_weight}
              value={weighGross}
              onChange={(e) => setWeighGross(e.target.value)}
              className="w-full px-3 py-2 text-sm font-bold text-stone-900 border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {weighGross && cylinderToWeigh && (
            <div className="p-3 bg-orange-50 rounded-xl text-xs flex justify-between items-center text-orange-950 font-bold">
              <span>गणना की गई बची हुई गैस:</span>
              <span className="text-base text-orange-800">
                {Math.max(0, parseFloat(weighGross) - cylinderToWeigh.tare_weight).toFixed(2)} kg
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">नोट्स (वैकल्पिक)</label>
            <input
              type="text"
              placeholder="उदा. दैनिक उत्पादन पश्चात शाम का वजन"
              value={weighNotes}
              onChange={(e) => setWeighNotes(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setCylinderToWeigh(null)}>
              रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={recordReadingMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold"
            >
              वजन दर्ज करें
            </Button>
          </div>
        </form>
      </Modal>

      {/* Refill Cylinder Modal */}
      <Modal
        isOpen={Boolean(cylinderToRefill)}
        onClose={() => setCylinderToRefill(null)}
        title={`सिलेंडर रिफिल दर्ज करें: ${cylinderToRefill?.cylinder_code || ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleRefillSubmit} className="space-y-4">
          <p className="text-xs text-stone-600">
            सिलेंडर रिफिल करने पर यह पुनः 100% फुल (19 kg गैस) के रूप में दर्ज हो जाएगा और इसका खर्च स्वतः दर्ज हो जाएगा।
          </p>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              रिफिल लागत (Refill Cost ₹) <span className="text-rose-600">*</span>
            </label>
            <input
              type="number"
              required
              step="any"
              min="0"
              value={refillCost}
              onChange={(e) => setRefillCost(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              भरे हुए सिलेंडर का कुल वजन (Full Gross Weight kg)
            </label>
            <input
              type="number"
              step="0.1"
              value={refillGross}
              onChange={(e) => setRefillGross(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setCylinderToRefill(null)}>
              रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={recordRefillMutation.isPending}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
            >
              ✓ रिफिल सुरक्षित करें
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add New Cylinder Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="नया LPG सिलेंडर जोड़ें (Add Cylinder)"
        maxWidth="md"
      >
        <form onSubmit={handleAddCylinderSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                सिलेंडर कोड <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={addCode}
                onChange={(e) => setAddCode(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono font-bold uppercase border border-stone-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                खाली वजन TW (kg) <span className="text-rose-600">*</span>
              </label>
              <input
                type="number"
                step="0.05"
                required
                value={addTareWeight}
                onChange={(e) => setAddTareWeight(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-bold border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">सप्लायर</label>
              <select
                value={addSupplierId}
                onChange={(e) => setAddSupplierId(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg bg-white"
              >
                <option value="">-- सप्लायर चुनें --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">स्थान</label>
              <input
                type="text"
                value={addLocation}
                onChange={(e) => setAddLocation(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
            <Button variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)}>
              रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={createCylinderMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold"
            >
              सहेजें
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Cylinder Confirmation Modal */}
      <Modal
        isOpen={Boolean(cylinderToDelete)}
        onClose={() => setCylinderToDelete(null)}
        title={language === 'hi' ? 'सिलेंडर हटाएं (Delete Cylinder)' : 'Delete LPG Cylinder'}
        maxWidth="md"
      >
        <div className="space-y-4">
          {cylinderToDelete?.status === 'in_use' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  {language === 'hi' ? 'सावधानी: यह सिलेंडर भट्टी पर सक्रिय है' : 'Warning: Cylinder is currently in use'}
                </p>
                <p className="text-amber-800 text-[11px] mt-0.5">
                  {language === 'hi'
                    ? 'यह सिलेंडर वर्तमान में भट्टी से जुड़ा है। इसे हटाने से इसका कनेक्शन भी समाप्त हो जाएगा।'
                    : 'This cylinder is currently connected to the burner. Deleting it will clear the active connection.'}
                </p>
              </div>
            </div>
          )}

          <div className="p-4 bg-stone-50 rounded-xl text-xs space-y-2 border border-stone-200">
            <div className="flex justify-between items-center text-stone-700">
              <span className="font-medium">{language === 'hi' ? 'सिलेंडर कोड:' : 'Cylinder Code:'}</span>
              <span className="font-black text-stone-900 font-mono text-sm">{cylinderToDelete?.cylinder_code}</span>
            </div>
            <div className="flex justify-between items-center text-stone-700">
              <span className="font-medium">{language === 'hi' ? 'खाली वजन (TW):' : 'Tare Weight (TW):'}</span>
              <span className="font-semibold text-stone-900">{cylinderToDelete?.tare_weight} kg</span>
            </div>
            <div className="flex justify-between items-center text-stone-700">
              <span className="font-medium">{language === 'hi' ? 'वर्तमान बची गैस:' : 'Remaining Gas:'}</span>
              <span className="font-bold text-orange-700">{cylinderToDelete?.calculated_remaining_gas} kg</span>
            </div>
            <div className="flex justify-between items-center text-stone-700">
              <span className="font-medium">{language === 'hi' ? 'स्थान:' : 'Storage Location:'}</span>
              <span className="font-medium text-stone-800">{cylinderToDelete?.storage_location || 'Kitchen'}</span>
            </div>
          </div>

          <p className="text-xs text-rose-700 font-medium">
            {language === 'hi'
              ? '⚠️ क्या आप वाकई इस सिलेंडर को हटाना चाहते हैं? इससे संबंधित सभी वजन व रिफिल इतिहास रिकॉर्ड भी हटा दिए जाएंगे।'
              : '⚠️ Are you sure you want to delete this cylinder? All associated weight readings and refill history records will also be removed.'}
          </p>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCylinderToDelete(null)}
              disabled={deleteCylinderMutation.isPending}
            >
              {language === 'hi' ? 'रद्द करें' : 'Cancel'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={deleteCylinderMutation.isPending}
              onClick={handleDeleteSubmit}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              {language === 'hi' ? 'हाँ, सिलेंडर हटाएं' : 'Yes, Delete Cylinder'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
