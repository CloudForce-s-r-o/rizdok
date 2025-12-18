// ========== APP.JS - Hlavní aplikační logika ==========
// Tento soubor obsahuje veškerou JavaScript logiku pro aplikaci.
// Struktura: Config → DOM cache → Funkce → Event listeners → Init

// ========== ČÁST 1: KONFIGURACE ENDPOINTŮ ==========
// Poznámka: tyto URL obsahují `sig` tokeny a jsou viditelné v klientovi.
// V produkci by bylo lepší volat vlastní backend (proxy), který tyto tokeny
// skryje a přidá server-side validace.

// Endpoint pro načtení seznamu dokumentů
// Očekávaný response: JSON pole s objekty dokumentů
const LOAD_ENDPOINT = "https://default40f47e5e0f3543d291f13536f290a4.6f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/8b6be599f8c14c2a939882e43906851e/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=BcSOI_G2LUwJ8LOxBblkSUhKyD6O_pYBNAYYx1JZFOk";

// Endpoint pro potvrzení seznámení s dokumenty
// Očekávaný request: JSON s formId, timestamp, selectedIds
const CONFIRM_ENDPOINT = "https://default40f47e5e0f3543d291f13536f290a4.6f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/949a49f261a9453980f06b7c02b38cce/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=m7kT7BIsbhlrZ0PzBDEc3Zg88NPaazF341BKVh5jiDw";

// ========== ČÁST 2: ZÍSKÁNÍ ID Z URL ==========
// Funkce, která přečte parametr `id` z query stringu v URL (např. ?id=testuser)
function getIdFromUrl() {
    // URLSearchParams je moderní API pro práci s query stringy
    const params = new URLSearchParams(window.location.search);
    // Vrátí hodnotu parametru 'id' nebo null, pokud neexistuje
    return params.get("id");
}

// Zavolej funkci a ulož výsledek
const USER_ID = getIdFromUrl();

// Pokud chybí id, zobrazíme chybovou hlášku
// Bez id nemá smysl nic ostatního dělat (server neví, pro koho data načítá)
if (!USER_ID) {
    document.getElementById("errorMsg").innerText = "Chybí parametr ?id= v URL!";
}

// ========== ČÁST 3: CACHE DOM REFERENCÍ ==========
// Najdeme všechny důležité HTML elementy jednou na začátku.
// Tím se vyhneme opakovanému hledání (performance optimalizace).

// Autentifikační sekce
const authSection = document.getElementById("authSection");          // Celá sekce ověření
const authBtn = document.getElementById("authBtn");                  // Tlačítko "Potvrdit"
const passwordInput = document.getElementById("passwordInput");      // Input pole pro heslo
const authError = document.getElementById("authError");              // Místo pro error zprávu

// Loading a content sekce
const loadingEl = document.getElementById("loading");                // Loading indikátor
const contentEl = document.getElementById("content");                // Hlavní obsah (tabulky)

// Chybové zprávy a status
const errorEl = document.getElementById("errorMsg");                 // Globální error zpráva
const statusEl = document.getElementById("status");                  // Stavová zpráva (odesílání...)

// Tabulky a jejich těla (tbody)
const pendingTbody = document.querySelector("#pendingTable tbody"); // Čekající dokumenty
const doneTbody = document.querySelector("#doneTable tbody");       // Hotové dokumenty

// Tlačítka
const confirmBtn = document.getElementById("confirmBtn");            // Tlačítko potvrzení
const refreshBtn = document.getElementById("refreshBtn");            // Tlačítko obnovení

// ========== ČÁST 4: GLOBÁLNÍ STAV ==========
// Heslo/kód zadaný uživatelem. Je uloženo v proměnné, a až po úspěšném 
// ověření (LOAD_ENDPOINT vrátí OK) se uloží do localStorage
let PASSWORD = null; // bude nastaveno po autentifikaci

// ========== ČÁST 5: AUTENTIFIKACE ==========

