"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { leads, type NewLead } from "@/lib/db/schema"
import { and, desc, eq, ilike, or, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

export const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

function clampScore(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function normalizeStatus(value: unknown): LeadStatus {
  return LEAD_STATUSES.includes(value as LeadStatus) ? (value as LeadStatus) : "new"
}

export async function getLeads(params?: { search?: string; status?: string }) {
  const userId = await getUserId()

  const conditions = [eq(leads.userId, userId)]

  if (params?.status && params.status !== "all") {
    conditions.push(eq(leads.status, normalizeStatus(params.status)))
  }

  if (params?.search) {
    const term = `%${params.search}%`
    const searchCondition = or(
      ilike(leads.name, term),
      ilike(leads.company, term),
      ilike(leads.email, term),
      ilike(leads.industry, term),
    )
    if (searchCondition) conditions.push(searchCondition)
  }

  return db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.score), desc(leads.createdAt))
}

export async function getLeadStats() {
  const userId = await getUserId()

  const rows = await db
    .select({ status: leads.status, count: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.userId, userId))
    .groupBy(leads.status)

  const byStatus: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    byStatus[row.status] = row.count
    total += row.count
  }

  const won = byStatus["won"] ?? 0
  const closed = won + (byStatus["lost"] ?? 0)
  const winRate = closed > 0 ? Math.round((won / closed) * 100) : 0

  return { total, byStatus, won, winRate }
}

export async function createLead(input: Omit<NewLead, "id" | "userId" | "createdAt" | "updatedAt">) {
  const userId = await getUserId()

  if (!input.name?.trim() || !input.company?.trim()) {
    throw new Error("Name and company are required")
  }

  await db.insert(leads).values({
    userId,
    name: input.name.trim(),
    company: input.company.trim(),
    title: input.title?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    website: input.website?.trim() || null,
    industry: input.industry?.trim() || null,
    location: input.location?.trim() || null,
    source: input.source?.trim() || null,
    status: normalizeStatus(input.status),
    score: clampScore(input.score),
    notes: input.notes?.trim() || null,
  })

  revalidatePath("/")
}

export async function updateLead(
  id: number,
  input: Partial<Omit<NewLead, "id" | "userId" | "createdAt" | "updatedAt">>,
) {
  const userId = await getUserId()

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.company !== undefined) patch.company = input.company.trim()
  if (input.title !== undefined) patch.title = input.title?.trim() || null
  if (input.email !== undefined) patch.email = input.email?.trim() || null
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
  if (input.website !== undefined) patch.website = input.website?.trim() || null
  if (input.industry !== undefined) patch.industry = input.industry?.trim() || null
  if (input.location !== undefined) patch.location = input.location?.trim() || null
  if (input.source !== undefined) patch.source = input.source?.trim() || null
  if (input.status !== undefined) patch.status = normalizeStatus(input.status)
  if (input.score !== undefined) patch.score = clampScore(input.score)
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null

  await db
    .update(leads)
    .set(patch)
    .where(and(eq(leads.id, id), eq(leads.userId, userId)))

  revalidatePath("/")
}

export async function updateLeadStatus(id: number, status: string) {
  const userId = await getUserId()
  await db
    .update(leads)
    .set({ status: normalizeStatus(status), updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.userId, userId)))
  revalidatePath("/")
}

export async function deleteLead(id: number) {
  const userId = await getUserId()
  await db.delete(leads).where(and(eq(leads.id, id), eq(leads.userId, userId)))
  revalidatePath("/")
}

export async function seedDemoLeads() {
  const userId = await getUserId()

  const existing = await db.select({ id: leads.id }).from(leads).where(eq(leads.userId, userId)).limit(1)
  if (existing.length > 0) return

  const demo: Array<Omit<NewLead, "id" | "userId" | "createdAt" | "updatedAt">> = [
    { name: "Sarah Chen", company: "Northwind Analytics", title: "VP of Marketing", email: "sarah.chen@northwind.io", phone: "+1 415 555 0142", website: "northwind.io", industry: "SaaS", location: "San Francisco, CA", source: "LinkedIn", status: "qualified", score: 88, notes: "Warm intro from a mutual connection. Evaluating for Q3." },
    { name: "Marcus Reed", company: "Atlas Logistics", title: "Head of Operations", email: "m.reed@atlaslog.com", phone: "+1 312 555 0199", website: "atlaslog.com", industry: "Logistics", location: "Chicago, IL", source: "Webinar", status: "contacted", score: 64, notes: "Attended the automation webinar, asked about API access." },
    { name: "Priya Nair", company: "BrightLeaf Health", title: "Director of Growth", email: "priya@brightleaf.health", phone: "+1 617 555 0110", website: "brightleaf.health", industry: "Healthcare", location: "Boston, MA", source: "Referral", status: "proposal", score: 92, notes: "Proposal sent. Decision expected within two weeks." },
    { name: "Diego Alvarez", company: "Vela Robotics", title: "CTO", email: "diego@velarobotics.com", phone: "+1 512 555 0175", website: "velarobotics.com", industry: "Hardware", location: "Austin, TX", source: "Cold Email", status: "new", score: 41, notes: "Replied asking for a one-pager." },
    { name: "Emma Thompson", company: "Cedar & Co", title: "Founder", email: "emma@cedarandco.com", phone: "+44 20 5550 0133", website: "cedarandco.com", industry: "Retail", location: "London, UK", source: "Event", status: "won", score: 100, notes: "Signed annual contract. Onboarding scheduled." },
    { name: "Kenji Watanabe", company: "Sakura Fintech", title: "Product Lead", email: "kenji@sakurafin.jp", phone: "+81 3 5550 0188", website: "sakurafin.jp", industry: "Fintech", location: "Tokyo, JP", source: "Inbound", status: "contacted", score: 57, notes: "Requested pricing for enterprise tier." },
    { name: "Olivia Bennett", company: "Summit Media", title: "CMO", email: "olivia@summitmedia.co", phone: "+1 206 555 0166", website: "summitmedia.co", industry: "Media", location: "Seattle, WA", source: "LinkedIn", status: "lost", score: 22, notes: "Went with a competitor this cycle. Revisit next year." },
    { name: "Liam O'Connor", company: "GreenGrid Energy", title: "VP Sales", email: "liam@greengrid.energy", phone: "+353 1 555 0121", website: "greengrid.energy", industry: "Energy", location: "Dublin, IE", source: "Referral", status: "qualified", score: 79, notes: "Strong budget fit. Scheduling a technical demo." },
  ]

  await db.insert(leads).values(demo.map((d) => ({ ...d, userId })))
  revalidatePath("/")
}
