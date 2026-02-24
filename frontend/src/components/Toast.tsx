import { useState, useCallback, useEffect, useRef } from 'react';

export type ToastType = '' | 'error' | 'success';

interface ToastMessage {
  text: string;
  type: ToastType;
  id: number;
}

let toastId = 0;

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((text: string, type: ToastType = '') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = ++toastId;
    setToast({ text, type, id });
    timerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { toast, showToast };
}

interface ToastProps {
  toast: ToastMessage | null;
}

export function Toast({ toast }: ToastProps) {
  const className = `toast${toast ? ' show' : ''}${toast?.type ? ' ' + toast.type : ''}`;

  return (
    <div className={className}>
      {toast?.text}
    </div>
  );
}
