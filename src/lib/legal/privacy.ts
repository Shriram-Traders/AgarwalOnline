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
              ["Your account", "Name, mobile number, email, password (stored only as a one-way hash, never readable), language, your preferred payment method and what to do if an item is unavailable."],
              ["Google sign-in", "If you choose it: the name, email address, profile picture link and account ID Google shares with us."],
              ["Delivery addresses", "Recipient's name, mobile number, address, landmark, PIN code and delivery instructions."],
              ["Orders", "Items, prices, offer used, delivery time, payment method, order and delivery status, the version of our Terms you agreed to, and the delivery code (stored only as a hash)."],
              ["Payments", "When online payment is switched on, you enter card or UPI details on Razorpay's own page. We receive only the payment ID, order ID and amount. We never see or store card or UPI details."],
              ["Support and complaints", "Chat messages, complaint and return details, and photos you upload."],
              ["Reviews and ratings", "Product reviews (shown publicly), order ratings and comments (seen only by the store)."],
              ["Shared lists", "List names, items and who added them."],
              ["School accounts", "School name, contact person, phone, email, address and GSTIN; your request to join; quotations and your replies."],
              ["Staff and delivery partners", "Name, phone, work email and role, and the work done: packing, deliveries, cash collected and customers' ratings of deliveries."],
              ["Security records", "For signed-in sessions and to stop repeated sign-in attempts: IP address and browser details. Changes made in the shop are logged with who made them."],
            ],
          },
          "We do not collect your date of birth, government ID numbers, precise location (GPS) or any data about students.",
        ],
      },
      {
        id: "why",
        title: "Why we use it",
        blocks: [
          {
            list: [
              "To create your account and keep it secure, including one-time sign-in codes.",
              "To take, pack, deliver and bill your orders, and to collect cash on delivery.",
              "To take payments and make refunds.",
              "To answer chats, sort out complaints and arrange returns.",
              "To show product reviews and to learn from order ratings.",
              "To send messages you need: sign-in codes, delivery codes, account emails and school quotations.",
              "To show \"Buy it again\" and \"Picked for you\" from your own past orders, on this site only.",
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
              ["Resend", "Sends our emails: your email address and the message."],
              ["SMS provider", "Sends sign-in and delivery codes: your mobile number and the code."],
              ["Google", "Only if you sign in with Google."],
              ["Razorpay", "Only when online payment is switched on: the order number and amount. You enter payment details on Razorpay's own page."],
              ["Cloudinary", "Stores photos for complaints, packing, deliveries and products."],
              ["Image hosts", "Product pictures load from Cloudinary, Unsplash and Pexels, so they see your IP address when your browser fetches a picture."],
              ["WhatsApp", "Only what you choose to share with the share button on a list."],
              ["Authorities", "Government bodies, courts or police, only when the law requires it."],
            ],
          },
          "These providers handle data for us under their own security terms. Some of them may process it outside India, as the DPDP Act allows.",
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
            ],
          },
          "Everything else is seen only by you and the store's staff, each according to their role.",
        ],
      },
      {
        id: "cookies",
        title: "Cookies and storage on your device",
        blocks: [
          "We use only cookies the site needs to work. We use no analytics, advertising or tracking cookies, so there is no cookie banner.",
          {
            rows: [
              ["ags_session", "Keeps you signed in. 7 days."],
              ["ags_locale", "Remembers English or Marathi. 1 year."],
              ["ags_guest_cart", "Keeps your basket before you sign in. 30 days."],
              ["ags_promotion", "Remembers an offer code you applied. 1 day."],
              ["ags_school, ags_school_view", "Remember the school you shop for and how its catalogue is shown. 1 year."],
              ["Google sign-in", "Short-lived security cookies while you sign in with Google."],
            ],
          },
          "Your browser also keeps your recent searches, whether you closed the rating pop-up, and the shop assistant's chat in that tab. These stay on your device and you can clear them in your browser settings.",
        ],
      },
      {
        id: "retention",
        title: "How long we keep it",
        blocks: [
          {
            rows: [
              ["Sign-in codes", "5 minutes."],
              ["Sign-in sessions", "7 days."],
              ["Basket before sign-in", "30 days."],
              ["Complaint, packing and delivery photos", `${f.evidenceDays} days.`],
              ["Notifications", "180 days."],
              ["Activity records (who changed what)", `${f.auditDays} days.`],
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
              "Passwords are stored only as one-way hashes. Sign-in and delivery codes expire within minutes and allow only a few tries.",
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
          "The shop is meant for adults. If you are under 18, a parent or guardian must create the account and place orders for you. School accounts are for adult school staff, and we don't collect data about students. If we learn that we hold a child's data without a parent's consent, we'll delete it.",
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
  mr: (f) => ({
    title: "गोपनीयता धोरण",
    lead: `${f.business.legalName} तुमची वैयक्तिक माहिती कशी गोळा करते, वापरते, कोणाला देते आणि कशी सुरक्षित ठेवते, आणि तुमच्याकडे कोणते पर्याय आहेत.`,
    sections: [
      {
        id: "who-we-are",
        title: "आम्ही कोण आहोत",
        blocks: [
          `${f.business.legalName}, ${f.business.address} ("दुकान", "आम्ही") ही वेबसाइट चालवते. तुमची वैयक्तिक माहिती कशासाठी आणि कशी वापरायची हे आम्ही ठरवतो, म्हणून डिजिटल वैयक्तिक डेटा संरक्षण कायदा, 2023 (DPDP कायदा) नुसार आम्ही त्या माहितीचे डेटा फिड्युशियरी आहोत.`,
          "हे धोरण वेबसाइट, तुमचे खाते, ऑर्डर, मदत, शाळा खाती आणि दुकानाचे कर्मचारी व डिलिव्हरी भागीदार या सर्वांना लागू आहे. ते माहिती तंत्रज्ञान कायदा, 2000, DPDP कायदा आणि त्याखालील नियमांनुसार प्रसिद्ध केले आहे.",
          "प्रश्न किंवा तक्रारींसाठी आमचे तक्रार निवारण अधिकारी [संपर्क व तक्रार निवारण](/p/contact-and-grievance) पानावर दिले आहेत.",
        ],
      },
      {
        id: "what-we-collect",
        title: "आम्ही कोणती माहिती घेतो",
        blocks: [
          "दुकानाच्या प्रत्येक भागाला लागेल तेवढीच:",
          {
            rows: [
              ["तुमचे खाते", "नाव, मोबाइल नंबर, ईमेल, पासवर्ड (फक्त वाचता न येणाऱ्या हॅश स्वरूपात), भाषा, तुमची पसंतीची पेमेंट पद्धत आणि वस्तू उपलब्ध नसल्यास काय करावे ही निवड."],
              ["Google साइन इन", "तुम्ही निवडल्यास: Google आम्हाला देत असलेले नाव, ईमेल, प्रोफाइल फोटोची लिंक आणि खाते ID."],
              ["वितरणाचे पत्ते", "घेणाऱ्याचे नाव, मोबाइल नंबर, पत्ता, खूण, पिन कोड आणि वितरणाच्या सूचना."],
              ["ऑर्डर", "वस्तू, किमती, वापरलेली ऑफर, वितरणाची वेळ, पेमेंट पद्धत, ऑर्डर व वितरणाची स्थिती, तुम्ही मान्य केलेली अटींची आवृत्ती आणि वितरण कोड (फक्त हॅश स्वरूपात)."],
              ["पेमेंट", "ऑनलाइन पेमेंट सुरू असताना कार्ड किंवा UPI तपशील तुम्ही Razorpay च्या स्वतःच्या पानावर भरता. आम्हाला फक्त पेमेंट ID, ऑर्डर ID आणि रक्कम मिळते. कार्ड किंवा UPI तपशील आम्ही कधीही पाहत नाही आणि साठवत नाही."],
              ["मदत आणि तक्रारी", "चॅट संदेश, तक्रार व परतीचा तपशील आणि तुम्ही पाठवलेले फोटो."],
              ["रिव्ह्यू आणि रेटिंग", "उत्पादनांचे रिव्ह्यू (सर्वांना दिसतात), ऑर्डरचे रेटिंग व टिप्पण्या (फक्त दुकानाला दिसतात)."],
              ["शेअर केलेल्या याद्या", "यादीची नावे, वस्तू आणि त्या कोणी जोडल्या."],
              ["शाळा खाती", "शाळेचे नाव, संपर्क व्यक्ती, फोन, ईमेल, पत्ता आणि GSTIN; सामील होण्याची तुमची विनंती; कोटेशन आणि तुमची उत्तरे."],
              ["कर्मचारी आणि डिलिव्हरी भागीदार", "नाव, फोन, कामाचा ईमेल आणि भूमिका, आणि केलेले काम: पॅकिंग, डिलिव्हरी, जमा केलेली रोख आणि ग्राहकांनी डिलिव्हरीला दिलेले रेटिंग."],
              ["सुरक्षेच्या नोंदी", "साइन-इन सत्रांसाठी आणि वारंवार साइन-इन प्रयत्न थांबवण्यासाठी: IP पत्ता आणि ब्राउझरचा तपशील. दुकानात केलेले बदल, ते कोणी केले यासह, नोंदवले जातात."],
            ],
          },
          "आम्ही तुमची जन्मतारीख, सरकारी ओळखपत्र क्रमांक, नेमके ठिकाण (GPS) किंवा विद्यार्थ्यांची कोणतीही माहिती घेत नाही.",
        ],
      },
      {
        id: "why",
        title: "आम्ही ती का वापरतो",
        blocks: [
          {
            list: [
              "तुमचे खाते तयार करण्यासाठी आणि सुरक्षित ठेवण्यासाठी, एक-वेळ साइन-इन कोडसह.",
              "तुमच्या ऑर्डर घेणे, पॅक करणे, पोहोचवणे आणि बिल करणे, आणि कॅश ऑन डिलिव्हरीची रक्कम घेणे.",
              "पेमेंट घेणे आणि पैसे परत करणे.",
              "चॅटला उत्तर देणे, तक्रारी सोडवणे आणि वस्तू परत घेण्याची व्यवस्था करणे.",
              "उत्पादनांचे रिव्ह्यू दाखवणे आणि ऑर्डरच्या रेटिंगमधून सुधारणा करणे.",
              "तुम्हाला आवश्यक संदेश पाठवणे: साइन-इन कोड, वितरण कोड, खात्याचे ईमेल आणि शाळांचे कोटेशन.",
              "तुमच्याच जुन्या ऑर्डरवरून \"पुन्हा घ्या\" आणि \"तुमच्यासाठी निवडलेले\" दाखवणे, फक्त या साइटवर.",
              "फसवणूक व गैरवापर रोखणे आणि साइट सुरक्षित ठेवणे.",
              "कायदेशीर जबाबदाऱ्या पूर्ण करणे, जसे की GST व हिशोबाच्या नोंदी आणि ग्राहक कायदा.",
            ],
          },
          "आम्ही तुमची वैयक्तिक माहिती विकत नाही, जाहिरातींसाठी वापरत नाही आणि मार्केटिंगचे संदेश पाठवत नाही.",
        ],
      },
      {
        id: "consent",
        title: "तुमची संमती",
        blocks: [
          "तुम्ही खाते तयार करता, ऑर्डर देता किंवा या धोरणाची लिंक असलेला फॉर्म पाठवता, तेव्हा तुम्ही दिलेली माहिती तिथे व या धोरणात सांगितलेल्या कारणासाठी वापरण्यास तुम्ही संमती देता. काही वापरांसाठी संमती लागत नाही कारण कायदा त्यांना परवानगी देतो, उदाहरणार्थ कराच्या नोंदी ठेवणे, किंवा तुम्ही स्वतः मागितलेल्या गोष्टीसाठी दिलेली माहिती.",
          "तुम्ही दिलेली संमती कधीही, तितक्याच सहजतेने मागे घेऊ शकता ([तुमचे अधिकार](#your-rights) पाहा). संमती मागे घेतल्याने आधी झालेले काम रद्द होत नाही, आणि त्यानंतर तुमचे खाते ठेवणे किंवा चालू ऑर्डर पूर्ण करणे आम्हाला शक्य होणार नाही.",
        ],
      },
      {
        id: "sharing",
        title: "आम्ही ती कोणाला देतो",
        blocks: [
          "फक्त दुकान चालवण्यास मदत करणाऱ्या व्यक्ती आणि सेवांना, आणि त्यांना लागेल तेवढीच:",
          {
            rows: [
              ["आमचे डिलिव्हरी भागीदार", "ते करत असलेल्या डिलिव्हरीसाठी नाव, फोन, पत्ता आणि ऑर्डरचा तपशील. त्यांच्या रस्ता दाखवणाऱ्या लिंकने पत्ता Google Maps मध्ये उघडतो."],
              ["MongoDB Atlas", "आमचा डेटाबेस, जिथे खाते आणि ऑर्डरची माहिती साठवली जाते."],
              ["Vercel", "वेबसाइट चालवते आणि प्रत्येक पानाची विनंती हाताळते."],
              ["Resend", "आमचे ईमेल पाठवते: तुमचा ईमेल पत्ता आणि संदेश."],
              ["SMS सेवा", "साइन-इन आणि वितरण कोड पाठवते: तुमचा मोबाइल नंबर आणि कोड."],
              ["Google", "तुम्ही Google ने साइन इन केल्यासच."],
              ["Razorpay", "ऑनलाइन पेमेंट सुरू असतानाच: ऑर्डर क्रमांक आणि रक्कम. पेमेंटचा तपशील तुम्ही Razorpay च्या स्वतःच्या पानावर भरता."],
              ["Cloudinary", "तक्रारी, पॅकिंग, डिलिव्हरी आणि उत्पादनांचे फोटो साठवते."],
              ["फोटो सेवा", "उत्पादनांचे फोटो Cloudinary, Unsplash आणि Pexels वरून येतात, त्यामुळे तुमचा ब्राउझर फोटो आणतो तेव्हा त्यांना तुमचा IP पत्ता दिसतो."],
              ["WhatsApp", "यादीवरील शेअर बटणाने तुम्ही स्वतः शेअर करता तेवढेच."],
              ["सरकारी यंत्रणा", "कायद्याने आवश्यक असेल तेव्हाच सरकारी संस्था, न्यायालये किंवा पोलीस."],
            ],
          },
          "या सेवा त्यांच्या स्वतःच्या सुरक्षा अटींनुसार आमच्यासाठी माहिती हाताळतात. त्यापैकी काही, DPDP कायद्याने परवानगी दिल्याप्रमाणे, भारताबाहेर माहितीवर प्रक्रिया करू शकतात.",
        ],
      },
      {
        id: "public",
        title: "इतरांना काय दिसते",
        blocks: [
          {
            list: [
              "तुम्ही लिहिलेला उत्पादनाचा रिव्ह्यू तुमच्या खात्याच्या नावासह सर्वांना दिसतो.",
              "शेअर केलेल्या यादीत, सदस्यांना तुमचे पहिले नाव आणि तुम्ही जोडलेल्या वस्तू दिसतात.",
              "एकाच शाळेच्या प्रतिनिधींना शाळेच्या बास्केटवर व कोटेशनवर एकमेकांची नावे दिसतात.",
              "तुमच्या डिलिव्हरी भागीदाराला ऑर्डर पोहोचवण्यासाठी लागेल तेवढी माहिती दिसते.",
            ],
          },
          "बाकी सर्व फक्त तुम्हाला आणि दुकानाच्या कर्मचाऱ्यांना, त्यांच्या भूमिकेनुसार, दिसते.",
        ],
      },
      {
        id: "cookies",
        title: "कुकीज आणि तुमच्या डिव्हाइसवरील साठवण",
        blocks: [
          "आम्ही फक्त साइट चालण्यासाठी आवश्यक कुकीज वापरतो. विश्लेषण, जाहिरात किंवा मागोवा घेणाऱ्या कुकीज वापरत नाही, म्हणून कुकी बॅनर नाही.",
          {
            rows: [
              ["ags_session", "तुम्हाला साइन इन ठेवते. 7 दिवस."],
              ["ags_locale", "इंग्रजी की मराठी हे लक्षात ठेवते. 1 वर्ष."],
              ["ags_guest_cart", "साइन इन करण्यापूर्वीची बास्केट ठेवते. 30 दिवस."],
              ["ags_promotion", "तुम्ही लावलेला ऑफर कोड लक्षात ठेवते. 1 दिवस."],
              ["ags_school, ags_school_view", "तुम्ही ज्या शाळेसाठी खरेदी करता ती शाळा आणि तिचा कॅटलॉग कसा दिसतो हे लक्षात ठेवतात. 1 वर्ष."],
              ["Google साइन इन", "Google ने साइन इन करताना थोड्या वेळासाठी सुरक्षा कुकीज."],
            ],
          },
          "तुमचा ब्राउझर अलीकडचे शोध, तुम्ही रेटिंगचा पॉप-अप बंद केला की नाही, आणि त्या टॅबमधील दुकान सहाय्यकाचा चॅटही ठेवतो. हे तुमच्या डिव्हाइसवरच राहते आणि ब्राउझरच्या सेटिंग्जमधून तुम्ही ते पुसू शकता.",
        ],
      },
      {
        id: "retention",
        title: "आम्ही ती किती काळ ठेवतो",
        blocks: [
          {
            rows: [
              ["साइन-इन कोड", "5 मिनिटे."],
              ["साइन-इन सत्र", "7 दिवस."],
              ["साइन इन करण्यापूर्वीची बास्केट", "30 दिवस."],
              ["तक्रार, पॅकिंग आणि डिलिव्हरीचे फोटो", `${f.evidenceDays} दिवस.`],
              ["सूचना", "180 दिवस."],
              ["बदलांच्या नोंदी (कोणी काय बदलले)", `${f.auditDays} दिवस.`],
              ["खाते, पत्ते, चॅट, तक्रारी आणि रिव्ह्यू", "तुमचे खाते सुरू असेपर्यंत, किंवा तुम्ही ते हटवायला सांगेपर्यंत."],
              ["ऑर्डर, बिले, पेमेंट आणि परतावे", "कर व हिशोबाचे कायदे सांगतात तितका काळ (GST च्या नोंदी किमान सहा वर्षे ठेवाव्या लागतात), खाते बंद झाले तरीही."],
            ],
          },
          "माहितीची गरज संपल्यावर आम्ही ती हटवतो किंवा तिच्यातून तुमची ओळख पटवणारा भाग काढून टाकतो.",
        ],
      },
      {
        id: "your-rights",
        title: "तुमचे अधिकार",
        blocks: [
          "DPDP कायद्यानुसार तुम्ही:",
          {
            list: [
              "आमच्याकडे असलेल्या तुमच्या वैयक्तिक माहितीचा आणि ती कोणाला दिली याचा **सारांश मागू** शकता.",
              "ती **दुरुस्त किंवा अद्ययावत** करू शकता. नाव, निवडी आणि पत्ते तुम्ही [तुमचे खाते](/account) मध्ये स्वतः बदलू शकता.",
              "तुमचे खाते आणि माहिती **हटवायला सांगू** शकता. कायद्याने ठेवाव्या लागणाऱ्या नोंदी सोडून, आम्ही 30 दिवसांत ती हटवू किंवा तिच्यातून तुमची ओळख काढून टाकू.",
              "दिलेली **संमती मागे घेऊ** शकता.",
              "तुमचा मृत्यू झाल्यास किंवा तुम्ही स्वतः करू शकत नसल्यास हे अधिकार वापरण्यासाठी **एखाद्या व्यक्तीला नामनिर्देशित** करू शकता.",
              "आमच्या तक्रार निवारण अधिकाऱ्याकडे, आणि समाधान न झाल्यास भारतीय डेटा संरक्षण मंडळाकडे **तक्रार** करू शकता.",
            ],
          },
          "यापैकी काहीही करण्यासाठी [दुकानाशी बोला](/account/support) मध्ये लिहा, किंवा [संपर्क व तक्रार निवारण](/p/contact-and-grievance) वरील तक्रार निवारण अधिकाऱ्याला लिहा. कृती करण्यापूर्वी विनंती खरोखर तुमचीच आहे याची खात्री आम्ही करू शकतो.",
        ],
      },
      {
        id: "security",
        title: "आम्ही ती कशी सुरक्षित ठेवतो",
        blocks: [
          {
            list: [
              "पासवर्ड फक्त वाचता न येणाऱ्या हॅश स्वरूपात साठवले जातात. साइन-इन आणि वितरण कोड काही मिनिटांत संपतात आणि त्यांचे फक्त काही प्रयत्न करता येतात.",
              "साइन इन करण्याचे किंवा फॉर्म पाठवण्याचे वारंवार प्रयत्न काही काळ थांबवले जातात.",
              "साइट सुरक्षित (HTTPS) जोडणी वापरते.",
              "कर्मचाऱ्यांना त्यांच्या भूमिकेला लागेल तेवढेच दिसते, आणि त्यांच्या कृतींची नोंद ठेवली जाते.",
            ],
          },
          "दुकान तुमचा पासवर्ड किंवा साइन-इन कोड कधीही विचारणार नाही. दुकानातून बोलतो असे सांगणाऱ्यांसह कोणालाही ते देऊ नका.",
          "कोणतीही यंत्रणा पूर्णपणे सुरक्षित नसते. तुमच्या माहितीवर परिणाम करणारी सुरक्षा भंगाची घटना घडल्यास, कायद्यानुसार आम्ही तुम्हाला आणि डेटा संरक्षण मंडळाला कळवू.",
        ],
      },
      {
        id: "children",
        title: "मुले",
        blocks: [
          "हे दुकान प्रौढांसाठी आहे. तुमचे वय 18 पेक्षा कमी असल्यास, पालक किंवा संरक्षकांनी खाते तयार करावे आणि तुमच्यासाठी ऑर्डर द्यावी. शाळा खाती शाळेच्या प्रौढ कर्मचाऱ्यांसाठी आहेत आणि आम्ही विद्यार्थ्यांची माहिती घेत नाही. पालकांच्या संमतीशिवाय एखाद्या मुलाची माहिती आमच्याकडे आहे असे कळल्यास, आम्ही ती हटवू.",
        ],
      },
      {
        id: "changes",
        title: "या धोरणातील बदल",
        blocks: [
          "हे धोरण बदलल्यावर आम्ही या पानाच्या वरची आवृत्ती आणि तारीख बदलतो. महत्त्वाचे बदल लागू होण्यापूर्वी आम्ही साइटवर सूचना दाखवू, आणि चेकआउटवर तुम्हाला सध्याच्या अटी मान्य करण्यास सांगितले जाईल.",
        ],
      },
    ],
  }),
};
