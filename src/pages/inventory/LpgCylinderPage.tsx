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

interface StatusConfigItem {
  labelEn: string;
  labelHi: string;
  color: string;
  bg: string;
  badge: string;
  avatar: string;
  cardBorder: string;
  dot: string;
}

const STATUS_CONFIG: Record<string, StatusConfigItem> = {
  full: {
    labelEn: 'Full',
    labelHi: 'भरा हुआ',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700',
    avatar: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700',
    cardBorder: 'border-l-4 border-l-emerald-500 border-stone-200 dark:border-stone-800 hover:border-emerald-300 dark:hover:border-emerald-700',
    dot: 'bg-emerald-500',
  },
  connected: {
    labelEn: 'Connected (In Use)',
    labelHi: 'भट्टी पर लगा',
    color: 'text-amber-800 dark:text-amber-300',
    bg: 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
    badge: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700',
    avatar: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700',
    cardBorder: 'border-l-4 border-l-amber-500 border-stone-200 dark:border-stone-800 hover:border-amber-300 dark:hover:border-amber-700',
    dot: 'bg-amber-500',
  },
  in_use: {
    labelEn: 'Connected (In Use)',
    labelHi: 'भट्टी पर लगा',
    color: 'text-amber-800 dark:text-amber-300',
    bg: 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
    badge: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700',
    avatar: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700',
    cardBorder: 'border-l-4 border-l-amber-500 border-stone-200 dark:border-stone-800 hover:border-amber-300 dark:hover:border-amber-700',
    dot: 'bg-amber-500',
  },
  empty: {
    labelEn: 'Empty',
    labelHi: 'खाली',
    color: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
    badge: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/60 dark:text-rose-200 dark:border-rose-700',
    avatar: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800',
    cardBorder: 'border-l-4 border-l-rose-500 border-stone-200 dark:border-stone-800 hover:border-rose-300 dark:hover:border-rose-700',
    dot: 'bg-rose-500',
  },
  sent_for_refill: {
    labelEn: 'Sent for Refill',
    labelHi: 'भरने भेजा',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-200 dark:border-blue-700',
    avatar: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800',
    cardBorder: 'border-l-4 border-l-blue-500 border-stone-200 dark:border-stone-800 hover:border-blue-300 dark:hover:border-blue-700',
    dot: 'bg-blue-500',
  },
  inactive: {
    labelEn: 'Inactive',
    labelHi: 'निष्क्रिय / बंद',
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    badge: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
    avatar: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    cardBorder: 'border-l-4 border-l-slate-400 border-slate-200 dark:border-slate-800',
    dot: 'bg-slate-400',
  },
  damaged_inactive: {
    labelEn: 'Inactive',
    labelHi: 'निष्क्रिय / बंद',
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    badge: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
    avatar: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    cardBorder: 'border-l-4 border-l-slate-400 border-slate-200 dark:border-slate-800',
    dot: 'bg-slate-400',
  },
};

const MOVEMENT_TYPE_CONFIG: Record<
  string,
  { labelHi: string; labelEn: string; colorClass: string; actionColor?: string }
