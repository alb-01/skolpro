const SUPABASE_URL = "https://kuucfiejtuzeaomwboiy.supabase.co";
const SUPABASE_KEY = "sb_publishable_wVhZoiKNe0aloDmkylBFZg_WHfnDOd9";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Globala variabler
let countdownTimer = null;
let currentStudent = null;
let qrCodeObj = null;

// ========================================
// ELEMENT-REFERENSER
// ========================================
const loginPage = document.getElementById("loginPage");
const cardPage = document.getElementById("cardPage");

const loginForm = document.getElementById("loginForm");
const studentIdInput = document.getElementById("studentId");
const passwordInput = document.getElementById("password");
const rememberMeInput = document.getElementById("rememberMe");
const loginError = document.getElementById("loginError");

const studentPhoto = document.getElementById("studentPhoto");
const studentName = document.getElementById("studentName");
const displayStudentId = document.getElementById("displayStudentId");
const cardId = document.getElementById("cardId");
const lastAccessTime = document.getElementById("lastAccessTime");
const authorizationStatus = document.getElementById("authorizationStatus");

const useCardButton = document.getElementById("useCardButton");
const accessMessage = document.getElementById("accessMessage");
const appleWalletBtn = document.getElementById("appleWalletBtn");
const logoutButton = document.getElementById("logoutButton");

const qrContainer = document.getElementById("qrContainer");
const qrcodeElement = document.getElementById("qrcode");


// ========================================
// AUTOMATISK INLOGGNING VID START (localStorage)
// ========================================
document.addEventListener("DOMContentLoaded", async function () {
    const savedStudentId = localStorage.getItem("savedStudentId");
    const savedPassword = localStorage.getItem("savedPassword");

    if (savedStudentId && savedPassword) {
        loginError.textContent = "Loggar in automatiskt...";

        const { data: student, error } = await supabaseClient
            .from("students")
            .select("*")
            .eq("student_id", savedStudentId)
            .eq("password", savedPassword)
            .maybeSingle();

        if (student && !error) {
            currentStudent = student;
            loginError.textContent = "";
            showStudentCard(student);
        } else {
            loginError.textContent = "";
            localStorage.removeItem("savedStudentId");
            localStorage.removeItem("savedPassword");
        }
    }
});


// ========================================
// INLOGGNING MOT SUPABASE
// ========================================
loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const enteredStudentId = studentIdInput.value.trim();
    const enteredPassword = passwordInput.value.trim();

    loginError.textContent = "Söker i databasen...";

    const { data: student, error } = await supabaseClient
        .from("students")
        .select("*")
        .eq("student_id", enteredStudentId)
        .eq("password", enteredPassword)
        .maybeSingle();

    if (error || !student) {
        loginError.textContent = "Fel Elev-ID eller lösenord.";
        return;
    }

    if (rememberMeInput && rememberMeInput.checked) {
        localStorage.setItem("savedStudentId", enteredStudentId);
        localStorage.setItem("savedPassword", enteredPassword);
    } else {
        localStorage.removeItem("savedStudentId");
        localStorage.removeItem("savedPassword");
    }

    currentStudent = student;
    loginError.textContent = "";
    showStudentCard(student);
});


