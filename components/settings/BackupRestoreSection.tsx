import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../common/Button';
import { ConfirmModal } from '../common/ConfirmModal';
import { saveBlobToFile } from '../../utils/fileUtils';
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  backupFileName,
  createBackup,
  estimateBackupBytes,
  estimateSeconds,
  formatBytes,
  formatSeconds,
  getBackupInventory,
  readBackupManifest,
  restoreBackup,
  sessionsBytesFor,
  type AudioMode,
  type BackupCategory,
  type BackupInventory,
  type BackupManifest,
  type BackupSelection,
  type CategoryFlags,
} from '../../services/backupService';

interface BackupRestoreSectionProps {
  showToast: (msg: string, type?: 'ok' | 'err') => void;
  onRestored: () => void | Promise<void>;
}

const AUDIO_MODE_LABELS: Record<AudioMode, string> = {
  all: "Includi tutto l'audio",
  skipIfTranscribed: "Escludi audio se c'è la trascrizione",
  none: "Escludi tutto l'audio",
};

/** Oltre questa soglia lo ZIP in memoria può diventare problematico. */
const BIG_BACKUP_BYTES = 500 * 1024 * 1024;

const defaultFlags = (value: boolean): CategoryFlags => ({
  sessions: value,
  calendarEvents: value,
  sessionEmbeddings: value,
  meetingNotifications: value,
  settings: value,
  secrets: value,
});

const Progress: React.FC<{ label: string; done: number; total: number }> = ({ label, done, total }) => (
  <div className="space-y-1">
    <div className="h-1.5 bg-gray-700 rounded overflow-hidden">
      <div
        className="h-full bg-sky-500 transition-all duration-150"
        style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }}
      />
    </div>
    <p className="text-[10px] text-gray-400 truncate">{done}/{total} — {label}</p>
  </div>
);

