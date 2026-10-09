import { legalRoute } from "@/components/legal-page";

const route = legalRoute("shipping");
export const generateMetadata = route.generateMetadata;
export default route.Page;