// ========================================
// VISA ELEVENS KORT & HÄMTA SENASTE INPASSAGE
// ========================================
async function showStudentCard(student) {
    studentName.textContent = student.name;
    displayStudentId.textContent = student.student_id;
    cardId.textContent = student.card_id || student.card_i || "N/A";

    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=0F172A&color=fff&size=128`;

    studentPhoto.src = student.photo_url || student.image_url || `${student.student_id}.jpg`;

    studentPhoto.onerror = function () {
        this.src = fallbackAvatar;
    };

    accessMessage.textContent = "";
    qrContainer.classList.add("hidden");
    qrcodeElement.innerHTML = "";

    if (student.authorized) {
        authorizationStatus.textContent = "✓ Behörig elev";
        if (authorizationStatus.parentElement) {
            authorizationStatus.parentElement.classList.remove("not-authorized");
        }

        useCardButton.disabled = false;
        useCardButton.style.opacity = "1";
    } else {
        authorizationStatus.textContent = "✕ Ej behörig elev";
        if (authorizationStatus.parentElement) {
            authorizationStatus.parentElement.classList.add("not-authorized");
        }

        useCardButton.disabled = true;
        useCardButton.style.opacity = "0.5";
    }

    // Hämta senast registrerade inpassage
    fetchLastEntrance(student.student_id);

    loginPage.classList.add("hidden");
    cardPage.classList.remove("hidden");
}

async function fetchLastEntrance(studentId) {
    if (!lastAccessTime) return;

    const { data, error } = await supabaseClient
        .from("access_logs")
        .select("created_at")
        .eq("student_id", studentId)
        .eq("granted", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (data && data.created_at) {
        const dateObj = new Date(data.created_at);
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isToday = new Date().toDateString() === dateObj.toDateString();

        lastAccessTime.textContent = isToday ? `Idag kl. ${timeStr}` : `${dateObj.toLocaleDateString()} ${timeStr}`;
    } else {
        lastAccessTime.textContent = "Ingen registrerad";
    }
}


// ========================================
// HJÄLPFUNKTION: SKAPA DYNAMISK QR-DATA
// ========================================
function getDynamicQrData() {
    const timestamp = Math.floor(Date.now() / 1000);
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?student_id=${encodeURIComponent(currentStudent.student_id)}&t=${timestamp}`;
}


// ========================================
// ANVÄND DIGITALT SKOLKORT (Statisk QR för direkt skanning)
// ========================================
useCardButton.addEventListener("click", function () {
    if (useCardButton.disabled || !currentStudent) {
        return;
    }

    if ("vibrate" in navigator) {
        navigator.vibrate(50);
    }

    clearInterval(countdownTimer);
    qrcodeElement.innerHTML = "";
    qrContainer.classList.remove("hidden");

    qrCodeObj = new QRCode(qrcodeElement, {
        text: getDynamicQrData(),
        width: 170,
        height: 170,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
    });

    let timeLeft = 30;
    useCardButton.disabled = true;
    useCardButton.style.opacity = "0.5";
    accessMessage.innerHTML = `⚡ Levande kod: <strong>${timeLeft}s</strong>`;

    countdownTimer = setInterval(function () {
        timeLeft--;

        if (timeLeft > 0) {
            accessMessage.innerHTML = `⚡ Levande kod: <strong>${timeLeft}s</strong>`;
        } else {
            clearInterval(countdownTimer);
            accessMessage.textContent = "✕ Tiden har gått ut. Tryck igen för ny kod.";
            qrContainer.classList.add("hidden");
            qrcodeElement.innerHTML = "";

            if (currentStudent && currentStudent.authorized) {
                useCardButton.disabled = false;
                useCardButton.style.opacity = "1";
            }
        }
    }, 1000);
});


// ========================================
// APPLE WALLET KNAPP
// ========================================
if (appleWalletBtn) {
    appleWalletBtn.addEventListener("click", function () {
        if (!currentStudent) return;
        alert("Apple Wallet-integrationen är förberedd i backend med Supabase Edge Functions och PassKit, men kräver ett betalt Apple Developer-certifikat för att aktiveras i produktion.");
    });
}


// ========================================
// LOGGA UT
// ========================================
logoutButton.addEventListener("click", function () {
    clearInterval(countdownTimer);

    localStorage.removeItem("savedStudentId");
    localStorage.removeItem("savedPassword");

    currentStudent = null;
    qrCodeObj = null;

    loginPage.classList.remove("hidden");
    cardPage.classList.add("hidden");

    loginForm.reset();

    studentName.textContent = "";
    displayStudentId.textContent = "";
    cardId.textContent = "";
    authorizationStatus.textContent = "";
    accessMessage.textContent = "";
    loginError.textContent = "";
    if (lastAccessTime) lastAccessTime.textContent = "";

    qrContainer.classList.add("hidden");
    qrcodeElement.innerHTML = "";

    if (authorizationStatus.parentElement) {
        authorizationStatus.parentElement.classList.remove("not-authorized");
    }

    useCardButton.disabled = false;
    useCardButton.style.opacity = "1";

    studentIdInput.focus();
});