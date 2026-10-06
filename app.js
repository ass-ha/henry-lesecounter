/*
 * Henrys Lesecounter – App-Logik
 *
 * Abhängigkeiten:
 *  - Firebase JS SDK 11.10.0 über gstatic-CDN: firebase-app, firebase-auth, firebase-firestore
 *  - ./firebase-config.js  (Projekt-Konfiguration)
 *  - ./stats.js            (Auswertung und Formatierung)
 *  - Firebase Authentication: Anbieter E-Mail/Passwort, zwei angelegte Konten
 *  - Firestore: Sammlung "days" (Dokument je Tag, ID = JJJJ-MM-TT, Felder: units, cents, updatedAt)
 *               Dokument "settings/tariff" (Felder: unit, centsPerUnit, updatedAt)
 *  - firestore.rules: Zugriff nur für die zwei freigegebenen E-Mail-Adressen
 *  - index.html: Elemente mit den IDs, die unten per $() angesprochen werden
 */
import { firebaseConfig } from './firebase-config.js';
import {
  UNITS, dateKey, aggregate, lastKeys, periodLabel, shortLabel,
  formatQty, formatRate, formatNumber, money, qtyWord,
} from './stats.js';

const $ = (id) => document.getElementById(id);
const show = (id, on) => { $(id).hidden = !on; };

// Solange Platzhalter in der Konfiguration stehen, nur den Hinweis zeigen.
if (String(firebaseConfig.apiKey).startsWith('DEIN')) {
  show('setup', true);
} else {
  start();
}