// Funkce: Inicializace autentifikace
// Pokud jsme si už dříve uložili heslo pro tohoto uživatele, 
// automaticky se přihlásíme bez nutnosti zadávat heslo znova
// NOVĚ: kontroluje expiraci - po 24 hodinách vyžaduje znovu heslo
function initAuth() {
    // Čteme z localStorage s klíčem: "authPassword_" + USER_ID
    // Např. "authPassword_testuser"
    const savedData = localStorage.getItem("authPassword_" + USER_ID);
    
    // Pokud existuje uložené heslo, zkontroluj expiraci
    if (savedData) {
        try {
            // Parse uložená data (očekáváme JSON s heslem a timestampem)
            const data = JSON.parse(savedData);
            const now = new Date().getTime();
            
            // Zkontroluj, zda už heslo nevypršelo (5 minut = 300000 ms)
            const expirationTime = 5 * 60 * 1000; // 5 minut
            
            if (now - data.timestamp < expirationTime) {
                // Heslo je stále platné
                PASSWORD = data.password;                   // Ulož do paměti
                authSection.classList.add("hidden");        // Skryj auth formulář
                loadData();                                 // Hned načti data
            } else {
                // Heslo vypršelo, smaž ho z localStorage
                localStorage.removeItem("authPassword_" + USER_ID);
            }
        } catch (e) {
            // Pokud je uložený formát starý (jen string hesla), smaž ho
            // a vyžaduj nové přihlášení
            localStorage.removeItem("authPassword_" + USER_ID);
        }
    }
    // Pokud neexistuje (poprvé) nebo vypršelo, auth sekce zůstane viditelná
}

// Event listener: Klik na tlačítko ověření
// `async` znamená, že funkce bude obsahovat `await` pro asynchronní operace
authBtn.addEventListener("click", async () => {
    // Přečti text z input pole a odeber bílé znaky (mezery, enter...)
    const password = passwordInput.value.trim();
    
    // Validace: Zkontroluj, zda uživatel zadal něco
    if (!password) {
        authError.textContent = "Zadejte prosím kod z emailu.";
        return; // Zastav funkci
    }
    
    // Validace: Zkontroluj, zda máme ID z URL
    if (!USER_ID) {
        authError.textContent = "Chybí parametr ?id= v URL!";
        return; // Zastav funkci
    }
    
    // Ulož heslo do dočasné proměnné
    // Permanentní uložení (do localStorage) proběhne až po úspěšném fetch
    // tímto se vyhneme ukládání špatného hesla
    PASSWORD = password;
    
    // Vymaž předchozí chybové zprávy
    authError.textContent = "";
    
    // Skryj auth formulář (user bude vidět loading indikátor)
    authSection.classList.add("hidden");
    
    // Zavolej main funkci pro načtení dat
    loadData();
});

// Event listener: Podpora zadání hesla přes Enter
// Uživatel může místo kliknutí na tlačítko stisknout Enter
passwordInput.addEventListener("keypress", (e) => {
    // Zkontroluj, zda stisknutá klávesa je Enter
    if (e.key === "Enter") {
        authBtn.click(); // Simuluj klik na tlačítko
    }
});

// ========== ČÁST 6: NAČTENÍ DAT Z API ==========

