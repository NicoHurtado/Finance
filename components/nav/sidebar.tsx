"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, ListOrdered, Wallet, BarChart3, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { useExchangeRateStore } from "@/lib/store/exchange-rate"
import { useSettingsStore } from "@/lib/store/settings"

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/historial", label: "Historial", icon: ListOrdered },
  { href: "/cuentas", label: "Cuentas", icon: Wallet },
  { href: "/analisis", label: "Análisis", icon: BarChart3 },
]

export function Sidebar() {
  const pathname = usePathname()
  const userName = useSettingsStore((s) => s.userName)
  const usdToCop = useExchangeRateStore((s) => s.usdToCop)
  const trmDate = useExchangeRateStore((s) => s.trmDate)

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    // Full-page load so the next user can't inherit this user's in-memory stores.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login")
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 gap-1 border-r bg-sidebar p-3 md:flex md:flex-col">
      <div className="px-3 pt-2 pb-4">
        <div className="min-w-0">
          <div className="truncate text-[14px] leading-tight font-semibold tracking-[-0.01em]">
            {userName}
          </div>
          <div className="text-[11px] text-muted-foreground">Finanzas personales</div>
        </div>
      </div>
      <div className="px-3 pt-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        General
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        {ITEMS.map((it) => {
          const Icon = it.icon
          const active =
            it.href === "/" ? pathname === "/" : pathname.startsWith(it.href)
          return (
            <Link
              key={it.href}
              href={it.href}
              prefetch
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium tracking-[-0.005em] transition-colors",
                active
                  ? "coffee-nav-active"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" strokeWidth={active ? 2.1 : 1.75} />
              {it.label}
            </Link>
          )
        })}
      </div>
      {usdToCop && (
        <div
          className="mt-1 flex items-center justify-between rounded-lg border bg-card px-3 py-2.5"
          title={trmDate ? `TRM vigente ${trmDate}` : undefined}
        >
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              TRM
            </span>
            <span className="text-[13px] font-semibold tabular-nums">
              ${Math.round(usdToCop).toLocaleString("es-CO")}
            </span>
          </div>
          {trmDate && (
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {trmDate.slice(8, 10)}/{trmDate.slice(5, 7)}/{trmDate.slice(2, 4)}
            </span>
          )}
        </div>
      )}
      <div className="mt-1 border-t pt-1">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <LogOut className="size-3.5" />
          Salir
        </button>
      </div>
    </aside>
  )
}
