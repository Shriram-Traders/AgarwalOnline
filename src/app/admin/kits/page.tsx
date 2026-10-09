import Link from "next/link";
import mongoose from "mongoose";
import { Backpack } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { CatalogAdminNav } from "@/components/catalog-admin-nav";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeading } from "@/components/page-heading";
import { RecordHistory } from "@/components/record-history";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { requirePage } from "@/lib/auth/session";
import { connectDB } from "@/lib/db/connect";
import { CLASSES, SchoolKit, classLabel } from "@/lib/family/models";
import { academicYear } from "@/lib/family/service";
import { kitAction } from "@/lib/family/staff-actions";
import { ShoppingList } from "@/lib/lists/models";
import { describeItems } from "@/lib/lists/service";
import { formatPrice } from "@/lib/display";
export const metadata = { title: "School kits", robots: { index: false } };

type Kit = {
  _id: unknown;
  school: string;
  className: string;
  year: string;
  status: string;
  items: { variantId: unknown; quantity: number }[];
  updatedAt: Date;
};
type Board = { _id: unknown; name: string; items: unknown[] };

/** The same fields for adding and editing, so the two forms can never drift apart. */
function KitFields({ kit, boards, schools, year }: { kit?: Kit; boards: Board[]; schools: string[]; year: string }) {
  return (
    <div className="staff-form-grid">
      <label>
        School
        <input name="school" defaultValue={kit?.school} list="kit-school-names" minLength={2} maxLength={80} required />
      </label>
      <label>
        Class
        <select name="className" defaultValue={kit?.className ?? ""} required>
          <option value="" disabled>
            Pick a class
          </option>
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {classLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label>
        School year <small>Like 2026-27</small>
        <input name="year" defaultValue={kit?.year ?? year} inputMode="numeric" pattern="\d{4}-\d{2}" required />
      </label>
      <label>
        Items from your board <small>Save products to a board of your own, then copy it here</small>
        <select name="boardId" defaultValue="" required={!kit}>
          <option value="" disabled={!kit}>
            {kit ? "Keep the current items" : "Pick a board"}
          </option>
          {boards.map((board) => (
            <option key={String(board._id)} value={String(board._id)}>
              {board.name} · {board.items.length} line{board.items.length === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </label>
      <datalist id="kit-school-names">
        {schools.map((school) => (
          <option key={school} value={school} />
        ))}
      </datalist>
    </div>
  );
}

export default async function KitsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; year?: string; status?: string; edit?: string }>;
}) {
  const user = await requirePage("catalog:write");
  const { q = "", year = "", status = "", edit } = await searchParams;
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (q.trim()) filter.school = { $regex: q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (/^\d{4}-\d{2}$/.test(year)) filter.year = year;
  if (status === "draft" || status === "published") filter.status = status;
  const [kits, years, schools, boards]: [Kit[], string[], string[], Board[]] = await Promise.all([
    SchoolKit.find(filter).sort({ year: -1, school: 1, className: 1 }).limit(200),
    SchoolKit.distinct("year"),
    SchoolKit.distinct("school"),
    ShoppingList.find({ ownerId: user.id, kind: "board" }).sort({ updatedAt: -1 }).select("name items"),
  ]);
  const editing = edit && mongoose.isValidObjectId(edit) ? await SchoolKit.findById(edit) : null;
  const rows = editing ? await describeItems(editing.items) : [];
  const totals = new Map(
    await Promise.all(
      kits.map(async (kit) => {
        const lines = await describeItems(kit.items);
        return [String(kit._id), lines.reduce((sum, line) => sum + line.pricePaise * line.quantity, 0)] as const;
      }),
    ),
  );
  const thisYear = academicYear(new Date());
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="School kits"
        lead="Each school's list for a class, ready for parents to buy in one tap. Parents with a matching child are told when you publish."
        aside={<span className="live-chip">{kits.length} shown</span>}
      />
      <CatalogAdminNav />
      {editing && (
        <div className="panel adjust-panel" id="edit">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{editing.year} · {editing.status === "published" ? "Published" : "Draft"}</span>
              <h2>
                {editing.school}, {classLabel(editing.className)}
              </h2>
            </div>
            <Link href="/admin/kits" className="text-button">
              Close
            </Link>
          </div>
          <ActionForm action={kitAction} submit="Save kit">
            <input type="hidden" name="kitId" value={String(editing._id)} />
            <KitFields kit={editing} boards={boards} schools={schools} year={thisYear} />
          </ActionForm>
          <h3 className="share-subhead">
            {rows.length} line{rows.length === 1 ? "" : "s"} ·{" "}
            {formatPrice(rows.reduce((sum, row) => sum + row.pricePaise * row.quantity, 0))}
          </h3>
          <ul className="kit-lines">
            {rows.map((row) => (
              <li key={row.variantId}>
                <span>
                  {row.quantity} × {row.name.en} <small>{row.label}</small>
                </span>
                {row.available < row.quantity ? <StatusPill tone="warn">Short of stock</StatusPill> : null}
              </li>
            ))}
          </ul>
          <ActionForm
            action={kitAction}
            className="list-inline-form"
            buttonClassName={editing.status === "published" ? "secondary-button" : "primary-button"}
            submit={editing.status === "published" ? "Pause this kit" : "Publish this kit"}
            confirmMessage={
              editing.status === "published"
                ? "Parents stop seeing this kit until you publish it again."
                : "Parents of every matching child see it and are told it is ready."
            }
          >
            <input type="hidden" name="intent" value="status" />
            <input type="hidden" name="kitId" value={String(editing._id)} />
            <input type="hidden" name="status" value={editing.status === "published" ? "draft" : "published"} />
          </ActionForm>
          <RecordHistory target={String(editing._id)} />
        </div>
      )}
      <details className="panel create-staff">
        <summary>Add a school kit</summary>
        <ActionForm action={kitAction} submit="Save as draft">
          <KitFields boards={boards} schools={schools} year={thisYear} />
        </ActionForm>
        {!boards.length && (
          <p className="muted">
            You have no boards yet. Open a product, tap Save and make a board named after the class, like “St. Mary’s Class 5”.
          </p>
        )}
      </details>
      <FilterBar label="Filter school kits" clearHref="/admin/kits">
        <label>
          School
          <input name="q" defaultValue={q} maxLength={80} placeholder="Search schools" />
        </label>
        <label>
          Year
          <select name="year" defaultValue={year}>
            <option value="">All years</option>
            {years.sort().reverse().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={status}>
            <option value="">Any</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </label>
      </FilterBar>
      <DataTable
        caption="School kits with their year, number of lines, total and status"
        rows={kits}
        rowKey={(kit) => String(kit._id)}
        columns={[
          {
            header: "Kit",
            cell: (kit) => (
              <Link href={`/admin/kits?edit=${kit._id}#edit`}>
                <strong>{kit.school}</strong> <small>{classLabel(kit.className)}</small>
              </Link>
            ),
          },
          { header: "Year", cell: (kit) => kit.year },
          { header: "Lines", numeric: true, cell: (kit) => kit.items.length },
          { header: "Total", numeric: true, cell: (kit) => formatPrice(totals.get(String(kit._id)) ?? 0) },
          { header: "Status", cell: (kit) => <StatusPill value={kit.status} /> },
          { header: "Updated", cell: (kit) => <When at={kit.updatedAt} /> },
        ]}
        empty={
          <EmptyState
            icon={Backpack}
            heading="h3"
            title={q || year || status ? "No kits match" : "No school kits yet"}
            body={
              q || year || status
                ? "Try another school or year."
                : "Add the first one above. Parents who save that school and class see it on their Family page."
            }
          />
        }
      />
    </section>
  );
}
