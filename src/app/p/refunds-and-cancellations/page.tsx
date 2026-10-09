import { legalRoute } from "@/components/legal-page";

const route = legalRoute("refunds");
export const generateMetadata = route.generateMetadata;
export default route.Page;
