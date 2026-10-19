import { describe, expect, it } from "vitest";
import { rupeesInWords } from "../src/lib/money-words";

describe("rupeesInWords", () => {
  it("says amounts the way an Indian bill does", () => {
    expect(rupeesInWords(0)).toBe("Rupees Zero Only");
    expect(rupeesInWords(5500)).toBe("Rupees Fifty-Five Only");
    expect(rupeesInWords(123450)).toBe("Rupees One Thousand Two Hundred Thirty-Four and Fifty Paise Only");
    expect(rupeesInWords(10000000)).toBe("Rupees One Lakh Only");
    expect(rupeesInWords(1200005000)).toBe("Rupees One Crore Twenty Lakh Fifty Only");
    expect(rupeesInWords(99)).toBe("Rupees Zero and Ninety-Nine Paise Only");
    expect(rupeesInWords(1100000)).toBe("Rupees Eleven Thousand Only");
  });
});
