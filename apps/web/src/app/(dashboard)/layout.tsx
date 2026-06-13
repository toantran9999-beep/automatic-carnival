"use client";

import { useAuthStore } from "@/stores/auth-store";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  LayoutDashboard,
  UtensilsCrossed,
  ClipboardList,
  Grid3X3,
  ChefHat,
  Package,
  Wifi,
  Heart,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  Building2,
  Smartphone,
} from "lucide-react";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import { cn } from "@/lib/utils";
import { useOrgSettings, useBranches } from "@/hooks/use-settings";
import { NotificationBell } from "@/components/notification-bell";
import { useTranslation } from "@/stores/lang-store";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { ClockNow } from "@/components/clock-now";
import { TodaMark } from "@/components/toda-mark";
import { StationToggle } from "@/components/station-toggle";
import { StationProvider } from "@/components/station-provider";

interface NavGroup {
  label: string;
  items: { href: string; label: string; icon: React.ElementType }[];
}

interface Branch {
  id: string;
  name: string;
  slug: string;
  address: string | null;
}

const allowedPaths = {
  org_admin: new Set([
    "/dashboard",
    "/pos",
    "/orders",
    "/tables",
    "/kitchen",
    "/connections",
    "/menu",
    "/inventory",
    "/staff",
    "/payments",
    "/loyalty",
    "/reports",
    "/settings",
  ]),
  branch_manager: new Set([
    "/dashboard",
    "/pos",
    "/orders",
    "/tables",
    "/kitchen",
    "/connections",
    "/menu",
    "/inventory",
    "/staff",
    "/payments",
    "/loyalty",
    "/reports",
  ]),
  cashier: new Set(["/dashboard","/pos", "/orders", "/tables", "/payments"]),
  waiter: new Set(["/dashboard","/pos", "/orders", "/tables", "/connections", "/kitchen"]),
  kitchen: new Set(["/dashboard","/kitchen"]),
};

function getTranslatedNavGroups(t: any): NavGroup[] {
  return [
    {
      label: t("nav.general"),
      items: [{ href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard }],
    },
    {
      label: t("nav.operations"),
      items: [
        { href: "/pos", label: t("nav.pos"), icon: Smartphone },
        { href: "/orders", label: t("nav.orders"), icon: ClipboardList },
        { href: "/tables", label: t("nav.tables"), icon: Grid3X3 },
        { href: "/kitchen", label: t("nav.kitchen"), icon: ChefHat },
        { href: "/connections", label: t("nav.connections"), icon: Wifi },
        { href: "/menu", label: t("nav.menu"), icon: UtensilsCrossed },
      ],
    },
    {
      label: t("nav.management"),
      items: [
        { href: "/inventory", label: t("nav.inventory"), icon: Package },
        { href: "/staff", label: t("nav.staff"), icon: Users },
        { href: "/payments", label: t("nav.payments"), icon: CreditCard },
      ],
    },
    {
      label: t("nav.business"),
      items: [
        { href: "/loyalty", label: t("nav.loyalty"), icon: Heart },
        { href: "/reports", label: t("nav.reports"), icon: BarChart3 },
        { href: "/settings", label: t("nav.settings"), icon: Settings },
      ],
    },
  ];
}

function getFilteredNavGroups(role: string | undefined, t: any): NavGroup[] {
  const allowed = allowedPaths[role as keyof typeof allowedPaths] || allowedPaths.org_admin;
  return getTranslatedNavGroups(t)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowed.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);
}