> = {
  cylinder_added: {
    labelHi: 'नया सिलेंडर जोड़ा गया',
    labelEn: 'Cylinder Added',
    colorClass: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
  connected: {
    labelHi: 'भट्टी पर लगाया',
    labelEn: 'Connected to Bhatti',
    colorClass: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700',
    actionColor: 'amber',
  },
  empty_removed: {
    labelHi: 'खाली / भट्टी से हटाया',
    labelEn: 'Empty / Removed',
    colorClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700',
    actionColor: 'rose',
  },
  refill_sent: {
    labelHi: 'रिफिल के लिए भेजा',
    labelEn: 'Sent for Refill',
    colorClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-200 dark:border-blue-700',
    actionColor: 'blue',
  },
  refill_received: {
    labelHi: 'रिफिल मिला (Full)',
    labelEn: 'Refill Received (Full)',
    colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700',
    actionColor: 'emerald',
  },
  correction: {
    labelHi: 'प्रविष्टि सुधार',
    labelEn: 'Correction / Reversal',
    colorClass: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/70 dark:text-purple-200 dark:border-purple-700',
  },
  reactivated: {
    labelHi: 'पुनः चालू किया गया',
    labelEn: 'Reactivated',
    colorClass: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/70 dark:text-teal-200 dark:border-teal-700',
  },
  archived: {
    labelHi: 'निष्क्रिय किया गया',
    labelEn: 'Archived',
    colorClass: 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
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
              className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer text-stone-700 dark:text-stone-300 shadow-2xs"
              title="Back to Inventory"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
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
            className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-black min-h-[44px] shadow-sm shadow-orange-600/20 cursor-pointer"
          >
            + Cylinder Entry / सिलेंडर एंट्री
          </Button>

          {isOwner && (
            <Button
              variant="outline"
              size="md"
              leftIcon={<Plus className="w-4 h-4 text-amber-600" />}
              onClick={handleOpenAddModal}
              className="font-bold bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px] cursor-pointer shadow-2xs"
            >
              + Add Cylinder
            </Button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-start justify-between gap-3 text-rose-900 dark:text-rose-200 text-sm shadow-xs animate-in fade-in">
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
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-start justify-between gap-3 text-emerald-900 dark:text-emerald-200 text-sm shadow-xs animate-in fade-in">
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

      {/* Summary KPI Cards with Vibrant Status Highlighting */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            key: 'all_active',
            labelHi: 'कुल सक्रिय',
            labelEn: 'Active Total',
            val: summary.totalActive,
            icon: Layers,
            iconColor: 'text-stone-700 dark:text-stone-200',
            iconBg: 'bg-stone-100 dark:bg-stone-800',
            activeStyle: 'bg-stone-900 text-white dark:bg-stone-800 ring-2 ring-stone-900 dark:ring-stone-400 shadow-md',
          },
          {
            key: 'full',
            labelHi: 'भरा हुआ',
            labelEn: 'Full',
            val: summary.full,
            icon: CheckCircle2,
            iconColor: 'text-emerald-600 dark:text-emerald-400',
            iconBg: 'bg-emerald-50 dark:bg-emerald-950/70',
            activeStyle: 'bg-emerald-900 text-white ring-2 ring-emerald-500 shadow-md border-emerald-800',
          },
          {
            key: 'connected',
            labelHi: 'भट्टी पर लगा',
            labelEn: 'Connected',
            val: summary.connected,
            icon: Flame,
            iconColor: 'text-amber-600 dark:text-amber-400',
            iconBg: 'bg-amber-50 dark:bg-amber-950/70',
            activeStyle: 'bg-amber-900 text-white ring-2 ring-amber-500 shadow-md border-amber-800',
          },
          {
            key: 'empty',
            labelHi: 'खाली',
            labelEn: 'Empty',
            val: summary.empty,
            icon: AlertCircle,
            iconColor: 'text-rose-600 dark:text-rose-400',
            iconBg: 'bg-rose-50 dark:bg-rose-950/70',
            activeStyle: 'bg-rose-900 text-white ring-2 ring-rose-500 shadow-md border-rose-800',
          },
          {
            key: 'sent_for_refill',
            labelHi: 'भरने भेजा',
            labelEn: 'Sent Refill',
            val: summary.sentForRefill,
            icon: Truck,
            iconColor: 'text-blue-600 dark:text-blue-400',
            iconBg: 'bg-blue-50 dark:bg-blue-950/70',
            activeStyle: 'bg-blue-900 text-white ring-2 ring-blue-500 shadow-md border-blue-800',
          },
          {
            key: 'inactive',
            labelHi: 'निष्क्रिय/बंद',
            labelEn: 'Inactive',
            val: summary.inactive,
            icon: Archive,
            iconColor: 'text-slate-500 dark:text-slate-400',
            iconBg: 'bg-slate-100 dark:bg-slate-800',
            activeStyle: 'bg-slate-800 text-white ring-2 ring-slate-400 shadow-md border-slate-700',
          },
        ].map(({ key, labelHi, labelEn, val, icon: Icon, iconColor, iconBg, activeStyle }) => {
          const isSelected = statusFilter === key;
          return (
            <div
              key={key}
              onClick={() => setStatusFilter(key as any)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                isSelected
                  ? activeStyle
                  : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:border-amber-300 dark:hover:border-amber-700 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                <span className={isSelected ? 'text-white/90' : 'text-stone-700 dark:text-stone-300'}>
                  {labelHi}
                </span>
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isSelected ? 'bg-white/20 text-white' : `${iconBg} ${iconColor}`}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-black tracking-tight">{val}</div>
              <div className={`text-[10px] font-semibold mt-0.5 ${isSelected ? 'text-white/75' : 'text-stone-500 dark:text-stone-400'}`}>
                {labelEn}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 dark:border-stone-800 pb-3">
        <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800/80 p-1.5 rounded-2xl border border-stone-200/60 dark:border-stone-700/60">
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              activeTab === 'status'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
            }`}
          >
            Current Status (वर्तमान स्थिति)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              activeTab === 'register'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
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
              className="px-3 py-2 text-xs font-bold bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
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
              className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-900 dark:text-white placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
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
              <p className="text-stone-700 dark:text-stone-300 font-bold">No cylinders found matching this filter.</p>
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
                    className={`p-5 rounded-2xl border transition-all flex flex-col justify-between shadow-2xs bg-white dark:bg-stone-900 ${cfg.cardBorder} ${
                      isInactive ? 'opacity-85' : ''
                    }`}
                  >
                    <div>
                      {/* Top Code & Status */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-11 h-11 rounded-xl border flex items-center justify-center font-black text-base shadow-2xs ${cfg.avatar}`}
                          >
                            {cyl.cylinder_code}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-black text-lg text-stone-900 dark:text-white leading-tight">
                                {cyl.cylinder_code}
                              </h3>
                              {isConnected && (
                                <span className="flex h-2.5 w-2.5 relative">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-stone-500 dark:text-stone-400 font-medium">
                              {cyl.supplier_name || 'Bharat Gas Agency'}
                            </span>
                          </div>
                        </div>

                        <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border shadow-2xs ${cfg.badge}`}>
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
                          <span className="font-bold text-stone-900 dark:text-stone-100">
                            {cyl.current_place || 'Storage / स्टोर'}
                          </span>
                        </div>

                        {isConnected && cyl.connected_at && (
                          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 flex justify-between items-center text-amber-900 dark:text-amber-200">
                            <span className="font-semibold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                              <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                              Connected Time:
                            </span>
                            <span className="font-black">
                              {formatDateTime(cyl.connected_at)}
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between items-center">
                          <span className="text-stone-500 font-medium flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-stone-400" />
                            Last Movement:
                          </span>
                          <span className="font-semibold text-stone-700 dark:text-stone-300">
                            {cyl.last_movement_at ? formatDateTime(cyl.last_movement_at) : 'N/A'}
                          </span>
                        </div>

                        {cyl.notes && (
                          <div className="pt-1 text-[11px] text-stone-600 dark:text-stone-400 italic bg-stone-50 dark:bg-stone-800/60 p-2 rounded-lg border border-stone-100 dark:border-stone-800">
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
                            className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-black min-h-[40px] text-xs shadow-2xs cursor-pointer"
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
                            className="border-rose-300 text-rose-800 dark:text-rose-200 bg-rose-50/60 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 font-bold min-h-[40px] text-xs cursor-pointer"
                          >
                            <AlertCircle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                            Mark Empty (खाली चिन्हित करें)
                          </Button>
                        )}

                        {cyl.status === 'empty' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenMovementModal(cyl, 'refill_sent')}
                              className="border-blue-300 text-blue-800 dark:text-blue-200 bg-blue-50/60 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-bold min-h-[40px] text-xs cursor-pointer"
                            >
                              <Truck className="w-3.5 h-3.5 mr-1 text-blue-600" />
                              Send Refill (भरने भेजें)
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleOpenMovementModal(cyl, 'refill_received')}
                              className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black min-h-[40px] text-xs shadow-2xs cursor-pointer"
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
                            className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black min-h-[40px] text-xs shadow-2xs cursor-pointer"
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
                            className="border-teal-300 text-teal-800 dark:text-teal-200 bg-teal-50/60 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 font-bold min-h-[40px] text-xs cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1 text-teal-600" />
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
                          className="p-2.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center border border-transparent hover:border-rose-200"
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
              <p className="text-stone-700 dark:text-stone-300 font-bold">No movements recorded yet.</p>
              <p className="text-xs text-stone-400 mt-1">कोई मूवमेंट रिकॉर्ड उपलब्ध नहीं है।</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 dark:bg-stone-800/80 border-b border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 font-bold">
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
                        <tr key={mov.id} className="hover:bg-stone-50/70 dark:hover:bg-stone-800/40 transition-colors">
                          <td className="p-3.5 font-medium whitespace-nowrap">
                            <div className="font-bold text-stone-900 dark:text-white">{formatDate(mov.movement_date)}</div>
                            {mov.movement_time && (
                              <div className="text-[10px] text-stone-400 font-mono mt-0.5">{mov.movement_time}</div>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className="font-black px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-700">
                              {mov.cylinder?.cylinder_code || '—'}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold border shadow-2xs ${cfg.colorClass}`}>
                              {cfg.labelHi}
                            </span>
                          </td>
                          <td className="p-3.5 font-semibold text-stone-800 dark:text-stone-200">
                            {mov.bhatti_place || '—'}
                          </td>
                          <td className="p-3.5">
                            {durFormatted ? (
                              <span className="font-black text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 shadow-2xs inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-600" />
                                {durFormatted}
                              </span>
                            ) : (
                              <span className="text-stone-400">—</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <div className="font-medium text-stone-900 dark:text-white">{mov.supplier_name || '—'}</div>
                            {mov.bill_number && (
                              <div className="text-[10px] text-stone-500 font-mono mt-0.5 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded inline-block border border-stone-200 dark:border-stone-700">
                                Bill: {mov.bill_number}
                              </div>
                            )}
                          </td>
                          <td className="p-3.5 max-w-xs truncate text-stone-600 dark:text-stone-400" title={mov.notes || ''}>
                            {mov.notes || '—'}
                          </td>
                          <td className="p-3.5 text-right whitespace-nowrap">
                            {isOwner && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenCorrectModal(mov)}
                                className="font-bold text-xs min-h-[36px] border-purple-200 text-purple-800 dark:text-purple-200 dark:border-purple-800/80 hover:bg-purple-50 dark:hover:bg-purple-950/60 cursor-pointer shadow-2xs"
                              >
                                <Edit3 className="w-3 h-3 mr-1 text-purple-600" />
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
                          <span className="font-black text-sm px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-700">
                            {mov.cylinder?.cylinder_code || '—'}
                          </span>
                          <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                            {formatDate(mov.movement_date)} {mov.movement_time || ''}
                          </span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${cfg.colorClass}`}>
                          {cfg.labelHi}
                        </span>
                      </div>

                      <div className="text-xs text-stone-600 dark:text-stone-300 space-y-1.5 bg-stone-50 dark:bg-stone-800/50 p-3 rounded-xl border border-stone-100 dark:border-stone-800">
                        {mov.bhatti_place && (
                          <div className="flex justify-between">
                            <span className="text-stone-500 font-medium">Place / स्थान:</span>
                            <span className="font-bold text-stone-900 dark:text-stone-100">{mov.bhatti_place}</span>
                          </div>
                        )}
                        {durFormatted && (
                          <div className="flex justify-between items-center">
                            <span className="text-stone-500 font-medium">Running Duration:</span>
                            <span className="font-black text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700">
                              ⏱️ {durFormatted}
                            </span>
                          </div>
                        )}
                        {mov.supplier_name && (
                          <div className="flex justify-between">
                            <span className="text-stone-500 font-medium">Supplier:</span>
                            <span className="font-semibold text-stone-800 dark:text-stone-200">{mov.supplier_name}</span>
                          </div>
                        )}
                        {mov.bill_number && (
                          <div className="flex justify-between">
                            <span className="text-stone-500 font-medium">Bill No:</span>
                            <span className="font-mono text-stone-700 dark:text-stone-300 font-semibold">{mov.bill_number}</span>
                          </div>
                        )}
                        {mov.notes && (
                          <div className="pt-1 text-[11px] text-stone-500 dark:text-stone-400 italic">
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
                            className="font-bold text-xs min-h-[38px] border-purple-200 text-purple-800 dark:text-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/50 cursor-pointer shadow-2xs"
                          >
                            <Edit3 className="w-3.5 h-3.5 mr-1 text-purple-600" />
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
      <div className="sm:hidden fixed bottom-20 right-4 z-40">
        <button
          type="button"
          onClick={() => handleOpenMovementModal()}
          className="flex items-center gap-2 px-5 py-3.5 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-full font-black text-sm shadow-xl shadow-orange-600/30 hover:from-orange-700 hover:to-amber-700 active:scale-95 transition-all min-h-[48px] cursor-pointer"
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
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
              Select Cylinder / सिलेंडर चुनें *
            </label>
            <select
              value={selectedCylId}
              onChange={(e) => handleCylinderSelectChange(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-bold text-stone-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 min-h-[44px] shadow-2xs"
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
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 font-medium">
                Current Status: <span className="font-bold text-amber-700 dark:text-amber-400">{STATUS_CONFIG[selectedCylinderObj.status]?.labelHi}</span> | Location: {selectedCylinderObj.current_place || 'Storage'}
              </p>
            )}
          </div>

          {/* Step 2: Movement Action */}
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
              Select Action / गतिविधि चुनें *
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                {
                  type: 'connected',
                  labelHi: 'भट्टी पर लगाएं',
                  labelEn: 'Connect to Bhatti',
                  allowed: selectedCylinderObj?.status === 'full',
                  activeBorder: 'border-amber-500 bg-amber-50/90 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500',
                  icon: Flame,
                  iconClass: 'text-amber-600',
                },
                {
                  type: 'empty_removed',
                  labelHi: 'खाली / हटाएं',
                  labelEn: 'Mark Empty / Removed',
                  allowed: selectedCylinderObj?.status === 'connected' || selectedCylinderObj?.status === 'in_use',
                  activeBorder: 'border-rose-500 bg-rose-50/90 dark:bg-rose-950/70 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500',
                  icon: AlertCircle,
                  iconClass: 'text-rose-600',
                },
                {
                  type: 'refill_sent',
                  labelHi: 'भरने भेजें',
                  labelEn: 'Send for Refill',
                  allowed: selectedCylinderObj?.status === 'empty',
                  activeBorder: 'border-blue-500 bg-blue-50/90 dark:bg-blue-950/70 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500',
                  icon: Truck,
                  iconClass: 'text-blue-600',
                },
                {
                  type: 'refill_received',
                  labelHi: 'रिफिल मिला (Full)',
                  labelEn: 'Refill Received',
                  allowed: selectedCylinderObj?.status === 'sent_for_refill' || selectedCylinderObj?.status === 'empty',
                  activeBorder: 'border-emerald-500 bg-emerald-50/90 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500',
                  icon: CheckCircle2,
                  iconClass: 'text-emerald-600',
                },
              ].map(({ type, labelHi, labelEn, allowed, activeBorder, icon: ActionIcon, iconClass }) => {
                const isSelected = movAction === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setMovAction(type as SimpleLpgMovementType)}
                    className={`p-3 rounded-xl border text-left transition-all min-h-[52px] cursor-pointer ${
                      isSelected
                        ? `${activeBorder} font-bold shadow-xs`
                        : allowed
                        ? 'border-stone-200 dark:border-stone-700 hover:border-amber-300 dark:hover:border-amber-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-white'
                        : 'opacity-40 border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/40 text-stone-400 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-black">{labelHi}</span>
                      <ActionIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-current' : iconClass}`} />
                    </div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400 font-medium">{labelEn}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Relevant Fields */}
          <div className="p-3.5 bg-stone-50 dark:bg-stone-850 rounded-xl border border-stone-200 dark:border-stone-700 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Date / दिनांक *
                </label>
                <input
                  type="date"
                  value={movDate}
                  onChange={(e) => setMovDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Time / समय
                </label>
                <input
                  type="time"
                  value={movTime}
                  onChange={(e) => setMovTime(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Connect Action Specific Fields */}
            {movAction === 'connected' && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Bhatti / Place (भट्टी का स्थान) *
                </label>
                <div className="flex gap-2">
                  <select
                    value={movPlace}
                    onChange={(e) => setMovPlace(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm font-bold text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-amber-500"
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
              <div className="p-3 bg-amber-50/90 dark:bg-amber-950/50 rounded-xl border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-bold flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Running Duration (कार्यकाल):
                </p>
                <p className="text-[11px] opacity-90 mt-1">
                  The system will automatically calculate the running duration (Empty Time − Connected Time).
                </p>
              </div>
            )}

            {/* Refill Sent / Received Specific Fields */}
            {(movAction === 'refill_sent' || movAction === 'refill_received') && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Supplier (गैस एजेंसी / आपूर्तिकर्ता)
                  </label>
                  <input
                    type="text"
                    value={movSupplier}
                    onChange={(e) => setMovSupplier(e.target.value)}
                    placeholder="Bharat Gas Agency"
                    className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Bill / Challan No. (बिल नंबर - Optional)
                  </label>
                  <input
                    type="text"
                    value={movBill}
                    onChange={(e) => setMovBill(e.target.value)}
                    placeholder="e.g. BG-9482"
                    className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
              </>
            )}

            {/* Remark / Notes */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                Remark / टिप्पणी (Optional)
              </label>
              <input
                type="text"
                value={movNotes}
                onChange={(e) => setMovNotes(e.target.value)}
                placeholder="e.g. Changed after batch 2"
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-amber-500"
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
              className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-black min-h-[44px] shadow-sm cursor-pointer"
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
              className="w-full px-3 py-2.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl font-mono font-bold text-base text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
              Suggested next code: <span className="font-bold text-amber-600">{getNextSuggestedCode(cylinders)}</span>
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
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-bold text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-amber-500"
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
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-amber-500"
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
              className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-amber-500"
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
              className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-white focus:ring-2 focus:ring-amber-500"
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
              className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-black min-h-[44px] shadow-sm cursor-pointer"
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
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                  {STATUS_CONFIG[targetCylinder.status]?.labelHi} ({STATUS_CONFIG[targetCylinder.status]?.labelEn})
                </span>
              </div>
            </div>
          )}

          <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
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
              className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-white focus:ring-2 focus:ring-rose-500"
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
              className="bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black min-h-[44px] shadow-sm cursor-pointer"
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
            <div className="p-3 bg-purple-50 dark:bg-purple-950/50 rounded-xl border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200">
              <span className="text-purple-700 dark:text-purple-300 font-medium">Original Movement: </span>
              <span className="font-black text-purple-950 dark:text-white">
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
              className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-white focus:ring-2 focus:ring-purple-500"
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
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm font-bold text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-purple-500"
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
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-purple-500"
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
              className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-purple-500"
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
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-purple-500"
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
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-white min-h-[44px] focus:ring-2 focus:ring-purple-500 font-mono"
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
              className="bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-black min-h-[44px] shadow-sm cursor-pointer"
            >
              Submit Correction / सुधार दर्ज करें
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
