import Link from "next/link";
import {
  ArrowUpRight,
  Headphones,
  MapPinned,
  PackageCheck,
  RotateCcw,
  Store,
  Heart,
  Bell,
  School,
  ShieldCheck,
} from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { hasPermission, staffHome } from "@/lib/auth/permissions";
import { pushPublicKey } from "@/lib/push/service";
import { PushSettings } from "@/components/push-settings";
import { linkGoogleAction, logoutAction, resendVerificationAction } from "@/lib/auth/actions";
import { emailEnabled, isPlaceholderEmail } from "@/lib/email/send";
import { MailCheck } from "lucide-react";
import { googleEnabled } from "@/lib/auth/better-auth";
import { GoogleMark, googleErrorMessage } from "@/components/google-button";
import { ClaimPhone } from "@/components/claim-phone";
import mongoose from "mongoose";
import { ActionForm } from "@/components/action-form";
import { profileAction } from "@/lib/profile/actions";
import { Order } from "@/lib/commerce/models";
import { WishlistItem, Notification } from "@/lib/engagement/models";
import { User } from "@/lib/db/models";
import { currentLocale } from "@/lib/i18n";
import { customerStage } from "@/lib/display";
import { dayLabel } from "@/lib/commerce/slots";
import { OrderHistory } from "@/components/order-history";
import { representsActiveSchool } from "@/lib/schools/membership";
export const metadata = { title: "Your account", robots: { index: false } };
export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; error?: string; connect?: string; welcome?: string; phone?: string; email?: string }>;
}) {
  const user = await requirePage("profile:own");
  const query = await searchParams;
  const home = staffHome(user.roles);
  const locale = await currentLocale();
  const mr = locale === "mr";
  const profile = await User.findById(user.id).select("preferredPaymentMethod substitutionPreference");
  const representsSchool = await representsActiveSchool(user.id);
  const customerOverview = await Promise.all([
          Order.findOne({
            customerId: user.id,
            orderStatus: { $in: ["placed", "confirmed"] },
          })
            .sort({ createdAt: -1 })
            .select("number orderStatus fulfilmentStatus deliveryStatus paymentMethod paymentStatus deliveryDate"),
          Order.countDocuments({ customerId: user.id }),
          WishlistItem.countDocuments({ customerId: user.id }),
          Notification.countDocuments({ userId: user.id, readAt: null }),
          // the latest few, so past orders are one tap away from the account page
          Order.find({ customerId: user.id })
            .sort({ createdAt: -1 })
            .limit(5)
            .select("number createdAt totalPaise items.quantity orderStatus fulfilmentStatus deliveryStatus paymentMethod paymentStatus codStatus"),
        ]);
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">{mr ? "माझे खाते" : "MY ACCOUNT"}</span>
          <h1>{mr ? `नमस्कार, ${user.name}` : `Hello, ${user.name}`}</h1>
          <p>{user.phone ? `+91 ••••••${user.phone.slice(-4)}` : user.email}</p>
        </div>
        <span className="profile-mark" aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
      </div>
      {query.google === "merged" && (
        <p role="status" className="success-message">
          {mr
            ? "तुमचे Google आता या खात्यात साइन इन करते. तुमच्या सर्व ऑर्डर येथे आहेत."
            : "Your Google sign-in now opens this account. All your orders are here."}
        </p>
      )}
      {query.phone === "added" && (
        <p role="status" className="success-message">
          {mr ? "मोबाईल क्रमांक जोडला." : "Mobile number added."}
        </p>
      )}
      {!user.phone && <ClaimPhone mr={mr} welcome={query.welcome === "google"} />}
      {customerOverview && (
        <>
          <div className="governance-stats account-stats">
            <Link href="/account/orders">
              <span>{customerOverview[1]}</span>
              <small>{mr ? "ऑर्डर" : "Orders"}</small>
            </Link>
            <Link href="/account/wishlist">
              <span>{customerOverview[2]}</span>
              <small>{mr ? "आवडत्या वस्तू" : "Wishlist"}</small>
            </Link>
            <Link href="/account/notifications">
              <span>{customerOverview[3]}</span>
              <small>{mr ? "न वाचलेल्या सूचना" : "Unread updates"}</small>
            </Link>
          </div>
          {customerOverview[0] && (
            <Link
              className="panel active-order-card"
              href={`/account/orders/${customerOverview[0]._id}`}
            >
              <span>
                <small>{mr ? "सक्रिय ऑर्डर" : "ACTIVE ORDER"}</small>
                <strong>{customerOverview[0].number}</strong>
              </span>
              <span>
                {customerStage(customerOverview[0], locale).label} ·{" "}
                {customerOverview[0].deliveryDate ? dayLabel(customerOverview[0].deliveryDate) : ""}
              </span>
              <ArrowUpRight size={20} />
            </Link>
          )}
          <section className="account-history" aria-labelledby="history-title">
            <div className="section-heading">
              <div>
                <h2 id="history-title">{mr ? "तुमच्या ऑर्डर" : "Your orders"}</h2>
              </div>
              {customerOverview[1] > 0 && (
                <Link href="/account/orders" className="text-button">
                  {mr ? `सर्व ${customerOverview[1]} ऑर्डर पाहा` : `See all ${customerOverview[1]} orders`}
                </Link>
              )}
            </div>
            {customerOverview[4].length ? (
              <OrderHistory orders={customerOverview[4]} mr={mr} />
            ) : (
              <p className="muted">
                {mr ? "अजून ऑर्डर नाही. " : "No orders yet. "}
                <Link href="/catalog">{mr ? "खरेदी सुरू करा" : "Start shopping"}</Link>
              </p>
            )}
          </section>
        </>
      )}
      <div className="dashboard-links">
        {[
              [
                mr ? "ऑर्डर" : "Orders",
                mr ? "मागोवा, रद्द करणे किंवा मदत" : "Track, cancel or get help",
                "/account/orders",
                PackageCheck,
              ],
              [
                mr ? "जतन केलेले पत्ते" : "Saved addresses",
                mr ? "वितरण तपशील तयार ठेवा" : "Keep delivery details ready",
                "/account/addresses",
                MapPinned,
              ],
              [
                mr ? "आवडत्या वस्तू" : "Wishlist",
                mr ? "नंतर घ्यायच्या वस्तू आणि बोर्ड" : "Things to buy later, and your boards",
                "/account/wishlist",
                Heart,
              ],
              [
                mr ? "सूचना" : "Notifications",
                mr ? "ऑर्डर, पेमेंट आणि वितरण अपडेट" : "Order, payment and delivery updates",
                "/account/notifications",
                Bell,
              ],
              [
                mr ? "दुकानाशी बोला" : "Talk to the store",
                mr ? "आमच्या स्थानिक टीमशी चॅट करा" : "Chat with our local team",
                "/account/support",
                Headphones,
              ],
              [
                mr ? "तक्रारी आणि परतावा" : "Complaints & returns",
                mr ? "आम्ही योग्य तोडगा काढू" : "We’ll help make it right",
                "/account/complaints",
                RotateCcw,
              ],
              [
                mr ? "गोपनीयता आणि तुमची माहिती" : "Privacy & your data",
                mr ? "आम्ही काय ठेवतो आणि हटवायला कसे सांगायचे" : "What we keep, and how to ask us to delete it",
                "/p/privacy-policy#your-rights",
                ShieldCheck,
              ],
              ...(representsSchool
                ? [
                    [
                      ...(user.roles.includes("super-admin")
                        ? [
                            mr ? "शाळांसाठी" : "For schools",
                            mr ? "कोणत्याही शाळेसाठी शाळेच्या दरात खरेदी करा" : "Shop at school prices for any school",
                          ]
                        : [
                            mr ? "माझ्या शाळेसाठी" : "For my school",
                            mr ? "शाळेच्या दरात खरेदी करा आणि कोटेशन मागा" : "Shop at school prices and ask for quotations",
                          ]),
                      "/school",
                      School,
                    ],
                  ]
                : []),
              ...(home
                ? [
                    [
                      mr ? "तुमचे कामाचे ठिकाण उघडा" : "Open your workspace",
                      mr ? "आजचे दुकानाचे काम सांभाळा" : "Manage today’s store work",
                      home,
                      Store,
                    ],
                  ]
                : []),
            ].map(([label, description, href, Icon]) => (
          <Link className="account-tile" key={String(href)} href={String(href)}>
            <span className="account-tile-icon">
              <Icon size={22} />
            </span>
            <span>
              <strong>{String(label)}</strong>
              <small>{String(description)}</small>
            </span>
            <ArrowUpRight size={18} />
          </Link>
        ))}
      </div>
      <PushSettings
        publicKey={pushPublicKey()}
        account={user.id}
        mr={mr}
        staff={hasPermission(user.roles, "order:manage")}
      />
      <GoogleSignInPanel
        userId={user.id}
        mr={mr}
        google={googleEnabled()}
        emailResult={query.email}
        linked={query.google === "linked"}
        nudge={query.connect === "google"}
        error={googleErrorMessage(query.error, mr)}
      />
      <details className="panel profile-settings">
        <summary>{mr ? "प्रोफाइल सेटिंग्ज" : "Profile settings"}</summary>
        <ActionForm action={profileAction} submit={mr ? "प्रोफाइल जतन करा" : "Save profile"}>
          <label>
            {mr ? "दिसणारे नाव" : "Display name"}
            <input
              name="name"
              defaultValue={user.name}
              minLength={2}
              maxLength={80}
              required
            />
          </label>
          <label>
            {mr ? "पसंतीची पेमेंट पद्धत" : "Preferred payment"}
            <select name="preferredPaymentMethod" defaultValue={profile?.preferredPaymentMethod ?? "cod"}>
              <option value="cod">{mr ? "वितरणावेळी रोख" : "Cash on Delivery"}</option>
              <option value="razorpay">{mr ? "ऑनलाइन पेमेंट" : "Pay online"}</option>
            </select>
          </label>
          <label>
            {mr ? "वस्तू उपलब्ध नसल्यास" : "If an item is unavailable"}
            <select name="substitutionPreference" defaultValue={profile?.substitutionPreference ?? "contact"}>
              <option value="contact">{mr ? "माझ्याशी संपर्क करा" : "Contact me"}</option>
              <option value="best-match">{mr ? "सर्वात जवळचा पर्याय निवडा" : "Choose the closest match"}</option>
              <option value="no-substitutions">{mr ? "पर्याय नको" : "Do not substitute"}</option>
            </select>
          </label>
          <p className="muted">
            {mr ? "मोबाईल क्रमांक बदलण्यासाठी नवीन OTP पडताळणी आवश्यक आहे." : "Phone-number changes require a new OTP-verified account recovery flow."}
          </p>
        </ActionForm>
      </details>
      <form action={logoutAction}>
        <button className="secondary-button">{mr ? "साइन आउट" : "Sign out"}</button>
      </form>
    </section>
  );
}