async function start() {
  // SDK erst laden, wenn die Konfiguration vorhanden ist.
  const V = '11.10.0';
  const cdn = (p) => `https://www.gstatic.com/firebasejs/${V}/${p}.js`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(cdn('firebase-app')),
    import(cdn('firebase-auth')),
    import(cdn('firebase-firestore')),
  ]);

  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);

  const DEFAULT_TARIFF = { unit: 'word', centsPerUnit: 10 };
  const CHART_N = { day: 14, week: 12, month: 12 };   // Balken im Diagramm
  const PAGE = { day: 14, week: 12, month: 12 };      // Zeilen in der Tabelle je Seite

  const state = {
    tariff: { ...DEFAULT_TARIFF },
    days: new Map(),          // JJJJ-MM-TT -> { units, cents }
    mode: 'day',
    limit: { ...PAGE },
    stepsFor: null,           // Einheit, für die die Buttons gerade gebaut sind
    unsubs: [],
  };

  function setStatus(id, text, isErr) {
    const el = $(id);
    el.textContent = text || '';
    el.classList.toggle('err', !!isErr);
  }

  // ---------- Anmeldung ----------

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-btn').disabled = true;
    setStatus('login-status', '');
    try {
      await A.signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value);
    } catch (err) {
      const bad = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'];
      setStatus('login-status', bad.includes(err.code)
        ? 'E-Mail oder Passwort stimmt nicht.'
        : 'Anmeldung nicht möglich. Bitte versuche es gleich noch einmal.', true);
    } finally {
      $('login-btn').disabled = false;
    }
  });

  $('signout').addEventListener('click', () => A.signOut(auth));

  A.onAuthStateChanged(auth, (user) => {
    state.unsubs.forEach((u) => u());
    state.unsubs = [];
    state.days = new Map();
    show('login', !user);
    show('app', !!user);
    if (user) subscribe();
  });

  // ---------- Daten live lesen ----------

  function onError(err) {
    if (err && err.code === 'permission-denied') {
      setStatus('status', 'Dieses Konto ist nicht freigegeben. Trage die E-Mail in firestore.rules ein.', true);
    } else {
      setStatus('status', 'Die Verbindung zur Datenbank ist gestört.', true);
    }
  }

  function subscribe() {
    state.unsubs.push(F.onSnapshot(F.doc(db, 'settings', 'tariff'), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      const rate = Number(d.centsPerUnit);
      state.tariff = {
        unit: UNITS[d.unit] ? d.unit : DEFAULT_TARIFF.unit,
        centsPerUnit: rate > 0 ? rate : DEFAULT_TARIFF.centsPerUnit,
      };
      fillTariffForm();
      render();
    }, onError));

    state.unsubs.push(F.onSnapshot(F.collection(db, 'days'), (snap) => {
      state.days = new Map(snap.docs.map((d) => [d.id, d.data()]));
      setStatus('status', '');
      render();
    }, onError));
  }

  // ---------- Klicken ----------

  // Menge zur Einheit des aktuellen Tarifs addieren (oder abziehen).
  // increment() rechnet auf dem Server, deshalb überschreiben sich zwei Geräte nie.
  function add(n) {
    const { unit, centsPerUnit } = state.tariff;
    const day = dateKey();
    const current = Number(state.days.get(day)?.units?.[unit]) || 0;
    if (n < 0) n = -Math.min(current, -n);   // nie unter 0
    if (!n) return;
    F.setDoc(F.doc(db, 'days', day), {
      units: { [unit]: F.increment(n) },
      cents: F.increment(n * centsPerUnit),    // Betrag zum Tarif von jetzt, alte Tage bleiben unverändert
      updatedAt: F.serverTimestamp(),
    }, { merge: true }).catch(() => {
      setStatus('status', 'Speichern hat nicht geklappt. Bitte klicke noch einmal.', true);
    });
    const el = $('today-qty');
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  $('tap').addEventListener('click', () => add(UNITS[state.tariff.unit].steps[0]));

  $('custom-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = Math.floor(Number($('custom').value));
    if (!(n >= 1 && n <= 100000)) {
      setStatus('status', 'Bitte eine Menge zwischen 1 und 100000 eingeben.', true);
      return;
    }
    setStatus('status', '');
    add(n);
    $('custom').value = '';
  });

  // Schrittweiten-Buttons passend zur Einheit bauen (nur wenn sich die Einheit ändert)
  function buildSteps() {
    const unit = state.tariff.unit;
    if (state.stepsFor === unit) return;
    state.stepsFor = unit;
    const steps = UNITS[unit].steps;
    $('tap').textContent = '+' + steps[0];
    $('tap').setAttribute('aria-label', `${steps[0]} ${qtyWord(unit, steps[0])} mehr`);
    const box = $('steps');
    box.replaceChildren();
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.id = 'minus';
    minus.textContent = '−1';
    minus.setAttribute('aria-label', `Ein ${UNITS[unit].one} weniger`);
    minus.addEventListener('click', () => add(-1));
    box.appendChild(minus);
    steps.slice(1).forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '+' + s;
      b.setAttribute('aria-label', `${s} ${qtyWord(unit, s)} mehr`);
      b.addEventListener('click', () => add(s));
      box.appendChild(b);
    });
  }

  // ---------- Anzeige ----------

  function renderToday() {
    const { unit, centsPerUnit } = state.tariff;
    const d = state.days.get(dateKey()) || {};
    const qty = Number(d.units?.[unit]) || 0;
    $('today-qty').textContent = formatNumber(qty);
    $('today-unit').textContent = qtyWord(unit, qty);
    $('today-eur').textContent = money(Number(d.cents) || 0);
    $('rate-note').textContent = formatRate(unit, centsPerUnit);
    const rest = Object.fromEntries(Object.entries(d.units || {}).filter(([u, n]) => u !== unit && n > 0));
    $('today-other').textContent = Object.keys(rest).length ? 'Außerdem heute: ' + formatQty(rest) : '';
  }

  function renderStats() {
    const days = [...state.days].map(([id, d]) => ({
      id, units: d.units || {}, cents: Number(d.cents) || 0,
    }));
    const mode = state.mode;
    const rows = aggregate(days, mode);                  // neueste zuerst
    const byKey = new Map(rows.map((r) => [r.key, r]));

    // Gesamt seit Start
    const totalUnits = {};
    let totalCents = 0;
    days.forEach((d) => {
      totalCents += d.cents;
      Object.entries(d.units).forEach(([u, v]) => { totalUnits[u] = (totalUnits[u] || 0) + (Number(v) || 0); });
    });
    $('sum-eur').textContent = money(totalCents);
    $('sum-qty').textContent = formatQty(totalUnits);

    // Diagramm: Verdienst je Zeitraum, fehlende Zeiträume als leere Balken
    const keys = lastKeys(mode, CHART_N[mode]);
    const series = keys.map((k) => byKey.get(k) || { key: k, units: {}, cents: 0 });
    const max = Math.max(...series.map((r) => r.cents), 0);
    const chart = $('chart');
    const axis = $('axis');
    chart.replaceChildren();
    axis.replaceChildren();
    series.forEach((r, i) => {
      const col = document.createElement('div');
      col.className = 'col' + (i === series.length - 1 ? ' now' : '');
      const bar = document.createElement('div');
      bar.className = 'bar' + (r.cents > 0 ? ' has' : '');
      bar.style.height = max > 0 ? Math.max(2, (r.cents / max) * 100) + '%' : '2px';
      bar.title = `${periodLabel(r.key, mode)}: ${money(r.cents)}`;
      col.appendChild(bar);
      chart.appendChild(col);
      const lab = document.createElement('span');
      lab.textContent = shortLabel(r.key, mode);
      axis.appendChild(lab);
    });
    $('chart-title').textContent = { day: 'Letzte 14 Tage', week: 'Letzte 12 Wochen (KW)', month: 'Letzte 12 Monate' }[mode];
    $('chart-max').textContent = max > 0 ? 'Höchster Balken ' + money(max) : '';

    // Tabelle
    const tbody = $('rows');
    tbody.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.className = 'muted';
      td.textContent = 'Noch nichts gelesen. Der erste Klick erscheint hier.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    const nowKey = keys[keys.length - 1];
    rows.slice(0, state.limit[mode]).forEach((r) => {
      const tr = document.createElement('tr');
      if (r.key === nowKey) tr.className = 'now';
      const a = document.createElement('td');
      a.textContent = periodLabel(r.key, mode);
      const b = document.createElement('td');
      b.className = 'num';
      b.textContent = formatQty(r.units);
      const c = document.createElement('td');
      c.className = 'r num';
      c.textContent = money(r.cents);
      tr.append(a, b, c);
      tbody.appendChild(tr);
    });
    $('more').hidden = rows.length <= state.limit[mode];
  }

  function render() {
    buildSteps();
    $('tap').disabled = false;
    $('custom-add').disabled = false;
    renderToday();
    renderStats();
  }

  document.querySelectorAll('.tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      document.querySelectorAll('.tabs button').forEach((x) => {
        x.setAttribute('aria-pressed', String(x === b));
      });
      renderStats();
    });
  });

  $('more').addEventListener('click', () => {
    state.limit[state.mode] += PAGE[state.mode];
    renderStats();
  });

  // ---------- Tarif ----------

  const unitSelect = $('unit');
  Object.entries(UNITS).forEach(([key, u]) => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = u.many;
    unitSelect.appendChild(o);
  });

  // Formular nur füllen, wenn man nicht gerade darin tippt
  function fillTariffForm() {
    if ($('tariff-form').contains(document.activeElement)) return;
    unitSelect.value = state.tariff.unit;
    $('rate').value = String(state.tariff.centsPerUnit).replace('.', ',');
  }

  $('tariff-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rate = Number($('rate').value.trim().replace(',', '.'));
    if (!(rate > 0 && rate <= 100000)) {
      setStatus('tariff-status', 'Bitte einen Betrag größer als 0 eingeben, zum Beispiel 10 oder 0,5.', true);
      return;
    }
    $('tariff-save').disabled = true;
    try {
      await F.setDoc(F.doc(db, 'settings', 'tariff'), {
        unit: unitSelect.value,
        centsPerUnit: Math.round(rate * 100) / 100,
        updatedAt: F.serverTimestamp(),
      });
      setStatus('tariff-status', 'Gespeichert. Gilt ab jetzt für beide Geräte.');
    } catch (err) {
      setStatus('tariff-status', 'Speichern hat nicht geklappt. Bitte versuche es noch einmal.', true);
    } finally {
      $('tariff-save').disabled = false;
    }
  });

  // Tageswechsel bei offener Seite berücksichtigen
  setInterval(() => { if (!$('app').hidden) render(); }, 60000);
}
