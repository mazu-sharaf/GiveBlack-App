import React, { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

type Props = {
  siteKey?: string;
  onTokenChange: (token: string) => void;
};

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function TurnstileWidget({ siteKey, onTokenChange }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !ref.current) return undefined;
    let cancelled = false;

    function renderWidget() {
      if (cancelled || !ref.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token: string) => onTokenChange(token || ""),
        "expired-callback": () => onTokenChange(""),
        "error-callback": () => onTokenChange(""),
      });
    }

    if (!document.querySelector(`script[src="${TURNSTILE_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    } else {
      const id = window.setInterval(() => {
        if (window.turnstile) {
          window.clearInterval(id);
          renderWidget();
        }
      }, 100);
    }

    renderWidget();
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [onTokenChange, siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} style={{ marginTop: 12, minHeight: 65 }} />;
}
