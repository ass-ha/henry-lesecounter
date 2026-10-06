/*
 * Firebase-Konfiguration für Henrys Lesecounter.
 * Werte aus der Firebase-Konsole (Projekteinstellungen > Deine Apps > SDK-Konfiguration).
 * Diese Werte sind nicht geheim. Den Zugriff schützen Anmeldung und firestore.rules.
 *
 * Abhängigkeiten:
 *  - Firebase-Projekt "henrys-lesecounter" mit Authentication (E-Mail/Passwort) und Firestore
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyCmJn3BgPwxr2bh4lApxMUpqXMLc2jURZw',
  authDomain: 'henrys-lesecounter.firebaseapp.com',
  projectId: 'henrys-lesecounter',
  storageBucket: 'henrys-lesecounter.firebasestorage.app',
  messagingSenderId: '913962625250',
  appId: '1:913962625250:web:342fbb09f2160a070d56bb',
};
