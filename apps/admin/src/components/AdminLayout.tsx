import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { Menu, Search, Bell, LogOut, User } from "lucide-react";
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
  "/giveblack-financials": "GiveBlack financials",
  "/transactions": "Transactions",
  "/fund-release": "Fund release",
  "/staff": "Staff",
  "/admin-emails": "Admin Emails",
  "/education-partners": "Education Partners",
  "/broadcast": "Notify users",
  "/settings": "Settings",
};

const searchableRoutes = Object.entries(routeLabels).map(([path, label]) => ({ path, label }));

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

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
    window.location.href = "/backoffice/login";
  };

  const pathParts = location.pathname.split("/").filter(Boolean);
  const currentLabel = routeLabels[location.pathname] || pathParts[pathParts.length - 1] || "Dashboard";
  const parentPath = pathParts.length > 1 ? `/${pathParts[0]}` : null;
  const parentLabel = parentPath ? routeLabels[parentPath] : null;

  const adminName = getCurrentName();
  const adminEmail = getCurrentEmail();
  const adminRole = getCurrentRole();

  const headerBtn =
    "h-9 w-9 shrink-0 touch-manipulation text-[#dee2e6] hover:text-white hover:bg-white/[0.06] border-0";

  return (
    <div className="gb-admin-shell-bg flex h-[100dvh] min-h-0 max-h-[100dvh] w-full overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/55 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col lg:ml-[min(260px,calc(100vw-2rem))]">
        <header className="sticky top-0 z-30 flex min-h-[3.5rem] shrink-0 items-center gap-2 border-b border-white/10 bg-transparent px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-3 sm:px-5 sm:py-0 sm:min-h-[4.375rem]">
          <Button
            variant="ghost"
            size="icon"
            className={`lg:hidden ${headerBtn}`}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="min-w-0 flex-1 sm:hidden">
            <p className="truncate text-sm font-semibold leading-tight text-[#e6ecf0]">{currentLabel}</p>
            {parentLabel && (
              <p className="truncate text-[11px] text-[#a7acb1]">{parentLabel}</p>
            )}
          </div>

          <Breadcrumb className="hidden min-w-0 flex-1 sm:flex">
            <BreadcrumbList className="text-sm text-[#a7acb1] [&_a]:text-[#dee2e6] [&_a:hover]:text-white [&_svg]:text-white/80">
              <BreadcrumbItem>
                <BreadcrumbLink href="/backoffice/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              {parentLabel && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href={`/backoffice${parentPath}`}>{parentLabel}</BreadcrumbLink>
                  </BreadcrumbItem>
                </>
              )}
              {location.pathname !== "/" && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-medium text-[#e6ecf0]">{currentLabel}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>

          <div ref={searchRef} className="relative flex flex-1 justify-end md:max-w-md">
            <div className="relative hidden w-full md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a7acb1]" />
              <Input
                placeholder="Search pages…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                className="h-9 rounded-full border border-white/15 bg-secondary/90 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/50"
              />
              {searchOpen && searchQuery.trim() && (
                <div className="absolute left-0 right-0 top-11 z-50 max-h-64 overflow-hidden rounded-xl border border-white/10 bg-popover shadow-xl">
                  {filteredRoutes.length > 0 ? (
                    <div className="gb-admin-scrollable max-h-48 overflow-auto overscroll-contain p-1">
                      {filteredRoutes.map((r) => (
                        <button
                          key={r.path}
                          type="button"
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#dee2e6] transition-colors hover:bg-white/[0.06]"
                          onClick={() => handleSearchNav(r.path)}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="px-3 py-2 text-xs text-[#a7acb1]">No matching pages</p>
                  )}
                </div>
              )}
            </div>

            <div className="md:hidden">
              <Button
                variant="ghost"
                size="icon"
                className={headerBtn}
                onClick={() => setSearchOpen(!searchOpen)}
                aria-label="Search pages"
              >
                <Search className="h-4 w-4" />
              </Button>
              {searchOpen && (
                <div className="fixed left-3 right-3 top-14 z-50 flex max-h-[min(70vh,24rem)] flex-col rounded-xl border border-white/10 bg-popover p-2 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:w-72 sm:max-h-none">
                  <Input
                    placeholder="Search pages…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="h-9 border-white/15 bg-secondary/90 text-sm text-foreground"
                  />
                  {filteredRoutes.length > 0 && (
                    <div className="gb-admin-scrollable mt-1 max-h-[min(50vh,12rem)] overflow-auto overscroll-contain sm:max-h-48">
                      {filteredRoutes.map((r) => (
                        <button
                          key={r.path}
                          type="button"
                          className="w-full rounded-lg px-3 py-1.5 text-left text-sm text-[#dee2e6] hover:bg-white/[0.06]"
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
          </div>

          <Button variant="ghost" size="icon" className={`${headerBtn} relative`} aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </Button>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-full bg-primary/25 text-xs font-bold text-primary sm:hidden"
              onClick={() => setProfileOpen(!profileOpen)}
              aria-label="Account menu"
            >
              {adminName.charAt(0).toUpperCase() || "A"}
            </button>
            <button
              type="button"
              className="hidden min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-sm text-[#dee2e6] transition-colors hover:bg-white/[0.06] hover:text-white sm:flex"
              onClick={() => setProfileOpen(!profileOpen)}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/25 text-xs font-bold text-primary">
                {adminName.charAt(0).toUpperCase() || "A"}
              </div>
              <span className="hidden max-w-[8rem] truncate md:inline lg:max-w-none">{adminName}</span>
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 z-50 w-[min(100vw-1.5rem,16rem)] rounded-xl border border-white/10 bg-popover py-2 shadow-xl sm:top-10 sm:w-56">
                <div className="border-b border-white/10 px-4 py-2">
                  <p className="text-sm font-medium text-[#e6ecf0]">{adminName}</p>
                  <p className="text-xs text-[#a7acb1]">{adminEmail}</p>
                  <p className="mt-0.5 text-xs capitalize text-[#a7acb1]">{adminRole}</p>
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[#dee2e6] transition-colors hover:bg-white/[0.06]"
                  onClick={() => {
                    navigate("/settings");
                    setProfileOpen(false);
                  }}
                >
                  <User className="h-3.5 w-3.5" /> Settings
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-400 transition-colors hover:bg-white/[0.06]"
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
          className="gb-admin-scrollable min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 [scrollbar-gutter:stable]"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
