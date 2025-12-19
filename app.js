const LOAD_ENDPOINT = "https://default40f47e5e0f3543d291f13536f290a4.6f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/8b6be599f8c14c2a939882e43906851e/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=BcSOI_G2LUwJ8LOxBblkSUhKyD6O_pYBNAYYx1JZFOk";
const CONFIRM_ENDPOINT = "https://default40f47e5e0f3543d291f13536f290a4.6f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/949a49f261a9453980f06b7c02b38cce/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=m7kT7BIsbhlrZ0PzBDEc3Zg88NPaazF341BKVh5jiDw";

// Získání ID z URL
function getIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
}

const USER_ID = getIdFromUrl();

if (!USER_ID) {
    document.getElementById("errorMsg").innerText = "Chybí parametr ?id= v URL!";
}

const authSection = document.getElementById("authSection");
const authBtn = document.getElementById("authBtn");
const passwordInput = document.getElementById("passwordInput");
const authError = document.getElementById("authError");
const loadingEl = document.getElementById("loading");
const contentEl = document.getElementById("content");
const errorEl = document.getElementById("errorMsg");
const statusEl = document.getElementById("status");
const pendingTbody = document.querySelector("#pendingTable tbody");
const doneTbody = document.querySelector("#doneTable tbody");
const confirmBtn = document.getElementById("confirmBtn");
const refreshBtn = document.getElementById("refreshBtn");

let PASSWORD = null;

// Inicializace autentifikace
function initAuth() {
    const savedData = localStorage.getItem("authPassword_" + USER_ID);
    
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            const now = new Date().getTime();
            const expirationTime = 5 * 60 * 1000;
            
            if (now - data.timestamp < expirationTime) {
                PASSWORD = data.password;
                authSection.classList.add("hidden");
                loadData();
            } else {
                localStorage.removeItem("authPassword_" + USER_ID);
            }
        } catch (e) {
            localStorage.removeItem("authPassword_" + USER_ID);
        }
    }
}

authBtn.addEventListener("click", async () => {
    const password = passwordInput.value.trim();
    
    if (!password) {
        authError.textContent = "Zadejte prosím kod z emailu.";
        return;
    }
    
    if (!USER_ID) {
        authError.textContent = "Chybí parametr ?id= v URL!";
        return;
    }
    
    PASSWORD = password;
    authError.textContent = "";
    authSection.classList.add("hidden");
    loadData();
});

passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        authBtn.click();
    }
});

// Načtení dat
async function loadData() {
    errorEl.textContent = "";
    statusEl.textContent = "";
    confirmBtn.disabled = true;
    confirmBtn.classList.add("hidden");
    pendingTbody.innerHTML = "";
    doneTbody.innerHTML = "";
    loadingEl.style.display = "block";
    contentEl.classList.add("hidden");

    if (!USER_ID) {
        loadingEl.style.display = "none";
        return;
    }

    try {
        const requestPayload = {
            id: USER_ID,
            password: PASSWORD
        };
        const response = await fetch(LOAD_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
            throw new Error("API vrátilo status " + response.status);
        }

        const data = await response.json();
        const authData = {
            password: PASSWORD,
            timestamp: new Date().getTime()
        };
        localStorage.setItem("authPassword_" + USER_ID, JSON.stringify(authData));

        renderTables(data);

    } catch (error) {
        errorEl.textContent = "Zadali jste špatné heslo.";
        authSection.classList.remove("hidden");
        PASSWORD = null;
        
    } finally {
        loadingEl.style.display = "none";
    }
}

// Vykreslení tabulek
function renderTables(data) {
    if (!Array.isArray(data)) {
        return;
    }

    contentEl.classList.remove("hidden");
    let hasPending = false;

    data.forEach(doc => {
        if (!doc) return;

        const isPending = (!doc.datumSeznameni || doc.datumSeznameni === "");

        if (isPending) {
            hasPending = true;
            const tableRow = document.createElement("tr");
            const checkboxId = "chk_" + (doc.id ?? Math.random().toString(36).slice(2, 8));

            tableRow.innerHTML = `
                <td style="text-align:center"><input type="checkbox" data-docid="${doc.id ?? ''}" id="${checkboxId}"></td>
                <td>${escapeHtml(doc.nazevSouboru)}</td>
                <td>${escapeHtml(doc.datumPozadavku || '')}</td>
                <td><a href="${escapeAttr(doc.odkazNaSoubor)}" target="_blank">Otevřít dokument</a></td>
            `;

            pendingTbody.appendChild(tableRow);

            const checkbox = tableRow.querySelector("input[type=checkbox]");
            checkbox.addEventListener("change", onCheckboxChange);

        } else {
            const tableRow = document.createElement("tr");

            tableRow.innerHTML = `
                <td>${escapeHtml(doc.nazevSouboru)}</td>
                <td>${escapeHtml(doc.datumPozadavku || '')}</td>
                <td>${escapeHtml(doc.datumSeznameni || '')}</td>
                <td><a href="${escapeAttr(doc.odkazNaSoubor)}" target="_blank">Otevřít dokument</a></td>
            `;

            doneTbody.appendChild(tableRow);
        }
    });

    if (hasPending) {
        confirmBtn.classList.remove("hidden");
        confirmBtn.disabled = true;
    } else {
        confirmBtn.classList.add("hidden");
    }
}

// Obsluha checkboxu
function onCheckboxChange() {
    const allCheckboxes = document.querySelectorAll("#pendingTable tbody input[type=checkbox]");
    const anyChecked = Array.from(allCheckboxes).some(checkbox => checkbox.checked);
    confirmBtn.disabled = !anyChecked;
}

// Escapování HTML
function escapeHtml(text) {
    if (text == null) return "";
    const str = String(text);
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

// Escapování atributů
function escapeAttr(text) {
    if (text == null) return "#";
    const str = String(text);
    return str.replace(/"/g, '&quot;');
}

confirmBtn.addEventListener("click", async () => {
    errorEl.textContent = "";
    statusEl.textContent = "Odesílám potvrzení…";

    confirmBtn.disabled = true;
    refreshBtn.disabled = true;

    const selectedCheckboxes = document.querySelectorAll("#pendingTable tbody input[type=checkbox]:checked");
    const selectedDocIds = Array.from(selectedCheckboxes)
        .map(checkbox => checkbox.getAttribute("data-docid"))
        .filter(id => id);

    if (selectedDocIds.length === 0) {
        statusEl.textContent = "Vyberte prosím alespoň jeden dokument.";
        confirmBtn.disabled = false;
        refreshBtn.disabled = false;
        return;
    }

    const confirmPayload = {
        formId: USER_ID,
        timestamp: new Date().toISOString(),
        selectedIds: selectedDocIds
    };

    try {
        const response = await fetch(CONFIRM_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(confirmPayload)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error("API vrátilo status " + response.status + (errorText ? " — " + errorText : ""));
        }

        window.location.reload(true);

    } catch (error) {
        errorEl.textContent = "Chyba při odesílání potvrzení: " + error.message;
        statusEl.textContent = "";
        confirmBtn.disabled = false;
        refreshBtn.disabled = false;
    }
});

refreshBtn.addEventListener("click", () => {
    loadData();
});

initAuth();
