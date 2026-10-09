import Image from "next/image";
import Link from "next/link";
import { MoreHorizontal, Plus, ReceiptText, UsersRound } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { currentLocale } from "@/lib/i18n";
import { getEnv } from "@/lib/env";
import { User } from "@/lib/db/models";
import { istDate } from "@/lib/commerce/delivery";
import { familyOf, familySpend } from "@/lib/family/service";
import { familyAction } from "@/lib/family/actions";
import { childKits, kitSchools } from "@/lib/family/kits";
import { tabStanding } from "@/lib/family/checkout";
import { TabPayment } from "@/lib/family/models";
import { When } from "@/components/when";
import { conversationAction } from "@/lib/chat/actions";
import { productImages } from "@/lib/catalog/images";
import { CLASSES, classLabel } from "@/lib/family/models";
import { firstName } from "@/lib/lists/service";
import { formatPrice } from "@/lib/display";
import { ActionForm } from "@/components/action-form";
import { Avatars } from "@/components/avatars";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { Popover } from "@/components/popover";
import { ShareLink } from "@/components/share-link";
import { ShareSheet } from "@/components/share-sheet";
import { StatTiles } from "@/components/stat-tiles";
export const metadata = { title: "Family", robots: { index: false } };

type Child = { _id: unknown; name: string; school: string; className: string; year: string };
type KitInfo = Awaited<ReturnType<typeof childKits>>[number];

/** Under each child: the yearly class question, their kit with one Buy button, or a way to ask for one. */
function KitBlock({ child, info, mr }: { child: Child; info?: KitInfo; mr: boolean }) {
  const t = (en: string, marathi: string) => (mr ? marathi : en);
  const kit = info?.kit;
  return (
    <>
      {info?.next && (
        <div className="class-up">
          <strong>
            {t(
              `Is ${child.name} going into ${classLabel(info.next.className)} for ${info.next.year}?`,
              `${child.name} ${info.next.year} साठी ${classLabel(info.next.className, true)}मध्ये जात आहे का?`,
            )}
          </strong>
          <div className="class-up-actions">
            {(["yes", "no"] as const).map((moved) => (
              <ActionForm
                key={moved}
                action={familyAction}
                className="list-inline-form"
                buttonClassName={moved === "yes" ? "primary-button" : "secondary-button"}
                submit={
                  moved === "yes"
                    ? t(`Yes, ${classLabel(info.next!.className)}`, `हो, ${classLabel(info.next!.className, true)}`)
                    : t(`No, staying in ${classLabel(child.className)}`, `नाही, ${classLabel(child.className, true)}च`)
                }
              >
                <input type="hidden" name="intent" value="promote" />
                <input type="hidden" name="childId" value={String(child._id)} />
                <input type="hidden" name="year" value={info.next!.year} />
                <input type="hidden" name="moved" value={moved} />
              </ActionForm>
            ))}
          </div>
        </div>
      )}
      {kit ? (
        <div className="kit-block">
          <div className="kit-thumbs" aria-hidden="true">
            {kit.images.map((item, index) => {
              const image = item.image ?? productImages[item.slug];
              return <span key={index}>{image && <Image src={image} alt="" fill sizes="56px" unoptimized />}</span>;
            })}
            {kit.lines > kit.images.length && <span className="kit-more">+{kit.lines - kit.images.length}</span>}
          </div>
          <p>
            <strong>{t(`${classLabel(child.className)} kit from the store`, `${classLabel(child.className, true)} शालेय संच`)}</strong>
            <small>
              {mr ? `${kit.lines} वस्तू` : `${kit.lines} item${kit.lines === 1 ? "" : "s"}`}
              {kit.unavailable
                ? t(` · ${kit.unavailable} out of stock, skipped for now`, ` · ${kit.unavailable} उपलब्ध नाहीत, आत्ता वगळल्या`)
                : ""}
            </small>
          </p>
          <ActionForm
            action={familyAction}
            className="list-inline-form kit-buy"
            submit={`${t("Buy the kit", "संच खरेदी करा")} · ${formatPrice(kit.totalPaise)}`}
          >
            <input type="hidden" name="intent" value="kit" />
            <input type="hidden" name="childId" value={String(child._id)} />
          </ActionForm>
        </div>
      ) : child.school ? (
        <div className="kit-block kit-missing">
          <p className="muted">
            {t(
              `${child.school} has no ${classLabel(child.className)} kit with us yet. We'll put one together if you ask.`,
              `${child.school} चा ${classLabel(child.className, true)} संच अजून आमच्याकडे नाही. सांगितल्यास आम्ही तयार करू.`,
            )}
          </p>
          <ActionForm
            action={conversationAction}
            className="list-inline-form kit-buy"
            buttonClassName="secondary-button"
            submit={t("Ask the store to add it", "दुकानाला संच जोडायला सांगा")}
          >
            <input
              type="hidden"
              name="title"
              value={`School kit please: ${child.school}, ${classLabel(child.className)}`.slice(0, 100)}
            />
          </ActionForm>
        </div>
      ) : (
        <p className="muted kit-missing">
          {t("Add their school under ⋯ to see their school kit.", "शालेय संच पाहण्यासाठी ⋯ मध्ये शाळा जोडा.")}
        </p>
      )}
    </>
  );
}