export const BackupRestoreSection: React.FC<BackupRestoreSectionProps> = ({ showToast, onRestored }) => {
  const [inventory, setInventory] = useState<BackupInventory | null>(null);
  const [exportSel, setExportSel] = useState<BackupSelection>({
    ...defaultFlags(true),
    secrets: false,
    audioMode: 'skipIfTranscribed',
  });
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number; label: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [manifest, setManifest] = useState<BackupManifest | null>(null);
  const [importSel, setImportSel] = useState<CategoryFlags>(defaultFlags(true));
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  const isBusy = exportProgress !== null || importProgress !== null;

  const loadInventory = useCallback(async () => {
    try {
      setInventory(await getBackupInventory());
    } catch {
      showToast("Errore nel calcolo del contenuto del database.", 'err');
    }
  }, [showToast]);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  // ── Export ──────────────────────────────────────────────────────────────────

  const exportBytes = inventory ? estimateBackupBytes(inventory, exportSel) : 0;

  const categoryInfo = (cat: BackupCategory) => {
    if (!inventory) return { count: 0, bytes: 0 };
    if (cat === 'sessions') {
      return { count: inventory.sessions.count, bytes: sessionsBytesFor(inventory.sessions, exportSel.audioMode) };
    }
    return inventory[cat];
  };

  const handleExport = async () => {
    setExportProgress({ done: 0, total: 1, label: 'Preparazione…' });
    try {
      const { blob } = await createBackup(exportSel, (done, total, label) =>
        setExportProgress({ done, total, label })
      );
      saveBlobToFile(blob, backupFileName());
      showToast(`Backup esportato: ${formatBytes(blob.size)}.`);
    } catch (err) {
      showToast(`Errore export: ${err instanceof Error ? err.message : String(err)}`, 'err');
    } finally {
      setExportProgress(null);
    }
  };

  // ── Import ──────────────────────────────────────────────────────────────────

  const handleFilePicked = async (file: File) => {
    setPendingFile(null);
    setManifest(null);
    try {
      const m = await readBackupManifest(file);
      const present = defaultFlags(false);
      for (const cat of ALL_CATEGORIES) present[cat] = !!m.contents[cat];
      setImportSel({ ...present, secrets: false });
      setImportMode('merge');
      setManifest(m);
      setPendingFile(file);
    } catch (err) {
      showToast(`File non valido: ${err instanceof Error ? err.message : String(err)}`, 'err');
    }
  };

  const runImport = async () => {
    if (!pendingFile) return;
    setShowReplaceConfirm(false);
    setImportProgress({ done: 0, total: 1, label: 'Lettura archivio…' });
    try {
      const result = await restoreBackup(
        pendingFile,
        { mode: importMode, selection: importSel },
        (done, total, label) => setImportProgress({ done, total, label })
      );
      showToast(`Importati ${result.imported}, saltati ${result.skipped}, errori ${result.errors}.`,
        result.errors > 0 ? 'err' : 'ok');
      setPendingFile(null);
      setManifest(null);
      await loadInventory();
      await onRestored();
    } catch (err) {
      showToast(`Errore import: ${err instanceof Error ? err.message : String(err)}`, 'err');
    } finally {
      setImportProgress(null);
    }
  };

  const manifestBytes = manifest
    ? Object.values(manifest.contents).reduce((acc, c) => acc + (c?.bytes ?? 0), 0)
    : 0;
  const manifestCategories = manifest
    ? ALL_CATEGORIES.filter(cat => manifest.contents[cat])
    : [];
  const backupHasStrippedAudio = !!manifest && manifest.audioMode !== 'all';
  const storesToClear = manifestCategories
    .filter(cat => importSel[cat] && cat !== 'settings')
    .map(cat => CATEGORY_LABELS[cat]);

  return (
    <section className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-sky-300">Backup &amp; Ripristino</h3>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Il database vive dentro il browser (IndexedDB) e non è un file copiabile. Questo backup
          produce un unico archivio ZIP trasferibile su un'altra installazione.
        </p>
      </div>

      {/* Export */}
      <div className="space-y-2 border-t border-gray-700 pt-3">
        <h4 className="text-xs font-semibold text-gray-200">Esporta</h4>

        {ALL_CATEGORIES.map(cat => {
          const info = categoryInfo(cat);
          const disabled = info.count === 0 || isBusy;
          return (
            <div key={cat}>
              <label className={`flex items-center gap-2 text-xs ${disabled ? 'text-gray-500' : 'text-gray-300'}`}>
                <input
                  type="checkbox"
                  className="accent-sky-500"
                  checked={exportSel[cat] && info.count > 0}
                  disabled={disabled}
                  onChange={e => setExportSel(s => ({ ...s, [cat]: e.target.checked }))}
                />
                <span className={cat === 'secrets' ? 'text-red-300' : ''}>{CATEGORY_LABELS[cat]}</span>
                <span className="text-gray-500">
                  — {info.count} {info.count === 1 ? 'elemento' : 'elementi'} · {formatBytes(info.bytes)}
                </span>
              </label>

              {cat === 'secrets' && (
                <p className="text-[10px] text-red-400/80 ml-6">
                  Include la chiave API e la chiave di cifratura: chi riceve il file può usarla.
                </p>
              )}

              {cat === 'sessions' && exportSel.sessions && inventory && (
                <div className="ml-6 mt-1 space-y-1">
                  {(['all', 'skipIfTranscribed', 'none'] as AudioMode[]).map(mode => (
                    <label key={mode} className="flex items-center gap-2 text-[11px] text-gray-300">
                      <input
                        type="radio"
                        name="backup-audio-mode"
                        className="accent-sky-500"
                        checked={exportSel.audioMode === mode}
                        disabled={isBusy}
                        onChange={() => setExportSel(s => ({ ...s, audioMode: mode }))}
                      />
                      {AUDIO_MODE_LABELS[mode]}
                      <span className="text-gray-500">
                        — {formatBytes(sessionsBytesFor(inventory.sessions, mode))}
                        {mode === 'skipIfTranscribed' && inventory.sessions.withAudio > 0 &&
                          ` · audio per ${inventory.sessions.withAudioUntranscribed} su ${inventory.sessions.count}`}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <p className="text-xs text-gray-200 pt-1">
          Totale stimato: <span className="font-semibold">{formatBytes(exportBytes)}</span>
          {' · '}{formatSeconds(estimateSeconds(exportBytes, 'export'))}
        </p>
        {exportBytes > BIG_BACKUP_BYTES && (
          <p className="text-[10px] text-yellow-400">
            Archivio molto grande: viene costruito interamente in memoria, l'export può fallire su macchine con poca RAM.
          </p>
        )}

        {exportProgress
          ? <Progress {...exportProgress} />
          : (
            <Button
              variant="secondary"
              size="sm"
              disabled={isBusy || exportBytes === 0}
              onClick={handleExport}
            >
              Esporta backup
            </Button>
          )}
      </div>

      {/* Import */}
      <div className="space-y-2 border-t border-gray-700 pt-3">
        <h4 className="text-xs font-semibold text-gray-200">Importa</h4>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFilePicked(file);
            e.target.value = '';
          }}
        />
        <Button variant="secondary" size="sm" disabled={isBusy} onClick={() => fileInputRef.current?.click()}>
          Seleziona file di backup…
        </Button>

        {manifest && pendingFile && (
          <div className="space-y-2 mt-2 p-2 bg-gray-900/50 border border-gray-700 rounded">
            <p className="text-[11px] text-gray-400">
              {pendingFile.name} · creato il {new Date(manifest.createdAt).toLocaleString('it-IT')}
              {manifest.appDbVersion !== undefined && ` · DB v${manifest.appDbVersion}`}
            </p>

            <table className="w-full text-[11px]">
              <tbody>
                {manifestCategories.map(cat => {
                  const info = manifest.contents[cat]!;
                  return (
                    <tr key={cat}>
                      <td className="py-0.5">
                        <label className="flex items-center gap-2 text-gray-300">
                          <input
                            type="checkbox"
                            className="accent-sky-500"
                            checked={importSel[cat]}
                            disabled={isBusy}
                            onChange={e => setImportSel(s => ({ ...s, [cat]: e.target.checked }))}
                          />
                          <span className={cat === 'secrets' ? 'text-red-300' : ''}>{CATEGORY_LABELS[cat]}</span>
                        </label>
                      </td>
                      <td className="py-0.5 text-right text-gray-500">{info.count}</td>
                      <td className="py-0.5 text-right text-gray-500">{formatBytes(info.bytes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {manifest.contents.sessions && (
              <p className="text-[10px] text-gray-400">
                Sessioni: {manifest.contents.sessions.count} · audio incluso per{' '}
                {manifest.contents.sessions.withAudio ?? 0} su {manifest.contents.sessions.count}
              </p>
            )}

            <p className="text-[11px] text-gray-200">
              Tempo stimato: {formatSeconds(estimateSeconds(manifestBytes, 'import'))}
            </p>

            <div className="space-y-1 pt-1">
              <label className="flex items-start gap-2 text-[11px] text-gray-300">
                <input
                  type="radio"
                  name="backup-import-mode"
                  className="accent-sky-500 mt-0.5"
                  checked={importMode === 'merge'}
                  disabled={isBusy}
                  onChange={() => setImportMode('merge')}
                />
                <span>
                  <span className="font-medium">Merge</span>
                  <span className="text-gray-500"> — aggiunge solo ciò che manca, non tocca i dati esistenti</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-[11px] text-gray-300">
                <input
                  type="radio"
                  name="backup-import-mode"
                  className="accent-sky-500 mt-0.5"
                  checked={importMode === 'replace'}
                  disabled={isBusy}
                  onChange={() => setImportMode('replace')}
                />
                <span>
                  <span className="font-medium text-red-300">Replace</span>
                  <span className="text-gray-500"> — svuota gli store selezionati e li sostituisce</span>
                </span>
              </label>
            </div>

            {importProgress
              ? <Progress {...importProgress} />
              : (
                <Button
                  variant={importMode === 'replace' ? 'danger' : 'primary'}
                  size="sm"
                  disabled={isBusy || !manifestCategories.some(cat => importSel[cat])}
                  onClick={() => importMode === 'replace' ? setShowReplaceConfirm(true) : runImport()}
                >
                  Importa
                </Button>
              )}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showReplaceConfirm}
        onClose={() => setShowReplaceConfirm(false)}
        onConfirm={runImport}
        title="Conferma sostituzione dati"
        confirmText="Sostituisci"
        confirmButtonVariant="danger"
      >
        <p className="text-sm">
          Verranno <span className="font-semibold text-red-400">svuotati</span> e sostituiti:{' '}
          {storesToClear.join(', ') || 'nessuno store'}.
        </p>
        {backupHasStrippedAudio && (
          <p className="text-sm mt-2 text-yellow-400">
            Il backup è stato creato escludendo parte dell'audio: l'audio presente in locale per quelle
            sessioni andrà perso.
          </p>
        )}
        <p className="text-sm mt-2">Operazione non reversibile.</p>
      </ConfirmModal>
    </section>
  );
};
