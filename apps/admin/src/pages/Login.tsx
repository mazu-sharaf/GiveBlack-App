import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type AdminRole, setAuthenticatedFromApi } from "@/lib/admin-auth";
import { loginViaApi, hasApiConfig } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";

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
      const role: AdminRole = ["admin", "super_admin", "manager", "staff"].includes(result.role) ? result.role as AdminRole : "staff";
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
    <div className="min-h-screen flex items-center justify-center bg-background dark">
      <Card className="w-full max-w-sm mx-4">
        <CardHeader className="text-center space-y-3 pb-2">
          <img
            src={`${import.meta.env.BASE_URL}giveblack-icon.png`}
            alt=""
            aria-hidden
            width={48}
            height={48}
            className="mx-auto h-12 w-12 rounded-xl object-cover border border-border"
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Give Black</h1>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-1">
              If you are facing any issues or login problems, please contact the developer.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
