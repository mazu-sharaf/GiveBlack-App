import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type AdminRole, setAuthenticatedFromApi } from "@/lib/admin-auth";
import { loginViaApi, hasApiConfig } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";

const fieldClass =
  "border-white/15 bg-secondary/90 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/45";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasApiConfig()) {
      toast.error("API not configured. Set VITE_API_URL.");
      return;
    }
    setLoading(true);
    try {
      const result = await loginViaApi(email, password);
      const role: AdminRole = ["admin", "super_admin", "manager", "staff"].includes(result.role)
        ? (result.role as AdminRole)
        : "staff";
      setAuthenticatedFromApi(email, role, result.name);
      navigate("/");
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
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className={fieldClass}
              />
            </div>
            <Button type="submit" className="w-full font-semibold" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
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
