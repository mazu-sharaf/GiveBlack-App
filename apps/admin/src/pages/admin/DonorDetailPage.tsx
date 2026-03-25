import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchDonations, dbQuerySingle, type EnrichedDonation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, Mail, User, DollarSign, Calendar, Hash } from "lucide-react";
import { format } from "date-fns";

interface UserProfile {
  name?: string;
  email?: string;
  zip_code?: string;
  user_type?: string;
  created_at?: string;
}

export default function DonorDetailPage() {
  const { email } = useParams();
  const navigate = useNavigate();
  const [donations, setDonations] = useState<EnrichedDonation[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) return;
    const load = async () => {
      setLoading(true);
      const decodedEmail = decodeURIComponent(email);
      try {
        const [donRes, profRes] = await Promise.all([
          fetchDonations({ search: decodedEmail, limit: 200 }),
          dbQuerySingle<UserProfile>("profiles", {
            filters: [{ column: "email", op: "eq", value: decodedEmail }],
          }).catch(() => ({ data: null })),
        ]);
        setDonations(donRes.donations || []);
        setProfile(profRes.data);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to load donor data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [email]);

  const decodedEmail = email ? decodeURIComponent(email) : "";
  const totalDonated = donations.reduce((s, d) => s + Number(d.amount), 0);
  const donorName = donations.find((d) => d.donor_name)?.donor_name || profile?.name || "Unknown Donor";

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" size="sm" onClick={() => navigate("/donations")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Donations
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Donor Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <User className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="font-semibold">{donorName}</p>
                <p className="text-sm text-muted-foreground">{decodedEmail}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span>Total: <strong className="text-emerald-500">${totalDonated.toLocaleString()}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span>Donations: <strong>{donations.length}</strong></span>
              </div>
              {profile && (
                <>
                  {profile.zip_code && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>Zip: {profile.zip_code}</span>
                    </div>
                  )}
                  {profile.user_type && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>Type: <Badge variant="secondary">{profile.user_type}</Badge></span>
                    </div>
                  )}
                  {profile.created_at && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>Joined: {format(new Date(profile.created_at), "MMM dd, yyyy")}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Donation History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {donations.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.org_name || "--"}</TableCell>
                      <TableCell className="text-emerald-500 font-medium">${Number(d.amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{d.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {d.created_at ? format(new Date(d.created_at), "MMM dd, yyyy") : "--"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {donations.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No donations found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
