import type { LegalDictionary } from "./legal.es"

const legal: LegalDictionary = {
  updated: "Last updated: October 16, 2026",
  contact: "If you have questions about this policy or these terms, reach us through the project repository:",
  privacy: {
    title: "Privacy policy",
    description: "What data OpenCircle collects and which cookies it uses.",
    sections: [
      {
        h: "What this site is",
        p: "OpenCircle is a prototype built during a hackathon. It is not a financial institution and does not take real money: the demo runs on test wallets and test funds.",
      },
      {
        h: "What we collect",
        p: "Nothing actively: the site has no sign-up forms and the demo doesn't ask for personal data. The names you see in the demo are samples.",
      },
      {
        h: "Technical data",
        p: "Like any website, the server that hosts it may log technical data about visits, such as IP addresses, to run and protect the service. We don't use it to identify you or for advertising.",
      },
      {
        h: "Cookies",
        p: "We use one cookie to remember the language you chose. We don't use advertising or analytics cookies.",
      },
    ],
  },
  terms: {
    title: "Terms of use",
    description: "Conditions for using the OpenCircle prototype and its demo.",
    sections: [
      {
        h: "A prototype in development",
        p: "OpenCircle is a prototype. Its features may change, break or stop being available without notice.",
      },
      {
        h: "No real money",
        p: "The demo uses test wallets and test funds. The site does not accept real-money deposits; don't try to send any.",
      },
      {
        h: "OpenCircle accounts",
        p: "An OpenCircle account is a test balance on the demo's internal ledger, backed by OpenCircle's wallet on the test network. It is not a bank account or an Open Payments wallet address, it earns no interest, and it may be reset at any time.",
      },
      {
        h: "We are not a financial institution",
        p: "OpenCircle is not a bank or a supervised entity, and it does not offer savings, credit or investment products. A real-money version would need a licensed financial institution to hold the funds.",
      },
      {
        h: "Example calculations",
        p: "The calculator, fees and amounts on this site are illustrative. They are not an offer or a promise of payment.",
      },
      {
        h: "No warranties",
        p: "The site is provided as is, with no guarantee of availability, accuracy or results.",
      },
      {
        h: "Changes to these terms",
        p: "We may update these terms. When we do, we'll change the last-updated date.",
      },
    ],
  },
}

export default legal
