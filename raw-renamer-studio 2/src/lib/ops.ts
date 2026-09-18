/**
 * Сводка по журналу операций (master §8: renamer.journal).
 * Общий для боковой панели и командной палитры (BUG-006/BUG-008).
 */
import * as sc from './sidecar';
import { useSession, errMsg } from '../store/useSession';

export async function showJournalSummary(): Promise<void> {
  const toast = useSession.getState().toast;
  if (!useSession.getState().online) {
    toast('warn', 'Sidecar офлайн', 'Журнал операций недоступен — запустите Python sidecar');
    return;
  }
  try {
    const r = await sc.rpc<{
      path: string;
      entries: { id: string; ts: string; files: { from: string; to: string }[] }[];
    }>('renamer.journal', {});
    const last = r.entries[r.entries.length - 1];
    toast(
      'info',
      'Журнал операций',
      last
        ? `${r.entries.length} в журнале · последняя: ${last.ts} (${last.files.length} файлов)`
        : `Журнал пуст · ${r.path}`,
    );
  } catch (e) {
    toast('err', 'Ошибка', errMsg(e));
  }
}