/** Shows whether Google is connected, and lets a signed-in person connect it. */
/** What a verification link came back with, as Better Auth reports it. */
function emailResultMessage(result: string | undefined, mr: boolean) {
  if (!result) return null;
  if (result === "verified")
    return { ok: true, text: mr ? "ईमेल पडताळला." : "Email confirmed." };
  if (result === "TOKEN_EXPIRED")
    return { ok: false, text: mr ? "ही लिंक जुनी झाली आहे. नवीन लिंक पाठवा." : "That link has expired. Send a new one below." };
  return { ok: false, text: mr ? "ही लिंक चालली नाही. नवीन लिंक पाठवा." : "That link didn’t work. Send a new one below." };
}

async function GoogleSignInPanel({
  userId,
  mr,
  google,
  emailResult,
  linked,
  nudge,
  error,
}: {
  userId: string;
  mr: boolean;
  google: boolean;
  emailResult: string | undefined;
  linked: boolean;
  nudge: boolean;
  error: string | null;
}) {
  const [connected, account] = await Promise.all([
    mongoose.connection
      .collection("authAccounts")
      .findOne({ userId: new mongoose.Types.ObjectId(userId), providerId: "google" })
      .then(Boolean),
    User.findById(userId).select("email emailVerified"),
  ]);
  const email = isPlaceholderEmail(account?.email) ? null : account!.email;
  const emailMessage = emailResultMessage(emailResult, mr);
  if (!google && !email) return null;
  return (
    <section
      className={`panel signin-methods${nudge && !connected ? " attention" : ""}`}
      aria-labelledby="signin-methods-title"
    >
      <h2 id="signin-methods-title">{mr ? "साइन इन पद्धती" : "Sign-in methods"}</h2>
      {nudge && !connected && (
        <p className="notice">
          {mr
            ? "आणखी एक पायरी: Google जोडा, म्हणजे पुढच्या वेळी Google थेट या खात्यात साइन इन करेल."
            : "One more step: connect Google, and next time Google signs you straight in to this account."}
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {emailMessage && (
        <p role={emailMessage.ok ? "status" : "alert"} className={emailMessage.ok ? "success-message" : "error-message"}>
          {emailMessage.text}
        </p>
      )}
      {email && (
        <div className="signin-method">
          <MailCheck size={18} aria-hidden="true" />
          <span>
            <strong>{mr ? "ईमेल" : "Email"}</strong>
            <small>
              {email} ·{" "}
              {account?.emailVerified
                ? mr
                  ? "पडताळलेले"
                  : "Confirmed"
                : mr
                  ? "पडताळलेले नाही"
                  : "Not confirmed yet"}
            </small>
          </span>
          {!account?.emailVerified && emailEnabled() && (
            <ActionForm
              action={resendVerificationAction}
              submit={mr ? "पडताळणी लिंक पाठवा" : "Send confirmation link"}
              className="signin-method-action"
            >
              {null}
            </ActionForm>
          )}
        </div>
      )}
      {google && (
      <div className="signin-method">
        <GoogleMark />
        <span>
          <strong>Google</strong>
          <small>
            {connected
              ? mr
                ? "जोडलेले: Google ने साइन इन करू शकता."
                : "Connected. You can sign in with Google."
              : mr
                ? "जोडलेले नाही."
                : "Not connected."}
          </small>
        </span>
        {connected ? (
          linked && (
            <span role="status" className="success-message">
              {mr ? "Google जोडले." : "Google connected."}
            </span>
          )
        ) : (
          <form action={linkGoogleAction}>
            <button className="secondary-button">{mr ? "Google जोडा" : "Connect Google"}</button>
          </form>
        )}
      </div>
      )}
    </section>
  );
}
