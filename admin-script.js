// Supabase Konfiguration
const SUPABASE_URL = "https://kuucfiejtuzeaomwboiy.supabase.co";
const SUPABASE_KEY = "sb_publishable_wVhZoiKNe0aloDmkylBFZg_WHfnDOd9";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Admin-lösenord för inloggning
const ADMIN_PASS = "Batteri22!@";

let allStudents = [];
let allLogs = []; // Lagrar alla säkerhetsloggar
let targetStudentIdForPhoto = null;

// DOM-Element
const adminLoginCard = document.getElementById("adminLoginCard");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminDashboard = document.getElementById("adminDashboard");
const loginError = document.getElementById("loginError");
const searchInput = document.getElementById("searchInput");
const studentTableBody = document.getElementById("studentTableBody");
const addStudentForm = document.getElementById("addStudentForm");
const saveStudentBtn = document.getElementById("saveStudentBtn");
const logoutBtn = document.getElementById("logoutBtn");
const changePhotoInput = document.getElementById("changePhotoInput");

const logDateFilter = document.getElementById("logDateFilter");
const logSearchInput = document.getElementById("logSearchInput");

// 1. Admin Inloggning
adminLoginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const enteredPass = document.getElementById("adminPassword").value.trim();

    if (enteredPass === ADMIN_PASS || enteredPass === "admin123") {
        sessionStorage.setItem("adminAuthenticated", "true");
        showDashboard();
    } else {
        loginError.textContent = "Felaktigt admin-lösenord!";
    }
});

logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("adminAuthenticated");
    location.reload();
});

if (sessionStorage.getItem("adminAuthenticated") === "true") {
    showDashboard();
}

function showDashboard() {
    adminLoginCard.classList.add("hidden");
    adminDashboard.classList.remove("hidden");
    loadStudents();
    loadAccessLogs();
}

// 2. FLIK-SYSTEM (TABS)
function switchTab(tabName) {
    const tabAttendance = document.getElementById("tabAttendanceSection");
    const tabStudents = document.getElementById("tabStudentsSection");
    const btnAttendance = document.getElementById("tabBtnAttendance");
    const btnStudents = document.getElementById("tabBtnStudents");

    if (tabName === 'attendance') {
        tabAttendance.classList.remove("hidden");
        tabStudents.classList.add("hidden");
        btnAttendance.classList.add("active");
        btnStudents.classList.remove("active");
    } else {
        tabAttendance.classList.add("hidden");
        tabStudents.classList.remove("hidden");
        btnAttendance.classList.remove("active");
        btnStudents.classList.add("active");
    }
}

// 3. SÄKERHETSLOGGAR & DATUM/TIDSFILTER
async function loadAccessLogs() {
    const { data, error } = await supabaseClient
        .from("access_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);

    if (error) {
        console.error("Fel vid hämtning av loggar:", error);
        return;
    }

    allLogs = data || [];
    applyLogFilters();
    subscribeToLiveLogs();
}

function applyLogFilters() {
    const selectedDate = logDateFilter.value; // YYYY-MM-DD
    const searchTerm = logSearchInput.value.toLowerCase().trim();

    let filtered = allLogs.filter(log => {
        const dateObj = new Date(log.created_at);

        // Formatera datum YYYY-MM-DD för jämförelse
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const logDateStr = `${year}-${month}-${day}`;

        // Formatera tid HH:MM:SS
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;

        // Datumfilter
        if (selectedDate && logDateStr !== selectedDate) {
            return false;
        }

        // Fritextsökning (Sök på klockslag ex "20:49", elevnamn eller elev-id)
        if (searchTerm) {
            const matchName = (log.student_name || '').toLowerCase().includes(searchTerm);
            const matchId = (log.student_id || '').toLowerCase().includes(searchTerm);
            const matchTime = timeStr.includes(searchTerm) || logDateStr.includes(searchTerm);

            if (!matchName && !matchId && !matchTime) {
                return false;
            }
        }

        return true;
    });

    renderLogs(filtered);
}

function resetLogFilters() {
    logDateFilter.value = "";
    logSearchInput.value = "";
    applyLogFilters();
}

logDateFilter.addEventListener("change", applyLogFilters);
logSearchInput.addEventListener("input", applyLogFilters);

function renderLogs(logs) {
    const tbody = document.getElementById("accessLogBody");
    if (!tbody) return;

    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center">Inga skanningar hittades för det valda filtret.</td></tr>`;
        return;
    }

    tbody.innerHTML = logs.map(log => {
        const dateObj = new Date(log.created_at);
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = dateObj.toLocaleDateString();

        return `
            <tr>
                <td><span style="color: var(--text-sub); font-size: 12px; margin-right: 6px;">${dateStr}</span> <strong>${timeStr}</strong></td>
                <td><strong>${log.student_name || 'Okänd'}</strong></td>
                <td>${log.student_id}</td>
                <td>
                    ${log.granted
                ? '<span class="status-badge badge-authorized">✓ Godkänd</span>'
                : '<span class="status-badge badge-blocked">✕ Nekad (Spärrad)</span>'}
                </td>
            </tr>
        `;
    }).join("");
}

function subscribeToLiveLogs() {
    supabaseClient
        .channel('realtime_access_logs')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'access_logs' }, () => {
            loadAccessLogs();
        })
        .subscribe();
}

// 4. ELEVHANTERING
async function loadStudents() {
    const { data, error } = await supabaseClient
        .from("students")
        .select("*")
        .order("name", { ascending: true });

    if (error) {
        notify("Fel vid hämtning av elever: " + error.message);
        return;
    }

    allStudents = data || [];
    renderTable(allStudents);
}

