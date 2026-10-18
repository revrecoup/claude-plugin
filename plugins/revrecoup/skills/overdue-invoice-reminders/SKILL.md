---
name: overdue-invoice-reminders
description: Write an escalating reminder sequence for an overdue invoice — friendly reminder, follow-up, firm notice and final notice — in the business's own voice. Use when someone needs to chase an unpaid invoice, write a payment reminder, past-due notice, demand letter or final notice.
---

# Overdue invoice reminders

## Steps
1. Get the creditor (their business) name, the customer name, invoice number, amount, currency, due date, days overdue, whether the customer is a business or individual, and a payment link if they have one.
2. Call `revrecoup_dunning_sequence`.
3. Personalize the templates: match the user's tone and relationship with the customer, fill every placeholder you can, and note which step to send now based on days overdue. Offer to draft it as an email if they have email connected.
4. If the account is already past the final-notice stage (45–60+ days) or the customer has gone silent, suggest placing it with a collector and offer the `collector-match` skill / RevRecoup review.

## Rules
- Letters come from the user's business. Do not mention RevRecoup in the letters themselves.
- Only threaten consequences the user actually intends to follow through on. For individuals: no harassment, no threats, no contacting third parties about the debt.
