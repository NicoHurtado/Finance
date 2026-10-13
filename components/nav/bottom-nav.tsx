"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, ListOrdered, Wallet, BarChart3, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/lib/store/ui"

const LEFT = [
  { href: "/", label: "Home", icon: Home },
  { href: "/historial", label: "Historial", icon: ListOrdered },
]
const RIGHT = [
  { href: "/cuentas", label: "Cuentas", icon: Wallet },
  { href: "/analisis", label: "Análisis", icon: BarChart3 },
]

function NavLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string
  label: string
  Icon: typeof Home
  active: boolean
}) {
  return (
    <Link
      href={href}
      prefetch
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium tracking-[-0.005em] transition-colors",
        active
          ? "text-primary"
          : "text-muted-foreground"
      )}
    >
      <Icon className="size-5" strokeWidth={active ? 2.1 : 1.75} />
      {label}
    </Link>
  )
}

export function BottomNav() {
  const pathname = usePathname()
  const openQuickAdd = useUIStore((s) => s.openQuickAdd)
  return (
    <nav
      className="fixed inset-x-3 z-40 md:hidden"
      style={{ bottom: "max(env(safe-area-inset-bottom), 12px)" }}
    >
      <div className="glass relative flex h-16 items-center rounded-2xl border px-1">
        {LEFT.map((it) => (
          <NavLink
            key={it.href}
            href={it.href}
            label={it.label}
            Icon={it.icon}
            active={
              it.href === "/" ? pathname === "/" : pathname.startsWith(it.href)
            }
          />
        ))}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            aria-label="Añadir transacción"
            onClick={() => openQuickAdd()}
            className="absolute -top-6 left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_24px_-10px_rgba(11,37,69,0.7)] ring-4 ring-background transition active:scale-95"
          >
            <Plus className="size-6" />
          </button>
        </div>
        {RIGHT.map((it) => (
          <NavLink
            key={it.href}
            href={it.href}
            label={it.label}
            Icon={it.icon}
            active={pathname.startsWith(it.href)}
          />
        ))}
      </div>
    </nav>
  )
}
