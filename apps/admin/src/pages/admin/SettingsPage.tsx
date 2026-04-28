import { useEffect, useState } from "react";
import { dbQuery, dbMutate } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Settings, Save } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await dbQuery("app_settings", {});
      const map: Record<string, string> = {};
      (res.data || []).forEach((row: Record<string, unknown>) => {
        const k = String(row.key || row.setting_key || row.name || "");
        map[k] = String(row.value || row.setting_value || "");
      });
      setSettings(map);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(settings)) {
        await dbMutate("app_settings", "upsert", { key, value });
      }
      toast.success("Settings saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const knownSettings = [
    { key: "platform_name", label: "Platform Name", type: "text" },
    { key: "platform_fee_percent", label: "Platform Fee (%)", type: "number" },
    { key: "ecosystem_fee_percent", label: "Ecosystem Fee (%)", type: "number" },
    { key: "endowment_fee_percent", label: "Endowment Fee (%)", type: "number" },
    { key: "support_email", label: "Support Email", type: "email" },
    { key: "min_donation_amount", label: "Min Donation ($)", type: "number" },
    { key: "maintenance_mode", label: "Maintenance Mode", type: "toggle" },
  ];

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6" /> Settings</h2>
        <Card><CardContent className="pt-6 space-y-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6" /> Settings</h2>
        <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
          <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save All"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {knownSettings.map((s) => (
            <div key={s.key} className="space-y-2">
              {s.type === "toggle" ? (
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">Key: {s.key}</p>
                  </div>
                  <Switch
                    checked={settings[s.key] === "true" || settings[s.key] === "1"}
                    onCheckedChange={(v) => updateSetting(s.key, v ? "true" : "false")}
                  />
                </div>
              ) : (
                <>
                  <Label>{s.label}</Label>
                  <Input
                    type={s.type === "number" ? "number" : s.type === "email" ? "email" : "text"}
                    value={settings[s.key] || ""}
                    onChange={(e) => updateSetting(s.key, e.target.value)}
                    placeholder={s.key}
                  />
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(settings)
            .filter(([key]) => !knownSettings.some((s) => s.key === key))
            .map(([key, value]) => (
              <div key={key} className="space-y-1">
                <Label className="text-muted-foreground text-xs">{key}</Label>
                <Input value={value} onChange={(e) => updateSetting(key, e.target.value)} />
              </div>
            ))}
          {Object.keys(settings).filter((k) => !knownSettings.some((s) => s.key === k)).length === 0 && (
            <p className="text-sm text-muted-foreground">No additional settings</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
