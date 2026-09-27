import { redirect } from "next/navigation";
export const metadata = { title: "Sign in", robots: { index: false } };
/** Staff sign in on the same page as everyone else; the account menu opens their workspace. */
export default function StaffLogin() {
  redirect("/login");
}
