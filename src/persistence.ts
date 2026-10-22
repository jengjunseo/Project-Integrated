import type { State } from "./model";
import { emptyState } from "./model";
let database: IDBDatabase;
export const channel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("original-recall-v1");
export async function openDB() {
  database = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("original-recall", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("state");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error("다른 탭을 닫은 뒤 다시 시도해 주세요."));
  });
  return readState();
}
export async function readState() {
  return new Promise<State>((resolve, reject) => {
    const tx = database.transaction("state", "readonly");
    const r = tx.objectStore("state").get("current");
    r.onsuccess = () => resolve(r.result ?? emptyState());
    r.onerror = () => reject(r.error);
  });
}
export function writeState(next: State, expectedRevision: number) {
  return new Promise<State>((resolve, reject) => {
    const tx = database.transaction("state", "readwrite"),
      store = tx.objectStore("state");
    let conflict = false;
    const r = store.get("current");
    const saved = {
      ...next,
      revision: expectedRevision + 1,
      updatedAt: new Date().toISOString(),
    };
    r.onsuccess = () => {
      if ((r.result?.revision ?? 0) !== expectedRevision) {
        conflict = true;
        tx.abort();
        return;
      }
      store.put(saved, "current");
    };
    tx.oncomplete = () => {
      channel?.postMessage({ revision: saved.revision });
      resolve(saved);
    };
    tx.onabort = () =>
      reject(
        Error(
          conflict
            ? "다른 탭에서 기록이 바뀌었습니다. 최신 기록을 불러와 주세요."
            : "저장하지 못했습니다. 저장 공간을 확인하고 재시도하거나 백업해 주세요.",
        ),
      );
    tx.onerror = () => {};
  });
}
