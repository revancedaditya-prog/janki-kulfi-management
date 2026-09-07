import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  useSimpleLpgCylinders,
  useSimpleLpgMovements,
  useAddSimpleLpgCylinder,
  useRecordSimpleLpgMovement,
  useCorrectSimpleLpgMovement,
  useDeleteOrArchiveSimpleLpgCylinder,
  useReactivateSimpleLpgCylinder,
} from '@/hooks/useLpg';
import { useAuth } from '@/context/AuthContext';
import {
  SimpleLpgCylinder,
  SimpleLpgMovement,
  SimpleLpgCylinderStatus,
  SimpleLpgMovementType,
} from '@/types';
import { formatDate, formatDateTime, getTodayDateString, formatLpgDuration } from '@/lib/formatters';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import {
  Flame,
  Plus,
  ArrowLeft,
  Archive,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Truck,
  MapPin,
  AlertTriangle,
  Layers,
  Edit3,
  Search,
  Trash2,
  Calendar,
  Clock,
  FileText,
} from 'lucide-react';

const STATUS_CONFIG: Record<
  string,
  { labelEn: string; labelHi: string; color: string; bg: string; badge: string }
> = {
  full: {
    labelEn: 'Full',
    labelHi: 'भरा हुआ',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200',
  },
  connected: {
    labelEn: 'Connected',
    labelHi: 'भट्टी पर लगा',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
    badge: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200',
  },
  in_use: {
    labelEn: 'Connected',
    labelHi: 'भट्टी पर लगा',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
    badge: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200',
  },
  empty: {
    labelEn: 'Empty',
    labelHi: 'खाली',
    color: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
    badge: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/60 dark:text-rose-200',
  },
  sent_for_refill: {
    labelEn: 'Sent for Refill',
    labelHi: 'भरने भेजा',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-200',
  },
  inactive: {
    labelEn: 'Inactive',
    labelHi: 'निष्क्रिय / बंद',
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    badge: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-300',
  },
  damaged_inactive: {
    labelEn: 'Inactive',
    labelHi: 'निष्क्रिय / बंद',
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    badge: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-300',
  },
};

const MOVEMENT_TYPE_CONFIG: Record<
  string,
  { labelHi: string; labelEn: string; colorClass: string }
> = {
  cylinder_added: {
    labelHi: 'नया सिलेंडर जोड़ा गया',
    labelEn: 'Cylinder Added',
    colorClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300',
  },
  connected: {
    labelHi: 'भट्टी पर लगाया',
    labelEn: 'Connected to Bhatti',
    colorClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200',
  },
  empty_removed: {
    labelHi: 'खाली / भट्टी से हटाया',
    labelEn: 'Empty / Removed',
    colorClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/60 dark:text-rose-200',
  },
  refill_sent: {
    labelHi: 'रिफिल के लिए भेजा',
    labelEn: 'Sent for Refill',
    colorClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-200',
  },
  refill_received: {
    labelHi: 'रिफिल मिला (Full)',
    labelEn: 'Refill Received (Full)',
    colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200',
  },
  correction: {
    labelHi: 'प्रविष्टि सुधार',
    labelEn: 'Correction / Reversal',
    colorClass: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/60 dark:text-purple-200',
  },
  reactivated: {
    labelHi: 'पुनः चालू किया गया',
    labelEn: 'Reactivated',
    colorClass: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/60 dark:text-teal-200',
  },
  archived: {
    labelHi: 'निष्क्रिय किया गया',
    labelEn: 'Archived',
    colorClass: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400',
  },
};

const BHATTI_PLACES = [
  'Kulfi Bhatti 1',
  'Kulfi Bhatti 2',
  'Rabdi Bhatti',
  'Boiling Station',
  'Main Kitchen',
  'Storage / रिजर्व',
];

