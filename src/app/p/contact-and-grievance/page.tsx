import { legalRoute } from "@/components/legal-page";

const route = legalRoute("contact");
export const generateMetadata = route.generateMetadata;
export default route.Page;
