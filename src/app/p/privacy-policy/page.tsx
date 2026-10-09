import { legalRoute } from "@/components/legal-page";

const route = legalRoute("privacy");
export const generateMetadata = route.generateMetadata;
export default route.Page;
