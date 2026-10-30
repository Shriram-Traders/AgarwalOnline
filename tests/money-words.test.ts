import { describe, expect, it } from "vitest";
import { rupeesInMarathiWords, rupeesInWords } from "../src/lib/money-words";

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

describe("rupeesInMarathiWords", () => {
  it("says amounts in Marathi, each number up to 99 its own word", () => {
    expect(rupeesInMarathiWords(0)).toBe("शून्य रुपये फक्त");
    expect(rupeesInMarathiWords(3000)).toBe("तीस रुपये फक्त");
    expect(rupeesInMarathiWords(3600)).toBe("छत्तीस रुपये फक्त");
    expect(rupeesInMarathiWords(10000)).toBe("शंभर रुपये फक्त");
    expect(rupeesInMarathiWords(13600)).toBe("एकशे छत्तीस रुपये फक्त");
    expect(rupeesInMarathiWords(53600)).toBe("पाचशे छत्तीस रुपये फक्त");
    expect(rupeesInMarathiWords(123450)).toBe("एक हजार दोनशे चौतीस रुपये आणि पन्नास पैसे फक्त");
    expect(rupeesInMarathiWords(10000000)).toBe("एक लाख रुपये फक्त");
    expect(rupeesInMarathiWords(1200005000)).toBe("एक कोटी वीस लाख पन्नास रुपये फक्त");
    expect(rupeesInMarathiWords(99)).toBe("शून्य रुपये आणि नव्व्याण्णव पैसे फक्त");
  });
});
