"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

type State = { error?: string; ok?: string };

/**
 * A form bound to a server action that shows the action's result underneath.
 * The action is dispatched by hand so that a rejected submission keeps what
 * the person typed (React clears forms that use the `action` prop).
 */
export function ActionForm({
  action,
  children,
  submit,
  primary,
  className = "stack",
  confirmText,
  resetOnOk,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  children: React.ReactNode;
  submit: string;
  primary?: boolean;
  className?: string;
  confirmText?: string;
  resetOnOk?: boolean;
}) {
  const [state, run, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirmText && !window.confirm(confirmText)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => run(fd));
      }}
    >
      {children}
      <button type="submit" className={primary ? "primary" : undefined} disabled={pending}>
        {pending ? "Working…" : submit}
      </button>
      <p className={`msg ${state.error ? "err" : "ok"}`} role="status" aria-live="polite" style={{ flexBasis: "100%" }}>
        {state.error ?? state.ok ?? ""}
      </p>
    </form>
  );
}