// Funkce: Hlavní aplikační logika
// - Fetche data z Power Automate
// - Ověří heslo
// - Zobrazí tabulky s dokumenty
// Slovo "async" znamená, že funkce vrátí Promise a můžeme v ní používat "await"
async function loadData() {
    // === Reset veškerého stavu UI ===
    // Vymaž staré chybové zprávy a stavové hlášky
    errorEl.textContent = "";
    statusEl.textContent = "";
    
    // Resetuj tlačítka (budou disabled, dokud se nepotvrdí nejméně jeden checkbox)
    confirmBtn.disabled = true;
    confirmBtn.classList.add("hidden");
    
    // Vymaž obsah obou tabulek
    pendingTbody.innerHTML = "";
    doneTbody.innerHTML = "";
    
    // Zobraz loading spinner
    loadingEl.style.display = "block";
    // Skryj hlavní obsah (tabulky) - bude viditelný až po načtení dat
    contentEl.classList.add("hidden");

    // === Validace: máme USER_ID? ===
    // Bez ID z URL se nebudeme moci volat API
    if (!USER_ID) {
        loadingEl.style.display = "none";  // Skryj spinner
        return;                            // Zastav funkci
    }

    try {
        // === Příprava request dat ===
        // API očekává objekt s USER_ID a heslem pro ověření
        // Poznámka: heslo by v produkci mělo být přenášeno přes HTTPS
        const requestPayload = {
            id: USER_ID,          // Identifikátor uživatele (z URL)
            password: PASSWORD    // Heslo zadané uživatelem
        };

        // === HTTP POST request ===
        // fetch() = asynchronní volání (čekáme na odpověď)
        // method: "POST" = odesílej data na server
        // headers: řekneme serveru, že posílíme JSON
        // body: JSON.stringify() = převede JavaScript objekt na JSON string
        const response = await fetch(LOAD_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestPayload)
        });

        // === Kontrola HTTP statusu ===
        // response.ok = true když status je 200-299
        // Pokud je false (např. 401, 403, 500), je to chyba
        if (!response.ok) {
            throw new Error("API vrátilo status " + response.status);
        }

        // === Parsování JSON odpovědi ===
        // response.json() = čekáme, až se JSON parsuje na JavaScript objekt
        const data = await response.json();

        // === Uložení hesla do localStorage (pouze po úspěšném ověření) ===
        // Heslo se uloží AŽ TEPRVE PO úspěšném API volání
        // Tímto se vyhneme situaci, kdy by se uložilo špatné heslo
        // A pak by se automaticky přihlašoval s tím špatným heslem
        // NOVĚ: ukládáme jako JSON s timestampem pro expiraci
        const authData = {
            password: PASSWORD,
            timestamp: new Date().getTime() // aktuální čas v ms
        };
        localStorage.setItem("authPassword_" + USER_ID, JSON.stringify(authData));

        // === Vykreslení tabulek ===
        // renderTables() vezme data z API a vykreslí je v HTML tabulkách
        renderTables(data);

    } catch (error) {
        // === Zpracování chyb ===
        // Chyba může být:
        // - Špatné heslo (401)
        // - Neexistující ID (404)
        // - Server mimo provoz (500)
        // - Network chyba (no internet)
        
        // Zobrazíme chybovou zprávu (generická, ale informativní)
        errorEl.textContent = "Zadali jste špatné heslo.";
        
        // Vrátíme se do auth módu (uživatel bude vidět auth formulář znova)
        authSection.classList.remove("hidden");
        
        // Resetujeme PASSWORD tak, aby se neuložilo do localStorage
        // To zabránit tomu, aby se v budoucnu přihlašoval s tímto špatným heslem
        PASSWORD = null;
        
    } finally {
        // === Finální cleanup (vždy se provede, i pokud byla chyba) ===
        // Skryjeme loading spinner
        loadingEl.style.display = "none";
    }
}

// ========== ČÁST 7: VYKRESLENÍ TABULEK ==========

