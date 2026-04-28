import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type AdminRole, setAuthenticatedFromApi } from "@/lib/admin-auth";
import { startAdminEmailOtp, verifyAdminEmailOtp, hasApiConfig } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Chrome } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";

const fieldClass =
  "border-white/15 bg-secondary/90 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/45";

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const startGoogleRedirect = () => {
    const clientId = import.meta.env.VITE_ADMIN_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) {
      toast.error("Google login is not configured");
      return;
    }
    const redirectUri = `${window.location.origin}/backoffice/oauth2redirect`;
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const state = Math.random().toString(36).slice(2);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "id_token",
      scope: "openid email profile",
      nonce,
      state,
      prompt: "select_account",
    });
    window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasApiConfig()) {
      toast.error("API not configured. Set VITE_API_URL.");
      return;
    }
    setLoading(true);
    try {
      if (step === "email") {
        await startAdminEmailOtp(email);
        toast.success("If you are authorized, a code was sent to your email.");
        setStep("code");
      } else {
        const result = await verifyAdminEmailOtp(email, code);
        const role: AdminRole = ["admin", "super_admin", "manager", "staff"].includes(result.role)
          ? (result.role as AdminRole)
          : "staff";
        setAuthenticatedFromApi(email, role, result.name);
        navigate("/");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid credentials";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gb-admin-shell-bg flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="mx-auto w-full max-w-sm border-white/10 shadow-2xl">
        <CardHeader className="space-y-3 pb-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-secondary/70">
            <img
              src={`${import.meta.env.BASE_URL}giveblack-icon.png`}
              alt=""
              aria-hidden
              width={48}
              height={48}
              className="h-12 w-12 object-cover"
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Give Black</h1>
            <p className="text-sm text-muted-foreground">Admin sign in</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Authorized staff only. Unauthorized access is prohibited.
              </p>
            </div>

            <Button type="button" variant="secondary" className="w-full gap-2" onClick={startGoogleRedirect} disabled={loading}>
              <Chrome className="h-4 w-4" />
              Continue with Google
            </Button>

            <div className="text-center text-xs text-muted-foreground">or</div>

            {step === "email" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={fieldClass}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-foreground">
                    Email code
                  </Label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    className={fieldClass}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the 6‑digit code sent to your email.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                  }}
                  disabled={loading}
                >
                  Back
                </Button>
              </>
            )}
            <Button type="submit" className="w-full font-semibold" disabled={loading}>
              {loading ? "Please wait…" : step === "email" ? "Continue" : "Verify & sign in"}
            </Button>
            <p className="pt-1 text-center text-xs text-muted-foreground">
              If you are facing any issues or login problems, please contact the developer.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
