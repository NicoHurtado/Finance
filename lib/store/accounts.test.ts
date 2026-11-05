import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAccountsStore } from "./accounts"
import type { Account } from "../types"

const account: Account = {
  id: "debit-1",
  type: "debit",
  name: "Mi tarjeta",
  institution: "Banco",
  currency: "COP",
  initialBalance: 100,
  createdAt: "2026-01-01",
}

beforeEach(() => {
  useAccountsStore.setState({
    accounts: [],
    activeAccounts: [],
    loaded: false,
    isHydrating: false,
  })
  useAccountsStore.getState().seed([account])
})
afterEach(() => vi.unstubAllGlobals())

describe("Home account visibility", () => {
  it("keeps existing accounts visible by default", () => {
    expect(useAccountsStore.getState().activeAccounts[0].showOnHome).not.toBe(
      false
    )
  })

  it("persists visibility without removing the account or changing its balance", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ ...account, showOnHome: false }))
    vi.stubGlobal("fetch", fetchMock)
    await useAccountsStore.getState().setHomeVisibility(account.id, false)
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/accounts/${account.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ showOnHome: false }),
      })
    )
    expect(useAccountsStore.getState().activeAccounts).toEqual([
      { ...account, showOnHome: false },
    ])

    fetchMock.mockResolvedValue(
      Response.json([{ ...account, showOnHome: false }])
    )
    await useAccountsStore.getState().refresh()
    expect(useAccountsStore.getState().activeAccounts[0].showOnHome).toBe(false)

    fetchMock.mockResolvedValue(Response.json({ ...account, showOnHome: true }))
    await useAccountsStore.getState().setHomeVisibility(account.id, true)
    expect(useAccountsStore.getState().activeAccounts[0].showOnHome).toBe(true)
  })

  it.each([500, 401])(
    "preserves visibility if saving fails with %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status }))
      )
      await expect(
        useAccountsStore.getState().setHomeVisibility(account.id, false)
      ).rejects.toThrow()
      expect(useAccountsStore.getState().activeAccounts).toEqual([account])
    }
  )

  it("does not report success for a missing account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(null)))
    await expect(
      useAccountsStore.getState().setHomeVisibility(account.id, false)
    ).rejects.toThrow()
    expect(useAccountsStore.getState().activeAccounts).toEqual([account])
  })
})

describe("Account order", () => {
  const card = (id: string, extra: Partial<Account> = {}) =>
    ({ ...account, id, type: "credit", createdAt: `2026-01-0${id.length}`, ...extra }) as Account

  it("sorts by type, then the chosen order, then creation date", () => {
    useAccountsStore.setState({ loaded: false })
    useAccountsStore.getState().seed([
      account,
      card("c1"),
      card("c22", { sortOrder: 0 }),
      card("c333"),
    ])
    expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual([
      "c22",
      "c1",
      "c333",
      "debit-1",
    ])
  })

  it("saves the new order and keeps it", async () => {
    useAccountsStore.setState({ loaded: false })
    useAccountsStore.getState().seed([card("a"), card("bb")])
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)
    await useAccountsStore.getState().reorder(["bb", "a"])
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/accounts/order",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ ids: ["bb", "a"] }) })
    )
    expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual(["bb", "a"])
  })

  it("restores the previous order when saving fails", async () => {
    useAccountsStore.setState({ loaded: false })
    useAccountsStore.getState().seed([card("a"), card("bb")])
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })))
    await expect(useAccountsStore.getState().reorder(["bb", "a"])).rejects.toThrow()
    expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual(["a", "bb"])
  })
})
