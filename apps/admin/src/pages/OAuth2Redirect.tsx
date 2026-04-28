import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { verifyGoogleAdmin } from "@/lib/api";
import { type AdminRole, setAuthenticatedFromApi } from "@/lib/admin-auth";

function parseHashParams(hash: string): Record<string, string> {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

export default function OAuth2Redirect() {
  const nav = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const params = parseHashParams(window.location.hash || "");
        const idToken = params.id_token;
        if (!idToken) {
          toast.error("Google login failed");
          nav("/login");
          return;
        }
        const result = await verifyGoogleAdmin(idToken);
        const role: AdminRole = ["admin", "super_admin", "manager", "staff"].includes(result.role)
          ? (result.role as AdminRole)
          : "staff";
        setAuthenticatedFromApi("", role, result.name);
        nav("/");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Google login failed");
        nav("/login");
      }
    })();
  }, [nav]);

  return (
    <div className="gb-admin-shell-bg flex min-h-screen items-center justify-center px-4 py-10 text-sm text-muted-foreground">
      Completing sign-in…
    </div>
  );
}

