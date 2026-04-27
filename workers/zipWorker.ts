
import { createSessionZipBlob, ZipEntry } from '../utils/fileUtils';

type WorkerIn  = { entries: ZipEntry[]; fileName: string };
type WorkerOut = { blob: Blob; fileName: string } | { error: string };

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  try {
    const blob = createSessionZipBlob(e.data.entries);
    const msg: WorkerOut = { blob, fileName: e.data.fileName };
    self.postMessage(msg);
  } catch (err) {
    const msg: WorkerOut = { error: String(err) };
    self.postMessage(msg);
  }
};
