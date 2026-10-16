import type { LandingDictionary } from "./landing.es"

const landing: LandingDictionary = {
  meta: {
    title: "OpenCircle · Savings circles and payment gateway powered by Open Payments",
    description:
      "Collaborative savings and cross-border settlement on Open Payments and Interledger (ILP). Transparent ledger, GNAP interactive consent, and Rafiki verified settlement.",
    ogAlt: "OpenCircle: collaborative savings and open payments",
  },
  nav: {
    how: "How it works",
    benefits: "Benefits",
    safety: "Safety",
    faq: "FAQ",
    cta: "Explore the demo",
    label: "Main navigation",
    menu: "Open menu",
    close: "Close menu",
    home: "OpenCircle home",
    language: "Language",
    switchTo: "Español",
  },
  hero: {
    eyebrow: "Financial gateway and savings circles on Open Payments",
    titleStart: "Collaborative savings and payments ",
    titleHighlight: "with instant global settlement.",
    lead: "Run your savings circles with friends or receive cross-border payouts. Connect your Wallet Address, authorize securely via GNAP interactive grants, and settle in seconds via Rafiki and Interledger.",
    primary: "Explore the demo",
    secondary: "See how it works",
    micro: "Open Payments Standard · Interledger Protocol · Verified Settlement",
    dashboard: {
      label: "Preview of the OpenCircle dashboard with real-time settlement",
      heading: "Active circle · Open Payments",
      circle: "Trip Circle 2026",
      status: "Round 2 of 5 · Settle via Rafiki",
      contribution: "Per-round contribution",
      participants: "Members",
      people: "{count} wallets",
      pool: "Settlement pool",
      progress: "{confirmed} of {total} debits confirmed",
      activity: "Ledger activity",
      confirmed: "Settled via ILP",
      pending: "Awaiting GNAP",
      times: ["2 min ago", "1 h ago", "yesterday", "yesterday"],
      receives: "Receives this round",
      notifyPaid: "María authorized and settled payment",
      notifyNext: "Next turn: Carlos",
      sample: "Testnet demonstration",
    },
  },
  trust: [
    "Instant settlement via Interledger",
    "GNAP secure interactive consent",
    "Cryptographic verification with Rafiki",
  ],
  benefits: {
    title: "Collaborative finance with mathematical precision.",
    lead: "No more chasing payments on WhatsApp, keeping tabs in spreadsheets, or relying on opaque legacy banks.",
    kicker: "Interoperability without borders.",
    cards: [
      {
        title: "Connect your open Wallet Address",
        body: "Join or receive using any Open Payments compatible wallet ($wallet/user). Zero lock-in to a single platform.",
      },
      {
        title: "GNAP interactive consent",
        body: "Every debit requires explicit consent with immutable spending limits. Zero surprises or unauthorized debits.",
      },
      {
        title: "Real-time ledger transparency",
        body: "Inspect every settled debit, assigned turn, and verifiable payment state machine end-to-end.",
      },
      {
        title: "Rafiki-verified settlement",
        body: "Funds are released only when every debit is cryptographically verified through signed Rafiki webhooks.",
      },
    ],
    mock: {
      payTitle: "Debit authorized",
      payTo: "To: Trip Circle 2026 ($circle/trip)",
      payFrom: "From your Wallet Address",
      payDone: "Settled",
      you: "You",
      round: "Round {n}",
      now: "Now",
      next: "Next",
      feedTitle: "Ledger activity",
      feedPaid: "settled",
      ruleAll: "{n} of {n} payments verified",
      ruleCheck: "Rafiki webhook signature valid",
      ruleRelease: "Payout settled to Andrés via ILP",
    },
  },
  how: {
    title: "Four steps to operate on OpenCircle.",
    lead: "A guided, transparent flow built on the open standard of Open Payments.",
    steps: [
      {
        title: "1. Connect your Wallet Address",
        body: "Enter your financial handle ($wallet.dev/user) to link payments without disclosing sensitive bank credentials.",
      },
      {
        title: "2. Define rules and members",
        body: "Set the per-round contribution in integer units, the order of turns, and immutable conditions for the circle.",
      },
      {
        title: "3. Authorize via GNAP grant",
        body: "Each cycle requests interactive authorization directly in your wallet with pre-agreed maximum caps.",
      },
      {
        title: "4. Direct settlement via Rafiki",
        body: "Once all contributions are confirmed, the Rafiki connector automatically settles to the recipient via Interledger.",
      },
    ],
    mock: {
      name: "Circle handle",
      amount: "Cycle contribution",
      invite: "Payment wallet ($circle)",
      copied: "Copied",
      received: "Settled to your wallet",
    },
  },
  calc: {
    title: "Simulate your savings circle.",
    lead: "Calculate with integer precision and zero floats the exact payout you will receive on your turn.",
    participants: "Member wallets",
    fewer: "Remove a member",
    more: "Add a member",
    contribution: "Contribution per member (COP)",
    presets: "Suggested amounts",
    fee: "Illustrative fee",
    feeBadge: "Sample",
    feeHelp: "Sample value for testnet experimentation.",
    payoutLabel: "You receive on your turn",
    total: "Total pot per round",
    feeLine: "Illustrative network cost ({rate})",
    payoutLine: "Estimated net settlement",
    summary: "Each member contributes {each} per cycle across {n} cycles ({total} in total) and receives {payout} on their turn.",
    note: "Illustrative calculation with integer units. Final fees and settlement depend on the Rafiki testnet connector.",
    errorAmount: "Enter an amount between $ 1,000 and $ 10,000,000.",
    breakdown: "Round pot breakdown",
  },
  safety: {
    title: "Security and decentralized custody.",
    lead: "OpenCircle is engineered under least privilege, cryptographic signatures, and zero opaque fund retention.",
    items: [
      {
        title: "Custody on Interledger (ILP)",
        body: "OpenCircle never holds user balances in pooled accounts. Payments route directly between compatible wallets.",
      },
      {
        title: "Cryptographically verified payouts",
        body: "A round is only marked completed after receiving and validating the HMAC signature on the Rafiki webhook.",
      },
      {
        title: "Deterministic idempotency",
        body: "Every fund movement request carries a unique idempotency key, preventing duplicate charges or race conditions.",
      },
      {
        title: "Cryptographic isolation",
        body: "Signing keys and Open Payments SDK clients operate strictly within isolated, server-only environments.",
      },
    ],
    disclaimer: "Technical demonstration on testnet. OpenCircle operates with Open Payments standards and simulated Rafiki settlement.",
  },
  useCases: {
    title: "Payment solutions for communities and merchants.",
    lead: "Engineered for trust-based collaborative funds, merchant checkouts, and frictionless cross-border payments.",
    cards: [
      {
        tag: "Community Savings",
        title: "Savings circles & mutual funds",
        body: "Group contributions with transparent turns and non-custodial settlement powered by Interledger Protocol.",
        metric: "100% on-ledger auditable",
      },
      {
        tag: "Global Merchant",
        title: "Checkout & direct creator payouts",
        body: "Issue Incoming Payment links with sub-second finality and zero abusive interchange fees.",
        metric: "Settlement in < 250ms",
      },
      {
        tag: "ILP Interoperability",
        title: "Multi-asset cross-border settlement",
        body: "Direct transfers across currencies and wallets over STREAM packets with zero foreign-exchange lock-in.",
        metric: "Open STREAM protocol",
      },
    ],
  },
  faq: {
    title: "Frequently asked questions",
    items: [
      {
        q: "What is OpenCircle?",
        a: "OpenCircle is a collaborative financial suite and payment gateway built on the Open Payments standard and Interledger Protocol (ILP) with Rafiki settlement.",
      },
      {
        q: "How is money custodied?",
        a: "OpenCircle is not a traditional custodian. Funds reside in Open Payments enabled wallets and are routed peer-to-peer via Interledger.",
      },
      {
        q: "What is a Wallet Address?",
        a: "It is an open identifier formatted like a URL (e.g. $ilp.rafiki.money/my-account) allowing interoperable transfers without exposing bank account details.",
      },
      {
        q: "How do I authorize payments?",
        a: "Every debit requires interactive consent via GNAP (Grant Negotiation and Authorization Protocol), where you explicitly approve the exact amount in your wallet.",
      },
      {
        q: "What if a member does not pay?",
        a: "The round is not settled until every debit is confirmed. The protocol protects the group by disallowing premature payouts.",
      },
      {
        q: "Are there fees?",
        a: "Open Payments operates with minimal network overhead. In this demo, sample rates are displayed for illustration.",
      },
      {
        q: "Can I use real money today?",
        a: "Not yet. OpenCircle runs on testnet with simulated assets to benchmark security, stability, and Rafiki connector integration.",
      },
    ],
  },
  finalCta: {
    title: "Build your financial circle today.",
    lead: "Connect your Wallet Address. Organize your capital. Experience instant payments on open standards.",
    primary: "Explore the demo",
    secondary: "Create a test circle",
    note: "Built on Open Payments, Interledger Protocol, and Rafiki.",
  },
  footer: {
    tagline: "Collaborative savings and payments on Open Payments.",
    navTitle: "Product",
    legalTitle: "Legal",
    demo: "Explore the demo",
    privacy: "Privacy",
    terms: "Terms",
    disclosure: "OpenCircle is an active prototype on Open Payments and Rafiki. Uses testnet assets and does not custody real fiat money.",
    source: "Source on GitHub",
  },
}

export default landing
