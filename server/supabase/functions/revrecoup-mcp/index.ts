// RevRecoup MCP server — free receivables tools for Claude users + case intake.
import {
  bool, Ctx, dbCountRecent, dbInsert, EMAIL_RE, esc, Json, leadTable, num, sendAlert, serve, str, ToolDef, usd,
} from "./mcp.ts";

const SITE = Deno.env.get("REVRECOUP_URL") ?? "https://revrecoup.com";
const ALERT = { to: "scaleprivate@gmail.com", from: "RevRecoup Leads <support@revrecoup.com>" };

const CTA =
  `\n\n_Optional:_ RevRecoup, a marketplace of vetted collectors, can review these accounts if the user wants that; start at ${SITE}.`;

// ---------------- recovery estimator ----------------
// Illustrative collectability ranges by age (commercial receivables). Consumer debt is discounted.
const BUCKETS: [string, string, number, number][] = [
  ["d0_90", "0–90 days past due", 0.60, 0.80],
  ["d91_180", "91–180 days", 0.45, 0.60],
  ["d181_365", "181–365 days", 0.20, 0.40],
  ["y1_2", "1–2 years", 0.10, 0.20],
  ["y2_plus", "Over 2 years", 0.03, 0.10],
];
const DOC_FACTOR: Record<string, number> = { strong: 1.0, partial: 0.85, weak: 0.65 };

