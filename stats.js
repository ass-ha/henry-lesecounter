/*
 * Henrys Lesecounter – Auswertung und Formatierung (reine Funktionen, ohne Firebase)
 * Abhängigkeiten:
 *  - keine (nur Intl und Date des Browsers)
 *  - wird von app.js importiert und in node-Tests geprüft
 */

// Einheiten, die im Tarif gewählt werden können.
// steps: Schrittweiten der Klick-Buttons (der erste Wert ist der große Button).
export const UNITS = {
  word:   { one: 'Wort',   many: 'Wörter', steps: [1, 10, 50] },
  page:   { one: 'Seite',  many: 'Seiten', steps: [1, 5, 10] },
  book:   { one: 'Buch',   many: 'Bücher', steps: [1] },
  minute: { one: 'Minute', many: 'Minuten', steps: [1, 5, 15] },
};
const UNIT_ORDER = ['word', 'page', 'book', 'minute'];

const nf = new Intl.NumberFormat('de-DE');
const nfRate = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export const formatNumber = (n) => nf.format(n);
export const money = (cents) => eur.format(cents / 100);

// Wort in Einzahl oder Mehrzahl, z. B. qtyWord('word', 3) -> "Wörter"
export function qtyWord(unit, n) {
  const u = UNITS[unit] || UNITS.word;
  return n === 1 ? u.one : u.many;
}

// "120 Wörter · 4 Seiten" (nur Einheiten mit Menge > 0)
export function formatQty(units) {
  const parts = [];
  for (const key of UNIT_ORDER) {
    const v = Number((units || {})[key]) || 0;
    if (v > 0) parts.push(`${nf.format(v)} ${qtyWord(key, v)}`);
  }
  return parts.length ? parts.join(' · ') : '–';
}

// "10 Cent pro Wort" oder "1,50 € pro Buch"
export function formatRate(unit, centsPerUnit) {
  const u = UNITS[unit] || UNITS.word;
  const amount = centsPerUnit >= 100 ? eur.format(centsPerUnit / 100) : `${nfRate.format(centsPerUnit)} Cent`;
  return `${amount} pro ${u.one}`;
}

// ---- Datumshilfen (alles in der lokalen Zeitzone des Geräts) ----

const pad = (n) => String(n).padStart(2, '0');

// Datum als Schlüssel JJJJ-MM-TT
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Schlüssel zurück in ein Datum (mittags, damit Zeitumstellungen nicht stören)
export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d || 1, 12);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Montag der Woche, in der d liegt
function mondayOf(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

// ISO-Kalenderwoche (Woche beginnt Montag, KW 1 enthält den 4. Januar)
export function isoWeek(d) {
  const t = new Date(d);
  t.setHours(12, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); // Donnerstag der Woche
  const week1 = new Date(t.getFullYear(), 0, 4, 12);
  const week = 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { year: t.getFullYear(), week };
}

// Zeitraum-Schlüssel eines Tages: day = Tag, week = Montag der Woche, month = JJJJ-MM
export function periodKey(dayKey, mode) {
  if (mode === 'week') return dateKey(mondayOf(parseKey(dayKey)));
  if (mode === 'month') return dayKey.slice(0, 7);
  return dayKey;
}

// Tagesdokumente [{id, units, cents}] zu Zeiträumen zusammenfassen, neueste zuerst
export function aggregate(days, mode) {
  const map = new Map();
  for (const d of days) {
    const key = periodKey(d.id, mode);
    let row = map.get(key);
    if (!row) { row = { key, units: {}, cents: 0 }; map.set(key, row); }
    for (const [u, v] of Object.entries(d.units || {})) {
      row.units[u] = (row.units[u] || 0) + (Number(v) || 0);
    }
    row.cents += Number(d.cents) || 0;
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

// Die letzten n Zeiträume bis einschließlich heute, älteste zuerst (für das Diagramm)
export function lastKeys(mode, n, today = new Date()) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    if (mode === 'week') {
      keys.push(dateKey(addDays(mondayOf(today), -7 * i)));
    } else if (mode === 'month') {
      const m = new Date(today.getFullYear(), today.getMonth() - i, 1, 12);
      keys.push(`${m.getFullYear()}-${pad(m.getMonth() + 1)}`);
    } else {
      keys.push(dateKey(addDays(today, -i)));
    }
  }
  return keys;
}

const fmtDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtMonthLong = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const fmtMonthShort = new Intl.DateTimeFormat('de-DE', { month: 'short' });

// Beschriftung in der Tabelle
export function periodLabel(key, mode) {
  if (mode === 'month') return fmtMonthLong.format(parseKey(key + '-01'));
  if (mode === 'week') {
    const m = parseKey(key);
    const s = addDays(m, 6);
    const dm = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
    return `KW ${isoWeek(m).week} · ${dm(m)}–${dm(s)}${s.getFullYear()}`;
  }
  return fmtDay.format(parseKey(key));
}

// Kurze Beschriftung unter den Balken
export function shortLabel(key, mode) {
  if (mode === 'month') return fmtMonthShort.format(parseKey(key + '-01')).replace('.', '');
  if (mode === 'week') return String(isoWeek(parseKey(key)).week);
  return String(parseKey(key).getDate());
}
