import { useEffect, useState } from "react";
import { getAdminEmails, addAdminEmail, deleteAdminEmail, sendTestAdminEmail, sendTestToAllAdminEmails } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Plus, Trash2, Send, SendHorizontal } from "lucide-react";

const MAX_ADMIN_EMAILS = 5;

export default function AdminEmailsPage() {
  const [emails, setEmails] = useState<{ id: string; email: string; created_at: string }[]>([]);
  const [mainAdminEmail, setMainAdminEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTestTo, setSendingTestTo] = useState<string | null>(null);
  const [sendingTestToAll, setSendingTestToAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { emails: list, mainAdminEmail: main } = await getAdminEmails();
      setEmails(list);
      setMainAdminEmail(main);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load admin emails";
      const friendly = msg === "Not Found" || msg.includes("404")
        ? "Admin emails API not found. Ensure the API is redeployed and restarted."
        : msg;
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Enter an email address");
      return;
    }
    if (emails.length >= MAX_ADMIN_EMAILS) {
      toast.error(`Maximum ${MAX_ADMIN_EMAILS} admin emails allowed. Remove one first.`);
      return;
    }
    setAdding(true);
    try {
      await addAdminEmail(email);
      await load();
      setNewEmail("");
      toast.success("Admin email added");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add email");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (email: string, id: string) => {
    setDeletingId(id);
    try {
      await deleteAdminEmail(email);
      await load();
      toast.success("Admin email removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove email");
    } finally {
      setDeletingId(null);
    }
  };

  const totalCount = (mainAdminEmail ? 1 : 0) + emails.length;

  const handleSendTestToAll = async () => {
    if (totalCount === 0) {
      toast.error("Add at least one admin email first.");
      return;
    }
    setSendingTestToAll(true);
    try {
      const { sent, failed, total } = await sendTestToAllAdminEmails();
      if (failed === 0) toast.success(`Test email sent to all ${sent} admin email(s). Check inboxes to confirm email is working.`);
      else toast.warning(`Sent to ${sent} of ${total}; ${failed} failed. Check email configuration.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send test to all";
      toast.error(msg.includes("No admin emails") ? msg : "Could not send test to all. Check email settings and try again.");
    } finally {
      setSendingTestToAll(false);
    }
  };

  const handleSendTest = async (to: string) => {
    const email = to.trim().toLowerCase();
    if (!email) {
      toast.error("Enter an email address");
      return;
    }
    setSendingTestTo(email);
    try {
      await sendTestAdminEmail(email);
      toast.success(`Test email sent to ${email}. Check the inbox to confirm email is working.`);
      setTestEmail("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send test email";
      toast.error(msg.includes("503") ? "Email not configured. Check your email settings." : msg);
    } finally {
      setSendingTestTo(null);
    }
  };

  const canAdd = emails.length < MAX_ADMIN_EMAILS;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6" /> Admin Emails
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Up to {MAX_ADMIN_EMAILS} emails that receive BCC on charity request approve/reject notifications.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send test email</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">Verify email is connected and working.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label htmlFor="test-email">Send to</Label>
              <Input
                id="test-email"
                type="email"
                placeholder="you@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleSendTest(testEmail)}
              disabled={sendingTestTo !== null}
            >
              <Send className="h-4 w-4 mr-1" /> {sendingTestTo ? "Sending..." : "Send test email"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add admin email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAdd} className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label htmlFor="new-email">Email address</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="admin@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={!canAdd}
              />
            </div>
            <Button type="submit" disabled={adding || !canAdd} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-1" /> {adding ? "Adding..." : "Add"}
            </Button>
          </form>
          {!canAdd && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Maximum {MAX_ADMIN_EMAILS} admin emails. Remove one to add another.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Current admin emails ({totalCount})</CardTitle>
              <p className="text-sm text-muted-foreground font-normal mt-1">
                {totalCount > 0 ? "Use « Send test » per email or « Send test to all » to verify email delivery." : "Add emails above; then use « Send test » or « Send test to all » to verify delivery."}
              </p>
            </div>
            {totalCount > 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleSendTestToAll}
                disabled={sendingTestToAll}
              >
                <SendHorizontal className="h-4 w-4 mr-1" /> {sendingTestToAll ? "Sending..." : "Send test to all"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : totalCount === 0 ? (
            <p className="text-sm text-muted-foreground">No admin emails added yet. Add one above to receive BCC copies of charity notifications.</p>
          ) : (
            <ul className="space-y-2">
              {mainAdminEmail && (
                <li className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-border bg-muted/30">
                  <span className="font-medium">{mainAdminEmail}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">Main</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSendTest(mainAdminEmail)}
                      disabled={sendingTestTo !== null}
                    >
                      <Send className="h-4 w-4 mr-1" /> {sendingTestTo === mainAdminEmail ? "Sending..." : "Send test"}
                    </Button>
                  </div>
                </li>
              )}
              {emails.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-border bg-muted/30"
                >
                  <span className="font-medium">{row.email}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSendTest(row.email)}
                      disabled={sendingTestTo !== null}
                    >
                      <Send className="h-4 w-4 mr-1" /> {sendingTestTo === row.email ? "Sending..." : "Send test"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(row.email, row.id)}
                      disabled={deletingId === row.id}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> {deletingId === row.id ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