// Funkce: Rozdělí data na "čekající" a "hotové" dokumenty a vykreslí je
// Parametr: data = pole objektů s dokumenty (z API)
function renderTables(data) {
    // Pokud data nejsou pole, lze je bezpečně ignorovat
    // (to by nemělo nastat, ale preventivně)
    if (!Array.isArray(data)) {
        return;
    }

    // Ukáž obsah (skryješ loading spinner)
    contentEl.classList.remove("hidden");

    // Příznak: máme alespoň jeden čekající dokument?
    let hasPending = false;

    // === Iterace přes všechny dokumenty ===
    // data.forEach() = pro každý dokument v poli
    data.forEach(doc => {
        // Ochrana: pokud je dokument null/undefined, přeskoč ho
        if (!doc) return;

        // === Určení stavu dokumentu ===
        // Dokument je "čekající" (pending), pokud nemá vyplněno datumSeznameni
        // Pokud má datumSeznameni = "", znamená to, že s ním uživatel ještě není seznámen
        const isPending = (!doc.datumSeznameni || doc.datumSeznameni === "");

        if (isPending) {
            // === ČEKAJÍCÍ DOKUMENT: přidej do tabulky s checkboxy ===
            hasPending = true;  // Víme, že máme alespoň jeden čekající

            // Vytvoř řádek v tabulce (HTML element <tr>)
            const tableRow = document.createElement("tr");

            // Vygeneruj jedinečný ID pro checkbox
            // Pokud doc.id neexistuje, vygeneruj náhodný řetězec
            const checkboxId = "chk_" + (doc.id ?? Math.random().toString(36).slice(2, 8));

            // === Obsah řádku (tři buňky) ===
            // 1. Checkbox pro výběr (data-docid = ID dokumentu pro později)
            // 2. Název souboru (escapován kvůli XSS)
            // 3. Datum požadavku (escapován)
            // 4. Odkaz na soubor (URL escapován kvůli atributům)
            tableRow.innerHTML = `
                <td style="text-align:center"><input type="checkbox" data-docid="${doc.id ?? ''}" id="${checkboxId}"></td>
                <td>${escapeHtml(doc.nazevSouboru)}</td>
                <td>${escapeHtml(doc.datumPozadavku || '')}</td>
                <td><a href="${escapeAttr(doc.odkazNaSoubor)}" target="_blank">Otevřít dokument</a></td>
            `;

            // Přidej řádek do tabulky (pendingTbody = <tbody> element)
            pendingTbody.appendChild(tableRow);

            // === Přidej event listener na checkbox ===
            // Když uživatel zaškrtne/odškrtne checkbox, musíme
            // povolít/zakázat tlačítko "Potvrdit"
            const checkbox = tableRow.querySelector("input[type=checkbox]");
            checkbox.addEventListener("change", onCheckboxChange);

        } else {
            // === HOTOVÝ DOKUMENT: přidej do tabulky bez checkboxy ===
            // Tyto dokumenty se už neukazují jako čekající
            // (uživatel je už potvrdil)

            const tableRow = document.createElement("tr");

            // === Obsah řádku (čtyři buňky, bez checkboxu) ===
            // Zobrazíme: název, datum požadavku, datum seznámení, odkaz
            tableRow.innerHTML = `
                <td>${escapeHtml(doc.nazevSouboru)}</td>
                <td>${escapeHtml(doc.datumPozadavku || '')}</td>
                <td>${escapeHtml(doc.datumSeznameni || '')}</td>
                <td><a href="${escapeAttr(doc.odkazNaSoubor)}" target="_blank">Otevřít dokument</a></td>
            `;

            // Přidej řádek do tabulky (doneTbody = <tbody> element)
            doneTbody.appendChild(tableRow);
        }
    });

    // === Rozhodnutí o viditelnosti tlačítka ===
    // Tlačítko "Potvrdit" má smysl jen když máme čekající dokumenty
    if (hasPending) {
        // Zobraz tlačítko potvrzení
        confirmBtn.classList.remove("hidden");
        // Ale zásadně ho je disabled (bude enabled až když user zaškrtne checkbox)
        confirmBtn.disabled = true;
    } else {
        // Všechny dokumenty jsou hotové, skryj tlačítko
        confirmBtn.classList.add("hidden");
    }
}

// ========== ČÁST 8: OBSLUHA CHECKBOXŮ ==========

// Funkce: Povolí/zakáže tlačítko "Potvrdit" na základě výběru
// Voláno pokaždé, když uživatel zaškrtne/odškrtne checkbox
function onCheckboxChange() {
    // === Najdi všechny checkboxy v tabulce čekajících dokumentů ===
    // querySelectorAll() vrátí seznam (array-like) všech checkboxů
    const allCheckboxes = document.querySelectorAll("#pendingTable tbody input[type=checkbox]");

    // === Zkontroluj, zda je alespoň jeden zaškrtnutý ===
    // Array.from() = převede NodeList na běžné pole
    // .some() = vrátí true pokud alespoň jeden checkbox je checked
    const anyChecked = Array.from(allCheckboxes).some(checkbox => checkbox.checked);

    // === Nastav stav tlačítka ===
    // Pokud je něco zaškrtnuto, povolíme tlačítko
    // Pokud není nic zaškrtnuto, zakazujeme tlačítko (nelze odeslat prázdné potvrzení)
    confirmBtn.disabled = !anyChecked;
}

// ========== ČÁST 9: BEZPEČNOSTNÍ FUNKCE (ESCAPE) ==========

// Funkce: Escapuj HTML znaky, aby se nedaly injektovat scripts
// Vstup: řetězec textu
// Výstup: bezpečný HTML (znaky < > " ' & jsou nahrazeny entities)
// DŮVOD: Pokud by API vrátila data s "<script>" tagem, nechceme ho spustit!
function escapeHtml(text) {
    // Pokud je text null/undefined, vrať prázdný string
    if (text == null) return "";
    
    // Převeď cokoliv na string (pro jistotu)
    const str = String(text);
    
    // Nahraď nebezpečné znaky HTML entitami
    // & → &amp;    (ampersand)
    // < → &lt;     (less than)
    // > → &gt;     (greater than)
    // " → &quot;   (double quote)
    // ' → &#39;    (single quote / apostrophe)
    return str.replace(/[&<>"']/g, function (char) {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return escapeMap[char];
    });
}

