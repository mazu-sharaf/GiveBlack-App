import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleGuard } from "@/components/RoleGuard";
import { AdminLayout } from "@/components/AdminLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/admin/Dashboard";
import UsersPage from "./pages/admin/UsersPage";
import OrganizationsPage from "./pages/admin/OrganizationsPage";
import OrganizationDetailPage from "./pages/admin/OrganizationDetailPage";
import DonationsPage from "./pages/admin/DonationsPage";
import CampaignsPage from "./pages/admin/CampaignsPage";
import CampaignDetailPage from "./pages/admin/CampaignDetailPage";
import CommunityCampaignsPage from "./pages/admin/CommunityCampaignsPage";
import CommunityCampaignDetailPage from "./pages/admin/CommunityCampaignDetailPage";
import CharityRequestsPage from "./pages/admin/CharityRequestsPage";
import SubscriptionsPage from "./pages/admin/SubscriptionsPage";
import VolunteersPage from "./pages/admin/VolunteersPage";
import CategoriesPage from "./pages/admin/CategoriesPage";
import LedgerPage from "./pages/admin/LedgerPage";
import FundReleasePage from "./pages/admin/FundReleasePage";
import TransactionsPage from "./pages/admin/TransactionsPage";
import StaffPage from "./pages/admin/StaffPage";
import AdminEmailsPage from "./pages/admin/AdminEmailsPage";
import BroadcastNotificationsPage from "./pages/admin/BroadcastNotificationsPage";
import SettingsPage from "./pages/admin/SettingsPage";
import EducationPartnersPage from "./pages/admin/EducationPartnersPage";
import DonorDetailPage from "./pages/admin/DonorDetailPage";
import CampaignPublicPage from "./pages/CampaignPublicPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const AdminPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <RoleGuard>
      <AdminLayout>{children}</AdminLayout>
    </RoleGuard>
  </ProtectedRoute>
);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename="/admin">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/c/:slug" element={<CampaignPublicPage />} />
            <Route path="/" element={<AdminPage><Dashboard /></AdminPage>} />
            <Route path="/users" element={<AdminPage><UsersPage /></AdminPage>} />
            <Route path="/organizations" element={<AdminPage><OrganizationsPage /></AdminPage>} />
            <Route path="/organizations/:id" element={<AdminPage><OrganizationDetailPage /></AdminPage>} />
            <Route path="/donations" element={<AdminPage><DonationsPage /></AdminPage>} />
            <Route path="/donors/:email" element={<AdminPage><DonorDetailPage /></AdminPage>} />
            <Route path="/campaigns" element={<AdminPage><CampaignsPage /></AdminPage>} />
            <Route path="/campaigns/:id" element={<AdminPage><CampaignDetailPage /></AdminPage>} />
            <Route path="/community-campaigns" element={<AdminPage><CommunityCampaignsPage /></AdminPage>} />
            <Route path="/community-campaigns/:id" element={<AdminPage><CommunityCampaignDetailPage /></AdminPage>} />
            <Route path="/charity-requests" element={<AdminPage><CharityRequestsPage /></AdminPage>} />
            <Route path="/subscriptions" element={<AdminPage><SubscriptionsPage /></AdminPage>} />
            <Route path="/volunteers" element={<AdminPage><VolunteersPage /></AdminPage>} />
            <Route path="/categories" element={<AdminPage><CategoriesPage /></AdminPage>} />
            <Route path="/ledger" element={<AdminPage><LedgerPage /></AdminPage>} />
            <Route path="/fund-release" element={<AdminPage><FundReleasePage /></AdminPage>} />
            <Route path="/transactions" element={<AdminPage><TransactionsPage /></AdminPage>} />
            <Route path="/staff" element={<AdminPage><StaffPage /></AdminPage>} />
            <Route path="/admin-emails" element={<AdminPage><AdminEmailsPage /></AdminPage>} />
            <Route path="/broadcast" element={<AdminPage><BroadcastNotificationsPage /></AdminPage>} />
            <Route path="/education-partners" element={<AdminPage><EducationPartnersPage /></AdminPage>} />
            <Route path="/settings" element={<AdminPage><SettingsPage /></AdminPage>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