/** The family hub: people and kids first, then what the family spent here. */
export default async function FamilyPage() {
  const user = await requirePage("order:own");
  const locale = await currentLocale();
  const mr = locale === "mr";
  const t = (en: string, marathi: string) => (mr ? marathi : en);
  const family = await familyOf(user.id);
  if (!family) return <StartFamily mr={mr} />;

  const owner = String(family.ownerId) === user.id;
  const [people, spend, kits, schools, standing, payments] = await Promise.all([
    User.find({ _id: { $in: family.adults } }).select("name"),
    familySpend(family),
    childKits(family),
    kitSchools(),
    tabStanding(user.id),
    TabPayment.find({ familyId: family._id, voidedAt: null }).sort({ createdAt: -1 }).limit(5),
  ]);
  const tabOpen = standing?.status === "active" || standing?.status === "paused";
  const nameOf = (id: unknown) => people.find((p) => String(p._id) === String(id))?.name ?? "Someone";
  const adults = family.adults.map((id: unknown) => ({ id: String(id), name: nameOf(id), you: String(id) === user.id }));
  const children: Child[] = family.children;
  const kitFor = (child: Child) => kits.find((k) => k.childId === String(child._id));
  const personName = (key: string, name: string | null) =>
    key === user.id ? t("You", "तुम्ही") : key === "everyone" ? t("Everyone", "सर्व") : (name ?? t("Everyone", "सर्व"));
  const forLine = (key: string, name: string | null) =>
    mr
      ? `${personName(key, name)} साठी`
      : key === user.id
        ? "for you"
        : key === "everyone" || !name
          ? "for everyone"
          : `for ${name}`;
  const monthName = (month: string) =>
    new Intl.DateTimeFormat(mr ? "mr-IN" : "en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${month}-01T00:00:00Z`),
    );
  const day = (at: Date) =>
    new Date(at).toLocaleDateString(mr ? "mr-IN" : "en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const thisMonth = istDate(new Date()).slice(0, 7);
  const current = spend.months.find((m) => m.month === thisMonth);
  const inviteUrl = `${getEnv().APP_ORIGIN}/family/${family.inviteToken}`;
  const others = adults.filter((a: { you: boolean }) => !a.you).map((a: { name: string }) => firstName(a.name));
  const adultsLine = others.length
    ? `${t("You and", "तुम्ही आणि")} ${new Intl.ListFormat(mr ? "mr" : "en", { type: "conjunction" }).format(others)}`
    : t("Only you so far", "सध्या फक्त तुम्ही");
  const kidsLine = !children.length ? "" : mr ? ` · ${children.length} मुले` : ` · ${children.length} kid${children.length === 1 ? "" : "s"}`;
  const hidden = (intent: string, extra: Record<string, string> = {}) =>
    Object.entries({ intent, ...extra }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);

  return (
    <section className="page-container">
      <Link href="/account" className="back-link">
        ‹ {t("Account", "खाते")}
      </Link>
      <PageHeading eyebrow={t("YOUR FAMILY", "तुमचे कुटुंब")} title={family.name} lead={`${adultsLine}${kidsLine}`} />

      <ul className="family-people" aria-label={t("Adults in this family", "कुटुंबातील मोठे")}>
        {adults.map((adult: { id: string; name: string; you: boolean }) => (
          <li key={adult.id}>
            <Avatars names={[adult.name]} />
            <span>{adult.you ? t("You", "तुम्ही") : firstName(adult.name)}</span>
          </li>
        ))}
        {owner && (
          <li>
            <ShareSheet
              label={t("Invite someone to the family", "कुटुंबात कोणाला तरी बोलवा")}
              title={t(`Invite to “${family.name}”`, `“${family.name}” मध्ये आमंत्रित करा`)}
              closeLabel={t("Close", "बंद करा")}
              triggerClassName="family-invite"
              trigger={
                <>
                  <span className="family-invite-ring" aria-hidden="true">
                    <Plus size={22} />
                  </span>
                  <span>{t("Invite", "आमंत्रित करा")}</span>
                </>
              }
            >
              <div className="invite-panel">
                <a
                  className="primary-button"
                  href={`https://wa.me/?text=${encodeURIComponent(
                    t(`Join our family “${family.name}” on Agarwal: ${inviteUrl}`, `Agarwal वर आपल्या “${family.name}” मध्ये सामील व्हा: ${inviteUrl}`),
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("Send on WhatsApp", "WhatsApp वर पाठवा")}
                </a>
                <ShareLink
                  label={t("Link", "लिंक")}
                  url={inviteUrl}
                  hint={t(
                    "A link lets one person in, then changes. Open this again for the next person.",
                    "एक लिंक एकाच व्यक्तीला आत घेते, मग बदलते. पुढच्या व्यक्तीसाठी हे पुन्हा उघडा.",
                  )}
                  title={family.name}
                  copy={t("Copy", "कॉपी")}
                  copied={t("Copied", "कॉपी केली")}
                />
              </div>
              <h3 className="share-subhead">{t("People in this family", "कुटुंबातील लोक")}</h3>
              <ul className="people-list">
                {adults.map((adult: { id: string; name: string; you: boolean }) => (
                  <li key={adult.id}>
                    <span className="people-row">
                      <Avatars names={[adult.name]} size="sm" />
                      <span>
                        <strong>
                          {adult.name}
                          {adult.you ? t(" (you)", " (तुम्ही)") : ""}
                        </strong>
                        <small>{adult.id === String(family.ownerId) ? t("Owner", "मालक") : t("Sees family spend", "कुटुंबाचा खर्च पाहू शकतात")}</small>
                      </span>
                    </span>
                    {!adult.you && (
                      <ActionForm
                        action={familyAction}
                        submit={t(`Remove ${firstName(adult.name)}`, "काढा")}
                        className="list-inline-form"
                        buttonClassName="secondary-button compact-button"
                        confirmMessage={t(
                          `${adult.name} will no longer see the family's spend. Their own orders stay theirs.`,
                          `${adult.name} यांना कुटुंबाचा खर्च दिसणार नाही. त्यांच्या ऑर्डर त्यांच्याकडेच राहतील.`,
                        )}
                      >
                        {hidden("remove-person", { personId: adult.id })}
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
              <ActionForm
                action={familyAction}
                submit={t("Make a new link", "नवीन लिंक बनवा")}
                className="list-inline-form"
                buttonClassName="text-button"
                confirmMessage={t("The current link stops working. People already in stay.", "सध्याची लिंक बंद होईल. आधीचे लोक राहतील.")}
              >
                {hidden("reset-link")}
              </ActionForm>
            </ShareSheet>
          </li>
        )}
      </ul>

      <StatTiles
        className="family-stats"
        items={[
          {
            label: t(`Spent in ${monthName(thisMonth)}`, `${monthName(thisMonth)} मधील खर्च`),
            value: formatPrice(current?.totalPaise ?? 0),
            href: "#spend",
          },
          tabOpen
            ? { label: t("Owed on the family tab", "कुटुंब खात्यावर बाकी"), value: formatPrice(Math.max(0, standing!.owedPaise)), href: "#tab" }
            : { label: t("Last 12 months", "मागील १२ महिने"), value: formatPrice(spend.totalPaise), href: "#spend" },
        ]}
      />

      <datalist id="kit-schools">
        {schools.map((school) => (
          <option key={school} value={school} />
        ))}
      </datalist>
      <div className="family-layout">
        <div className="family-main">
          <section id="kids" className="family-section" aria-labelledby="kids-title">
            <h2 id="kids-title">{t("Kids", "मुले")}</h2>
            {children.length > 0 && (
              <div className="kid-grid">
                {children.map((child) => (
                  <article className="panel kid-card" key={String(child._id)}>
                    <div className="kid-head">
                      <span className="kid-mark" aria-hidden="true">
                        {child.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>{child.name}</strong>
                        <small>
                          {classLabel(child.className, mr)}
                          {child.school ? ` · ${child.school}` : ""}
                        </small>
                      </span>
                      <Popover
                        className="overflow-menu"
                        label={t(`Change ${child.name}`, `${child.name} बदला`)}
                        summary={<MoreHorizontal size={20} aria-hidden="true" />}
                      >
                        <ChildForm child={child} mr={mr} />
                        <ActionForm
                          action={familyAction}
                          submit={t(`Remove ${child.name}`, `${child.name} काढा`)}
                          className="list-inline-form"
                          buttonClassName="text-button"
                          confirmMessage={t(
                            `Remove ${child.name} from the family? Past orders keep the name.`,
                            `${child.name} यांना कुटुंबातून काढायचे? जुन्या ऑर्डरवर नाव राहील.`,
                          )}
                        >
                          {hidden("remove-child", { childId: String(child._id) })}
                        </ActionForm>
                      </Popover>
                    </div>
                    <KitBlock child={child} info={kitFor(child)} mr={mr} />
                  </article>
                ))}
              </div>
            )}
            <details className="panel add-child" open={children.length === 0}>
              <summary>
                <Plus size={18} aria-hidden="true" /> {t("Add a child", "मूल जोडा")}
              </summary>
              <p className="muted">
                {t(
                  "Their school and class let the store keep their school kit ready.",
                  "शाळा आणि इयत्ता कळली की दुकान त्यांचा शालेय संच तयार ठेवू शकते.",
                )}
              </p>
              <ChildForm mr={mr} />
            </details>
          </section>

          <section id="spend" className="family-section" aria-labelledby="spend-title">
            <h2 id="spend-title">{t("Spent here", "इथला खर्च")}</h2>
            {spend.months.length ? (
              spend.months.map((month, index) => (
                <details className="panel spend-month" key={month.month} open={index === 0}>
                  <summary>
                    <strong>{monthName(month.month)}</strong>
                    <span>{formatPrice(month.totalPaise)}</span>
                  </summary>
                  <ul>
                    {month.orders.map((order) => (
                      <li key={order.id} className="spend-row">
                        <span>
                          <strong>{order.number}</strong>
                          <small>
                            {order.buyerId === user.id ? t("You", "तुम्ही") : order.buyer} ·{" "}
                            {forLine(order.forKey, order.forName)} · {day(order.at)}
                          </small>
                        </span>
                        <span>
                          <strong>{formatPrice(order.netPaise)}</strong>
                          <a href={`/api/invoices/${order.id}`}>
                            <ReceiptText size={14} aria-hidden="true" /> {t("Invoice", "पावती")}
                          </a>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))
            ) : (
              <EmptyState
                heading="h3"
                icon={ReceiptText}
                title={t("Nothing spent here yet", "अजून इथे खर्च नाही")}
                body={t(
                  "Orders the family places from now on show here, month by month, with invoices.",
                  "आतापासून कुटुंबाने दिलेल्या ऑर्डर इथे महिन्यानुसार, पावत्यांसह दिसतील.",
                )}
              />
            )}
          </section>
        </div>

        <aside className="family-aside">
          <TabCard
            standing={standing}
            payments={payments}
            owner={owner}
            mr={mr}
            dueBy={new Intl.DateTimeFormat(mr ? "mr-IN" : "en-IN", { day: "numeric", month: "long", timeZone: "UTC" }).format(
              new Date(`${thisMonth}-10T00:00:00Z`),
            )}
          />
          {spend.people.length > 0 && (
            <section className="panel by-person" aria-labelledby="by-person-title">
              <h2 id="by-person-title">{t("By person · 12 months", "व्यक्तीनुसार · १२ महिने")}</h2>
              <ul>
                {spend.people.map((person) => (
                  <li key={person.key}>
                    <span>{personName(person.key, person.name)}</span>
                    <strong>{formatPrice(person.totalPaise)}</strong>
                  </li>
                ))}
              </ul>
              <p className="muted">
                {t("Choose who an order is for at checkout.", "ऑर्डर कोणासाठी आहे ते चेकआउटला निवडा.")}
              </p>
            </section>
          )}
          {owner ? (
            adults.length === 1 && (
              <ActionForm
                action={familyAction}
                submit={t("Delete this family", "हे कुटुंब हटवा")}
                className="list-inline-form"
                buttonClassName="text-button"
                confirmMessage={t(
                  "Your orders stay yours; the family's spend page goes away.",
                  "तुमच्या ऑर्डर तुमच्याकडेच राहतील; कुटुंबाचे खर्च पान जाईल.",
                )}
              >
                {hidden("delete")}
              </ActionForm>
            )
          ) : (
            <ActionForm
              action={familyAction}
              submit={t("Leave this family", "हे कुटुंब सोडा")}
              className="list-inline-form"
              buttonClassName="text-button"
              confirmMessage={t(
                "Your orders stay yours. The family stops seeing new ones.",
                "तुमच्या ऑर्डर तुमच्याकडेच राहतील. कुटुंबाला नवीन ऑर्डर दिसणार नाहीत.",
              )}
            >
              {hidden("leave")}
            </ActionForm>
          )}
        </aside>
      </div>
    </section>
  );
}

type Standing = Awaited<ReturnType<typeof tabStanding>>;

/** The khata: what is owed against the limit and when to pay, or how to ask the store for one. */
function TabCard({
  standing,
  payments,
  owner,
  mr,
  dueBy,
}: {
  standing: Standing;
  payments: { _id: unknown; amountPaise: number; method: string; createdAt: Date }[];
  owner: boolean;
  mr: boolean;
  dueBy: string;
}) {
  const t = (en: string, marathi: string) => (mr ? marathi : en);
  if (!standing || standing.status === "requested" || standing.status === "closed") {
    const owed = standing && standing.owedPaise > 0 ? standing.owedPaise : 0;
    return (
      <section id="tab" className="panel tab-card" aria-labelledby="tab-title">
        <h2 id="tab-title">{t("Family tab", "कुटुंब खाते")}</h2>
        {standing?.status === "requested" ? (
          <p className="muted">{t("You asked for a tab. The store will be in touch before it opens.", "तुम्ही खाते मागितले आहे. खाते उघडण्यापूर्वी दुकान संपर्क करेल.")}</p>
        ) : (
          <>
            <p className="muted">
              {standing?.status === "closed"
                ? owed
                  ? t(`Your tab is closed. ${formatPrice(owed)} is still owed; pay it at the store.`, `खाते बंद आहे. ${formatPrice(owed)} अजून बाकी आहे; दुकानात भरा.`)
                  : t("Your tab is closed.", "तुमचे खाते बंद आहे.")
                : t(
                    "Order now and settle with the store once a month, like a khata. The store sets your family's limit.",
                    "आत्ता ऑर्डर करा आणि महिन्यातून एकदा दुकानात हिशोब करा, खात्यासारखे. मर्यादा दुकान ठरवते.",
                  )}
            </p>
            {owner ? (
              <ActionForm action={familyAction} submit={t("Ask the store for a tab", "दुकानाकडे खाते मागा")} buttonClassName="secondary-button">
                <input type="hidden" name="intent" value="request-tab" />
              </ActionForm>
            ) : (
              <p className="muted">{t("The family's owner can ask the store for one.", "कुटुंबाचे मालक दुकानाकडे खाते मागू शकतात.")}</p>
            )}
          </>
        )}
      </section>
    );
  }
  const owed = Math.max(0, standing.owedPaise);
  const used = standing.limitPaise ? Math.min(100, Math.round((owed / standing.limitPaise) * 100)) : 100;
  return (
    <section id="tab" className="panel tab-card open" aria-labelledby="tab-title">
      <h2 id="tab-title">
        {t("FAMILY TAB", "कुटुंब खाते")}
        {standing.status === "paused" && <span className="tab-paused">{t("Paused", "थांबवले")}</span>}
      </h2>
      <p className="tab-owed">
        <strong>{formatPrice(owed)}</strong> {t(`owed of ${formatPrice(standing.limitPaise)}`, `बाकी, मर्यादा ${formatPrice(standing.limitPaise)}`)}
      </p>
      <div className="tab-meter" role="img" aria-label={t(`${used}% of the limit used`, `मर्यादेपैकी ${used}% वापरले`)}>
        <span style={{ width: `${used}%` }} />
      </div>
      <p>
        {standing.duePaise > 0
          ? t(
              `${formatPrice(standing.duePaise)} from last month${standing.overdue ? " is overdue" : `, please pay by ${dueBy}`}.`,
              `मागच्या महिन्याचे ${formatPrice(standing.duePaise)}${standing.overdue ? " थकले आहेत" : ` ${dueBy} पर्यंत भरा`}.`,
            )
          : t(`${formatPrice(standing.availablePaise)} left. Pay at the store or to the rider.`, `${formatPrice(standing.availablePaise)} शिल्लक. दुकानात किंवा डिलिव्हरीवेळी भरा.`)}
      </p>
      {payments.length > 0 && (
        <ul className="tab-payments" aria-label={t("Recent payments", "अलीकडील भरणा")}>
          {payments.map((payment) => (
            <li key={String(payment._id)}>
              <span>
                {t("Paid", "भरले")} · {payment.method === "upi" ? "UPI" : t("cash", "रोख")} · <When at={payment.createdAt} />
              </span>
              <strong>{formatPrice(payment.amountPaise)}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Add a child, or change one: name, school and class. */
function ChildForm({ child, mr }: { child?: Child; mr: boolean }) {
  const t = (en: string, marathi: string) => (mr ? marathi : en);
  return (
    <ActionForm action={familyAction} submit={child ? t("Save", "जतन करा") : t("Add child", "मूल जोडा")} className="form-stack child-form">
      <input type="hidden" name="intent" value="save-child" />
      {child && <input type="hidden" name="childId" value={String(child._id)} />}
      <label>
        {t("Name", "नाव")}
        <input name="name" defaultValue={child?.name} required maxLength={40} autoComplete="off" />
      </label>
      <label>
        {t("School", "शाळा")}
        <input name="school" defaultValue={child?.school} maxLength={80} autoComplete="off" list="kit-schools" />
      </label>
      <label>
        {t("Class", "इयत्ता")}
        <select name="className" defaultValue={child?.className ?? ""} required>
          <option value="" disabled>
            {t("Pick a class", "इयत्ता निवडा")}
          </option>
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {classLabel(c, mr)}
            </option>
          ))}
        </select>
      </label>
    </ActionForm>
  );
}

function StartFamily({ mr }: { mr: boolean }) {
  const t = (en: string, marathi: string) => (mr ? marathi : en);
  return (
    <section className="page-container">
      <Link href="/account" className="back-link">
        ‹ {t("Account", "खाते")}
      </Link>
      <PageHeading
        eyebrow={t("YOUR FAMILY", "तुमचे कुटुंब")}
        title={t("Shop as a family", "कुटुंब म्हणून खरेदी करा")}
        lead={t(
          "One place for your household: what you spend here each month, with invoices, and each child's school and class.",
          "तुमच्या घरासाठी एकच ठिकाण: इथे दर महिन्याला झालेला खर्च, पावत्यांसह, आणि प्रत्येक मुलाची शाळा व इयत्ता.",
        )}
      />
      <div className="family-start">
        <div className="panel">
          <h2>{t("Start your family", "तुमचे कुटुंब सुरू करा")}</h2>
          <ActionForm action={familyAction} submit={t("Start the family", "कुटुंब सुरू करा")}>
            <input type="hidden" name="intent" value="create" />
            <label>
              {t("Family name", "कुटुंबाचे नाव")}
              <input name="name" required minLength={2} maxLength={40} placeholder={t("Sharma family", "शर्मा कुटुंब")} />
            </label>
          </ActionForm>
        </div>
        <ul className="family-perks">
          <li>
            <ReceiptText size={20} aria-hidden="true" />
            {t("See what the family spends here, month by month, with invoices.", "कुटुंबाचा इथला खर्च महिन्यानुसार, पावत्यांसह पाहा.")}
          </li>
          <li>
            <UsersRound size={20} aria-hidden="true" />
            {t("Invite the other adults with one link.", "इतर मोठ्यांना एका लिंकने बोलवा.")}
          </li>
          <li>
            <Plus size={20} aria-hidden="true" />
            {t("Keep each child's school and class, so their school kit is one tap away.", "प्रत्येक मुलाची शाळा आणि इयत्ता जतन करा, म्हणजे शालेय संच एका टॅपवर.")}
          </li>
        </ul>
      </div>
      <p className="muted">{t("Got an invite? Open the link you were sent.", "आमंत्रण आले आहे? तुम्हाला पाठवलेली लिंक उघडा.")}</p>
    </section>
  );
}
