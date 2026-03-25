import { useNavigate, NavLink } from "react-router-dom";
import {
  LayoutDashboard, Building2, Grid3X3, Heart, Users, FileText, CreditCard,
  LogOut, Settings, BookOpen, Zap, Megaphone, X, Shield,
  Handshake, Mail,
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
      { title: "Ledger", url: "/ledger", icon: BookOpen },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Categories", url: "/categories", icon: Grid3X3 },
      { title: "Staff", url: "/staff", icon: Shield },
      { title: "Admin Emails", url: "/admin-emails", icon: Mail },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

const roleColors: Record<string, string> = {
  admin: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  super_admin: "bg-red-500/20 text-red-400 border-red-500/30",
  manager: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  staff: "bg-gray-500/20 text-gray-400 border-gray-500/30",
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
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-200 ease-in-out",
        "lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}giveblack-icon.jpg`}
            alt=""
            aria-hidden
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-cover shrink-0 border border-border/60"
          />
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight truncate">Give Black</h1>
            <p className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
              Operations hub for impact-driven giving
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 lg:hidden" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-3">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => canAccessNav(role, item.url));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className="mb-4">
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-2 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.url}
                    to={item.url}
                    end={item.url === "/"}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors",
                        isActive
                          ? "bg-emerald-600/15 text-emerald-500"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-3 space-y-2 shrink-0">
        <div className="flex items-center gap-2.5 px-2">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
            {name.charAt(0).toUpperCase() || "A"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{name}</p>
            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", roleColors[role])}>
              {role}
            </Badge>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors w-full px-2 py-1.5 rounded-md hover:bg-muted/50"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
