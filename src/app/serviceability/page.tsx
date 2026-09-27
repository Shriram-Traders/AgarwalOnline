import { deliveryRules } from "@/lib/commerce/service";
import { connectDB } from "@/lib/db/connect";
import { ServiceArea } from "@/lib/db/models";
import { currentLocale } from "@/lib/i18n";
export const metadata = { title: "Check your delivery area", description: "Enter your PIN code to see whether Agarwal General Stores delivers to you: Nagothane, Roha, Pali, RIL Township and NMD." };
export const dynamic = "force-dynamic";
export default async function Serviceability({
  searchParams,
}: {
  searchParams: Promise<{ pin?: string }>;
}) {
  const { pin } = await searchParams;
  const locale = await currentLocale();
  const mr = locale === "mr";
  const rules = await deliveryRules();
  await connectDB();
  const valid = !!pin && /^\d{6}$/.test(pin);
  const area = valid
    ? await ServiceArea.findOne({ enabled: true, pincodes: pin })
    : null;
  return (
    <section className="auth-card utility-card serviceability-card">
      <span className="eyebrow">{mr ? "वितरण तपासणी" : "DELIVERY CHECK"}</span>
      <h1>{mr ? "तुमचे क्षेत्र तपासा." : "Check your area."}</h1>
      <p>{mr ? "सध्याची वितरण उपलब्धता आणि शुल्क पाहण्यासाठी सहा अंकी पिन कोड टाका." : "Enter your six-digit PIN code for current delivery availability and charges."}</p>
      <form className="form-stack">
        <label>
          {mr ? "पिन कोड" : "PIN code"}
          <input
            name="pin"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            defaultValue={pin}
            autoComplete="postal-code"
            aria-describedby="pin-help"
            required
          />
        </label>
        <button className="primary-button">{mr ? "उपलब्धता तपासा" : "Check availability"}</button>
      </form>
      <small className="muted" id="pin-help">{mr ? "तुमचा पिन कोड फक्त वितरण उपलब्धता तपासण्यासाठी वापरला जातो." : "We use your PIN code only to check serviceability."}</small>
      {pin && (
        <div role="status" className={`panel serviceability-result ${area ? "available" : "unavailable"}`}>
          {area
            ? mr
              ? `होय! ${area.name} येथे वितरण उपलब्ध आहे. शुल्क ₹${area.feePaise / 100} पासून; ₹${rules.freeThresholdPaise / 100} किंवा अधिक पात्र खरेदीवर विनामूल्य.`
              : `Yes! We deliver to ${area.name}. Delivery starts at ₹${area.feePaise / 100}; free on eligible merchandise subtotals of ₹${rules.freeThresholdPaise / 100} or more.`
            : mr
              ? "या पिन कोडसाठी वितरण सध्या सुरू नाही. कृपया दुकानाशी संपर्क साधा."
              : "Delivery is not currently enabled for this PIN code. Please check with the store."}
        </div>
      )}
      <p className="muted service-area-list">
        Nagothane · Roha · Pali · RIL Township · NMD
      </p>
    </section>
  );
}
