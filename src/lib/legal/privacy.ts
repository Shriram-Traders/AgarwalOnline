import type { LegalBuilder } from "./types";

/*
 * Privacy Policy, written to the Digital Personal Data Protection Act, 2023 and the IT Act, 2000.
 * Every claim here matches the code: change the code, change this text (and POLICY_VERSION).
 */
export const privacyDoc: LegalBuilder = {
  en: (f) => ({
    title: "Privacy Policy",
    lead: `How ${f.business.legalName} collects, uses, shares and protects your personal data, and the choices you have.`,
    sections: [
      {
        id: "who-we-are",
        title: "Who we are",
        blocks: [
          `${f.business.legalName}, ${f.business.address} ("the store", "we") runs this website. We decide why and how your personal data is used, so under the Digital Personal Data Protection Act, 2023 (the DPDP Act) we are its Data Fiduciary.`,
          "This policy covers the website, your account, orders, support, school accounts and the store's staff and delivery partners. It is published under the Information Technology Act, 2000, the DPDP Act and the rules made under them.",
          "Questions or complaints go to our grievance officer, listed on [Contact & Grievance](/p/contact-and-grievance).",
        ],
      },
      {
        id: "what-we-collect",
        title: "What we collect",
        blocks: [
          "Only what each part of the shop needs:",
          {
            rows: [
              ["Your account", "Name, mobile number, email, password (stored only as a one-way hash, never readable), your preferred payment method and what to do if an item is unavailable."],
              ["Google sign-in", "If you choose it: the name, email address, profile picture link and account ID Google shares with us, and the sign-in tokens Google issues for your account."],
              ["Delivery addresses", "Recipient's name, mobile number, address, landmark, PIN code and delivery instructions."],
              ["Orders", "Items, prices, offer used, delivery time, payment method, order and delivery status, and the version of our Terms you agreed to. The delivery code isn't stored: it is worked out from the order whenever it is shown or checked."],
              ["Support and complaints", "Chat messages, complaint and return details, and photos you upload."],
              ["Reviews and ratings", "Product reviews (shown publicly), order ratings and comments (seen only by the store)."],
              ["Shared lists", "List names, items and who added them."],
              ["School accounts", "School name, contact person, phone, email, address and GSTIN; your request to join; quotations and your replies."],
              ["Family accounts", "If you create or join one: the family's name, the adults in it, and for each child their first name, school and class. Children have no login or account of their own."],
              ["Notifications on your device", "If you turn them on: your browser's push address and encryption keys, and a label such as \"Chrome on Android\"."],
              ["Staff and delivery partners", "Name, phone, work email and role, and the work done: packing, deliveries, cash collected and customers' ratings of deliveries."],
              ["Security records", "For signed-in sessions and to stop repeated sign-in attempts: IP address and browser details. Changes made in the shop are logged with who made them."],
            ],
          },
          "We do not collect dates of birth, government ID numbers or your precise location (GPS). About children we keep only what a parent adds to a family account: first name, school and class.",
        ],
      },
      {
        id: "why",
        title: "Why we use it",
        blocks: [
          {
            list: [
              "To create your account and keep it secure, including one-time sign-in codes.",
              f.upiAtDoor
                ? "To take, pack, deliver and bill your orders, and to collect payment on delivery. When you pay by UPI, your payment app shows us your name and UPI ID with the payment, as any UPI payment does."
                : "To take, pack, deliver and bill your orders, and to collect cash on delivery.",
              "To make refunds.",
              "To answer chats, sort out complaints and arrange returns.",
              "To show product reviews and to learn from order ratings.",
              "To send messages you need: sign-in codes, delivery codes, account emails and school quotations.",
              "To show \"Buy it again\" and \"Picked for you\" from your own past orders, on this site only.",
              "To let a family share its orders, and to tell parents when their child's school kit is ready.",
              "To send the notifications you turned on, such as order updates, in the app and on your device; an alert when an item you asked about is back in stock; and one reminder about items left in your basket, which you can turn off in Edit profile on [your account](/account).",
              "To count visits and see which pages people use, with Google Analytics.",
              "To prevent fraud and misuse and to keep the site secure.",
              "To meet legal duties, such as GST and accounting records and consumer law.",
            ],
          },
          "We do not sell your personal data, we do not use it for advertising, and we do not send marketing messages.",
        ],
      },
      {
        id: "consent",
        title: "Your consent",
        blocks: [
          "When you create an account, place an order or send a form that links to this policy, you agree to us using the data you give for the purpose described there and in this policy. Some uses need no consent because the law allows them, for example records we must keep for tax, or data you give us yourself for something you asked for.",
          "You can withdraw your consent at any time, as easily as you gave it (see [Your rights](#your-rights)). Withdrawing doesn't undo what was done before, and we may then be unable to keep your account or complete open orders.",
        ],
      },
      {
        id: "sharing",
        title: "Who we share it with",
        blocks: [
          "Only with people and services that help us run the shop, and only what they need:",
          {
            rows: [
              ["Our delivery partners", "The name, phone, address and order details for the delivery they make. Their navigation link opens the address in Google Maps."],
              ["MongoDB Atlas", "Hosts our database, where account and order data is stored."],
              ["Vercel", "Hosts the website and handles each page request."],
              ["Hostinger", "Sends our emails (email confirmations and school quotations): your email address and the message."],
              ["MiniMoth", "Sends one-time codes for signing up and resetting a password, and each order's delivery code, by WhatsApp or, if that fails, by SMS: the mobile number and the code."],
              ["Google", "Only if you sign in with Google."],
              ["Google Analytics", "The pages you open and what you tap on them, your browser and device, the city your connection is in, and a random ID kept in a cookie. Google works the city out from your IP address and doesn't keep the address. Google signals and ad personalisation are off, and staff are never counted."],
              ["Browser push services", "Only if you turn on notifications: they travel through your browser maker's push service (Google for Chrome, Mozilla for Firefox, Apple for Safari), encrypted so only your device can read them."],
              ["Cloudinary", "Stores photos for complaints, packing, deliveries and products."],
              ["Image hosts", "Product pictures load from Cloudinary, Unsplash and Pexels, so they see your IP address when your browser fetches a picture."],
              ["Your browser's speech service", "Only if you tap the microphone in search: your browser turns what you say into words (Chrome does this through Google). We receive only the words."],
              ["WhatsApp", "Only what you choose to share with the share button on a list."],
              ["Authorities", "Government bodies, courts or police, only when the law requires it."],
            ],
          },
          "These providers handle data for us under their own security terms. Some of them may process it outside India, as the DPDP Act allows.",
          "The other shops whose items we sell (named under those items) don't receive your details: we pack and deliver every order ourselves.",
        ],
      },
      {
        id: "public",
        title: "What other people can see",
        blocks: [
          {
            list: [
              "A product review you write is shown publicly with your account name.",
              "On a shared list, members see your first name and what you add.",
              "School representatives of the same school see each other's names on the school basket and quotations.",
              "Your delivery partner sees what they need to deliver your order.",
              "In a family account, the other adults see the family's orders and invoices (with delivery addresses) and the children's details. An order you mark private at checkout stays yours.",
            ],
          },
          "Everything else is seen only by you and the store's staff, each according to their role.",
        ],
      },
      {
        id: "cookies",
        title: "Cookies and storage on your device",
        blocks: [
          "We use the cookies the site needs to work, and Google Analytics cookies to count visits. We use no advertising cookies. To stop analytics, block cookies for this site in your browser settings, or on a computer install Google's [Analytics opt-out add-on](https://tools.google.com/dlpage/gaoptout).",
          {
            rows: [
              ["__Secure-ags_session", "Keeps you signed in. 30 days after you last use the site, or until you sign out."],
              ["ags_guest_cart", "Keeps your basket before you sign in. 30 days."],
              ["ags_promotion", "Remembers an offer code you applied. 1 day."],
              ["ags_school, ags_school_view", "Remember the school you shop for and how its catalogue is shown. 1 year."],
              ["Google sign-in", "Short-lived security cookies while you sign in with Google."],
              ["_ga, _ga_…", "Let Google Analytics tell visits apart. 2 years."],
            ],
          },
          "Your browser also keeps your recent searches, the site's look if you picked one, and whether you closed the rating pop-up. These stay on your device and you can clear them in your browser settings.",
          "If you install the app, it saves a small offline page on your device to show when there's no connection. Notifications you turn on are kept for that browser only; turn them off any time in [Notifications](/account/notifications).",
        ],
      },
      {
        id: "retention",
        title: "How long we keep it",
        blocks: [
          {
            rows: [
              ["Sign-in codes", "Valid for 5 minutes, deleted within a day."],
              ["Sign-in sessions, with IP address and browser", "30 days after you last use the site, or until you sign out."],
              ["Sign-in attempts, with IP address", "1 day."],
              ["Basket before sign-in", "30 days."],
              ["Complaint, packing and delivery photos", `${f.evidenceDays} days.`],
              ["Notifications", "180 days."],
              ["Google Analytics visit data", "2 months, then Google deletes it."],
              ["Activity records (who changed what)", `${f.auditDays} days.`],
              ["Children's details", "Until an adult in the family removes them, or the family is deleted."],
              ["Notification devices", "Until you turn notifications off, or the push service says that browser is gone. At most 8 browsers per person."],
              ["Account, addresses, chats, complaints and reviews", "While your account is open, or until you ask us to delete them."],
              ["Orders, bills, payments and refunds", "As long as tax and accounting laws require (GST records must be kept for at least six years), even after an account is closed."],
            ],
          },
          "When data is no longer needed, we delete it or remove what identifies you.",
        ],
      },
      {
        id: "your-rights",
        title: "Your rights",
        blocks: [
          "Under the DPDP Act you can:",
          {
            list: [
              "**Get a summary** of the personal data we hold about you and who we've shared it with.",
              "**Correct or update** it. You can edit your name, preferences and addresses yourself on [Your account](/account).",
              "**Ask us to delete** your account and data. We'll delete it, or remove what identifies you, within 30 days, except records the law makes us keep.",
              "**Withdraw consent** you gave us.",
              "**Nominate someone** to use these rights for you if you die or can't act yourself.",
              "**Complain** to our grievance officer, and if you're not satisfied, to the Data Protection Board of India.",
            ],
          },
          "To use any of these, write to us in [Talk to the store](/account/support) or to the grievance officer on [Contact & Grievance](/p/contact-and-grievance). We may ask you to confirm it's really you before we act.",
        ],
      },
      {
        id: "security",
        title: "How we protect it",
        blocks: [
          {
            list: [
              "Passwords are stored only as one-way hashes. Sign-in codes expire within minutes and allow only a few tries. A delivery code works only for its own order, until it is delivered, and allows only a few tries at a time.",
              "Repeated attempts to sign in or send forms are blocked for a while.",
              "The site uses secure (HTTPS) connections.",
              "Staff see only what their role needs, and their actions are logged.",
            ],
          },
          "The store will never ask for your password or sign-in code. Don't share them with anyone, including people who say they're from the store.",
          "No system is perfectly secure. If a breach affects your data, we'll tell you and the Data Protection Board as the law requires.",
        ],
      },
      {
        id: "children",
        title: "Children",
        blocks: [
          "The shop is meant for adults. If you are under 18, a parent or guardian must create the account and place orders for you. Children never get an account.",
          "In a family account, a parent or guardian can add a child's first name, school and class, so the family can find and buy the right school kit and be told when it's ready. We use these details only for that: never for advertising, tracking or profiling. Any adult in the family can change or remove a child, and deleting the family removes them all.",
          "School accounts are for adult school staff and hold no student details. If we learn that we hold a child's data without a parent's consent, we'll delete it.",
        ],
      },
      {
        id: "changes",
        title: "Changes to this policy",
        blocks: [
          "When we change this policy we update the version and date at the top of this page. For important changes we'll show a notice on the site before they apply, and checkout will ask you to agree to the current terms.",
        ],
      },
    ],
  }),
};
