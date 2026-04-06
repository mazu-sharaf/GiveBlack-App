import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { Menu, Sun, Moon, Search, Bell, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentName, getCurrentEmail, getCurrentRole, logout } from "@/lib/admin-auth";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/users": "Users",
  "/organizations": "Organizations",
  "/donations": "Donations",
  "/campaigns": "Campaigns",
  "/community-campaigns": "Community Campaigns",
  "/charity-requests": "Charity Requests",
  "/subscriptions": "Subscriptions",
  "/volunteers": "Volunteers",
  "/categories": "Categories",
  "/ledger": "Ledger",
  "/transactions": "Transactions",
  "/fund-release": "Fund release",
  "/staff": "Staff",
  "/admin-emails": "Admin Emails",
  "/education-partners": "Education Partners",
  "/broadcast": "Notify donors",
  "/settings": "Settings",
};

const searchableRoutes = Object.entries(routeLabels).map(([path, label]) => ({ path, label }));

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("gb_admin_theme");
    return saved ? saved === "dark" : true;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("gb_admin_theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    setSidebarOpen(false);
    setSearchOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredRoutes = searchQuery
    ? searchableRoutes.filter((r) => r.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const handleSearchNav = (path: string) => {
    navigate(path);
    setSearchQuery("");
    setSearchOpen(false);
  };

  const handleLogout = () => {
    logout();
    window.location.href = "/admin/login";
  };

  const pathParts = location.pathname.split("/").filter(Boolean);
  const currentLabel = routeLabels[location.pathname] || pathParts[pathParts.length - 1] || "Dashboard";
  const parentPath = pathParts.length > 1 ? `/${pathParts[0]}` : null;
  const parentLabel = parentPath ? routeLabels[parentPath] : null;

  const adminName = getCurrentName();
  const adminEmail = getCurrentEmail();
  const adminRole = getCurrentRole();

  return (
    <div className="flex h-[100dvh] min-h-0 max-h-[100dvh] w-full overflow-hidden bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col lg:ml-[min(18rem,calc(100vw-2rem))]">
        <header className="sticky top-0 z-30 min-h-14 flex items-center gap-2 sm:gap-3 border-b border-border bg-background/95 backdrop-blur px-2 sm:px-4 py-2 sm:py-0 shrink-0 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9 shrink-0 touch-manipulation"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="sm:hidden flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">{currentLabel}</p>
            {parentLabel && (
              <p className="text-[11px] text-muted-foreground truncate">{parentLabel}</p>
            )}
          </div>

          <Breadcrumb className="hidden sm:flex min-w-0 flex-1">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/admin/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              {parentLabel && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href={`/admin${parentPath}`}>{parentLabel}</BreadcrumbLink>
                  </BreadcrumbItem>
                </>
              )}
              {location.pathname !== "/" && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>

          <div className="relative" ref={searchRef}>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 touch-manipulation"
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label="Search pages"
            >
              <Search className="h-4 w-4" />
            </Button>
            {searchOpen && (
              <div className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:w-72 max-h-[min(70vh,24rem)] bg-popover border border-border rounded-lg shadow-lg p-2 z-50 sm:max-h-none flex flex-col">
                <Input
                  placeholder="Search pages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="h-8 text-sm"
                />
                {filteredRoutes.length > 0 && (
                  <div className="mt-1 max-h-[min(50vh,12rem)] sm:max-h-48 overflow-auto overscroll-contain">
                    {filteredRoutes.map((r) => (
                      <button
                        key={r.path}
                        className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors"
                        onClick={() => handleSearchNav(r.path)}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 relative touch-manipulation" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 touch-manipulation"
            onClick={() => setDark(!dark)}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="sm:hidden flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary touch-manipulation"
              onClick={() => setProfileOpen(!profileOpen)}
              aria-label="Account menu"
            >
              {adminName.charAt(0).toUpperCase() || "A"}
            </button>
            <button
              type="button"
              className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg px-2 py-1 min-w-0"
              onClick={() => setProfileOpen(!profileOpen)}
            >
              <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {adminName.charAt(0).toUpperCase() || "A"}
              </div>
              <span className="hidden md:inline truncate max-w-[8rem] lg:max-w-none">{adminName}</span>
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 sm:top-10 w-[min(100vw-1.5rem,16rem)] sm:w-56 bg-popover border border-border rounded-lg shadow-lg py-2 z-50">
                <div className="px-4 py-2 border-b border-border">
                  <p className="text-sm font-medium">{adminName}</p>
                  <p className="text-xs text-muted-foreground">{adminEmail}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">{adminRole}</p>
                </div>
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2 transition-colors"
                  onClick={() => { navigate("/settings"); setProfileOpen(false); }}
                >
                  <User className="h-3.5 w-3.5" /> Settings
                </button>
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2 text-red-400 transition-colors"
                  onClick={handleLogout}
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        <main
          dir="ltr"
          className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 [scrollbar-gutter:stable]"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
