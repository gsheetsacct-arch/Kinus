/**
 * Hebrew names typed in English: a Hebrew-name field that holds "Menachem", or the letters
 * spelled out ("nun shin beis tes"). Finds them and suggests the Hebrew, from:
 *   1. the letters spelled out (nun shin beis tes → נשבט, with final letters at word ends),
 *   2. campers whose Hebrew name is already in Hebrew (siblings; others with that name),
 *   3. a list of common names.
 * A suggestion is only that: the office checks it before saving.
 */

/** Hebrew letters and nothing in English. */
export const isHebrew = (v: string) => /[א-ת]/.test(v) && !/[a-z]/i.test(v);
/** Written (at least partly) in English letters: needs fixing. */
export const hasEnglish = (v: string) => /[a-z]/i.test(v);

const FINAL: Record<string, string> = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };
const UNFINAL: Record<string, string> = Object.fromEntries(Object.entries(FINAL).map(([a, b]) => [b, a]));

/** Final letters at the end of each word (and only there). */
export function withFinalLetters(word: string): string {
  const letters = [...word].map((ch) => UNFINAL[ch] ?? ch);
  const last = letters.length - 1;
  if (last >= 0 && FINAL[letters[last]] && last > 0) letters[last] = FINAL[letters[last]];
  return letters.join("");
}

// Letter names as people spell them (Ashkenazi and modern): kuf / qof is ק, kof / chof is כ
const LETTER_NAMES: [string, string[]][] = [
  ["א", ["alef", "aleph", "alif", "olef", "aluf"]],
  ["ב", ["beis", "beit", "bet", "beth", "bais", "bes", "vais", "veis", "vet", "veit", "ves", "beys", "bayis"]],
  ["ג", ["gimel", "gimmel", "gimmal", "gimal"]],
  ["ד", ["daled", "dalet", "daleth", "dalid", "dolet", "doled", "dalad"]],
  ["ה", ["hei", "hey", "he", "hay", "hai", "heh", "hee"]],
  ["ו", ["vav", "vov", "vuv", "waw", "vof", "vaf", "vow"]],
  ["ז", ["zayin", "zayen", "zain", "zayn", "zayan"]],
  ["ח", ["ches", "chet", "het", "cheth", "heth", "khet", "chess", "ches", "hes"]],
  ["ט", ["tes", "tet", "teth", "tess"]],
  ["י", ["yud", "yod", "yood", "jod", "yid"]],
  ["כ", ["chof", "kof", "kaf", "khaf", "chaf", "caf", "kav", "khof", "chav"]],
  ["ל", ["lamed", "lamid", "lammed", "lomed", "lamad", "lamedh"]],
  ["מ", ["mem", "mim", "mam"]],
  ["נ", ["nun", "noon", "nunn"]],
  ["ס", ["samech", "samekh", "samach", "somech", "samek", "samech", "samekh", "sameh"]],
  ["ע", ["ayin", "ayen", "ain", "ayn", "ayan"]],
  ["פ", ["pei", "pey", "pe", "peh", "pay", "fei", "fey", "fe", "feh", "fay", "phe"]],
  ["צ", ["tzadi", "tzadik", "tsadi", "tsadik", "tzadee", "tzaddi", "tsade", "sadi", "tzade", "tzadek", "tzaddik", "tzadie", "tzadey", "tsadik", "tzaddie"]],
  ["ק", ["kuf", "qof", "koof", "kuph", "qoph", "kuff"]],
  ["ר", ["reish", "resh", "raish", "raysh", "reysh", "rash"]],
  ["ש", ["shin", "sin", "sheen", "seen", "shinn"]],
  ["ת", ["tof", "tav", "taf", "sof", "sav", "tov", "taw", "toff"]],
];
const LETTER = new Map(LETTER_NAMES.flatMap(([ch, names]) => names.map((n) => [n, ch] as const)));
const FINAL_WORDS = new Set(["sofit", "sofis", "final", "end", "sofi"]);

/**
 * "nun shin beis tes" → "נשבט"; words apart with a comma, slash, "space" or a new line
 * ("mem nun ches mem, mem ayin nun daled lamed" → "מנחם מענדל"). Null unless every word is a
 * letter's name (two letters at least).
 */
