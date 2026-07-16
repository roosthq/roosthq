import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface AlertRequest {
  kind: 'alert';
  message: string;
  title?: string;
  resolve: () => void;
}

interface ConfirmRequest {
  kind: 'confirm';
  message: string;
  title?: string;
  danger?: boolean;
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
}

type Request = AlertRequest | ConfirmRequest;

interface DialogApi {
  alert: (message: string, opts?: { title?: string }) => Promise<void>;
  confirm: (message: string, opts?: { title?: string; danger?: boolean; confirmLabel?: string }) => Promise<boolean>;
}

const DialogContext = createContext<DialogApi | null>(null);

// Drop-in, styled replacement for window.alert/window.confirm — same
// call-and-await shape, but a real modal instead of a native browser dialog.
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  // Guards against the (rare) case of a second call firing before the first
  // dialog closes — queue it instead of clobbering the pending resolve.
  const queue = useRef<Request[]>([]);

  const show = useCallback((req: Request) => {
    setRequest((current) => {
      if (current) {
        queue.current.push(req);
        return current;
      }
      return req;
    });
  }, []);

  const closeAndAdvance = useCallback(() => {
    const next = queue.current.shift();
    setRequest(next ?? null);
  }, []);

  const api: DialogApi = {
    alert: (message, opts) =>
      new Promise((resolve) => {
        show({ kind: 'alert', message, title: opts?.title, resolve });
      }),
    confirm: (message, opts) =>
      new Promise((resolve) => {
        show({
          kind: 'confirm',
          message,
          title: opts?.title,
          danger: opts?.danger,
          confirmLabel: opts?.confirmLabel,
          resolve,
        });
      }),
  };

  function handleOk() {
    if (!request) return;
    if (request.kind === 'alert') request.resolve();
    else request.resolve(true);
    closeAndAdvance();
  }

  function handleCancel() {
    if (!request) return;
    if (request.kind === 'confirm') request.resolve(false);
    else request.resolve();
    closeAndAdvance();
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {request && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-lg bg-white p-5">
            {request.title && <h3 className="text-lg font-semibold">{request.title}</h3>}
            <p className={`text-sm text-slate-600 ${request.title ? 'mt-2' : ''}`}>{request.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              {request.kind === 'confirm' && (
                <button onClick={handleCancel} className="rounded border px-4 py-1.5 text-sm hover:bg-slate-50">
                  Cancel
                </button>
              )}
              <button
                autoFocus
                onClick={handleOk}
                className={`rounded px-4 py-1.5 text-sm text-white hover:opacity-90 ${
                  request.kind === 'confirm' && request.danger ? 'bg-red-600' : 'bg-slate-800'
                }`}
              >
                {request.kind === 'confirm' ? request.confirmLabel ?? 'OK' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog() must be used within a DialogProvider');
  return ctx;
}