// Funkce: Escapuj hodnoty pro HTML atributy (např. href="...")
// Vstup: URL nebo text určený do atributu
// Výstup: bezpečný string bez uvozovek (které by mohly zlomit atribut)
function escapeAttr(text) {
    // Pokud je null/undefined, vrať default hodnotu
    if (text == null) return "#";
    
    // Převeď na string (pro jistotu)
    const str = String(text);
    
    // Nahraď uvozovky za HTML entitu
    // To zabrání "breakout" útoku: href="javascript:alert('xss')"
    return str.replace(/"/g, '&quot;');
}

// ========== ČÁST 10: ODESLÁNÍ POTVRZENÍ ==========

// Event listener: Klik na tlačítko "Potvrdit" / "Odeslat potvrzení"
confirmBtn.addEventListener("click", async () => {
    // === Vyčištění stavu UI ===
    errorEl.textContent = "";                      // Vymaž staré chyby
    statusEl.textContent = "Odesílám potvrzení…"; // Zobraz stavovou zprávu

    // === Zakáž tlačítka během odesílání ===
    // Zabáníme duplikativnímu odesílání (user nesmí kliknout dvakrát)
    confirmBtn.disabled = true;
    refreshBtn.disabled = true;

    // === Sesbírej vybraná ID dokumentů ===
    // querySelectorAll() = najdi všechny zaškrtnuté checkboxy
    const selectedCheckboxes = document.querySelectorAll("#pendingTable tbody input[type=checkbox]:checked");

    // Extrahuj data-docid atribut z každého checkboxu
    // filter() = odstraň prázdné hodnoty
    const selectedDocIds = Array.from(selectedCheckboxes)
        .map(checkbox => checkbox.getAttribute("data-docid"))
        .filter(id => id); // odstraň null/empty

    // === Validace: máme co odesílat? ===
    if (selectedDocIds.length === 0) {
        statusEl.textContent = "Vyberte prosím alespoň jeden dokument.";
        confirmBtn.disabled = false;   // Znova povolíme tlačítko
        refreshBtn.disabled = false;
        return;                       // Zastav funkcí
    }

    // === Příprava payload pro API ===
    // API očekává objekt s těmito údaji:
    const confirmPayload = {
        formId: USER_ID,                          // Kdo to potvrzuje
        timestamp: new Date().toISOString(),      // Kdy to potvrzuje (ISO čas)
        selectedIds: selectedDocIds               // Která ID byla vybrána
    };

    try {
        // === Odeslání HTTP POST requestu ===
        const response = await fetch(CONFIRM_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(confirmPayload)
        });

        // === Kontrola statusu ===
        if (!response.ok) {
            // Pokud je status chyba (ne 200-299), vyhoď exception
            const errorText = await response.text().catch(() => "");
            throw new Error("API vrátilo status " + response.status + (errorText ? " — " + errorText : ""));
        }

        // === Úspěch! ===
        // Znovu načti stránku, aby se zobrazily aktualizované data
        // reload(true) = tvrdý refresh (bez cache)
        window.location.reload(true);

    } catch (error) {
        // === Zpracování chyby ===
        // Zobraz chybu uživateli
        errorEl.textContent = "Chyba při odesílání potvrzení: " + error.message;
        statusEl.textContent = "";

        // === Znova povolíme tlačítka (aby to mohl zkusit znova) ===
        confirmBtn.disabled = false;
        refreshBtn.disabled = false;
    }
});

// ========== ČÁST 11: TLAČÍTKO OBNOVENÍ ==========

// Event listener: Klik na tlačítko "Obnovit" / "Refresh"
// Zavolá loadData(), která znovu načte data ze serveru
refreshBtn.addEventListener("click", () => {
    loadData();
});

// ========== ČÁST 12: INICIALIZACE APLIKACE ==========

// Na začátku spuštění zavolej initAuth()
// Tato funkce zkontroluje, zda máme uložené heslo v localStorage
// Pokud ano, automaticky se přihlásíme bez nutnosti zadávat heslo znova
initAuth();
