import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Camera, Code2, Globe, Mail, MessageCircle, type LucideIcon } from "lucide-react";
import type { SectionValues } from "@/lib/settings/shop";

/* The developer credit and the team (Settings → Developer and team, which only Tech can change): a
   card at the bottom of every shop page, and the team page. A contact left blank there is not shown. */

export type Team = SectionValues<"team">;
type Contact = { href: string; label: string; Icon: LucideIcon };
type Links = { email: string; whatsapp: string; linkedin: string; github: string; instagram: string; portfolio: string };

/** Each way to reach someone that's filled in. Email shows its address where there's room. */
function contactsOf(links: Links, full = false): Contact[] {
  return [
    links.email && { href: `mailto:${links.email}`, label: full ? links.email : "Email", Icon: Mail },
    links.whatsapp && { href: `https://wa.me/91${links.whatsapp}`, label: "WhatsApp", Icon: MessageCircle },
    links.linkedin && { href: links.linkedin, label: "LinkedIn", Icon: BriefcaseBusiness },
    links.github && { href: links.github, label: "GitHub", Icon: Code2 },
    links.instagram && { href: links.instagram, label: "Instagram", Icon: Camera },
    links.portfolio && { href: links.portfolio, label: "Portfolio", Icon: Globe },
  ].filter((contact): contact is Contact => Boolean(contact));
}

const devLinks = (team: Team): Links => ({
  email: team.devEmail,
  whatsapp: team.devWhatsapp,
  linkedin: team.devLinkedin,
  github: team.devGithub,
  instagram: team.devInstagram,
  portfolio: team.devPortfolio,
});

/** The developer's contacts, for the footer card. */
export const devContacts = (team: Team, full = false) => contactsOf(devLinks(team), full);

export type Member = { key: string; name: string; role: string; photo: string; bio: string; skills: string[]; contacts: Contact[] };
const skillsOf = (text: string) =>
  text
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);

/** The people on the team page: the developer, and the second member unless their name is left blank. */
export function teamMembers(team: Team): Member[] {
  const members: Member[] = [
    {
      key: "lead",
      name: team.devName,
      role: team.devRole,
      photo: team.devPhoto,
      bio: team.devBio,
      skills: skillsOf(team.devSkills),
      contacts: contactsOf(devLinks(team)),
    },
  ];
  if (team.helperName.trim())
    members.push({
      key: "helper",
      name: team.helperName,
      role: team.helperRole,
      photo: team.helperPhoto,
      bio: team.helperBio,
      skills: skillsOf(team.helperSkills),
      contacts: contactsOf({
        email: team.helperEmail,
        whatsapp: team.helperWhatsapp,
        linkedin: team.helperLinkedin,
        github: team.helperGithub,
        instagram: team.helperInstagram,
        portfolio: team.helperPortfolio,
      }),
    });
  return members;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** The photo from Settings, or the person's initials in its place until there is one. */
export function TeamPhoto({ name, photo, size }: { name: string; photo?: string; size: number }) {
  return photo ? (
    <Image src={photo} alt={name} width={size} height={size} unoptimized className="dev-photo" />
  ) : (
    <span className="dev-photo is-initials" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function ContactList({ contacts, label }: { contacts: Contact[]; label?: string }) {
  if (!contacts.length) return null;
  return (
    <ul className="dev-contacts" aria-label={label}>
      {contacts.map(({ href, label: text, Icon }) => (
        <li key={href}>
          <a href={href} {...(href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            <Icon size={18} aria-hidden="true" />
            {text}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The footer's card: who built the site, how to reach them, and the way to the team page. */
export function DevCredit({ team, mr }: { team: Team; mr: boolean }) {
  return (
    <section className="dev-credit" aria-label={`${mr ? "विकसित केले" : "Developed by"} ${team.devName}`}>
      <TeamPhoto name={team.devName} photo={team.devPhoto} size={64} />
      <div className="dev-credit-text">
        <p className="dev-credit-eyebrow">{mr ? "विकसित केले" : "Developed by"}</p>
        <p className="dev-credit-name">{team.devName}</p>
        <p className="dev-credit-role">{team.devRole}</p>
      </div>
      <ContactList contacts={devContacts(team)} />
      <Link href="/p/team" className="dev-team-link">
        {mr ? "टीम पाहा" : "Meet the team"}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
