import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { ContactList, TeamPhoto, teamMembers } from "@/components/dev-credit";
import { shopSettings } from "@/lib/settings/shop";

/** "Krish Modi, with Swarnabh", or just the one name. */
const byline = (names: string[]) => (names.length > 1 ? `${names[0]}, with ${names.slice(1).join(" and ")}` : names[0]);

export async function generateMetadata(): Promise<Metadata> {
  const team = await shopSettings("team");
  return {
    title: "The team",
    description: `Agarwal Online is built and looked after by ${byline(teamMembers(team).map((member) => member.name))}.`,
  };
}

/** Who built the site, all from Settings → Developer and team: a card for each person, then a way to work with them. */
export default async function TeamPage() {
  const team = await shopSettings("team");
  const members = teamMembers(team);
  const firstName = team.devName.split(/\s+/)[0];
  const intro =
    team.pageIntro ||
    `Built and looked after by ${byline(members.map((member) => member.name))}. Get in touch about the website, or about building one for your business.`;
  return (
    <section className="page-container team-page">
      <PageHeading eyebrow="Agarwal Online" title={team.pageTitle} lead={intro} />
      <div className="team-grid">
        {members.map((member) => (
          <article className="panel team-member" key={member.key} aria-labelledby={`team-${member.key}`}>
            <div className="team-member-head">
              <TeamPhoto name={member.name} photo={member.photo} size={96} />
              <div>
                <h2 id={`team-${member.key}`}>{member.name}</h2>
                {member.role && <p className="team-role">{member.role}</p>}
              </div>
            </div>
            {member.bio && <p className="team-bio">{member.bio}</p>}
            {member.skills.length > 0 && (
              <ul className="team-skills" aria-label={`What ${member.name} works on`}>
                {member.skills.map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            )}
            <ContactList contacts={member.contacts} label={`Contact ${member.name}`} />
          </article>
        ))}
      </div>
      {team.hireOn && (team.devWhatsapp || team.devEmail) && (
        <section className="team-hire" aria-labelledby="team-hire-title">
          <div>
            <h2 id="team-hire-title">{team.hireTitle}</h2>
            <p>{team.hireText}</p>
          </div>
          <div className="team-hire-actions">
            {team.devWhatsapp && (
              <a className="primary-button" href={`https://wa.me/91${team.devWhatsapp}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={18} aria-hidden="true" /> Chat with {firstName}
              </a>
            )}
            {team.devEmail && (
              <a className="secondary-button" href={`mailto:${team.devEmail}`}>
                <Mail size={18} aria-hidden="true" /> {team.devEmail}
              </a>
            )}
          </div>
        </section>
      )}
      <p className="muted team-note">
        A question about an order or the shop? <Link href="/p/contact-and-grievance">Contact the shop</Link> instead.
      </p>
    </section>
  );
}