function getRoleLabel(role: string, t: any) {
  switch (role) {
    case "owner":
      return t("nav.role_owner");
    case "org_admin":
      return t("nav.role_admin");
    case "branch_manager":
      return t("nav.role_manager");
    case "cashier":
      return t("nav.role_cashier");
    case "waiter":
      return t("nav.role_waiter");
    case "kitchen":
      return t("nav.role_kitchen");
    default:
      return t("nav.role_staff");
  }
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, accessToken, isAuthenticated, logout, selectedBranchId, setSelectedBranch } =
    useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useTranslation();

  const queryClient = useQueryClient();

  const hasSession = !!user && !!accessToken;
  const { data: org } = useOrgSettings({ enabled: hasSession });
  const { data: branches } = useBranches({ enabled: hasSession });
  const availableBranches = branches ?? [];
  const canSwitchBranch = availableBranches.length > 1;

  const currentBranch = availableBranches.find((branch: Branch) => branch.id === selectedBranchId);

  const handleBranchChange = useCallback(
    (branchId: string) => {
      if (branchId === selectedBranchId) return;
      setSelectedBranch(branchId);
      queryClient.invalidateQueries();
    },
    [selectedBranchId, setSelectedBranch, queryClient],
  );

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (availableBranches.length === 0) return;

    const selectedBranchStillAllowed = selectedBranchId
      ? availableBranches.some((branch: Branch) => branch.id === selectedBranchId)
      : false;

    if (!selectedBranchStillAllowed) {
      setSelectedBranch(availableBranches[0].id);
      queryClient.invalidateQueries();
    }
  }, [availableBranches, selectedBranchId, setSelectedBranch, queryClient]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const orgName = org?.name || "TODA POS";

  const filteredNavGroups = getFilteredNavGroups(user.role, t);
  const allFilteredItems = filteredNavGroups.flatMap((g) => g.items);
  const mobileNavItems = allFilteredItems.slice(0, 5);

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Trạm in tại quầy: nghe order:new & tự in (chỉ khi máy này bật trạm) */}
      <StationProvider />
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r bg-sidebar transition-all duration-300 relative",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        {/* Brand header */}
        <div className="h-14 flex items-center gap-3 px-4 border-b border-sidebar-border">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <TodaMark size={20} />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight">
                {orgName}
              </p>
              <p className="text-[11px] text-muted-foreground truncate leading-tight">
                {t("nav.restaurantMgmt")}
              </p>
            </div>
          )}
        </div>

        {/* Branch selector */}
        {!collapsed && canSwitchBranch && (
          <div className="px-3 py-2 border-b border-sidebar-border">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              {t("nav.activeBranch")}
            </label>
            <Select value={selectedBranchId || undefined} onValueChange={handleBranchChange}>
              <SelectTrigger className="h-auto text-xs bg-sidebar-accent/50 text-sidebar-foreground border-sidebar-border py-1.5 focus:ring-sidebar-ring">
                <SelectValue placeholder={t("nav.selectBranch")} />
              </SelectTrigger>
              <SelectContent>
                {availableBranches.map((branch: Branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Branch name display (single branch or collapsed) */}
        {!collapsed && availableBranches.length === 1 && currentBranch && (
          <div className="px-3 py-2 border-b border-sidebar-border">
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">
                {currentBranch.name}
              </span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {filteredNavGroups.map((group) => (
            <div key={group.label} className="mb-1">
              {!collapsed && (
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 pt-3 pb-1">
                  {group.label}
                </p>
              )}
              {collapsed && group.label !== t("nav.general") && (
                <div className="mx-2 my-2 border-t border-sidebar-border" />
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md text-[13px] transition-colors relative",
                        collapsed
                          ? "justify-center px-0 py-2.5 mx-auto w-10"
                          : "px-3 py-2",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-sidebar-primary rounded-r-full" />
                      )}
                      <item.icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft
            className={cn(
              "h-3 w-3 transition-transform",
              collapsed && "rotate-180"
            )}
          />
        </button>

        {/* User footer */}
        <div className="border-t border-sidebar-border p-2">
          {!collapsed ? (
            <div className="flex items-center gap-3 rounded-md px-2 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground text-xs font-medium uppercase">
                {user.name?.charAt(0) || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-sidebar-foreground truncate leading-tight">
                  {user.name}
                </p>
                <p className="text-[11px] text-muted-foreground truncate leading-tight">
                  {getRoleLabel(user.role, t)}
                </p>
              </div>
              <button
                onClick={handleLogout}
                title={t("nav.logout")}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground text-xs font-medium uppercase">
                {user.name?.charAt(0) || "?"}
              </div>
              <button
                onClick={handleLogout}
                title={t("nav.logout")}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header
          className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex items-center justify-between h-14 px-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
              <span className="font-semibold md:hidden">{orgName}</span>
            </div>

            <div className="flex items-center gap-3">
              {/* Trạm in tại quầy (theo thiết bị) */}
              <StationToggle />
              {/* Real-time clock */}
              <ClockNow />
              {/* Appearance (theme + accent) */}
              <ThemeSwitcher />
              {/* Language Switcher */}
              <LanguageSwitcher />

              {/* Mobile branch selector */}
              {canSwitchBranch && (
                <div className="md:hidden">
                    <Select value={selectedBranchId || undefined} onValueChange={handleBranchChange}>
                      <SelectTrigger className="h-auto text-xs py-1.5 w-auto min-w-[8rem]">
                        <SelectValue placeholder={t("nav.selectBranch")} />
                      </SelectTrigger>
                    <SelectContent>
                      {availableBranches.map((branch: Branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* Current branch badge on desktop */}
              {currentBranch && (
                <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>{currentBranch.name}</span>
                </div>
              )}
              <NotificationBell />
              <div className="hidden md:flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {user.name}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <div
              className="fixed inset-y-0 left-0 w-72 bg-sidebar border-r shadow-xl flex flex-col"
              style={{ paddingTop: "env(safe-area-inset-top)" }}
            >
              {/* Mobile header */}
              <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <TodaMark size={20} />
                  </div>
                  <span className="font-semibold text-sm text-sidebar-foreground">
                    {orgName}
                  </span>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Mobile branch selector */}
              {canSwitchBranch && (
                <div className="px-3 py-2 border-b border-sidebar-border">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                    {t("nav.activeBranch")}
                  </label>
                  <Select value={selectedBranchId || undefined} onValueChange={handleBranchChange}>
                    <SelectTrigger className="h-auto text-xs bg-sidebar-accent/50 text-sidebar-foreground border-sidebar-border py-1.5 focus:ring-sidebar-ring">
                      <SelectValue placeholder={t("nav.selectBranch")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBranches.map((branch: Branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {currentBranch && availableBranches.length <= 1 && (
                <div className="px-3 py-2 border-b border-sidebar-border">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">
                      {currentBranch.name}
                    </span>
                  </div>
                </div>
              )}

              {/* Mobile nav */}
              <nav className="flex-1 overflow-y-auto py-2 px-2">
                {filteredNavGroups.map((group) => (
                  <div key={group.label} className="mb-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 pt-3 pb-1">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const active = isActive(pathname, item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors relative",
                              active
                                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                            )}
                          >
                            {active && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-sidebar-primary rounded-r-full" />
                            )}
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              {/* Mobile user footer */}
              <div className="border-t border-sidebar-border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground text-xs font-medium uppercase">
                    {user.name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-sidebar-foreground truncate">
                      {user.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {getRoleLabel(user.role, t)}
                    </p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-28 md:pb-6">{children}</main>

        {/* Mobile bottom nav */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t z-40"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-around h-16">
            {mobileNavItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                    active
                      ? "text-primary font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
