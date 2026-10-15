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

// Common names as written in English → Hebrew (Yiddish names in their usual Yiddish spelling)
const NAMES: [string, string[]][] = [
  // boys
  ["מנחם", ["menachem", "menacham", "menahem"]],
  ["מנחם מענדל", ["menachem mendel", "mendy", "mendel", "mendi", "mendie"]],
  ["יוסף", ["yosef", "yossi", "yosi", "yoseph", "joseph", "yossie", "yossy", "yoissy", "yosef"]],
  ["יוסף יצחק", ["yosef yitzchak", "yossi yitzchak", "yosef yitzchok"]],
  ["יצחק", ["yitzchak", "yitzchok", "yitzhak", "itzik", "yitzi", "isaac", "yitzy", "itchy", "yitzchock"]],
  ["שניאור זלמן", ["shneur zalman", "shneor zalman", "shneur zalmen", "zalmy", "zalmen", "zalmy", "zalman"]],
  ["שניאור", ["shneur", "shneor", "shneuer", "shneiur", "shneur"]],
  ["לוי", ["levi", "levy", "lev"]],
  ["לוי יצחק", ["levi yitzchak", "levi yitzchok"]],
  ["משה", ["moshe", "moishe", "moishy", "moishie", "moses", "moishi", "moshy"]],
  ["אברהם", ["avraham", "avrohom", "avrom", "abraham", "avi", "avrumi", "avremi", "avrahom", "avrohom"]],
  ["יעקב", ["yaakov", "yakov", "yankel", "yanky", "yankie", "jacob", "yaacov", "yankele"]],
  ["שמואל", ["shmuel", "shmuli", "shmulik", "samuel", "shmueli", "shmully"]],
  ["דוד", ["dovid", "david", "dovi", "dudi", "duvid", "duvi"]],
  ["שלמה", ["shlomo", "shloime", "shloimy", "solomon", "shlomie", "shloimie"]],
  ["חיים", ["chaim", "chayim", "haim", "chaimy", "chaimie", "hayim"]],
  ["מרדכי", ["mordechai", "motti", "mordche", "motty", "mordy", "mordchai", "mottel"]],
  ["אליהו", ["eliyahu", "eliyohu", "eli", "elie", "elijah"]],
  ["שלום", ["sholom", "shalom", "sholem", "shuli"]],
  ["שלום דובער", ["sholom dovber", "sholom ber", "shalom dovber"]],
  ["דובער", ["dovber", "dov ber", "berel", "berl", "berry"]],
  ["דוב", ["dov"]],
  ["בער", ["ber"]],
  ["אריה", ["aryeh", "arye", "ari", "arie"]],
  ["אריה לייב", ["aryeh leib", "arye leib", "ari leib"]],
  ["לייב", ["leib", "leibel", "leibele", "leibl"]],
  ["יהודה", ["yehuda", "yehudah", "yudi", "yehudi", "judah"]],
  ["יהודה לייב", ["yehuda leib", "yehudah leib"]],
  ["בנימין", ["binyomin", "binyamin", "benjamin", "benny", "beni", "binyomin", "binyamin"]],
  ["ישראל", ["yisroel", "yisrael", "srulik", "israel", "sruly", "srully", "yisrael"]],
  ["נתן", ["nosson", "natan", "nathan", "nussi", "nosi", "nussy"]],
  ["נחום", ["nochum", "nachum", "nachumi", "nochumi"]],
  ["צבי", ["tzvi", "zvi", "tsvi", "tzvy", "tzviki"]],
  ["צבי הירש", ["tzvi hirsh", "zvi hirsh", "tzvi hirsch", "hirshy", "hershy"]],
  ["הירש", ["hirsh", "hirsch", "hersh"]],
  ["הערשל", ["hershel", "hershl", "herschel"]],
  ["גרשון", ["gershon", "gershy"]],
  ["פרץ", ["peretz", "perets"]],
  ["פנחס", ["pinchas", "pinny", "pini", "pinchus", "pinchos", "pinnie"]],
  ["ראובן", ["reuven", "reuvain", "ruby", "reuvein", "ruvi"]],
  ["שמעון", ["shimon", "shimmy", "shimi", "simon", "shimen"]],
  ["אוריאל", ["uriel", "uri"]],
  ["מיכאל", ["michoel", "michael", "michel", "michoel", "mikey"]],
  ["גבריאל", ["gavriel", "gabriel", "gavi", "gavriel"]],
  ["רפאל", ["refael", "rafael", "raphael", "rafi", "raphi", "refoel", "rafoel"]],
  ["אליעזר", ["eliezer", "leizer", "laizer", "elazar"]],
  ["אלחנן", ["elchonon", "elchanan", "elchonen", "chonon", "chononi"]],
  ["יחיאל", ["yechiel", "yechiel", "chiel"]],
  ["יונה", ["yonah", "yona", "jonah", "yoni"]],
  ["יואל", ["yoel", "joel", "yoely"]],
  ["יהושע", ["yehoshua", "shia", "joshua", "shuki", "yeshua"]],
  ["אפרים", ["ephraim", "efraim", "effy", "efrayim"]],
  ["מנשה", ["menashe", "menashe", "menashi"]],
  ["נפתלי", ["naftali", "tuli", "naftoli", "tully"]],
  ["אשר", ["asher", "ushi"]],
  ["זאב", ["zev", "zeev", "ze'ev", "zevi", "zevy"]],
  ["ברוך", ["boruch", "baruch", "boruchy", "baruchy", "burech"]],
  ["בן ציון", ["bentzion", "ben zion", "bentzi", "bentzy", "benzion", "ben tzion"]],
  ["נחמיה", ["nechemia", "nechemya", "nechemiah", "nechemye"]],
  ["עזרא", ["ezra"]],
  ["עקיבא", ["akiva", "kivi"]],
  ["מאיר", ["meir", "meyer", "meiri"]],
  ["חנוך", ["chanoch", "henoch", "chonoch", "enoch"]],
  ["שמריהו", ["shmaryahu", "shmarya", "shmaryohu"]],
  ["שמחה", ["simcha", "simchy"]],
  ["מתתיהו", ["matisyahu", "matityahu", "mattis", "matis", "matisyohu"]],
  ["יששכר", ["yisachar", "yissachar", "yissocher", "berish"]],
  ["זבולון", ["zevulun", "zevulun", "zevulon"]],
  ["הלל", ["hillel", "hilel"]],
  ["יחזקאל", ["yechezkel", "chezky", "chezki", "ezekiel"]],
  ["דניאל", ["doniel", "daniel", "dani", "danny"]],
  ["נח", ["noach", "noah"]],
  ["אהרן", ["aharon", "aaron", "ahron", "ahrele", "ari"]],
  ["אלימלך", ["elimelech", "meilech", "melech"]],
  ["קלמן", ["kalman", "kalmen"]],
  ["טוביה", ["tuvia", "tuvya", "tuviah", "tevye"]],
  ["זכריה", ["zecharia", "zechariah", "zecharya"]],
  ["שאול", ["shaul", "saul", "shauli"]],
  ["עמרם", ["amram"]],
  ["אבנר", ["avner"]],
  ["עובדיה", ["ovadia", "ovadya", "ovadiah"]],
  ["זושא", ["zushe", "zusha", "zushie"]],
  ["פייוול", ["feivel", "feivish", "faivel"]],
  ["פישל", ["fishel", "fishl"]],
  ["וועלוועל", ["velvel", "wolf", "volf"]],
  ["ישעיה", ["yeshaya", "yeshayahu", "shaya", "shaye"]],
  ["ירמיהו", ["yirmiyahu", "yirmiya", "yirmi"]],
  ["אליהו", ["eliyahu"]],
  ["גד", ["gad"]],
  ["דן", ["dan"]],
  ["יוסף חיים", ["yosef chaim", "yossi chaim"]],
  ["משה חיים", ["moshe chaim"]],
  // girls
  ["חיה", ["chaya", "chaia", "haya", "chayale"]],
  ["חיה מושקא", ["chaya mushka", "chaya mushkie", "chaya mussia"]],
  ["מושקא", ["mushka", "mushky", "mushkie", "mussie", "mussi", "mushki", "mussy"]],
  ["חנה", ["chana", "chanie", "chany", "hannah", "chani", "chanah", "hana", "channah"]],
  ["רבקה", ["rivka", "rivky", "rivkah", "rebecca", "rivki", "rivkie", "rivkee"]],
  ["רחל", ["rochel", "rachel", "ruchie", "rochi", "ruchy", "rochie", "ruchi"]],
  ["לאה", ["leah", "lea", "leahle", "leeba"]],
  ["שרה", ["sarah", "sara", "sori", "suri", "sorah", "surie", "sury"]],
  ["דבורה", ["devorah", "devora", "devoiry", "dvora", "deborah", "dvorah", "devory", "devoiri"]],
  ["דבורה לאה", ["devorah leah", "devora leah", "devoiry leah"]],
  ["אסתר", ["esther", "estie", "esti", "esty", "ester"]],
  ["מרים", ["miriam", "miri", "miriem", "mimi"]],
  ["שיינא", ["shayna", "shaina", "sheina", "shaine", "shayne", "sheine"]],
  ["פריידא", ["frieda", "frida", "fraida", "fraidy", "fraydie", "fraidie", "freida"]],
  ["גאלדא", ["golda", "goldie", "goldy"]],
  ["בתיה", ["basya", "batya", "basha", "bashie", "basy", "bashy", "basia"]],
  ["ברכה", ["bracha", "brocha", "brachie", "brochie", "brochy"]],
  ["דינה", ["dina", "dinah", "dena", "dini", "dinie"]],
  ["פייגא", ["faiga", "feiga", "faigy", "feigy", "faigie", "feige", "faige"]],
  ["פערל", ["perel", "perl", "pearl", "perela", "peri"]],
  ["רייזל", ["raizel", "raizy", "reizel", "raisy", "raizie", "reizy"]],
  ["מלכה", ["malka", "malky", "malkie", "malki", "malke"]],
  ["מנוחה", ["menucha", "menuchi", "menuchie", "nuchie"]],
  ["נחמה", ["nechama", "nechamie", "nechamy", "nechami"]],
  ["נחמה דינה", ["nechama dina", "nechama dinah"]],
  ["רות", ["rus", "ruth", "rut", "ruti", "rusi"]],
  ["שטערנא", ["shterna", "shterny", "shternie", "sterna", "sterny"]],
  ["שולמית", ["shulamis", "shulamit", "shuli", "shulamith"]],
  ["צביה", ["tzivia", "tzivy", "tziviah", "tzivya", "tzivi", "tzivie"]],
  ["יהודית", ["yehudis", "yehudit", "judith", "yudis", "yehudi"]],
  ["זעלדא", ["zelda", "zeldy"]],
  ["הינדא", ["hinda", "hindy", "hindi", "hindie"]],
  ["העניא", ["henya", "henia", "henny", "henie", "hennie"]],
  ["בלומא", ["bluma", "blumie", "blumy", "bluma"]],
  ["גיטל", ["gittel", "gitty", "gitel", "gitti", "gittie"]],
  ["איטא", ["itta", "ita", "itty", "itti", "ittie"]],
  ["חוה", ["chava", "eva", "chavi", "chavie", "chavy"]],
  ["אלישבע", ["elisheva", "elisheva", "elisheva", "sheva"]],
  ["יוכבד", ["yocheved", "yochi", "yochie", "yochy"]],
  ["זיסל", ["zissel", "zisi", "zissy", "zisel", "zisa"]],
  ["שושנה", ["shoshana", "shoshie", "shoshy", "shoshi"]],
  ["שפרה", ["shifra", "shifry", "shifrie"]],
  ["אביגיל", ["avigail", "abigail", "avigayil", "avigail"]],
  ["הדסה", ["hadassah", "hadasa", "hadassa", "hadas"]],
  ["מיכל", ["michal", "michali"]],
  ["נעמי", ["naomi", "nomi", "naomie"]],
  ["תמר", ["tamar", "tamari", "tami"]],
  ["יפה", ["yaffa", "yafa", "yaffi"]],
  ["צירל", ["tzirel", "tzirl", "tziri", "tzirel", "tzirie"]],
  ["בת שבע", ["batsheva", "bas sheva", "bassheva", "bat sheva", "basheva"]],
  ["טובה", ["tova", "toby", "tovah", "tovi", "tovie"]],
  ["רחל לאה", ["rochel leah", "rachel leah"]],
  ["שרה רבקה", ["sarah rivka", "sara rivka"]],
  ["אסתר מלכה", ["esther malka"]],
  // family names
  ["כהן", ["cohen", "kohen", "cohn", "kahn", "kohn", "kagan", "cohan"]],
  ["לוי", ["levine", "levin", "lewin"]],
  ["כץ", ["katz", "kats"]],
  ["שפירא", ["shapiro", "shapira", "schapiro", "spiro"]],
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
const DICTIONARY = new Map<string, string>();
for (const [he, ens] of NAMES) for (const en of ens) if (!DICTIONARY.has(norm(en))) DICTIONARY.set(norm(en), he);

/** What we know from names already written in Hebrew: English → Hebrew, with how often. */
export class NameBook {
  private whole = new Map<string, Map<string, number>>();
  private words = new Map<string, Map<string, number>>();
  private add(map: Map<string, Map<string, number>>, en: string, he: string) {
    const m = map.get(en) ?? new Map<string, number>();
    m.set(he, (m.get(he) ?? 0) + 1);
    map.set(en, m);
  }
  /** A camper's English name next to the same name already in Hebrew ("Menachem Mendel" ↔ "מנחם מענדל"). */
  learn(english: string, hebrew: string) {
    const en = norm(english);
    const he = hebrew.trim().replace(/\s+/g, " ");
    if (!en || !isHebrew(he)) return;
    this.add(this.whole, en, he);
    const ew = en.split(" ");
    const hw = he.split(" ");
    if (ew.length === hw.length) ew.forEach((w, i) => this.add(this.words, w, hw[i]));
  }
  private best(map: Map<string, Map<string, number>>, en: string) {
    const m = map.get(en);
    if (!m) return null;
    const [he, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return { he, n };
  }
  /** Hebrew for an English name: as others wrote it, else word by word, else the list of common names. */
  lookup(english: string): { value: string; how: string } | null {
    const en = norm(english);
    if (!en) return null;
    const seen = this.best(this.whole, en);
    if (seen) return { value: seen.he, how: seen.n > 1 ? `as ${seen.n} others named ${english.trim()} have it` : `as another ${english.trim()} has it` };
    const known = DICTIONARY.get(en);
    if (known) return { value: known, how: "common name" };
    // word by word ("Menachem Mendel": each word known)
    const parts = en.split(" ").map((w) => this.best(this.words, w)?.he ?? DICTIONARY.get(w) ?? null);
    if (parts.length > 1 && parts.every(Boolean)) return { value: parts.join(" "), how: "word by word" };
    return null;
  }
}

export type NameSuggestion = { value: string; how: string };

/**
 * The Hebrew for a Hebrew-name field: its letters spelled out, else the field's English
 * looked up, else the camper's English name looked up (for an empty field, too).
 */
export function suggestHebrew(current: string, englishName: string, book: NameBook): NameSuggestion | null {
  const v = current.trim();
  if (v && isHebrew(v)) return null;
  const spelled = v ? lettersSpelledOut(v) : null;
  if (spelled) return { value: spelled, how: "letters spelled out" };
  const fromField = v ? book.lookup(v) : null;
  if (fromField) return fromField;
  const fromName = englishName.trim() ? book.lookup(englishName) : null;
  if (fromName) return { ...fromName, how: `from the English name (${fromName.how})` };
  return null;
}

/** Converts letter names typed into a Hebrew field as soon as they're whole ("nun shin" → "נש"). */
export function convertTyped(v: string): string {
  return lettersSpelledOut(v) ?? v;
}
