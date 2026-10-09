import { legalRoute } from "@/components/legal-page";

const route = legalRoute("terms");
export const generateMetadata = route.generateMetadata;
export default route.Page;
