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
