import styles from './Toast.module.css';

export type ToastProps = {
  message: string | null;
};

// small transient status bubble anchored under the control cluster; renders
// nothing while there is no message so callers can pass useToast's state directly
export function Toast({ message }: ToastProps) {
  if (!message) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      {message}
    </div>
  );
}
