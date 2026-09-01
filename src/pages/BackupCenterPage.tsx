import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import {
  useBackupHistory,
  useCreateCompleteBackup,
  useCreateDateRangeBackup,
  useCreateExpenseBillsBackup,
  useValidateBackup,
  useExecuteRestore,
} from '@/hooks/useBackup';
import { Card, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { formatDateTime, formatDate, getTodayDateString } from '@/lib/formatters';
import { triggerDownload } from '@/lib/backupService';
import { BackupValidationResult } from '@/types';
import {
  ShieldCheck,
  Download,
  Calendar,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  RotateCcw,
  HardDrive,
  FileText,
  AlertCircle,
  Database,
  Lock,
  RefreshCw,
  Trash2,
} from 'lucide-react';

export const BackupCenterPage: React.FC = () => {
  const { t } = useLanguage();
  const { isOwner } = useAuth();
  const { pendingCount, syncNow, isSyncing, exportEmergencyDraftsJson, clearAllDraftsWithWarning } = useSync();

  const { data: history = [], isLoading: isHistoryLoading } = useBackupHistory();

  // Mutations
  const completeBackupMutation = useCreateCompleteBackup();
  const dateRangeBackupMutation = useCreateDateRangeBackup();
  const expenseBillsMutation = useCreateExpenseBillsBackup();
  const validateBackupMutation = useValidateBackup();
  const restoreMutation = useExecuteRestore();

  // Date Range state
  const [startDate, setStartDate] = useState<string>(getTodayDateString());
  const [endDate, setEndDate] = useState<string>(getTodayDateString());

  // Progress state
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Validation State
  const [selectedFileForValidation, setSelectedFileForValidation] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<BackupValidationResult | null>(null);

  // Restore State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassphrase, setRestorePassphrase] = useState<string>('');
  const [restoreReason, setRestoreReason] = useState<string>('');
  const [isDryRun, setIsDryRun] = useState<boolean>(true);
  const [restoreResultMsg, setRestoreResultMsg] = useState<string | null>(null);
  const [restoreErrorMsg, setRestoreErrorMsg] = useState<string | null>(null);

  // Success notifications
  const [bannerSuccessMsg, setBannerSuccessMsg] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setBannerSuccessMsg(msg);
    setTimeout(() => setBannerSuccessMsg(null), 6000);
  };

  // --- Compute Backup Reminders ---
  const lastCompleteBackup = useMemo(() => {
    return history.find((h) => h.backup_type === 'complete' && h.status === 'success');
  }, [history]);

  const lastBillsBackup = useMemo(() => {
    return history.find((h) => h.backup_type === 'expense_bills' && h.status === 'success');
  }, [history]);

  const completeBackupAgeDays = useMemo(() => {
    if (!lastCompleteBackup) return null;
    const diffMs = Date.now() - new Date(lastCompleteBackup.created_at).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [lastCompleteBackup]);

  const billsBackupAgeDays = useMemo(() => {
    if (!lastBillsBackup) return null;
    const diffMs = Date.now() - new Date(lastBillsBackup.created_at).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [lastBillsBackup]);

  const isCompleteBackupOverdue = completeBackupAgeDays === null || completeBackupAgeDays >= 7;
  const isBillsBackupOverdue = billsBackupAgeDays === null || billsBackupAgeDays >= 30;

  // --- Handlers ---
  const handleDownloadCompleteBackup = async () => {
    setIsProcessing(true);
    setProgressPercent(5);
    setProgressMsg('बैकअप प्रारंभ हो रहा है...');

    try {
      const result = await completeBackupMutation.mutateAsync({
        onProgress: ({ step, percent }) => {
          setProgressMsg(step);
          setProgressPercent(percent);
        },
      });

      triggerDownload(result.blob, result.fileName);
      showSuccess(`सम्पूर्ण बैकअप (${result.fileName}) सफलतापूर्वक तैयार होकर डाउनलोड हो गया!`);
    } catch (err: any) {
      alert(`बैकअप त्रुटि: ${err.message || 'सम्पूर्ण बैकअप तैयार नहीं हो सका।'}`);
    } finally {
      setIsProcessing(false);
      setProgressPercent(0);
      setProgressMsg('');
    }
  };

  const handleDownloadDateRangeBackup = async () => {
    if (!startDate || !endDate) {
      alert('कृपया प्रारंभिक और अंतिम दिनांक चुनें');
      return;
    }
    if (startDate > endDate) {
      alert('प्रारंभिक दिनांक, अंतिम दिनांक से बाद की नहीं हो सकती');
      return;
    }

    setIsProcessing(true);
    setProgressPercent(5);
    setProgressMsg('दिनांक सीमा डेटा लोड हो रहा है...');

    try {
      const result = await dateRangeBackupMutation.mutateAsync({
        startDate,
        endDate,
        onProgress: ({ step, percent }) => {
          setProgressMsg(step);
          setProgressPercent(percent);
        },
      });

      triggerDownload(result.blob, result.fileName);
      showSuccess(`दिनांक सीमा बैकअप (${result.fileName}) डाउनलोड हो गया!`);
    } catch (err: any) {
      alert(`निर्यात त्रुटि: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setProgressPercent(0);
      setProgressMsg('');
    }
  };

  const handleDownloadExpenseBillsBackup = async () => {
    setIsProcessing(true);
    setProgressPercent(5);
    setProgressMsg('खर्च बिल संकलित हो रहे हैं...');

    try {
      const result = await expenseBillsMutation.mutateAsync({
        onProgress: ({ step, percent }) => {
          setProgressMsg(step);
          setProgressPercent(percent);
        },
      });

      triggerDownload(result.blob, result.fileName);
      showSuccess(`खर्च बिल बैकअप (${result.fileName}) डाउनलोड हो गया!`);
    } catch (err: any) {
      alert(`बिल बैकअप त्रुटि: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setProgressPercent(0);
      setProgressMsg('');
    }
  };

  const handleValidateFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileForValidation(file);
    try {
      const res = await validateBackupMutation.mutateAsync(file);
      setValidationResult(res);
    } catch (err: any) {
      alert(`सत्यापन त्रुटि: ${err.message}`);
    }
  };

  const handleOpenRestoreModal = () => {
    setRestoreFile(null);
    setRestorePassphrase('');
    setRestoreReason('');
    setIsDryRun(true);
    setRestoreResultMsg(null);
    setRestoreErrorMsg(null);
    setIsRestoreModalOpen(true);
  };

  const handleExecuteRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreFile) {
      setRestoreErrorMsg('कृपया पुनर्स्थापना के लिए बैकअप ZIP फाइल चुनें।');
      return;
    }
    setRestoreErrorMsg(null);
    setRestoreResultMsg(null);

    try {
      const res = await restoreMutation.mutateAsync({
        file: restoreFile,
        passphrase: restorePassphrase,
        reason: restoreReason,
        isDryRun,
      });

      setRestoreResultMsg(res.message);
      if (!isDryRun) {
        showSuccess('डेटाबेस पुनर्स्थापना पूर्ण हो गई!');
      }
    } catch (err: any) {
      setRestoreErrorMsg(err.message || 'पुनर्स्थापना प्रक्रिया विफल रही।');
    }
  };

  if (!isOwner) {
    return (
      <Card className="text-center py-12 border-rose-200 bg-rose-50/20">
        <div className="w-14 h-14 bg-rose-100 text-rose-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Lock className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-gray-900">अनधिकृत पहुंच (Unauthorized Access)</h3>
        <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">
          बैकअप केंद्र एवं डेटा डाउनलोड केवल व्यवसाय के <strong>मालिक (Owner)</strong> के लिए सुरक्षित है।
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-maroon-800" />
            बैकअप केंद्र (Backup & Disaster Recovery Center)
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            ऑफ़लाइन आपदा बैकअप, दिनांक सीमा डेटा निर्यात, खर्च बिल एवं सत्यापन केंद्र
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="active">मालिक अधिकार सुरक्षित (Owner Authorized)</Badge>
        </div>
      </div>

      {/* Success Notification Alert */}
      {bannerSuccessMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{bannerSuccessMsg}</span>
          </div>
          <button onClick={() => setBannerSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-900 ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Progress Bar (When processing backups) */}
      {isProcessing && (
        <Card className="border-maroon-300 bg-cream-50 animate-pulse">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-maroon-950">
              <span>{progressMsg}</span>
              <span className="font-mono">{progressPercent}%</span>
            </div>
            <div className="w-full bg-cream-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-maroon-800 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Backup Status & Reminders Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Complete Backup Status */}
        <Card className={`border ${isCompleteBackupOverdue ? 'border-amber-300 bg-amber-50/40' : 'border-emerald-200 bg-emerald-50/30'}`}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-maroon-700" />
                अंतिम सम्पूर्ण बैकअप
              </span>
              <h4 className="text-sm font-black text-gray-900">
                {lastCompleteBackup ? formatDate(lastCompleteBackup.created_at) : 'कभी नहीं लिया गया'}
              </h4>
              <p className="text-[11px] text-gray-500">
                {completeBackupAgeDays !== null ? `${completeBackupAgeDays} दिन पहले` : 'नया बैकअप डाउनलोड करें'}
              </p>
            </div>
            <span
              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                isCompleteBackupOverdue ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
              }`}
            >
              {isCompleteBackupOverdue ? '7 दिन से पुराना ⚠️' : 'सुरक्षित ✅'}
            </span>
          </div>
        </Card>

        {/* Expense Bills Status */}
        <Card className={`border ${isBillsBackupOverdue ? 'border-amber-300 bg-amber-50/40' : 'border-emerald-200 bg-emerald-50/30'}`}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-maroon-700" />
                अंतिम खर्च बिल बैकअप
              </span>
              <h4 className="text-sm font-black text-gray-900">
                {lastBillsBackup ? formatDate(lastBillsBackup.created_at) : 'कभी नहीं लिया गया'}
              </h4>
              <p className="text-[11px] text-gray-500">
                {billsBackupAgeDays !== null ? `${billsBackupAgeDays} दिन पहले` : 'बिल बैकअप डाउनलोड करें'}
              </p>
            </div>
            <span
              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                isBillsBackupOverdue ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
              }`}
            >
              {isBillsBackupOverdue ? '30 दिन से पुराना ⚠️' : 'सुरक्षित ✅'}
            </span>
          </div>
        </Card>

        {/* Local IndexedDB Status */}
        <Card className="border-cream-300 bg-cream-50/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-maroon-700" />
                ऑफ़लाइन ड्राफ्ट (IndexedDB)
              </span>
              <h4 className="text-sm font-black text-gray-900 font-mono">
                {pendingCount} ड्राफ्ट असिंकित
              </h4>
              <p className="text-[10px] text-amber-800 font-medium">
                *IndexedDB स्थायी बैकअप नहीं है
              </p>
            </div>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-cream-200 text-maroon-900">
              लोकल कैश
            </span>
          </div>
        </Card>
      </div>

      {/* Main 3 Backup Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Action 1: Complete Offline Backup */}
        <Card className="border-cream-300 flex flex-col justify-between hover:border-maroon-600 transition-all shadow-sm">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-maroon-800 text-white flex items-center justify-center shadow-md">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">सम्पूर्ण डेटा बैकअप</h3>
              <p className="text-xs text-gray-500 mt-1">
                सभी 16 टेबल्स (उत्पाद, दरें, विक्रेता, ठेले, उत्पादन, बिक्री, हिसाब, खर्चे, स्टॉक बहीखाता व ऑडिट लॉग्स) का सम्पूर्ण ज़िप आर्काइव।
              </p>
            </div>
            <div className="p-2.5 bg-cream-50 rounded-xl border border-cream-200 text-[11px] text-gray-600 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-maroon-950">
                <FileCheck className="w-3.5 h-3.5 text-maroon-700" />
                <span>JSON + CSV + SHA-256 Checksum</span>
              </div>
              <p className="text-[10px] text-gray-500">
                पासवर्ड या निजी क्रेडेंशियल्स पूर्णतः सुरक्षित रूप से बहिष्कृत हैं।
              </p>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-gray-100">
            <Button
              variant="primary"
              className="w-full justify-center"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={handleDownloadCompleteBackup}
              disabled={isProcessing}
            >
              Download Complete Backup
            </Button>
          </div>
        </Card>

        {/* Action 2: Date-Range Reporting Export */}
        <Card className="border-cream-300 flex flex-col justify-between hover:border-maroon-600 transition-all shadow-sm">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-700 text-white flex items-center justify-center shadow-md">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">दिनांक-सीमा डेटा निर्यात</h3>
              <p className="text-xs text-gray-500 mt-1">
                चयनित समयावधि का उत्पादन, बिक्री हिसाब, खर्चे, दिन बंदी व स्टॉक आवागमन निर्यात करें।
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Input
                type="date"
                label="प्रारंभिक तिथि"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                type="date"
                label="अंतिम तिथि"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="p-2 bg-amber-50 rounded-xl border border-amber-200 text-[10px] font-bold text-amber-900">
              ⚠️ यह केवल रिपोर्टिंग निर्यात है, आपदा रिकवरी बैकअप नहीं।
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-gray-100">
            <Button
              variant="secondary"
              className="w-full justify-center"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={handleDownloadDateRangeBackup}
              disabled={isProcessing}
            >
              Download Date-Range Backup
            </Button>
          </div>
        </Card>

        {/* Action 3: Expense Bills Storage Backup */}
        <Card className="border-cream-300 flex flex-col justify-between hover:border-maroon-600 transition-all shadow-sm">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shadow-md">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">खर्च बिल व रसीदें (Storage)</h3>
              <p className="text-xs text-gray-500 mt-1">
                क्लाउड स्टोरेज में सुरक्षित सभी अपलोड किए गए बिल और रसीदों का अलग ज़िप संग्रह।
              </p>
            </div>

            <div className="p-2.5 bg-cream-50 rounded-xl border border-cream-200 text-[11px] text-gray-600 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-900">
                <FileText className="w-3.5 h-3.5 text-emerald-700" />
                <span>expense-bills-manifest.json</span>
              </div>
              <p className="text-[10px] text-gray-500">
                प्रत्येक रसीद को खर्च रिकॉर्ड के साथ मैप करता है और गुम फाइलों की रिपोर्ट देता है।
              </p>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-gray-100">
            <Button
              variant="secondary"
              className="w-full justify-center"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={handleDownloadExpenseBillsBackup}
              disabled={isProcessing}
            >
              Download Expense Bills
            </Button>
          </div>
        </Card>
      </div>

      {/* Validation & Restore Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Validate Backup (Client-Side Verification) */}
        <Card className="border-cream-300 space-y-3">
          <CardHeader
            title="बैकअप सत्यापन (Validate Backup ZIP)"
            subtitle="बिना डेटाबेस बदले अपने स्थानीय बैकअप ZIP की अखंडता और SHA-256 चेकसम की जांच करें"
          />

          <div className="border-2 border-dashed border-gray-300 hover:border-maroon-700 rounded-2xl p-4 text-center cursor-pointer bg-cream-50/50 transition-all">
            <input
              type="file"
              accept=".zip"
              id="validate-file-input"
              className="hidden"
              onChange={handleValidateFileSelect}
            />
            <label htmlFor="validate-file-input" className="cursor-pointer block">
              <FileCheck className="w-8 h-8 text-maroon-800 mx-auto mb-2" />
              <span className="text-xs font-bold text-maroon-950 block">
                {selectedFileForValidation ? selectedFileForValidation.name : 'जांच के लिए बैकअप ZIP फ़ाइल चुनें'}
              </span>
              <span className="text-[11px] text-gray-500 mt-1 block">
                (फ़ाइल को ब्राउज़र में ही जाँचा जाता है, कोई सर्वर बदलाव नहीं होता)
              </span>
            </label>
          </div>

          {/* Validation Results Display */}
          {validationResult && (
            <div className={`p-3.5 rounded-2xl text-xs space-y-2.5 border ${
              validationResult.isValid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`font-black text-sm flex items-center gap-1.5 ${
                  validationResult.isValid ? 'text-emerald-900' : 'text-rose-900'
                }`}>
                  {validationResult.isValid ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      बैकअप पूर्णतः मान्य व सुरक्षित है (100% Valid)
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      बैकअप में त्रुटियां पाई गईं (Validation Failed)
                    </>
                  )}
                </span>
                <span className="font-mono font-bold text-gray-600">
                  {validationResult.manifest?.backup_format_version ? `v${validationResult.manifest.backup_format_version}` : ''}
                </span>
              </div>

              {validationResult.errors.length > 0 && (
                <div className="space-y-1 text-rose-800 text-[11px]">
                  {validationResult.errors.map((err, idx) => (
                    <div key={idx} className="flex items-start gap-1">
                      <span>•</span>
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Table Row Counts */}
              {Object.keys(validationResult.tableCounts).length > 0 && (
                <div className="pt-2 border-t border-gray-200/60">
                  <span className="font-bold text-gray-700 block mb-1">रिकॉर्ड्स सारांश (Table Counts):</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[10px] font-mono text-gray-600">
                    {Object.entries(validationResult.tableCounts).map(([tbl, count]) => (
                      <span key={tbl} className="bg-white/80 px-1.5 py-0.5 rounded">
                        {tbl}: <strong className="text-gray-900">{count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Disaster Restoration (Owner Protected) */}
        <Card className="border-rose-200 bg-rose-50/20 space-y-3 flex flex-col justify-between">
          <div>
            <CardHeader
              title="डेटा पुनर्स्थापना (Disaster Recovery Restore)"
              subtitle="बैकअप से डेटा पुनर्स्थापित करने के लिए कड़ा सुरक्षा नियंत्रण"
            />

            <div className="p-3 rounded-xl bg-rose-100/70 text-rose-900 text-xs space-y-1.5 mt-2">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-700 flex-shrink-0" />
                <span>अत्यंत महत्वपूर्ण सुरक्षा नियम:</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                1. उत्पादन वातावरण में पूर्ण पुनर्स्थापना केवल नियंत्रित एडमिन प्रक्रिया या Supabase CLI द्वारा अनुशंसित है।<br />
                2. किसी भी पुनर्स्थापना से पहले वर्तमान डेटाबेस का स्वचालित प्री-रिस्टोर स्नैपशॉट बैकअप लिया जाता है।<br />
                3. सभी पुनर्स्थापना कार्य अनिवार्य रूप से ऑडिट लॉग में दर्ज किए जाते हैं।
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-rose-100">
            <Button
              variant="danger"
              className="w-full justify-center"
              leftIcon={<RotateCcw className="w-4 h-4" />}
              onClick={handleOpenRestoreModal}
            >
              नियंत्रित डेटा पुनर्स्थापना (Controlled Restore)
            </Button>
          </div>
        </Card>
      </div>

      {/* Offline IndexedDB Protection Card */}
      <Card className="border-amber-200 bg-amber-50/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-amber-700" />
              <h3 className="text-base font-bold text-gray-900">ऑफ़लाइन ड्राफ्ट सुरक्षा एवं आपातकालीन निर्यात</h3>
            </div>
            <p className="text-xs text-gray-600 max-w-2xl">
              ब्राउज़र के IndexedDB में मौजूद ऑफ़लाइन उत्पादन, बिक्री और खर्च ड्राफ्ट्स को आपातकालीन JSON फ़ाइल के रूप में सुरक्षित करें।
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<FileText className="w-4 h-4" />}
              onClick={exportEmergencyDraftsJson}
            >
              Export Drafts (JSON)
            </Button>
            {pendingCount > 0 && (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Trash2 className="w-4 h-4" />}
                onClick={clearAllDraftsWithWarning}
              >
                ड्राफ्ट हटाएं
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              leftIcon={<RefreshCw className="w-4 h-4" />}
              onClick={syncNow}
              isLoading={isSyncing}
            >
              {t.syncNow}
            </Button>
          </div>
        </div>
      </Card>

      {/* Backup History Table */}
      <Card className="border-cream-300">
        <CardHeader
          title="बैकअप इतिहास (Backup History & Audit)"
          subtitle="पिछले बैकअप और निर्यात कार्यों का पूरा रिकॉर्ड"
        />

        {isHistoryLoading ? (
          <div className="text-center py-6">
            <div className="w-8 h-8 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold text-gray-500 mt-2">{t.loading}</p>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-xs">
            अभी तक कोई बैकअप इतिहास दर्ज नहीं है। ऊपर दिए गए बटन से नया बैकअप लें।
          </div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 font-bold">
                  <th className="py-2.5">दिनांक एवं समय</th>
                  <th className="py-2.5">प्रकार (Type)</th>
                  <th className="py-2.5">फाइल नाम</th>
                  <th className="py-2.5 text-center">स्थिति</th>
                  <th className="py-2.5 text-right">टेबल्स / रिकॉर्ड्स</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-cream-50/50">
                    <td className="py-2.5 font-sans font-semibold text-gray-900 whitespace-nowrap">
                      {formatDateTime(h.created_at)}
                    </td>
                    <td className="py-2.5">
                      <span className="font-semibold text-maroon-900 bg-cream-100 px-2 py-0.5 rounded-md uppercase text-[10px]">
                        {h.backup_type === 'complete'
                          ? 'सम्पूर्ण (Complete)'
                          : h.backup_type === 'date_range'
                          ? 'दिनांक सीमा'
                          : 'खर्च बिल'}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-gray-700 text-[11px]">
                      {h.file_name}
                    </td>
                    <td className="py-2.5 text-center">
                      <Badge variant={h.status === 'success' ? 'active' : 'inactive'}>
                        {h.status === 'success' ? 'सफल (Success)' : 'विफल (Failed)'}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right font-mono text-[11px] text-gray-600">
                      {h.table_counts ? Object.keys(h.table_counts).length : 0} टेबल्स
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Controlled Restore Modal */}
      <Modal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        title="नियंत्रित डेटा पुनर्स्थापना (Controlled Restore)"
        maxWidth="md"
      >
        <form onSubmit={handleExecuteRestoreSubmit} className="space-y-4 py-2">
          {restoreErrorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{restoreErrorMsg}</span>
            </div>
          )}

          {restoreResultMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{restoreResultMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-800">
              पुनर्स्थापना हेतु बैकअप ZIP फ़ाइल चुनें *
            </label>
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
              required
              className="w-full text-xs text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-maroon-800 file:text-white hover:file:bg-maroon-900"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-800">
              पुनर्स्थापना मोड (Mode)
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="restoreMode"
                  checked={isDryRun}
                  onChange={() => setIsDryRun(true)}
                  className="text-maroon-800 focus:ring-maroon-700"
                />
                <span>सुरक्षित ड्राई-रन (Dry-Run / केवल सत्यापन)</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-rose-800 cursor-pointer">
                <input
                  type="radio"
                  name="restoreMode"
                  checked={!isDryRun}
                  onChange={() => setIsDryRun(false)}
                  className="text-rose-800 focus:ring-rose-700"
                />
                <span>वास्तविक डेटाबेस रिस्टोर (Live Restore)</span>
              </label>
            </div>
          </div>

          <Input
            label="डेटा पुनर्स्थापना का अनिवार्य कारण (Reason) *"
            placeholder="जैसे: सर्वर माइग्रेशन / आकस्मिक डेटा नुकसान रिकवरी..."
            value={restoreReason}
            onChange={(e) => setRestoreReason(e.target.value)}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-rose-900">
              सुरक्षा पुष्टि कोड (Type <span className="font-mono bg-rose-100 px-1.5 py-0.5 rounded text-rose-950 font-black">RESTORE JANKI KULFI</span> to confirm) *
            </label>
            <input
              type="text"
              placeholder="RESTORE JANKI KULFI"
              value={restorePassphrase}
              onChange={(e) => setRestorePassphrase(e.target.value)}
              required
              className="w-full bg-white border border-rose-300 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-rose-900 focus:ring-2 focus:ring-rose-700 focus:outline-none min-h-[44px]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsRestoreModalOpen(false)}
            >
              {t.cancel}
            </Button>
            <Button
              type="submit"
              variant={isDryRun ? 'primary' : 'danger'}
              isLoading={restoreMutation.isPending}
            >
              {isDryRun ? 'ड्राई-रन चलाएं (Dry Run)' : 'डेटाबेस रिस्टोर करें (Execute Restore)'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