export function lettersSpelledOut(input: string): string | null {
  const words = input
    .toLowerCase()
    .replace(/\bspace\b/g, ",")
    .split(/[,/\n;|]+|\s{2,}/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (!words.length) return null;
  const out: string[] = [];
  let count = 0;
  for (const w of words) {
    const tokens = w.split(/[\s\-.'’_]+/).filter(Boolean);
    let word = "";
    for (const t of tokens) {
      if (FINAL_WORDS.has(t)) {
        if (!word) return null;
        const last = word.slice(-1);
        if (FINAL[last]) word = word.slice(0, -1) + FINAL[last];
        continue;
      }
      const ch = LETTER.get(t);
      if (!ch) return null;
      word += ch;
      count++;
    }
    if (word) out.push(withFinalLetters(word));
  }
  return count >= 2 ? out.join(" ") : null;
}

// Common names: how each is spelled in English (the same name), and its nicknames (Mendy,
// Yossi: often, but not always, that name; suggested only as a nickname). Yiddish names in
// their usual Yiddish spelling. Zev and Zevi are different names; so are Menachem and
// Menachem Mendel.
const NAMES: [he: string, spellings: string[], nicknames?: string[]][] = [
  // boys
  ["מנחם", ["menachem", "menacham", "menahem"]],
  ["מנחם מענדל", ["menachem mendel", "menachem mendl"], ["mendy", "mendi", "mendie"]],
  ["מענדל", ["mendel", "mendl"]],
  ["יוסף", ["yosef", "yoseph", "joseph", "yosaif"], ["yossi", "yosi", "yossie", "yossy", "yoissy"]],
  ["יוסף יצחק", ["yosef yitzchak", "yosef yitzchok"], ["yossi yitzchak"]],
  ["יצחק", ["yitzchak", "yitzchok", "yitzhak", "isaac", "yitzchock"], ["itzik", "yitzi", "yitzy", "itchy"]],
  ["שניאור זלמן", ["shneur zalman", "shneor zalman", "shneur zalmen"], ["zalmy"]],
  ["זלמן", ["zalman", "zalmen"]],
  ["שניאור", ["shneur", "shneor", "shneuer", "shneiur"]],
  ["לוי", ["levi", "levy"]],
  ["לוי יצחק", ["levi yitzchak", "levi yitzchok"]],
  ["משה", ["moshe", "moishe", "moses"], ["moishy", "moishie", "moishi", "moshy"]],
  ["אברהם", ["avraham", "avrohom", "avrom", "abraham", "avrahom"], ["avi", "avrumi", "avremi"]],
  ["יעקב", ["yaakov", "yakov", "jacob", "yaacov"], ["yankel", "yanky", "yankie", "yankele"]],
  ["שמואל", ["shmuel", "samuel"], ["shmuli", "shmulik", "shmueli", "shmully"]],
  ["דוד", ["dovid", "david", "duvid"], ["dovi", "dudi", "duvi"]],
  ["שלמה", ["shlomo", "shloime", "solomon"], ["shloimy", "shlomie", "shloimie"]],
  ["חיים", ["chaim", "chayim", "haim", "hayim"], ["chaimy", "chaimie"]],
  ["מרדכי", ["mordechai", "mordchai", "mordche"], ["motti", "motty", "mordy", "mottel"]],
  ["אליהו", ["eliyahu", "eliyohu", "elijah"], ["eli", "elie"]],
  ["שלום", ["sholom", "shalom", "sholem"]],
  ["שלום דובער", ["sholom dovber", "shalom dovber", "sholom ber"]],
  ["דובער", ["dovber", "dov ber"], ["berel", "berl", "berry"]],
  ["דוב", ["dov"]],
  ["בער", ["ber"]],
  ["אריה", ["aryeh", "arye", "arie"]],
  ["ארי", ["ari"]],
  ["אריה לייב", ["aryeh leib", "arye leib"], ["ari leib"]],
  ["לייב", ["leib", "leibl"], ["leibel", "leibele"]],
  ["יהודה", ["yehuda", "yehudah", "judah"], ["yudi"]],
  ["יהודה לייב", ["yehuda leib", "yehudah leib"]],
  ["בנימין", ["binyomin", "binyamin", "benjamin"], ["benny", "beni"]],
  ["ישראל", ["yisroel", "yisrael", "israel"], ["srulik", "sruly", "srully"]],
  ["נתן", ["nosson", "natan", "nathan"], ["nussi", "nosi", "nussy"]],
  ["נחום", ["nochum", "nachum"], ["nachumi", "nochumi"]],
  ["צבי", ["tzvi", "zvi", "tsvi", "tzvy", "zevi"], ["tzviki"]],
  ["צבי הירש", ["tzvi hirsh", "zvi hirsh", "tzvi hirsch"], ["hirshy", "hershy"]],
  ["הירש", ["hirsh", "hirsch", "hersh"]],
  ["הערשל", ["hershel", "hershl", "herschel"]],
  ["גרשון", ["gershon"], ["gershy"]],
  ["פרץ", ["peretz", "perets"]],
  ["פנחס", ["pinchas", "pinchus", "pinchos"], ["pinny", "pini", "pinnie"]],
  ["ראובן", ["reuven", "reuvain", "reuvein"], ["ruby", "ruvi"]],
  ["שמעון", ["shimon", "simon", "shimen"], ["shimmy", "shimi"]],
  ["אוריאל", ["uriel"]],
  ["אורי", ["uri"]],
  ["מיכאל", ["michoel", "michael"], ["mikey"]],
  ["גבריאל", ["gavriel", "gabriel"], ["gavi"]],
  ["רפאל", ["refael", "rafael", "raphael", "refoel", "rafoel"], ["rafi", "raphi"]],
  ["אליעזר", ["eliezer"], ["leizer", "laizer"]],
  ["אלעזר", ["elazar", "elozor"]],
  ["אלחנן", ["elchonon", "elchanan", "elchonen"], ["chonon", "chononi"]],
  ["יחיאל", ["yechiel"], ["chiel"]],
  ["יונה", ["yonah", "yona", "jonah"]],
  ["יואל", ["yoel", "joel"], ["yoely"]],
  ["יהושע", ["yehoshua", "joshua"], ["shia", "shuki"]],
  ["אפרים", ["ephraim", "efraim", "efrayim"], ["effy"]],
  ["מנשה", ["menashe"]],
  ["נפתלי", ["naftali", "naftoli"], ["tuli", "tully"]],
  ["אשר", ["asher"]],
  ["זאב", ["zev", "zeev", "ze'ev"]],
  ["ברוך", ["boruch", "baruch", "burech"], ["boruchy", "baruchy"]],
  ["בן ציון", ["bentzion", "ben zion", "benzion", "ben tzion"], ["bentzi", "bentzy"]],
  ["נחמיה", ["nechemia", "nechemya", "nechemiah", "nechemye"]],
  ["עזרא", ["ezra"]],
  ["עקיבא", ["akiva"], ["kivi"]],
  ["מאיר", ["meir", "meyer"]],
  ["חנוך", ["chanoch", "henoch", "chonoch", "enoch"]],
  ["שמריהו", ["shmaryahu", "shmaryohu"]],
  ["שמחה", ["simcha"], ["simchy"]],
  ["מתתיהו", ["matisyahu", "matityahu", "matisyohu"], ["mattis", "matis"]],
  ["יששכר", ["yisachar", "yissachar", "yissocher"]],
  ["זבולון", ["zevulun", "zevulon"]],
  ["הלל", ["hillel", "hilel"]],
  ["יחזקאל", ["yechezkel", "ezekiel"], ["chezky", "chezki"]],
  ["דניאל", ["doniel", "daniel"], ["dani", "danny"]],
  ["נח", ["noach", "noah"]],
  ["אהרן", ["aharon", "aaron", "ahron"], ["ahrele"]],
  ["אלימלך", ["elimelech"], ["meilech", "melech"]],
  ["קלמן", ["kalman", "kalmen"]],
  ["טוביה", ["tuvia", "tuvya", "tuviah"], ["tevye"]],
  ["זכריה", ["zecharia", "zechariah", "zecharya"]],
  ["שאול", ["shaul", "saul"], ["shauli"]],
  ["עמרם", ["amram"]],
  ["אבנר", ["avner"]],
  ["עובדיה", ["ovadia", "ovadya", "ovadiah"]],
  ["זושא", ["zushe", "zusha"], ["zushie"]],
  ["פייוול", ["feivel", "faivel"]],
  ["פישל", ["fishel", "fishl"]],
  ["וועלוועל", ["velvel"]],
  ["ישעיה", ["yeshaya", "yeshayahu"], ["shaya", "shaye"]],
  ["ירמיהו", ["yirmiyahu", "yirmiya"], ["yirmi"]],
  ["גד", ["gad"]],
  ["דן", ["dan"]],
  ["יוסף חיים", ["yosef chaim"], ["yossi chaim"]],
  ["משה חיים", ["moshe chaim"]],
  // girls
  ["חיה", ["chaya", "chaia", "haya"], ["chayale"]],
  ["חיה מושקא", ["chaya mushka", "chaya mushke"], ["chaya mushkie", "chaya mussie"]],
  ["מושקא", ["mushka", "mushke"], ["mushky", "mushkie", "mussie", "mussi", "mushki", "mussy"]],
  ["חנה", ["chana", "hannah", "chanah", "hana", "channah"], ["chanie", "chany", "chani"]],
  ["רבקה", ["rivka", "rivkah", "rebecca"], ["rivky", "rivki", "rivkie", "rivkee"]],
  ["רחל", ["rochel", "rachel"], ["ruchie", "rochi", "ruchy", "rochie", "ruchi"]],
  ["לאה", ["leah", "lea"], ["leahle"]],
  ["שרה", ["sarah", "sara", "sorah"], ["sori", "suri", "surie", "sury"]],
  ["דבורה", ["devorah", "devora", "dvora", "deborah", "dvorah"], ["devoiry", "devory", "devoiri"]],
  ["דבורה לאה", ["devorah leah", "devora leah"]],
  ["אסתר", ["esther", "ester"], ["estie", "esti", "esty"]],
  ["מרים", ["miriam"], ["miri", "mimi"]],
  ["שיינא", ["shayna", "shaina", "sheina", "shaine", "shayne", "sheine"]],
  ["פריידא", ["frieda", "frida", "fraida", "freida"], ["fraidy", "fraydie", "fraidie"]],
  ["גאלדא", ["golda"], ["goldie", "goldy"]],
  ["בתיה", ["basya", "batya", "basia"], ["basha", "bashie", "basy", "bashy"]],
  ["ברכה", ["bracha", "brocha"], ["brachie", "brochie", "brochy"]],
  ["דינה", ["dina", "dinah", "dena"], ["dini", "dinie"]],
  ["פייגא", ["faiga", "feiga", "feige", "faige"], ["faigy", "feigy", "faigie"]],
  ["פערל", ["perel", "perl", "pearl"], ["perela", "peri"]],
  ["רייזל", ["raizel", "reizel"], ["raizy", "raisy", "raizie", "reizy"]],
  ["מלכה", ["malka", "malke"], ["malky", "malkie", "malki"]],
  ["מנוחה", ["menucha"], ["menuchi", "menuchie", "nuchie"]],
  ["נחמה", ["nechama"], ["nechamie", "nechamy", "nechami"]],
  ["נחמה דינה", ["nechama dina", "nechama dinah"]],
  ["רות", ["rus", "ruth", "rut"], ["ruti", "rusi"]],
  ["שטערנא", ["shterna", "sterna"], ["shterny", "shternie", "sterny"]],
  ["שולמית", ["shulamis", "shulamit", "shulamith"], ["shuli"]],
  ["צביה", ["tzivia", "tziviah", "tzivya"], ["tzivy", "tzivi", "tzivie"]],
  ["יהודית", ["yehudis", "yehudit", "judith"], ["yudis"]],
  ["זעלדא", ["zelda"], ["zeldy"]],
  ["הינדא", ["hinda"], ["hindy", "hindi", "hindie"]],
  ["העניא", ["henya", "henia"], ["henny", "henie", "hennie"]],
  ["בלומא", ["bluma"], ["blumie", "blumy"]],
  ["גיטל", ["gittel", "gitel"], ["gitty", "gitti", "gittie"]],
  ["איטא", ["itta", "ita"], ["itty", "itti", "ittie"]],
  ["חוה", ["chava", "eva"], ["chavi", "chavie", "chavy"]],
  ["אלישבע", ["elisheva"]],
  ["יוכבד", ["yocheved"], ["yochi", "yochie", "yochy"]],
  ["זיסל", ["zissel", "zisel"], ["zisi", "zissy"]],
  ["שושנה", ["shoshana"], ["shoshie", "shoshy", "shoshi"]],
  ["שפרה", ["shifra"], ["shifry", "shifrie"]],
  ["אביגיל", ["avigail", "abigail", "avigayil"]],
  ["הדסה", ["hadassah", "hadasa", "hadassa"]],
  ["מיכל", ["michal"]],
  ["נעמי", ["naomi", "naomie"], ["nomi"]],
  ["תמר", ["tamar"]],
  ["יפה", ["yaffa", "yafa"], ["yaffi"]],
  ["צירל", ["tzirel", "tzirl"], ["tziri", "tzirie"]],
  ["בת שבע", ["batsheva", "bas sheva", "bassheva", "bat sheva", "basheva"]],
  ["טובה", ["tova", "tovah"], ["toby", "tovi", "tovie"]],
  ["רחל לאה", ["rochel leah", "rachel leah"]],
  ["שרה רבקה", ["sarah rivka", "sara rivka"]],
  ["אסתר מלכה", ["esther malka"]],
  // family names
  ["כהן", ["cohen", "kohen", "cohn", "kahn", "kohn", "cohan"]],
  ["כץ", ["katz", "kats"]],
  ["שפירא", ["shapiro", "shapira", "schapiro"]],
  ["פרידמאן", ["friedman", "fridman", "freedman"]],
  ["גולדברג", ["goldberg"]],
  ["גרינברג", ["greenberg", "grinberg"]],
  ["שוורץ", ["schwartz", "schwarz", "shwartz", "swartz"]],
  ["רובינשטיין", ["rubinstein", "rubenstein"]],
  ["גורדון", ["gordon"]],
  ["לנדא", ["landau", "landa"]],
  ["הורוויץ", ["horowitz", "horovitz", "hurwitz", "horwitz"]],
  ["פרלמן", ["perlman", "pearlman"]],
  ["רוזנברג", ["rosenberg", "rozenberg"]],
  ["גרוס", ["gross", "grosz"]],
  ["וויס", ["weiss", "weis", "wais"]],
];
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();
const SPELLED = new Map<string, string>();
const NICKNAME = new Map<string, string>();
for (const [he, spellings, nicknames = []] of NAMES) {
  for (const en of spellings) if (!SPELLED.has(norm(en))) SPELLED.set(norm(en), he);
  for (const en of nicknames) if (!NICKNAME.has(norm(en))) NICKNAME.set(norm(en), he);
}
const words = (s: string) => s.split(" ").filter(Boolean);

/**
 * Where a suggestion comes from, surest first:
 *   letters  — the letters spelled out (nun shin beis tes),
 *   exact    — campers with exactly this name (same words) have it in Hebrew like this,
 *   words    — each word as other campers have it,
 *   common   — the list of common names (that name's English spelling),
 *   nickname — a nickname's usual name (Mendy → מנחם מענדל): a guess, never ticked by itself.
 */
export type SuggestionSource = "letters" | "exact" | "words" | "common" | "nickname";
export type NameSuggestion = { value: string; how: string; source: SuggestionSource };

/** What we know from names already written in Hebrew: English → Hebrew, with how often. */
export class NameBook {
  private whole = new Map<string, Map<string, number>>();
  private single = new Map<string, Map<string, number>>();
  private add(map: Map<string, Map<string, number>>, en: string, he: string) {
    const m = map.get(en) ?? new Map<string, number>();
    m.set(he, (m.get(he) ?? 0) + 1);
    map.set(en, m);
  }
  /**
   * A camper's English name next to the same name in Hebrew. Only when they have the same
   * number of words: "Menachem" next to "מנחם מענדל" isn't the same name, so it teaches nothing.
   */
  learn(english: string, hebrew: string) {
    const en = norm(english);
    const he = hebrew.trim().replace(/\s+/g, " ");
    if (!en || !isHebrew(he)) return;
    const ew = words(en);
    const hw = words(he);
    if (ew.length !== hw.length) return;
    this.add(this.whole, en, he);
    ew.forEach((w, i) => this.add(this.single, w, hw[i]));
  }
  private best(map: Map<string, Map<string, number>>, en: string) {
    const m = map.get(en);
    if (!m) return null;
    const [he, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return { he, n };
  }
  /** Hebrew for an English name, surest first (see SuggestionSource). */
  lookup(english: string): NameSuggestion | null {
    const en = norm(english);
    if (!en) return null;
    const name = english.trim();
    const seen = this.best(this.whole, en);
    if (seen) return { value: seen.he, how: seen.n > 1 ? `${seen.n} others named exactly ${name} have it like this` : `another camper named exactly ${name} has it like this`, source: "exact" };
    const ew = words(en);
    if (ew.length > 1) {
      const learned = ew.map((w) => this.best(this.single, w)?.he ?? null);
      if (learned.every(Boolean)) return { value: learned.join(" "), how: "each word as other campers have it", source: "words" };
    }
    const listed = SPELLED.get(en);
    if (listed) return { value: listed, how: `${name} on the list of common names`, source: "common" };
    if (ew.length > 1) {
      const parts = ew.map((w) => this.best(this.single, w)?.he ?? SPELLED.get(w) ?? null);
      if (parts.every(Boolean)) return { value: parts.join(" "), how: "word by word, partly from the list of common names", source: "common" };
    }
    const nick = NICKNAME.get(en);
    if (nick) return { value: nick, how: `${name} is usually a nickname for this: check it`, source: "nickname" };
    return null;
  }
}

/** Surest first: a better kind of suggestion wins over a worse one. */
export const SOURCE_RANK: Record<SuggestionSource, number> = { letters: 0, exact: 1, words: 2, common: 3, nickname: 4 };

/**
 * The Hebrew for a Hebrew-name field: its letters spelled out, else the field's English
 * looked up, else the camper's English name looked up (for an empty field, too).
 */
export function suggestHebrew(current: string, englishName: string, book: NameBook): NameSuggestion | null {
  const v = current.trim();
  if (v && isHebrew(v)) return null;
  const spelled = v ? lettersSpelledOut(v) : null;
  if (spelled) return { value: spelled, how: "letters spelled out", source: "letters" };
  const fromField = v ? book.lookup(v) : null;
  const fromNameRaw = englishName.trim() && norm(englishName) !== norm(v) ? book.lookup(englishName) : null;
  const fromName = fromNameRaw ? { ...fromNameRaw, how: `from the English name: ${fromNameRaw.how}` } : null;
  // only part of the name written ("Zalman" for Shneur Zalman): the whole name's Hebrew, and
  // never "exact" for the part: it's someone else's whole name
  if (v && fromField && partOfName(v, englishName)) {
    if (fromName) return { ...fromName, how: `${fromName.how} (only “${v}” was written)` };
    return { ...fromField, source: fromField.source === "exact" ? "words" : fromField.source, how: `only “${v}” was written, part of ${englishName.trim()}: ${fromField.how}` };
  }
  // what the family wrote comes first; the camper's English name only when that finds nothing
  return fromField ?? fromName;
}

/** Whether `part` is some of the words of `whole`, not all of them ("Zalman" of "Shneur Zalman"). */
function partOfName(part: string, whole: string): boolean {
  const p = words(norm(part));
  const w = words(norm(whole));
  return p.length > 0 && p.length < w.length && p.every((x) => w.includes(x));
}

/** Converts letter names typed into a Hebrew field as soon as they're whole ("nun shin" → "נש"). */
export function convertTyped(v: string): string {
  return lettersSpelledOut(v) ?? v;
}
