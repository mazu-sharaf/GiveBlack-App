import { useNavigate, NavLink } from "react-router-dom";
import {
  LayoutDashboard, Building2, Grid3X3, Heart, Users, FileText, CreditCard,
  LogOut, Settings, BookOpen, Zap, Megaphone, X, Shield,
  Handshake, Mail, GraduationCap, Landmark, Bell,
} from "lucide-react";
import { logout, getCurrentName, getCurrentRole } from "@/lib/admin-auth";
import { canAccessNav } from "@/lib/role-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Users", url: "/users", icon: Users },
      { title: "Organizations", url: "/organizations", icon: Building2 },
      { title: "Campaigns", url: "/campaigns", icon: Megaphone },
      { title: "Community", url: "/community-campaigns", icon: Handshake },
      { title: "Charity Requests", url: "/charity-requests", icon: FileText },
      { title: "Volunteers", url: "/volunteers", icon: Users },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Donations", url: "/donations", icon: Heart },
      { title: "Subscriptions", url: "/subscriptions", icon: Zap },
      { title: "Transactions", url: "/transactions", icon: CreditCard },
      { title: "Fund release", url: "/fund-release", icon: Landmark },
      { title: "Ledger", url: "/ledger", icon: BookOpen },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Categories", url: "/categories", icon: Grid3X3 },
      { title: "Education partners", url: "/education-partners", icon: GraduationCap },
      { title: "Staff", url: "/staff", icon: Shield },
      { title: "Admin Emails", url: "/admin-emails", icon: Mail },
      { title: "Notify users", url: "/broadcast", icon: Bell },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

const roleColors: Record<string, string> = {
  admin: "border-primary/30 bg-primary/15 text-primary",
  super_admin: "border-red-500/30 bg-red-500/20 text-red-400",
  manager: "border-teal-400/35 bg-teal-950/50 text-teal-300",
  staff: "border-white/15 bg-white/10 text-[#a7acb1]",
};

export function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const role = getCurrentRole();
  const name = getCurrentName();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[min(260px,100vw-2rem)] max-w-[85vw] flex-col border-r border-white/10 bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-in-out",
        "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
        "lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4 sm:h-[4.375rem]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-secondary/70">
            <img
              src={`${import.meta.env.BASE_URL}giveblack-icon.png`}
              alt=""
              aria-hidden
              width={32}
              height={32}
              className="h-8 w-8 object-cover"
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-[#e6ecf0]">Give Black</h1>
            <p className="line-clamp-2 text-[11px] leading-tight text-[#a7acb1]">Operations hub</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-[#dee2e6] hover:bg-white/[0.06] hover:text-white lg:hidden"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <nav className="gb-admin-scrollable flex-1 overflow-y-auto px-2 py-3">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => canAccessNav(role, item.url));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className="mb-5">
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b0afaf]">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.url}
                    to={item.url}
                    end={item.url === "/"}
                    onClick={() => onClose()}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-white/[0.06] text-white"
                          : "text-[#a7acb1] hover:bg-white/[0.05] hover:text-white"
                      )
                    }
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/5 bg-white/[0.04] text-[#dee2e6]">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="truncate">{item.title}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/25 text-xs font-bold text-primary">
            {name.charAt(0).toUpperCase() || "A"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#e6ecf0]">{name}</p>
            <Badge variant="outline" className={cn("mt-0.5 border px-1.5 py-0 text-[9px]", roleColors[role])}>
              {role}
            </Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[#a7acb1] transition-colors hover:bg-white/[0.05] hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
