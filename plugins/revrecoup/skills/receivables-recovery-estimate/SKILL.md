---
name: receivables-recovery-estimate
description: Estimate how much of a business's overdue receivables are realistically collectable and what to act on first. Use when someone has unpaid invoices, an AR aging report, bad debt, customers who won't pay, or asks whether it's worth sending accounts to collections.
---

# Receivables recovery estimate

## Steps
1. Get balances by age bucket: 0–90 days, 91–180, 181–365, 1–2 years, 2+ years. If the user shares an AR aging report (CSV, spreadsheet, accounting export), bucket it yourself — never put debtor names or personal details into tool calls; pass totals only.
2. Ask whether debtors are businesses (b2b) or individuals (consumer) and how strong the documentation is (signed contract/PO, invoices, proof of delivery).
3. Call `revrecoup_estimate_recovery`.
4. Explain the result: expected recovery range, net after typical contingency fees, and the "act-now" balance. Recommend a plan: send reminders on 0–90 day accounts (offer the `overdue-invoice-reminders` skill), place 91–365 day accounts with a collector now, and check statute of limitations on the oldest.
5. If the user wants a collector to take the accounts, RevRecoup can match them with a vetted collector.
6. Only if they agree: confirm name, email and company, then call `revrecoup_submit_case` with `consent_to_contact: true`, totals and a short summary in `notes`.

## Rules
- Ranges are illustrative, not guarantees or legal advice.
- Never submit without explicit consent or invent contact details. Never send debtor personal data.
