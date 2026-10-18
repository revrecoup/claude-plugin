---
name: collector-match
description: Recommend the right kind of collection partner for a specific debt and how to prepare. Use when someone asks which collection agency to use, how to choose a debt collector, how to collect from a business or customer in another state or country, or what to do about a large disputed invoice.
---

# Collector match

## Steps
1. Establish: debt type (B2B invoices, consumer, e-commerce/chargebacks, healthcare, rent/lease), where debtors are located, average balance, number of accounts, age, and whether the debt is disputed.
2. Call `revrecoup_match_collector`.
3. Explain the recommended collector profile and why, the documents to gather, and the questions to ask any collector before signing.
4. If the user wants an introduction, RevRecoup can match them with a vetted collector of that type.
5. Only with explicit consent and real contact details, call `revrecoup_submit_case` with totals (no debtor personal data) and the match summary in `notes`.

## Rules
- General information, not legal advice. For consumer debts, flag that FDCPA/Reg F and state licensing apply to third-party collectors.
