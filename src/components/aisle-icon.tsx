import {
  Backpack,
  BriefcaseBusiness,
  Frame,
  Gift,
  Heart,
  LayoutGrid,
  Mail,
  NotebookPen,
  NotebookText,
  Palette,
  PartyPopper,
  Puzzle,
  Ribbon,
  ShoppingBasket,
} from "lucide-react";

const ICONS: Record<string, typeof Heart> = {
  stationery: NotebookPen,
  paper: NotebookText,
  school: Backpack,
  "art-craft": Palette,
  office: BriefcaseBusiness,
  "gift-sets": Gift,
  "gift-wrap": Ribbon,
  cards: Mail,
  decor: Frame,
  toys: Puzzle,
  party: PartyPopper,
  all: LayoutGrid,
};

/** Line icon standing in for a category or product that has no photograph. */
export function AisleIcon({ slug }: { slug: string }) {
  const Icon = ICONS[slug] ?? ShoppingBasket;
  return <Icon size={30} strokeWidth={1.4} aria-hidden="true" className="aisle-icon" />;
}