function getNextSuggestedCode(cylinders: SimpleLpgCylinder[]): string {
  let maxNum = 0;
  for (const c of cylinders) {
    const match = c.cylinder_code.match(/^C-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `C-${maxNum + 1}`;
}

export const LpgCylinderPage: React.FC = () => {
  const { isOwner } = useAuth();

  const { data: cylinders = [], refetch: refetchCylinders } = useSimpleLpgCylinders(true);
  const { data: movements = [], refetch: refetchMovements } = useSimpleLpgMovements();

  const addCylinderMutation = useAddSimpleLpgCylinder();
  const recordMovementMutation = useRecordSimpleLpgMovement();
  const correctMovementMutation = useCorrectSimpleLpgMovement();
  const deleteArchiveMutation = useDeleteOrArchiveSimpleLpgCylinder();
  const reactivateMutation = useReactivateSimpleLpgCylinder();

  const [activeTab, setActiveTab] = useState<'status' | 'register'>('status');
  const [statusFilter, setStatusFilter] = useState<'all_active' | 'full' | 'connected' | 'empty' | 'sent_for_refill' | 'inactive'>('all_active');
  const [searchQuery, setSearchQuery] = useState('');
  const [movementFilterCylinder, setMovementFilterCylinder] = useState<string>('all');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCorrectModalOpen, setIsCorrectModalOpen] = useState(false);

  const [targetCylinder, setTargetCylinder] = useState<SimpleLpgCylinder | null>(null);
  const [targetMovement, setTargetMovement] = useState<SimpleLpgMovement | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Quick Movement State
  const [selectedCylId, setSelectedCylId] = useState<string>('');
  const [movAction, setMovAction] = useState<SimpleLpgMovementType>('connected');
  const [movDate, setMovDate] = useState<string>(getTodayDateString());
  const [movTime, setMovTime] = useState<string>('08:00');
  const [movPlace, setMovPlace] = useState<string>('Kulfi Bhatti 1');
  const [movSupplier, setMovSupplier] = useState<string>('Bharat Gas Agency');
  const [movBill, setMovBill] = useState<string>('');
  const [movNotes, setMovNotes] = useState<string>('');

  // Add Cylinder State
  const [addCode, setAddCode] = useState<string>('');
  const [addStatus, setAddStatus] = useState<SimpleLpgCylinderStatus>('full');
  const [addSupplierName, setAddSupplierName] = useState<string>('Bharat Gas Agency');
  const [addStartDate, setAddStartDate] = useState<string>(getTodayDateString());
  const [addNotes, setAddNotes] = useState<string>('');

  // Delete/Archive State
  const [deleteReason, setDeleteReason] = useState<string>('');

  // Correction State
  const [corrReason, setCorrReason] = useState<string>('');
  const [corrType, setCorrType] = useState<SimpleLpgMovementType>('connected');
  const [corrDate, setCorrDate] = useState<string>(getTodayDateString());
  const [corrTime, setCorrTime] = useState<string>('');
  const [corrPlace, setCorrPlace] = useState<string>('');
  const [corrSupplier, setCorrSupplier] = useState<string>('');
  const [corrBill, setCorrBill] = useState<string>('');
  const [corrNotes, setCorrNotes] = useState<string>('');

  const summary = useMemo(() => {
    const active = cylinders.filter((c) => c.is_active !== false && c.status !== 'inactive');
    return {
      totalActive: active.length,
      full: active.filter((c) => c.status === 'full').length,
      connected: active.filter((c) => c.status === 'connected' || c.status === 'in_use').length,
      empty: active.filter((c) => c.status === 'empty').length,
      sentForRefill: active.filter((c) => c.status === 'sent_for_refill').length,
      inactive: cylinders.filter((c) => c.is_active === false || c.status === 'inactive').length,
    };
  }, [cylinders]);

  const filteredCylinders = useMemo(() => {
    return cylinders.filter((c) => {
      if (statusFilter === 'all_active') {
        if (c.is_active === false || c.status === 'inactive') return false;
      } else if (statusFilter === 'inactive') {
        if (c.is_active !== false && c.status !== 'inactive') return false;
      } else if (statusFilter === 'connected') {
        if (c.status !== 'connected' && c.status !== 'in_use') return false;
      } else {
        if (c.status !== statusFilter) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const code = (c.cylinder_code || '').toLowerCase();
        const place = (c.current_place || '').toLowerCase();
        const supp = (c.supplier_name || '').toLowerCase();
        const notes = (c.notes || '').toLowerCase();
        if (!code.includes(q) && !place.includes(q) && !supp.includes(q) && !notes.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [cylinders, statusFilter, searchQuery]);

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (movementFilterCylinder !== 'all' && m.cylinder_id !== movementFilterCylinder) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const code = (m.cylinder?.cylinder_code || '').toLowerCase();
        const notes = (m.notes || '').toLowerCase();
        const place = (m.bhatti_place || '').toLowerCase();
        const supp = (m.supplier_name || '').toLowerCase();
        const bill = (m.bill_number || '').toLowerCase();
        if (!code.includes(q) && !notes.includes(q) && !place.includes(q) && !supp.includes(q) && !bill.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [movements, movementFilterCylinder, searchQuery]);

  const handleOpenMovementModal = (cylinder?: SimpleLpgCylinder, defaultAction?: SimpleLpgMovementType) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const activeCyls = cylinders.filter((c) => c.is_active !== false && c.status !== 'inactive');
    const selected = cylinder || (activeCyls.length > 0 ? activeCyls[0] : cylinders[0]);
    if (!selected) {
      setErrorMsg('No cylinder available. Please add a cylinder first.');
      return;
    }
    setSelectedCylId(selected.id);
    let action: SimpleLpgMovementType = 'connected';
    if (defaultAction) {
      action = defaultAction;
    } else {
      if (selected.status === 'full') action = 'connected';
      else if (selected.status === 'connected' || selected.status === 'in_use') action = 'empty_removed';
      else if (selected.status === 'empty') action = 'refill_sent';
      else if (selected.status === 'sent_for_refill') action = 'refill_received';
    }
    setMovAction(action);
    setMovDate(getTodayDateString());
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setMovTime(`${hh}:${mm}`);
    setMovPlace(selected.current_place || 'Kulfi Bhatti 1');
    setMovSupplier(selected.supplier_name || 'Bharat Gas Agency');
    setMovBill('');
    setMovNotes('');
    setIsMovementModalOpen(true);
  };

  const handleCylinderSelectChange = (newCylId: string) => {
    setSelectedCylId(newCylId);
    const cyl = cylinders.find((c) => c.id === newCylId);
    if (!cyl) return;
    if (cyl.status === 'full') setMovAction('connected');
    else if (cyl.status === 'connected' || cyl.status === 'in_use') setMovAction('empty_removed');
    else if (cyl.status === 'empty') setMovAction('refill_sent');
    else if (cyl.status === 'sent_for_refill') setMovAction('refill_received');
    if (cyl.current_place) setMovPlace(cyl.current_place);
    if (cyl.supplier_name) setMovSupplier(cyl.supplier_name);
  };

  const handleOpenAddModal = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setAddCode(getNextSuggestedCode(cylinders));
    setAddStatus('full');
    setAddSupplierName('Bharat Gas Agency');
    setAddStartDate(getTodayDateString());
    setAddNotes('');
    setIsAddModalOpen(true);
  };

  const handleOpenDeleteModal = (cyl: SimpleLpgCylinder) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setTargetCylinder(cyl);
    setDeleteReason('');
    setIsDeleteModalOpen(true);
  };

  const handleOpenCorrectModal = (mov: SimpleLpgMovement) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setTargetMovement(mov);
    setCorrReason('');
    setCorrType(mov.movement_type);
    setCorrDate(mov.movement_date || getTodayDateString());
    setCorrTime('');
    setCorrPlace(mov.bhatti_place || '');
    setCorrSupplier(mov.supplier_name || '');
    setCorrBill(mov.bill_number || '');
    setCorrNotes(mov.notes || '');
    setIsCorrectModalOpen(true);
  };

  const handleMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCylId) return;
    setErrorMsg(null);
    try {
      const res = await recordMovementMutation.mutateAsync({
        cylinder_id: selectedCylId,
        movement_type: movAction,
        movement_date: movDate,
        movement_time: movTime || null,
        bhatti_place: movAction === 'connected' || movAction === 'empty_removed' ? movPlace : null,
        supplier_name: movAction === 'refill_sent' || movAction === 'refill_received' ? movSupplier : null,
        bill_number: movBill.trim() || null,
        notes: movNotes.trim() || null,
      });
      const cylCode = res.cylinder?.cylinder_code || '';
      const stHi = STATUS_CONFIG[res.cylinder?.status]?.labelHi || res.cylinder?.status;
      setSuccessMsg(`प्रविष्टि सफल: सिलेंडर ${cylCode} अब "${stHi}" स्थिति में है।`);
      setIsMovementModalOpen(false);
      refetchCylinders();
      refetchMovements();
    } catch (err: any) {
      setErrorMsg(err.message || 'सिलेंडर प्रविष्टि दर्ज करने में त्रुटि हुई');
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = addCode.trim().toUpperCase();
    if (!code) {
      setErrorMsg('Cylinder code is required / सिलेंडर कोड आवश्यक है');
      return;
    }
    setErrorMsg(null);
    try {
      await addCylinderMutation.mutateAsync({
        cylinder_code: code,
        status: addStatus,
        supplier_name: addSupplierName.trim() || 'Bharat Gas Agency',
        starting_date: addStartDate,
        notes: addNotes.trim() || null,
      });
      setSuccessMsg(`सिलेंडर ${code} सफलतापूर्वक जोड़ा गया!`);
      setIsAddModalOpen(false);
      refetchCylinders();
      refetchMovements();
    } catch (err: any) {
      setErrorMsg(err.message || 'सिलेंडर जोड़ने में त्रुटि हुई');
    }
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCylinder) return;
    if (!deleteReason.trim()) {
      setErrorMsg('हटाने का कारण दर्ज करना अनिवार्य है (Reason is mandatory)');
      return;
    }
    setErrorMsg(null);
    try {
      const res = await deleteArchiveMutation.mutateAsync({
        cylinder_id: targetCylinder.id,
        reason: deleteReason.trim(),
      });
      setSuccessMsg(res.message || 'सिलेंडर प्रक्रिया पूर्ण हुई');
      setIsDeleteModalOpen(false);
      setTargetCylinder(null);
      refetchCylinders();
      refetchMovements();
    } catch (err: any) {
      setErrorMsg(err.message || 'सिलेंडर हटाने/निष्क्रिय करने में त्रुटि');
    }
  };

  const handleReactivate = async (cyl: SimpleLpgCylinder) => {
    setErrorMsg(null);
    try {
      await reactivateMutation.mutateAsync({
        cylinder_id: cyl.id,
        reason: 'Reactivated by Owner',
      });
      setSuccessMsg(`सिलेंडर ${cyl.cylinder_code} पुनः सक्रिय (Active) कर दिया गया!`);
      refetchCylinders();
      refetchMovements();
    } catch (err: any) {
      setErrorMsg(err.message || 'पुनः सक्रिय करने में त्रुटि');
    }
  };

  const handleCorrectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMovement) return;
    if (!corrReason.trim()) {
      setErrorMsg('सुधार का कारण दर्ज करना अनिवार्य है (Reason is mandatory)');
      return;
    }
    setErrorMsg(null);
    try {
      await correctMovementMutation.mutateAsync({
        movement_id: targetMovement.id,
        reason: corrReason.trim(),
        corrected_movement_type: corrType,
        corrected_date: corrDate || undefined,
        corrected_time: corrTime || undefined,
        corrected_bhatti_place: corrPlace || undefined,
        corrected_supplier_name: corrSupplier || undefined,
        corrected_bill_number: corrBill || undefined,
        corrected_notes: corrNotes || undefined,
      });
      setSuccessMsg('प्रविष्टि में सुधार (Correction) दर्ज हो गया और इतिहास सुरक्षित है।');
      setIsCorrectModalOpen(false);
      setTargetMovement(null);
      refetchCylinders();
      refetchMovements();
    } catch (err: any) {
      setErrorMsg(err.message || 'प्रविष्टि सुधार में त्रुटि हुई');
    }
  };

  const selectedCylinderObj = useMemo(
    () => cylinders.find((c) => c.id === selectedCylId),
    [cylinders, selectedCylId]
  );

  return (
    <div className="space-y-6 pb-28 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
        <div className="flex items-center gap-3">
          <Link to="/inventory">
            <button
              type="button"
              className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer text-stone-700 dark:text-stone-300"
              title="Back to Inventory"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white shadow-xs">
                <Flame className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white tracking-tight">
                Cylinder Register / सिलेंडर रजिस्टर
              </h1>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 font-medium">
              LPG Cylinder Status & Movement Ledger (सरल गैस सिलेंडर प्रबंधन)
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="md"
            leftIcon={<Flame className="w-4 h-4" />}
            onClick={() => handleOpenMovementModal()}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold min-h-[44px] shadow-sm cursor-pointer"
          >
            + Cylinder Entry / सिलेंडर एंट्री
          </Button>

          {isOwner && (
            <Button
              variant="outline"
              size="md"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={handleOpenAddModal}
              className="font-bold border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px] cursor-pointer"
            >
              + Add Cylinder
            </Button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-start justify-between gap-3 text-rose-800 dark:text-rose-200 text-sm shadow-xs animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-500 hover:text-rose-700 font-bold px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-start justify-between gap-3 text-emerald-800 dark:text-emerald-200 text-sm shadow-xs animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <span className="font-semibold">{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-700 font-bold px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { key: 'all_active', labelHi: 'कुल सक्रिय', labelEn: 'Active', val: summary.totalActive, icon: Layers, color: 'text-stone-800 dark:text-stone-100' },
          { key: 'full', labelHi: 'भरा हुआ', labelEn: 'Full', val: summary.full, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
          { key: 'connected', labelHi: 'भट्टी पर लगा', labelEn: 'Connected', val: summary.connected, icon: Flame, color: 'text-amber-600 dark:text-amber-400' },
          { key: 'empty', labelHi: 'खाली', labelEn: 'Empty', val: summary.empty, icon: AlertCircle, color: 'text-rose-600 dark:text-rose-400' },
          { key: 'sent_for_refill', labelHi: 'भरने भेजा', labelEn: 'Sent Refill', val: summary.sentForRefill, icon: Truck, color: 'text-blue-600 dark:text-blue-400' },
          { key: 'inactive', labelHi: 'निष्क्रिय/बंद', labelEn: 'Inactive', val: summary.inactive, icon: Archive, color: 'text-slate-500 dark:text-slate-400' },
        ].map(({ key, labelHi, labelEn, val, icon: Icon, color }) => {
          const isSelected = statusFilter === key;
          return (
            <div
              key={key}
              onClick={() => setStatusFilter(key as any)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                isSelected
                  ? 'bg-stone-900 text-white border-stone-900 shadow-md ring-2 ring-orange-500'
                  : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:border-orange-300'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold mb-1 opacity-80">
                <span>{labelHi}</span>
                <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : color}`} />
              </div>
              <div className="text-2xl font-black">{val}</div>
              <div className="text-[10px] opacity-60 font-medium">{labelEn}</div>
            </div>
          );
        })}
      </div>

      {/* Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 dark:border-stone-800 pb-3">
        <div className="flex items-center gap-2 bg-stone-100 dark:bg-stone-800/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
              activeTab === 'status'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            Current Status (वर्तमान स्थिति)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
              activeTab === 'register'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            Movement Register (मूवमेंट रजिस्टर)
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'register' && (
            <select
              value={movementFilterCylinder}
              onChange={(e) => setMovementFilterCylinder(e.target.value)}
              className="px-3 py-2 text-xs font-bold bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Cylinders (सभी)</option>
              {cylinders.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.cylinder_code}
                </option>
              ))}
            </select>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search / खोजें..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      </div>

      {/* View A: Current Status Cards */}
      {activeTab === 'status' && (
        <div>
          {filteredCylinders.length === 0 ? (
            <div className="text-center py-12 bg-stone-50 dark:bg-stone-900/50 rounded-2xl border border-dashed border-stone-300 dark:border-stone-800">
              <Flame className="w-12 h-12 text-stone-300 dark:text-stone-700 mx-auto mb-3" />
              <p className="text-stone-600 dark:text-stone-400 font-bold">No cylinders found matching this filter.</p>
              <p className="text-xs text-stone-400 mt-1">कोई सिलेंडर नहीं मिला।</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCylinders.map((cyl) => {
                const isConnected = cyl.status === 'connected' || cyl.status === 'in_use';
                const isInactive = cyl.is_active === false || cyl.status === 'inactive';
                const cfg = STATUS_CONFIG[cyl.status] || STATUS_CONFIG.full;

                return (
                  <div
                    key={cyl.id}
                    className={`p-5 rounded-2xl border transition-all flex flex-col justify-between shadow-2xs ${
                      isInactive
                        ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-80'
                        : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:border-orange-300'
                    }`}
                  >
                    <div>
                      {/* Top Code & Status */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800 flex items-center justify-center text-orange-700 dark:text-orange-400 font-black text-base">
                            {cyl.cylinder_code}
                          </div>
                          <div>
                            <h3 className="font-black text-lg text-stone-900 dark:text-white leading-tight">
                              {cyl.cylinder_code}
                            </h3>
                            <span className="text-[11px] text-stone-500 dark:text-stone-400">
                              {cyl.supplier_name || 'Bharat Gas Agency'}
                            </span>
                          </div>
                        </div>

                        <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${cfg.badge}`}>
                          {cfg.labelHi} ({cfg.labelEn})
                        </span>
                      </div>

                      {/* Details */}
                      <div className="space-y-2 py-3 border-y border-stone-100 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-300">
                        <div className="flex justify-between items-center">
                          <span className="text-stone-500 font-medium flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-stone-400" />
                            Place / स्थान:
                          </span>
                          <span className="font-bold text-stone-800 dark:text-stone-200">
                            {cyl.current_place || 'Storage / स्टोर'}
                          </span>
                        </div>

                        {isConnected && cyl.connected_at && (
                          <div className="flex justify-between items-center">
                            <span className="text-stone-500 font-medium flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-amber-500" />
                              Connected Time:
                            </span>
                            <span className="font-bold text-amber-700 dark:text-amber-300">
                              {formatDateTime(cyl.connected_at)}
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between items-center">
                          <span className="text-stone-500 font-medium flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-stone-400" />
                            Last Movement:
                          </span>
                          <span className="font-medium text-stone-700 dark:text-stone-300">
                            {cyl.last_movement_at ? formatDateTime(cyl.last_movement_at) : 'N/A'}
                          </span>
                        </div>

                        {cyl.notes && (
                          <div className="pt-1 text-[11px] text-stone-500 italic bg-stone-50 dark:bg-stone-800/50 p-2 rounded-lg">
                            Remark: {cyl.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Contextual Action Buttons */}
                    <div className="mt-4 pt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap flex-1">
                        {cyl.status === 'full' && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleOpenMovementModal(cyl, 'connected')}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold min-h-[40px] text-xs cursor-pointer"
                          >
                            <Flame className="w-3.5 h-3.5 mr-1" />
                            Connect to Bhatti (भट्टी पर लगाएं)
                          </Button>
                        )}

                        {isConnected && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenMovementModal(cyl, 'empty_removed')}
                            className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950 font-bold min-h-[40px] text-xs cursor-pointer"
                          >
                            <AlertCircle className="w-3.5 h-3.5 mr-1" />
                            Mark Empty (खाली चिन्हित करें)
                          </Button>
                        )}

                        {cyl.status === 'empty' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenMovementModal(cyl, 'refill_sent')}
                              className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950 font-bold min-h-[40px] text-xs cursor-pointer"
                            >
                              <Truck className="w-3.5 h-3.5 mr-1" />
                              Send Refill (भरने भेजें)
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleOpenMovementModal(cyl, 'refill_received')}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold min-h-[40px] text-xs cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Received Full (रिफिल मिला)
                            </Button>
                          </>
                        )}

                        {cyl.status === 'sent_for_refill' && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleOpenMovementModal(cyl, 'refill_received')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold min-h-[40px] text-xs cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Refill Received Full (रिफिल मिला)
                          </Button>
                        )}

                        {isInactive && isOwner && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReactivate(cyl)}
                            className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950 font-bold min-h-[40px] text-xs cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />
                            Reactivate (पुनः चालू करें)
                          </Button>
                        )}
                      </div>

                      {/* Owner Delete/Archive button */}
                      {isOwner && !isConnected && !isInactive && (
                        <button
                          type="button"
                          onClick={() => handleOpenDeleteModal(cyl)}
                          title="Remove / Archive Cylinder"
                          className="p-2.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View B: Movement Register (Ledger) */}
      {activeTab === 'register' && (
        <div className="space-y-4">
          {filteredMovements.length === 0 ? (
            <div className="text-center py-12 bg-stone-50 dark:bg-stone-900/50 rounded-2xl border border-dashed border-stone-300 dark:border-stone-800">
              <FileText className="w-12 h-12 text-stone-300 dark:text-stone-700 mx-auto mb-3" />
              <p className="text-stone-600 dark:text-stone-400 font-bold">No movements recorded yet.</p>
              <p className="text-xs text-stone-400 mt-1">कोई मूवमेंट रिकॉर्ड उपलब्ध नहीं है।</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-100 dark:bg-stone-800/70 border-b border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 font-bold">
                    <tr>
                      <th className="p-3.5">Date & Time / दिनांक</th>
                      <th className="p-3.5">Cylinder ID</th>
                      <th className="p-3.5">Action / गतिविधि</th>
                      <th className="p-3.5">Place / स्थान</th>
                      <th className="p-3.5">Running Duration / अवधि</th>
                      <th className="p-3.5">Supplier / Bill</th>
                      <th className="p-3.5">Remark / टिप्पणी</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-stone-800 dark:text-stone-200">
                    {filteredMovements.map((mov) => {
                      const cfg = MOVEMENT_TYPE_CONFIG[mov.movement_type] || {
                        labelHi: mov.movement_type,
                        labelEn: mov.movement_type,
                        colorClass: 'bg-stone-100 text-stone-800 border-stone-300',
                      };
                      const durFormatted = mov.running_duration_display || mov.running_duration_text || formatLpgDuration(mov.running_duration_minutes);

                      return (
                        <tr key={mov.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                          <td className="p-3.5 font-medium whitespace-nowrap">
                            <div>{formatDate(mov.movement_date)}</div>
                            {mov.movement_time && (
                              <div className="text-[10px] text-stone-400">{mov.movement_time}</div>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className="font-black px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100">
                              {mov.cylinder?.cylinder_code || '—'}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-bold border ${cfg.colorClass}`}>
                              {cfg.labelHi}
                            </span>
                          </td>
                          <td className="p-3.5 font-semibold text-stone-700 dark:text-stone-300">
                            {mov.bhatti_place || '—'}
                          </td>
                          <td className="p-3.5">
                            {durFormatted ? (
                              <span className="font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                                ⏱️ {durFormatted}
                              </span>
                            ) : (
                              <span className="text-stone-400">—</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <div>{mov.supplier_name || '—'}</div>
                            {mov.bill_number && (
                              <div className="text-[10px] text-stone-500 font-mono">Bill: {mov.bill_number}</div>
                            )}
                          </td>
                          <td className="p-3.5 max-w-xs truncate text-stone-500" title={mov.notes || ''}>
                            {mov.notes || '—'}
                          </td>
                          <td className="p-3.5 text-right whitespace-nowrap">
                            {isOwner && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenCorrectModal(mov)}
                                className="font-bold text-xs min-h-[36px] border-stone-200 text-stone-600 hover:text-purple-700 hover:border-purple-300 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3 mr-1" />
                                Correct (सुधार)
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View (Optimized for small screens) */}
              <div className="md:hidden space-y-3">
                {filteredMovements.map((mov) => {
                  const cfg = MOVEMENT_TYPE_CONFIG[mov.movement_type] || {
                    labelHi: mov.movement_type,
                    labelEn: mov.movement_type,
                    colorClass: 'bg-stone-100 text-stone-800 border-stone-300',
                  };
                  const durFormatted = mov.running_duration_display || mov.running_duration_text || formatLpgDuration(mov.running_duration_minutes);

                  return (
                    <div
                      key={mov.id}
                      className="p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xs space-y-2.5"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100">
                            {mov.cylinder?.cylinder_code || '—'}
                          </span>
                          <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
                            {formatDate(mov.movement_date)} {mov.movement_time || ''}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${cfg.colorClass}`}>
                          {cfg.labelHi}
                        </span>
                      </div>

                      <div className="text-xs text-stone-600 dark:text-stone-300 space-y-1 bg-stone-50 dark:bg-stone-800/40 p-2.5 rounded-xl">
                        {mov.bhatti_place && (
                          <div className="flex justify-between">
                            <span className="text-stone-400">Place / स्थान:</span>
                            <span className="font-semibold text-stone-800 dark:text-stone-200">{mov.bhatti_place}</span>
                          </div>
                        )}
                        {durFormatted && (
                          <div className="flex justify-between">
                            <span className="text-stone-400">Running Duration:</span>
                            <span className="font-bold text-amber-700 dark:text-amber-300">⏱️ {durFormatted}</span>
                          </div>
                        )}
                        {mov.supplier_name && (
                          <div className="flex justify-between">
                            <span className="text-stone-400">Supplier:</span>
                            <span>{mov.supplier_name}</span>
                          </div>
                        )}
                        {mov.bill_number && (
                          <div className="flex justify-between">
                            <span className="text-stone-400">Bill No:</span>
                            <span className="font-mono">{mov.bill_number}</span>
                          </div>
                        )}
                        {mov.notes && (
                          <div className="pt-1 text-[11px] text-stone-500 italic">
                            Remark: {mov.notes}
                          </div>
                        )}
                      </div>

                      {isOwner && (
                        <div className="pt-1 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenCorrectModal(mov)}
                            className="font-bold text-xs min-h-[38px] border-stone-300 text-purple-700 hover:bg-purple-50 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 mr-1" />
                            Correct Entry (प्रविष्टि सुधार)
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating Sticky Quick Action Button on Mobile */}
      <div className="sm:hidden fixed bottom-18 right-4 z-40">
        <button
          type="button"
          onClick={() => handleOpenMovementModal()}
          className="flex items-center gap-2 px-5 py-3.5 bg-orange-600 text-white rounded-full font-black text-sm shadow-xl hover:bg-orange-700 active:scale-95 transition-all min-h-[48px] cursor-pointer"
        >
          <Flame className="w-5 h-5" />
          <span>+ सिलेंडर एंट्री</span>
        </button>
      </div>

      {/* Modal 1: Quick Movement Entry */}
      <Modal
        isOpen={isMovementModalOpen}
        onClose={() => setIsMovementModalOpen(false)}
        title="+ Cylinder Movement Entry / सिलेंडर एंट्री"
        maxWidth="md"
      >
        <form onSubmit={handleMovementSubmit} className="space-y-4 py-1">
          {/* Step 1: Cylinder Selection */}
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              Select Cylinder / सिलेंडर चुनें *
            </label>
            <select
              value={selectedCylId}
              onChange={(e) => handleCylinderSelectChange(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-bold text-stone-900 dark:text-white focus:ring-2 focus:ring-orange-500 min-h-[44px]"
            >
              {cylinders
                .filter((c) => c.is_active !== false && c.status !== 'inactive')
                .map((c) => {
                  const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.full;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.cylinder_code} — [{cfg.labelHi} / {cfg.labelEn}]
                    </option>
                  );
                })}
            </select>
            {selectedCylinderObj && (
              <p className="text-[11px] text-stone-500 mt-1">
                Current Status: <span className="font-bold text-orange-600">{STATUS_CONFIG[selectedCylinderObj.status]?.labelHi}</span> | Location: {selectedCylinderObj.current_place || 'Storage'}
              </p>
            )}
          </div>

          {/* Step 2: Movement Action */}
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              Select Action / गतिविधि चुनें *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { type: 'connected', labelHi: 'भट्टी पर लगाएं', labelEn: 'Connect to Bhatti', allowed: selectedCylinderObj?.status === 'full' },
                { type: 'empty_removed', labelHi: 'खाली / हटाएं', labelEn: 'Mark Empty / Removed', allowed: selectedCylinderObj?.status === 'connected' || selectedCylinderObj?.status === 'in_use' },
                { type: 'refill_sent', labelHi: 'भरने भेजें', labelEn: 'Send for Refill', allowed: selectedCylinderObj?.status === 'empty' },
                { type: 'refill_received', labelHi: 'रिफिल मिला (Full)', labelEn: 'Refill Received', allowed: selectedCylinderObj?.status === 'sent_for_refill' || selectedCylinderObj?.status === 'empty' },
              ].map(({ type, labelHi, labelEn, allowed }) => {
                const isSelected = movAction === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setMovAction(type as SimpleLpgMovementType)}
                    className={`p-3 rounded-xl border text-left transition-all min-h-[44px] cursor-pointer ${
                      isSelected
                        ? 'border-orange-600 bg-orange-50 dark:bg-orange-950/40 text-orange-900 dark:text-orange-200 ring-2 ring-orange-500 font-bold'
                        : allowed
                        ? 'border-stone-200 dark:border-stone-700 hover:border-orange-300 bg-white dark:bg-stone-900'
                        : 'opacity-50 border-stone-200 bg-stone-50 dark:bg-stone-800 text-stone-400'
                    }`}
                  >
                    <div className="text-xs font-bold">{labelHi}</div>
                    <div className="text-[10px] text-stone-500">{labelEn}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Relevant Fields */}
          <div className="p-3.5 bg-stone-50 dark:bg-stone-850 rounded-xl border border-stone-200 dark:border-stone-700 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">
                  Date / दिनांक *
                </label>
                <input
                  type="date"
                  value={movDate}
                  onChange={(e) => setMovDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">
                  Time / समय
                </label>
                <input
                  type="time"
                  value={movTime}
                  onChange={(e) => setMovTime(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm min-h-[44px]"
                />
              </div>
            </div>

            {/* Connect Action Specific Fields */}
            {movAction === 'connected' && (
              <div>
                <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">
                  Bhatti / Place (भट्टी का स्थान) *
                </label>
                <div className="flex gap-2">
                  <select
                    value={movPlace}
                    onChange={(e) => setMovPlace(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm min-h-[44px]"
                  >
                    {BHATTI_PLACES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Empty/Removed Action Details */}
            {movAction === 'empty_removed' && (
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-semibold">⏱️ Running Duration (कार्यकाल):</p>
                <p className="text-[11px] opacity-80 mt-0.5">
                  The system will automatically calculate the running duration (Empty Time − Connected Time).
                </p>
              </div>
            )}

            {/* Refill Sent / Received Specific Fields */}
            {(movAction === 'refill_sent' || movAction === 'refill_received') && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">
                    Supplier (गैस एजेंसी / आपूर्तिकर्ता)
                  </label>
                  <input
                    type="text"
                    value={movSupplier}
                    onChange={(e) => setMovSupplier(e.target.value)}
                    placeholder="Bharat Gas Agency"
                    className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">
                    Bill / Challan No. (बिल नंबर - Optional)
                  </label>
                  <input
                    type="text"
                    value={movBill}
                    onChange={(e) => setMovBill(e.target.value)}
                    placeholder="e.g. BG-9482"
                    className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm min-h-[44px]"
                  />
                </div>
              </>
            )}

            {/* Remark / Notes */}
            <div>
              <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">
                Remark / टिप्पणी (Optional)
              </label>
              <input
                type="text"
                value={movNotes}
                onChange={(e) => setMovNotes(e.target.value)}
                placeholder="e.g. Changed after batch 2"
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm min-h-[44px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200 dark:border-stone-800">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsMovementModalOpen(false)}
              className="min-h-[44px] cursor-pointer"
            >
              Cancel / रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={recordMovementMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold min-h-[44px] cursor-pointer"
            >
              Save Entry / प्रविष्टि सहेजें
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Add Cylinder (Owner Only) */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="+ Add Cylinder / नया सिलेंडर जोड़ें"
        maxWidth="md"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4 py-1">
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              Cylinder ID / Code *
            </label>
            <input
              type="text"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value.toUpperCase())}
              placeholder="C-5"
              required
              className="w-full px-3 py-2.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl font-mono font-bold text-base min-h-[44px]"
            />
            <p className="text-[11px] text-stone-500 mt-1">
              Suggested next code: <span className="font-bold text-orange-600">{getNextSuggestedCode(cylinders)}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                Initial Status / प्रारंभिक स्थिति *
              </label>
              <select
                value={addStatus}
                onChange={(e) => setAddStatus(e.target.value as SimpleLpgCylinderStatus)}
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm min-h-[44px]"
              >
                <option value="full">Full / भरा हुआ</option>
                <option value="empty">Empty / खाली</option>
                <option value="connected">Connected / भट्टी पर लगा</option>
                <option value="sent_for_refill">Sent for Refill / भरने भेजा</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                Starting Date / तिथि
              </label>
              <input
                type="date"
                value={addStartDate}
                onChange={(e) => setAddStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm min-h-[44px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              Supplier / आपूर्तिकर्ता (Optional)
            </label>
            <input
              type="text"
              value={addSupplierName}
              onChange={(e) => setAddSupplierName(e.target.value)}
              placeholder="Bharat Gas Agency"
              className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              Remark / टिप्पणी (Optional)
            </label>
            <textarea
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              rows={2}
              placeholder="e.g. New commercial cylinder purchase"
              className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200 dark:border-stone-800">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsAddModalOpen(false)}
              className="min-h-[44px] cursor-pointer"
            >
              Cancel / रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={addCylinderMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold min-h-[44px] cursor-pointer"
            >
              + Add Cylinder / जोड़ें
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 3: Remove / Archive Cylinder (Owner Only) */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Remove / Archive Cylinder (सिलेंडर हटाएँ)"
        maxWidth="md"
      >
        <form onSubmit={handleDeleteSubmit} className="space-y-4 py-1">
          {targetCylinder && (
            <div className="p-3.5 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700">
              <div className="flex justify-between items-center">
                <span className="text-xs text-stone-500 font-medium">Cylinder Code:</span>
                <span className="font-black text-base text-stone-900 dark:text-white">
                  {targetCylinder.cylinder_code}
                </span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-stone-500 font-medium">Current Status:</span>
                <span className="text-xs font-bold text-orange-600">
                  {STATUS_CONFIG[targetCylinder.status]?.labelHi} ({STATUS_CONFIG[targetCylinder.status]?.labelEn})
                </span>
              </div>
            </div>
          )}

          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Deletion & Archival Rules:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90 pl-1">
              <li>यदि सिलेंडर का कोई पुराना मूवमेंट इतिहास नहीं है, तो यह डेटाबेस से स्थायी रूप से हटा दिया जाएगा।</li>
              <li>यदि इस सिलेंडर का इतिहास है, तो यह सुरक्षित रूप से निष्क्रिय (Archived) कर दिया जाएगा ताकि रिकॉर्ड सुरक्षित रहे।</li>
              <li>भट्टी पर लगे (Connected) सिलेंडर को हटाया नहीं जा सकता।</li>
            </ul>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              Reason for Removal / हटाने का कारण * (अनिवार्य)
            </label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              required
              rows={3}
              placeholder="e.g. Cylinder returned to agency / Cylinder replaced"
              className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200 dark:border-stone-800">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsDeleteModalOpen(false)}
              className="min-h-[44px] cursor-pointer"
            >
              Cancel / रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={deleteArchiveMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold min-h-[44px] cursor-pointer"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Confirm Removal / हटाएं
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 4: Correct Movement Entry */}
      <Modal
        isOpen={isCorrectModalOpen}
        onClose={() => setIsCorrectModalOpen(false)}
        title="Correct Entry / प्रविष्टि सुधार"
        maxWidth="md"
      >
        <form onSubmit={handleCorrectSubmit} className="space-y-4 py-1">
          {targetMovement && (
            <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700 text-xs">
              <span className="text-stone-500">Original Movement: </span>
              <span className="font-bold text-stone-900 dark:text-white">
                {targetMovement.cylinder?.cylinder_code} — {MOVEMENT_TYPE_CONFIG[targetMovement.movement_type]?.labelHi} ({formatDate(targetMovement.movement_date)})
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              Reason for Correction / सुधार का कारण * (अनिवार्य)
            </label>
            <textarea
              value={corrReason}
              onChange={(e) => setCorrReason(e.target.value)}
              required
              rows={2}
              placeholder="e.g. Wrong bhatti entered by mistake"
              className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                Corrected Action / सही गतिविधि *
              </label>
              <select
                value={corrType}
                onChange={(e) => setCorrType(e.target.value as SimpleLpgMovementType)}
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm min-h-[44px]"
              >
                <option value="connected">Connected / भट्टी पर लगाया</option>
                <option value="empty_removed">Empty / Removed (खाली किया)</option>
                <option value="refill_sent">Sent for Refill / भरने भेजा</option>
                <option value="refill_received">Refill Received / रिफिल मिला</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                Date / दिनांक
              </label>
              <input
                type="date"
                value={corrDate}
                onChange={(e) => setCorrDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm min-h-[44px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              Place / भट्टी का स्थान
            </label>
            <input
              type="text"
              value={corrPlace}
              onChange={(e) => setCorrPlace(e.target.value)}
              placeholder="Kulfi Bhatti 1"
              className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm min-h-[44px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                Supplier
              </label>
              <input
                type="text"
                value={corrSupplier}
                onChange={(e) => setCorrSupplier(e.target.value)}
                placeholder="Bharat Gas Agency"
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                Bill Number
              </label>
              <input
                type="text"
                value={corrBill}
                onChange={(e) => setCorrBill(e.target.value)}
                placeholder="BG-1234"
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm min-h-[44px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200 dark:border-stone-800">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsCorrectModalOpen(false)}
              className="min-h-[44px] cursor-pointer"
            >
              Cancel / रद्द करें
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={correctMovementMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold min-h-[44px] cursor-pointer"
            >
              Submit Correction / सुधार दर्ज करें
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
