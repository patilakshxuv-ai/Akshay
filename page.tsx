import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getLeads, getLeadStats } from "@/app/actions/leads"
import { AppHeader } from "@/components/app-header"
import { LeadStats } from "@/components/lead-stats"
import { LeadsView } from "@/components/leads-view"

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const [leads, stats] = await Promise.all([getLeads(), getLeadStats()])

  return (
    <div className="min-h-svh bg-background">
      <AppHeader name={session.user.name ?? ""} email={session.user.email} />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
            Leads
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Search, qualify, and track every prospect through your pipeline.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <LeadStats stats={stats} />
          <LeadsView leads={leads} />
        </div>
      </main>
    </div>
  )
}