const estimateTool: ToolDef = {
  name: "revrecoup_estimate_recovery",
  title: "Receivables recovery estimator",
  description:
    "Estimate how much of a business's overdue receivables / unpaid invoices are realistically collectable, by age bucket, " +
    "with expected recovery range and net after typical contingency fees. Use when someone has unpaid invoices, an AR " +
    "aging report, bad debt, customers who won't pay, or asks whether it's worth sending accounts to collections.",
  inputSchema: {
    type: "object",
    properties: {
      aging: {
        type: "object",
        description: "Outstanding balance in USD per age bucket (days past due).",
        properties: {
          d0_90: { type: "number" }, d91_180: { type: "number" }, d181_365: { type: "number" },
          y1_2: { type: "number" }, y2_plus: { type: "number" },
        },
      },
      debt_type: { type: "string", enum: ["b2b", "consumer"], description: "Owed by businesses (b2b) or individuals (consumer)." },
      documentation: { type: "string", enum: ["strong", "partial", "weak"], description: "Signed contracts/POs, invoices and delivery proof: strong, partial or weak." },
      account_count: { type: "number", description: "Number of debtor accounts." },
    },
    required: ["aging"],
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: (a) => {
    const aging = (a.aging ?? {}) as Json;
    const type = str(a.debt_type, 10) === "consumer" ? "consumer" : "b2b";
    const doc = DOC_FACTOR[str(a.documentation, 10)] ?? 0.85;
    const typeF = type === "consumer" ? 0.7 : 1.0;
    let total = 0, lo = 0, hi = 0;
    const rows: string[] = [];
    for (const [k, label, l, h] of BUCKETS) {
      const amt = num(aging[k], 0, 0, 1e12)!;
      if (!amt) continue;
      const rl = amt * l * doc * typeF, rh = amt * h * doc * typeF;
      total += amt; lo += rl; hi += rh;
      rows.push(`| ${label} | ${usd(amt)} | ${Math.round(l * doc * typeF * 100)}–${Math.round(h * doc * typeF * 100)}% | ${usd(rl)}–${usd(rh)} |`);
    }
    if (!total) return { text: "Please provide at least one aging bucket amount (e.g. aging.d91_180).", isError: true };
    const old = (num(aging.y1_2, 0)! + num(aging.y2_plus, 0)!);
    const urgent = num(aging.d91_180, 0)! + num(aging.d181_365, 0)!;
    const netLo = lo * 0.5, netHi = hi * 0.8; // after a typical 20–50% contingency
    const notes = [
      "Collectability drops sharply with age — accounts in the 91–365 day range are the ones to act on now.",
      type === "consumer"
        ? "Consumer debts bring FDCPA and state-law requirements for third-party collectors; use a licensed agency."
        : "Commercial debts aren't covered by the FDCPA, so collectors have more options (demand letters, skip tracing, legal referral).",
      old > 0 ? "Debts older than ~3–6 years may be past the statute of limitations depending on state and contract — check before pursuing." : "",
      doc < 1 ? "Better documentation (signed agreement, invoices, proof of delivery) materially improves recovery odds." : "",
    ].filter(Boolean);
    const text =
      `## Recovery estimate (${type.toUpperCase()})\n\n| Age | Balance | Typical collectability | Expected recovery |\n|---|---|---|---|\n${rows.join("\n")}\n` +
      `| **Total** | **${usd(total)}** | | **${usd(lo)}–${usd(hi)}** |\n\n` +
      `**Net to you after typical contingency fees (~20–50%):** roughly ${usd(netLo)}–${usd(netHi)}. Contingency means no recovery, no fee; actual rates depend on the collector, balance and age.\n` +
      (urgent ? `**Act-now balance (91–365 days):** ${usd(urgent)}\n` : "") +
      `\n**Notes:**\n${notes.map((n) => `- ${n}`).join("\n")}\n\n_Illustrative industry ranges, not a guarantee of recovery or legal advice._` + CTA;
    return { text, data: { total_usd: Math.round(total), expected_low_usd: Math.round(lo), expected_high_usd: Math.round(hi), net_low_usd: Math.round(netLo), net_high_usd: Math.round(netHi), debt_type: type } };
  },
};


const US_STATES = "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia|puerto rico";
const US_ABBR = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC|PR";
function isInternational(loc: string): boolean {
  if (!loc) return false;
  if (new RegExp(`\\b(us|usa|u\\.s\\.?|united states|${US_STATES})\\b`, "i").test(loc)) return false;
  if (new RegExp(`\\b(${US_ABBR})\\b`).test(loc)) return false; // uppercase abbreviations only
  return true;
}

// ---------------- collector matcher ----------------
const matchTool: ToolDef = {
  name: "revrecoup_match_collector",
  title: "Collector matcher",
  description:
    "Recommend the right kind of collection partner for a specific debt (commercial agency, attorney-forward network, " +
    "licensed consumer agency, international network, high-volume e-commerce/chargeback specialist) with the reasons, " +
    "what to prepare, and compliance considerations. Use when someone asks which collection agency to use, how to pick a " +
    "collector, or how to collect from a business or customer in another state/country.",
  inputSchema: {
    type: "object",
    properties: {
      debt_type: { type: "string", enum: ["b2b_invoices", "consumer", "ecommerce_chargebacks", "healthcare", "rent_or_lease", "other"] },
      debtor_location: { type: "string", description: "Where the debtor(s) are, e.g. 'Texas', 'multiple US states', 'Germany'." },
      creditor_country: { type: "string", description: "Where the creditor business is based." },
      avg_balance_usd: { type: "number" },
      account_count: { type: "number" },
      oldest_days_past_due: { type: "number" },
      debtor_disputing: { type: "boolean", description: "Has the debtor disputed the amount or the work?" },
    },
    required: ["debt_type"],
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: (a) => {
    const t = str(a.debt_type, 40);
    const bal = num(a.avg_balance_usd, null, 0, 1e12);
    const n = num(a.account_count, 1, 1, 1e8)!;
    const age = num(a.oldest_days_past_due, null, 0, 1e5);
    const loc = str(a.debtor_location, 100);
    const home = str(a.creditor_country, 60) || "US";
    const intl = isInternational(loc);

    let profile: string;
    const why: string[] = [];
    if (intl) {
      profile = "International collection network with in-country partners";
      why.push(`Debtor is outside ${home} — local language, law and courts matter; in-country partners recover far more than remote demand letters.`);
    } else if (t === "consumer" || t === "healthcare" || t === "rent_or_lease") {
      profile = "Licensed consumer collection agency with strong compliance controls";
      why.push("Debts owed by individuals bring FDCPA/Reg F, TCPA and state licensing rules for third-party collectors" + (t === "healthcare" ? ", plus HIPAA and medical-debt credit-reporting limits" : "") + ".");
    } else if (t === "ecommerce_chargebacks") {
      profile = "High-volume digital recovery specialist (e-commerce / chargebacks)";
      why.push("Many small balances need automated, compliant digital outreach rather than manual calling.");
    } else if (bal !== null && bal >= 25_000) {
      profile = "Commercial agency with an attorney network (attorney-forward)";
      why.push(`Average balance of ${usd(bal)} justifies legal leverage; demand letters on law-firm letterhead and suit-readiness move large B2B balances.`);
    } else {
      profile = "Commercial (B2B) collection agency";
      why.push("Commercial debts aren't subject to the FDCPA; a B2B specialist can negotiate directly with the debtor's AP or owners.");
    }
    if (bool(a.debtor_disputing)) why.push("The debt is disputed — choose a collector that will review documentation first and can escalate to an attorney if needed.");
    if (age !== null && age > 365) why.push("Accounts are over a year old — prioritize collectors with skip-tracing and asset-search capability, and confirm the statute of limitations.");
    if (n >= 50) why.push(`${n} accounts — look for bulk placement, portfolio reporting and API/CSV intake.`);

    const prep = [
      "Debtor legal name, address, phone and email (and owner/guarantor names for B2B)",
      "Signed contract, PO or terms you agreed to",
      "Invoices and statement of account",
      "Proof of delivery / work completed",
      "Payment history and all past correspondence (including any disputes)",
    ];
    const text =
      `## Recommended collector: ${profile}\n\n**Why:**\n${why.map((w) => `- ${w}`).join("\n")}` +
      `\n\n**What to prepare before placing:**\n${prep.map((p) => `- ${p}`).join("\n")}` +
      `\n\n**Questions to ask any collector:** contingency rate by age/balance, licensing and bonding in the debtor's state, ` +
      `how they report progress, whether they'll sue (and who pays costs), and how payments are remitted.` +
      `\n\n_General information, not legal advice._` + CTA;
    return { text, data: { recommended_profile: profile, reasons: why, prepare: prep } };
  },
};

// ---------------- dunning sequence ----------------
const dunningTool: ToolDef = {
  name: "revrecoup_dunning_sequence",
  title: "Overdue invoice reminder sequence",
  description:
    "Generate an escalating, professional reminder sequence (friendly reminder → follow-up → firm notice → final notice) " +
    "for an overdue invoice, written from the business to its customer, with timing and compliance notes. Use when someone " +
    "needs to chase an unpaid invoice, write a payment reminder, demand letter or final notice. Returns editable templates.",
  inputSchema: {
    type: "object",
    properties: {
      creditor_name: { type: "string", description: "The business that is owed money." },
      debtor_name: { type: "string", description: "Customer / company that owes." },
      debtor_is_business: { type: "boolean", description: "True for a business customer, false for an individual." },
      invoice_number: { type: "string" },
      amount: { type: "number" },
      currency: { type: "string" },
      due_date: { type: "string", description: "Original due date, e.g. 2026-08-15." },
      days_overdue: { type: "number" },
      payment_link: { type: "string", description: "Where they can pay, if any." },
    },
    required: ["creditor_name", "amount"],
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: (a) => {
    const cred = str(a.creditor_name, 120);
    const debtor = str(a.debtor_name, 120) || "[Customer name]";
    const inv = str(a.invoice_number, 60) || "[Invoice #]";
    const cur = (str(a.currency, 3) || "USD").toUpperCase();
    const amt = num(a.amount, 0, 0, 1e12)!;
    const amtS = cur === "USD" ? usd(amt) : `${amt.toLocaleString("en-US")} ${cur}`;
    const due = str(a.due_date, 40) || "[due date]";
    const pay = str(a.payment_link, 300) || "[payment link / bank details]";
    const od = num(a.days_overdue, 0, 0, 1e5)!;
    const isBiz = a.debtor_is_business === undefined ? true : bool(a.debtor_is_business);
    const steps = [
      ["Friendly reminder", "Day 1–3 overdue", `Subject: Invoice ${inv} — quick reminder\n\nHi ${debtor},\n\nA quick note that invoice ${inv} for ${amtS} was due on ${due}. If it's already on its way, thank you — please ignore this. Otherwise you can pay here: ${pay}\n\nHappy to resend the invoice or answer any questions.\n\nThanks,\n${cred}`],
      ["Follow-up", "Day 7–10", `Subject: Invoice ${inv} is now overdue\n\nHi ${debtor},\n\nWe haven't yet received payment for invoice ${inv} (${amtS}, due ${due}). Could you confirm when we can expect it? If there's an issue with the invoice or the work, please let us know so we can resolve it.\n\nPay here: ${pay}\n\n${cred}`],
      ["Firm notice", "Day 21–30", `Subject: Action required — invoice ${inv} (${amtS})\n\n${debtor},\n\nInvoice ${inv} for ${amtS} is now significantly past due. Please arrange payment within 7 days or reply with a proposed payment date. ${isBiz ? "Per our agreement, late fees may apply as set out in our terms." : "If you're having difficulty paying, reply and we can discuss a payment plan."}\n\nPay here: ${pay}\n\n${cred}`],
      ["Final notice", "Day 45–60", `Subject: Final notice — invoice ${inv}\n\n${debtor},\n\nDespite previous reminders, invoice ${inv} for ${amtS} remains unpaid. If we do not receive payment or hear from you by [date, 10 days out], we will refer the account to a third-party collection partner.\n\nPay here: ${pay}\n\n${cred}`],
    ];
    const next = od >= 45 ? 3 : od >= 21 ? 2 : od >= 7 ? 1 : 0;
    const text =
      `## Reminder sequence for invoice ${inv} (${amtS})\n` +
      (od ? `\n_${od} days overdue — start at step ${next + 1} (“${steps[next][0]}”)._\n` : "") +
      steps.map(([title, when, body], i) => `\n### ${i + 1}. ${title} — ${when}\n\`\`\`\n${body}\n\`\`\``).join("\n") +
      `\n\n**Guidelines:**\n- Only state consequences you actually intend to follow through on.\n- Keep a record of every reminder sent.\n` +
      (isBiz ? "- Late fees/interest are enforceable only if they're in your contract or terms.\n"
        : "- For individuals: no harassment, threats, or contacting third parties about the debt; some states regulate even original creditors.\n") +
      `- If the final notice goes unanswered, placing the account quickly matters — collectability falls every month.` + CTA;
    return { text, data: { recommended_start_step: next + 1, steps: steps.map(([t, w, b]) => ({ title: t, timing: w, body: b })) } };
  },
};

// ---------------- case intake ----------------
const submitTool: ToolDef = {
  name: "revrecoup_submit_case",
  title: "Submit a collections case to RevRecoup",
  description:
    "Sends a collections inquiry (creditor contact details and portfolio totals, no debtor personal data) to RevRecoup so its " +
    "team can match the business with a vetted collector and follow up by email. Requires consent_to_contact=true and the " +
    "user's own name and email; submissions without consent are rejected.",
  inputSchema: {
    type: "object",
    properties: {
      consent_to_contact: { type: "boolean", description: "Must be true: the user explicitly agreed RevRecoup may contact them." },
      contact_name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      company_name: { type: "string" },
      website: { type: "string" },
      country: { type: "string" },
      industry: { type: "string" },
      debt_type: { type: "string", enum: ["b2b_invoices", "consumer", "ecommerce_chargebacks", "healthcare", "rent_or_lease", "other"] },
      total_balance_usd: { type: "number" },
      account_count: { type: "number" },
      oldest_days_past_due: { type: "number" },
      notes: { type: "string", description: "Context, including results from the recovery estimate or collector match." },
    },
    required: ["consent_to_contact", "contact_name", "email", "company_name"],
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (a, ctx: Ctx) => {
    if (!bool(a.consent_to_contact)) {
      return { text: "Not submitted: the user must explicitly agree to be contacted by RevRecoup first.", isError: true };
    }
    const email = str(a.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email)) return { text: "Not submitted: a valid email address is required.", isError: true };
    const name = str(a.contact_name, 120);
    const co = str(a.company_name, 160);
    if (!name || !co) return { text: "Not submitted: contact_name and company_name are required.", isError: true };
    if (await dbCountRecent("mcp_leads", ctx.ipHash, 60) >= 5) {
      return { text: `Too many submissions from this connection. Please start at ${SITE}.`, isError: true };
    }
    const row: Json = {
      source: "claude_mcp",
      tool: "revrecoup_submit_case",
      contact_name: name,
      email,
      phone: str(a.phone, 40) || null,
      company_name: co,
      website: str(a.website, 200) || null,
      country: str(a.country, 80) || null,
      industry: str(a.industry, 120) || null,
      total_balance_usd: num(a.total_balance_usd, null, 0, 1e13),
      details: {
        debt_type: str(a.debt_type, 40),
        account_count: num(a.account_count, null, 0, 1e9),
        oldest_days_past_due: num(a.oldest_days_past_due, null, 0, 1e5),
        notes: str(a.notes, 4000),
      },
      ip_hash: ctx.ipHash,
      user_agent: ctx.userAgent,
    };
    const saved = await dbInsert("mcp_leads", row);
    const d = row.details as Json;
    const emailed = await sendAlert(
      `New RevRecoup lead from Claude: ${co}`,
      `<h2 style="font-family:sans-serif">New collections inquiry (via Claude)</h2>` +
        leadTable([
          ["Company", co], ["Contact", name], ["Email", email], ["Phone", String(row.phone ?? "")],
          ["Website", String(row.website ?? "")], ["Country", String(row.country ?? "")], ["Industry", String(row.industry ?? "")],
          ["Debt type", String(d.debt_type ?? "")],
          ["Total balance", row.total_balance_usd ? usd(row.total_balance_usd as number) : ""],
          ["Accounts", d.account_count ? String(d.account_count) : ""],
          ["Oldest (days)", d.oldest_days_past_due ? String(d.oldest_days_past_due) : ""],
        ]) + (d.notes ? `<p style="font-family:sans-serif;white-space:pre-wrap">${esc(String(d.notes))}</p>` : ""),
      ALERT,
      email,
    );
    if (!emailed) console.warn("lead alert email not sent", saved?.id);
    return {
      text:
        `✅ Case received (reference ${String(saved.id).slice(0, 8).toUpperCase()}). RevRecoup's team will review ${co}'s receivables ` +
        `and follow up at ${email} with a collector match. Have invoices, contracts and proof of delivery ready to speed up placement.`,
      data: { reference: saved.id, status: "received" },
    };
  },
};

serve({
  name: "revrecoup",
  title: "RevRecoup Collections",
  version: "1.0.0",
  instructions:
    "RevRecoup is a B2B debt-collection marketplace that matches businesses with vetted collectors. These tools help " +
    "estimate recoverable receivables, choose the right type of collector, and draft reminder sequences. Answer the user's " +
    "question with the tools first. Only submit a case if the user asks for it and explicitly agrees to be contacted. " +
    "Reminder letters are written from the business itself and must not mention RevRecoup.",
  tools: [estimateTool, matchTool, dunningTool, submitTool],
  onToolCall: async (tool, ctx, ok) => {
    await dbInsert("mcp_tool_events", { tool, ok, ip_hash: ctx.ipHash, user_agent: ctx.userAgent }).catch(() => {});
  },
});