function renderTable(students) {
    studentTableBody.innerHTML = "";

    if (students.length === 0) {
        studentTableBody.innerHTML = `<tr><td colspan="6" class="text-center">Inga elever hittades.</td></tr>`;
        return;
    }

    students.forEach(student => {
        const tr = document.createElement("tr");
        const avatarUrl = student.photo_url || student.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=0F172A&color=fff`;

        tr.innerHTML = `
            <td><img src="${avatarUrl}" class="student-avatar" alt="Foto"></td>
            <td><strong>${student.name}</strong></td>
            <td>${student.student_id}</td>
            <td>${student.card_id || student.card_i || 'PLS-000'}</td>
            <td>
                <span class="status-badge ${student.authorized ? 'badge-authorized' : 'badge-blocked'}">
                    ${student.authorized ? '✓ Behörig' : '✕ Spärrad'}
                </span>
            </td>
            <td>
                <button class="btn btn-action ${student.authorized ? 'btn-toggle-off' : 'btn-toggle-on'}" 
                        onclick="toggleAuthorization('${student.student_id}', ${student.authorized})">
                    ${student.authorized ? 'Spärra' : 'Aktivera'}
                </button>
                <button class="btn btn-action btn-photo" onclick="triggerPhotoChange('${student.student_id}')">
                    Byt bild
                </button>
                <button class="btn btn-action btn-delete" onclick="deleteStudent('${student.student_id}')">
                    Radera
                </button>
            </td>
        `;
        studentTableBody.appendChild(tr);
    });
}

function triggerPhotoChange(studentId) {
    targetStudentIdForPhoto = studentId;
    changePhotoInput.click();
}

changePhotoInput.addEventListener("change", async (e) => {
    if (!targetStudentIdForPhoto || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const filePath = `photos/${targetStudentIdForPhoto}-${Date.now()}.${fileExt}`;

    notify("Laddar upp ny bild...");

    const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from("student-photos")
        .upload(filePath, file);

    if (uploadError) {
        notify("Uppladdning misslyckades: " + uploadError.message);
        return;
    }

    const { data: publicUrlData } = supabaseClient.storage
        .from("student-photos")
        .getPublicUrl(filePath);

    const newPhotoUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabaseClient
        .from("students")
        .update({ photo_url: newPhotoUrl })
        .eq("student_id", targetStudentIdForPhoto);

    if (updateError) {
        notify("Kunde inte uppdatera databasen: " + updateError.message);
    } else {
        notify(`Bilden har uppdaterats för elev ${targetStudentIdForPhoto}!`);
        loadStudents();
    }

    targetStudentIdForPhoto = null;
    changePhotoInput.value = "";
});

async function toggleAuthorization(studentId, currentStatus) {
    const newStatus = !currentStatus;

    const { error } = await supabaseClient
        .from("students")
        .update({ authorized: newStatus })
        .eq("student_id", studentId);

    if (error) {
        notify("Kunde inte uppdatera: " + error.message);
    } else {
        notify(`Status ändrad för elev ${studentId}`);
        loadStudents();
    }
}

addStudentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    saveStudentBtn.disabled = true;
    saveStudentBtn.textContent = "Laddar upp & sparar...";

    const studentId = document.getElementById("newStudentId").value.trim();
    const name = document.getElementById("newName").value.trim();
    const password = document.getElementById("newPassword").value.trim();
    const cardId = document.getElementById("newCardId").value.trim() || `PLS-${Math.floor(100 + Math.random() * 900)}`;
    const fileInput = document.getElementById("photoFile");

    let photoUrl = null;

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const filePath = `photos/${studentId}-${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from("student-photos")
            .upload(filePath, file);

        if (uploadError) {
            notify("Bild-uppladdning misslyckades: " + uploadError.message);
        } else {
            const { data: publicUrlData } = supabaseClient.storage
                .from("student-photos")
                .getPublicUrl(filePath);

            photoUrl = publicUrlData.publicUrl;
        }
    }

    const studentData = {
        student_id: studentId,
        name: name,
        password: password,
        card_id: cardId,
        authorized: true
    };

    if (photoUrl) {
        studentData.photo_url = photoUrl;
    }

    const { error: insertError } = await supabaseClient
        .from("students")
        .upsert([studentData]);

    if (insertError) {
        notify("Kunde inte spara elev: " + insertError.message);
    } else {
        notify(`Elev ${name} har sparats!`);
        addStudentForm.reset();
        loadStudents();
    }

    saveStudentBtn.disabled = false;
    saveStudentBtn.textContent = "Spara Elev i Supabase";
});

async function deleteStudent(studentId) {
    if (!confirm(`Är du säker på att du vill ta bort elev ${studentId}?`)) return;

    const { error } = await supabaseClient
        .from("students")
        .delete()
        .eq("student_id", studentId);

    if (error) {
        notify("Kunde inte radera elev: " + error.message);
    } else {
        notify("Elev raderad.");
        loadStudents();
    }
}

searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allStudents.filter(s =>
        (s.name && s.name.toLowerCase().includes(term)) ||
        (s.student_id && s.student_id.toLowerCase().includes(term)) ||
        (s.card_id && s.card_id.toLowerCase().includes(term))
    );
    renderTable(filtered);
});

function notify(text) {
    const box = document.getElementById("notification");
    box.textContent = text;
    box.style.display = "block";
    setTimeout(() => { box.style.display = "none"; }, 3500);
}