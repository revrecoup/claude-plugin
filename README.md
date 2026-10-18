# RevRecoup for Claude

Free accounts-receivable tools inside Claude — and a direct line to RevRecoup's vetted collector network when you need it.

| Tool | What it does |
|---|---|
| **Recovery estimator** | Upload or describe your AR aging → expected recovery by age bucket, net after fees, what to act on now |
| **Collector matcher** | Tells you which kind of collector fits your debt (commercial, attorney-forward, consumer-licensed, international, e-commerce) and what to prepare |
| **Overdue-invoice reminders** | Writes a 4-step reminder sequence, from a friendly nudge to a final notice, in your business's voice |
| **Submit a case** | With your permission, sends a summary to RevRecoup so the team can match you with a collector |

## Install

**Claude.ai / Claude Desktop (any plan with custom connectors)**
Settings → Connectors → *Add custom connector*
- Name: `RevRecoup`
- URL: `https://cklperszmqyhlofhpyhm.supabase.co/functions/v1/revrecoup-mcp`

**Claude Code / Cowork (plugin with skills)**
```
/plugin marketplace add revrecoup/claude-plugin
/plugin install revrecoup@revrecoup
```

Then just ask: *"I have $180k in unpaid invoices, about half over 90 days. What can I realistically recover?"*

## Privacy
Full policy: https://revrecoup.com/privacy

The calculator code does not save the business inputs you provide. Tool-usage records include the tool name, success status, timestamp, a hash derived from the request IP address, and the user-agent string. Contact and case details are saved and sent to RevRecoup only when you explicitly ask Claude to submit a case and consent to contact. Never include debtor personal data in a submission; totals are enough.

---

## Operator notes (RevRecoup internal)

- Server: `server/supabase/functions/revrecoup-mcp/` (deployed to Supabase project `cklperszmqyhlofhpyhm`, verify_jwt off, public MCP endpoint)
- Leads: `public.mcp_leads` (status: new/contacted/qualified/won/lost/spam). Usage: `public.mcp_tool_events`
- Email alerts: set edge-function secret `RESEND_API_KEY` (optional `LEAD_ALERT_TO`, `LEAD_ALERT_FROM`; defaults: scaleprivate@gmail.com, support@revrecoup.com)
  `supabase secrets set RESEND_API_KEY=re_xxx --project-ref cklperszmqyhlofhpyhm`
- Redeploy: `supabase functions deploy revrecoup-mcp --no-verify-jwt --project-ref cklperszmqyhlofhpyhm`

```sql
-- New leads
select created_at, company_name, contact_name, email, phone, total_balance_usd, details
from mcp_leads where status = 'new' order by created_at desc;
-- Weekly usage by tool
select date_trunc('week', created_at) wk, tool, count(*) from mcp_tool_events group by 1,2 order by 1 desc, 3 desc;
```
