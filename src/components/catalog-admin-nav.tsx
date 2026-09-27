"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Views of the catalog. Adding a product is an action, so it is a button on the Products page, not a tab. */
const links = [
  ["/admin/products", "Products"],
  ["/admin/categories", "Categories"],
  ["/admin/inventory", "Stock"],
] as const;

export function CatalogAdminNav() {
  const pathname = usePathname();
  return (
    <nav className="catalog-admin-nav" aria-label="Catalog views">
      {links.map(([href, label]) => (
        <Link
          href={href}
          key={href}
          aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
