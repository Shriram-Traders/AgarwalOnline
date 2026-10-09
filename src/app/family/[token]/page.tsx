import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { currentLocale } from "@/lib/i18n";
import { familyOf, invitedFamily } from "@/lib/family/service";
import { familyAction } from "@/lib/family/actions";
import { ActionForm } from "@/components/action-form";
import { Avatars } from "@/components/avatars";
export const metadata = { title: "Family invite", robots: { index: false, follow: false } };

/** What a family invite link shows: who sent it and what joining shares, never the members or spend. */
export default async function FamilyInvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await invitedFamily(token);
  if (!found) notFound();
  const { family, ownerName } = found;
  const [user, locale] = await Promise.all([currentUser(), currentLocale()]);
  const mr = locale === "mr";
  const t = (en: string, marathi: string) => (mr ? marathi : en);
  const mine = user ? await familyOf(user.id) : null;
  const member = mine && String(mine._id) === String(family._id);
  return (
    <section className="page-container family-invite-page">
      <div className="panel family-invite-card">
        <Avatars names={[ownerName]} />
        <h1>{t(`${ownerName} invited you to “${family.name}”`, `${ownerName} यांनी तुम्हाला “${family.name}” मध्ये बोलावले आहे`)}</h1>
        <p className="muted">{t("Families on Agarwal keep their shopping in one place.", "Agarwal वरील कुटुंबे त्यांची खरेदी एकाच ठिकाणी ठेवतात.")}</p>
        <h2>{t("What joining shares", "सामील झाल्यावर काय दिसते")}</h2>
        <ul className="family-perks">
          <li>
            <Check size={18} aria-hidden="true" />
            {t(
              "Orders you place from now on show in Family spend, with invoices, for the family's adults.",
              "आतापासून तुम्ही दिलेल्या ऑर्डर कुटुंबातील मोठ्यांना खर्चात, पावत्यांसह दिसतील.",
            )}
          </li>
          <li>
            <Check size={18} aria-hidden="true" />
            {t("Choose Private at checkout to keep an order out.", "एखादी ऑर्डर बाहेर ठेवायची असल्यास चेकआउटला “खाजगी” निवडा.")}
          </li>
          <li>
            <Check size={18} aria-hidden="true" />
            {t(`You can leave any time, and ${ownerName} can remove people.`, `तुम्ही केव्हाही सोडू शकता, आणि ${ownerName} लोकांना काढू शकतात.`)}
          </li>
        </ul>
        {member ? (
          <Link className="primary-button" href="/account/family">
            {t("Open your family", "तुमचे कुटुंब उघडा")}
          </Link>
        ) : mine ? (
          <p className="notice">
            {t(
              `You're already in “${mine.name}”. Leave it first to join this one.`,
              `तुम्ही आधीच “${mine.name}” मध्ये आहात. हे जॉइन करण्यासाठी आधी ते सोडा.`,
            )}
          </p>
        ) : user ? (
          <ActionForm action={familyAction} submit={t(`Join “${family.name}”`, `“${family.name}” मध्ये सामील व्हा`)}>
            <input type="hidden" name="intent" value="join" />
            <input type="hidden" name="token" value={token} />
          </ActionForm>
        ) : (
          <Link className="primary-button" href={`/login?then=${encodeURIComponent(`/family/${token}`)}`}>
            {t("Sign in to join", "सामील होण्यासाठी साइन इन करा")}
          </Link>
        )}
      </div>
    </section>
  );
}
