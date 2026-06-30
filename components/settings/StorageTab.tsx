
import React, { useState, useEffect, useCallback } from 'react';
import { StorageStats, SavedSession } from '../../types';
import { db } from '../../utils/db';
import { Button } from '../common/Button';
import { ConfirmModal } from '../common/ConfirmModal';
import { CAL_AUDIO_RETENTION_DAYS } from '../../constants/appConfig';

interface StorageTabProps {
  onClose?: () => void;
}

const AUDIO_RETENTION_DAYS = CAL_AUDIO_RETENTION_DAYS;

function formatMb(mb: number): string {
  if (mb < 0.01) return '< 0.01 MB';
  return `${mb.toFixed(2)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function daysUntilExpiry(session: SavedSession): number | null {
  const hasAudio = !!(session.data.audioBlob || (session.data.chunks && session.data.chunks.length > 0));
  if (!hasAudio) return null;
  const expiryMs = session.timestamp + AUDIO_RETENTION_DAYS * 86400000;
  const diffMs = expiryMs - Date.now();
  return Math.ceil(diffMs / 86400000);
}

export const StorageTab: React.FC<StorageTabProps> = () => {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [retentionDays, setRetentionDays] = useState(60);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [s, sess] = await Promise.all([db.getStorageStats(), db.getAllSessions()]);
      setStats(s);
      setSessions(sess.sort((a, b) => b.timestamp - a.timestamp));
    } catch {
      showToast('Errore nel caricamento dei dati storage.', 'err');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Preview: sessions that would be deleted
  const sessionsToDelete = sessions.filter(s => s.timestamp < Date.now() - retentionDays * 86400000);
  const mbToFree = sessionsToDelete.reduce((acc, s) => acc + (s.totalSizeMb ?? 0), 0);

  const handleApplyRetention = async () => {
    setShowConfirm(false);
    setIsWorking(true);
    try {
      const count = await db.deleteSessionsOlderThan(retentionDays);
      showToast(`${count} sessioni eliminate.`);
      await loadData();
    } catch {
      showToast('Errore durante la pulizia sessioni.', 'err');
    } finally {
      setIsWorking(false);
    }
  };

  const handleForceAudioCleanup = async () => {
    setIsWorking(true);
    try {
      const count = await db.deleteAudioOlderThan(AUDIO_RETENTION_DAYS);
      showToast(`Audio rimosso da ${count} sessioni.`);
      await loadData();
    } catch {
      showToast('Errore durante la pulizia audio.', 'err');
    } finally {
      setIsWorking(false);
    }
  };

  const handleCleanCalendarEvents = async () => {
    setIsWorking(true);
    try {
      const count = await db.deleteStaleCalendarEvents();
      showToast(`${count} eventi calendario scaduti eliminati.`);
      await loadData();
    } catch {
      showToast('Errore durante la pulizia eventi.', 'err');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm shadow-lg ${
          toast.type === 'ok' ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'
        }`}>
          {toast.type === 'ok' ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
          Caricamento dati storage…
        </div>
      ) : (
        <>
          {/* A. Database Overview */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-sky-300">Database Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Totale usato', value: formatMb(stats?.totalMb ?? 0) },
                { label: 'Audio (blob)', value: formatMb(stats?.audioMb ?? 0) },
                { label: 'Testo', value: formatMb(stats?.textMb ?? 0) },
                { label: 'Sessioni totali', value: String(stats?.sessionCount ?? 0) },
                { label: 'Con audio', value: String(stats?.sessionWithAudioCount ?? 0) },
                { label: 'Eventi calendario', value: String(stats?.calendarEventCount ?? 0) },
              ].map(card => (
                <div key={card.label} className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-3 flex flex-col gap-1">
                  <span className="text-[11px] text-gray-400 leading-tight">{card.label}</span>
                  <span className="text-lg font-semibold text-gray-100">{card.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* B. Retention Controls */}
          <section className="space-y-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h3 className="text-sm font-semibold text-sky-300">Retention Controls</h3>

            {/* Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-300 font-medium">
                  Elimina sessioni più vecchie di
                </label>
                <span className="text-xs font-semibold text-sky-400">{retentionDays} giorni</span>
              </div>
              <input
                type="range"
                min={7}
                max={365}
                step={1}
                value={retentionDays}
                onChange={e => setRetentionDays(parseInt(e.target.value, 10))}
                className="w-full accent-sky-500"
              />
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>7 gg</span>
                <span>365 gg</span>
              </div>
              {sessionsToDelete.length > 0 ? (
                <p className="text-xs text-yellow-400">
                  Eliminerà {sessionsToDelete.length} sessioni, liberando ~{formatMb(mbToFree)}
                </p>
              ) : (
                <p className="text-xs text-gray-500">Nessuna sessione da eliminare con questa impostazione.</p>
              )}
              <Button
                variant="danger"
                size="sm"
                disabled={sessionsToDelete.length === 0 || isWorking}
                onClick={() => setShowConfirm(true)}
              >
                Applica pulizia
              </Button>
            </div>

            <div className="border-t border-gray-700 pt-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-xs text-gray-300 font-medium">Auto-elimina audio &gt;10 gg</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Il daemon gira automaticamente all'apertura del calendario. Rimuove solo i blob audio, mantiene testo e analisi.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isWorking}
                  onClick={handleForceAudioCleanup}
                >
                  Forza pulizia audio ora
                </Button>
              </div>
            </div>
          </section>

          {/* C. Sessions Table */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-sky-300">Sessioni salvate</h3>
            {sessions.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">Nessuna sessione salvata.</p>
            ) : (
              <div className="overflow-y-auto max-h-64 rounded-lg border border-gray-700">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Nome</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Data</th>
                      <th className="text-center px-3 py-2 text-gray-400 font-medium">Audio</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">Dim.</th>
                      <th className="text-right px-3 py-2 text-gray-400 font-medium">Scadenza audio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s, i) => {
                      const hasAudio = !!(s.data.audioBlob || (s.data.chunks && s.data.chunks.length > 0));
                      const daysLeft = daysUntilExpiry(s);
                      return (
                        <tr
                          key={s.id}
                          className={`border-b border-gray-700/50 ${i % 2 === 0 ? 'bg-gray-800/20' : ''}`}
                        >
                          <td className="px-3 py-2 text-gray-200 max-w-[140px] truncate" title={s.name}>
                            {s.name}
                          </td>
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                            {formatDate(s.timestamp)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span title={hasAudio ? 'Audio presente' : 'Nessun audio'}>
                              {hasAudio ? (
                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                              ) : (
                                <span className="inline-block w-2 h-2 rounded-full bg-gray-600" />
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">
                            {formatMb(s.totalSizeMb ?? 0)}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {hasAudio ? (
                              daysLeft !== null && daysLeft <= 0 ? (
                                <span className="text-red-400">Scaduto</span>
                              ) : (
                                <span className="text-gray-300">{daysLeft} gg</span>
                              )
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* D. Calendar Events */}
          <section className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg space-y-2">
            <h3 className="text-sm font-semibold text-sky-300">Calendar Events</h3>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-gray-300">
                <span className="font-semibold text-gray-100">{stats?.calendarEventCount ?? 0}</span> eventi in store
              </p>
              <Button
                variant="secondary"
                size="sm"
                disabled={isWorking}
                onClick={handleCleanCalendarEvents}
              >
                Pulizia eventi scaduti
              </Button>
            </div>
            <p className="text-[10px] text-gray-500">
              Rimuove eventi con data di fine nel passato che non sono collegati a una sessione.
            </p>
          </section>
        </>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleApplyRetention}
        title="Conferma pulizia sessioni"
        confirmText="Elimina"
        confirmButtonVariant="danger"
      >
        <p className="text-sm">
          Stai per eliminare <strong className="text-white">{sessionsToDelete.length} sessioni</strong> più
          vecchie di {retentionDays} giorni, liberando ~{formatMb(mbToFree)}.
        </p>
        <p className="text-xs text-gray-500 mt-2">Questa operazione è irreversibile.</p>
      </ConfirmModal>
    </div>
  );
};
