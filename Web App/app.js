// ════════════════════════════════════════
// HALEON PARTNERS CLUB — app.js
// Firebase Realtime DB + Google Sheets sync
// ════════════════════════════════════════

const SHEETS_WEBHOOK = "https://script.google.com/macros/s/AKfycbwHj5I-AiO5mQhxJCUHjFf-p1spOTU-E5LZH3-Lc4cq5zkTHs2U-RrTsSY8JFzl2KrX/exec";

// Parse URL parameters and check for reference
const initParams = new URLSearchParams(window.location.search);
if (initParams.get('ref') === 'in_event') {
  sessionStorage.setItem('ref', 'in_event');
  localStorage.setItem('ref', 'in_event');
}

const state = {
  uid: null, user: null, score: 0, quizzesCompleted: 0,
  claimedBadges: [], answeredQuestions: [], gamesCompleted: {},
  active: false, attendance: false, cardId: "", redeemedReward: null,
  ref: ""
};

let currentTab = 0;
const answeredSet = new Set();
const tabOrder = ["home", "education", "games", "calendar", "profile"];
const TOTAL_GAMES = 9; // Updated games count (basket, myth, buzzer, mitohype, match, spot, placement, memory, spin)

function makeQRUrl(data, size = 200) {
  // Using QuickChart API — modern, active, and reliable
  return `https://quickchart.io/qr?text=${encodeURIComponent(data)}&size=${size}&margin=1`;
}

// Renamed from 'badges' to 'badgeDefs' and uses 'image' property
const badgeDefs = [
  { id: 0, name: 'Health Advocate', image: 'assets/Health Advocate.png', pts: 200 },
  { id: 1, name: 'Daily Mover', image: 'assets/Daily Mover.png', pts: 400 },
  { id: 2, name: 'Wellness Leader', image: 'assets/Wellness Leader.png', pts: 600 }
];

const rewardsData = [
  { key: "pen", title: "Haleon Branded Pen", pts: 100, image: "assets/Pen.png" },
  { key: "notebook", title: "Haleon Notebook", pts: 200, image: "assets/Notebook.png" },
  { key: "flask", title: "Haleon Flask", pts: 300, image: "assets/Flask.png" },
  { key: "mug", title: "Ceramic Mug", pts: 400, image: "assets/Mug.png" },
];

window.bootApp = function (uid, data, showWelcome) {
  state.uid = uid; state.user = data.profile; state.score = data.score || 0;
  state.quizzesCompleted = data.quizzesCompleted || 0; state.claimedBadges = data.claimedBadges || [];
  state.answeredQuestions = data.answeredQuestions || []; state.gamesCompleted = data.gamesCompleted || {};
  state.active = data.active !== undefined ? data.active : false;
  state.attendance = data.attendance !== undefined ? data.attendance : false;
  state.cardId = data.cardId || "";
  state.cardPointsClaimed = data.cardPointsClaimed !== undefined ? data.cardPointsClaimed : (data.cardId ? true : false);
  state.initialOnboardingClaimed = data.initialOnboardingClaimed !== undefined ? data.initialOnboardingClaimed : false;
  state.watchedVideos = data.watchedVideos || {};
  state.redeemedReward = data.redeemedReward || null;
  state.ref = data.ref || "";
  state.mysteryShopperWatched = data.mysteryShopperWatched || JSON.parse(localStorage.getItem('mysteryShopperWatched') || '{"v1":false,"v2":false}');
  state.mysteryShopperCompleted = data.mysteryShopperCompleted !== undefined ? data.mysteryShopperCompleted : (localStorage.getItem('mysteryShopperCompleted') === 'true');
  state.mysteryShopperReward = data.mysteryShopperReward || JSON.parse(localStorage.getItem('mysteryShopperReward') || 'null');

  if (!state.initialOnboardingClaimed) {
    state.score += 15; // 5 pts for email verification + 10 pts for profile completion
    state.initialOnboardingClaimed = true;
    saveToFirebase();
  }
  if (typeof updateMysteryShopperProgress === 'function') updateMysteryShopperProgress();

  answeredSet.clear();
  state.answeredQuestions.forEach((i) => answeredSet.add(i));

  document.getElementById("nav-username").textContent = state.user.name;
  document.getElementById("bottom-nav").classList.add("visible");
  
  const urlParams = new URLSearchParams(window.location.search);
  const rGame = urlParams.get('rewardGame');
  const rPts = parseInt(urlParams.get('rewardPts'), 10);

  if (rGame && !isNaN(rPts)) {
    window.history.replaceState({}, document.title, window.location.pathname); 
    if (!state.gamesCompleted[rGame]) {
      // [OLD - points system] state.score += rPts;
      // [OLD - points system] state.gamesCompleted[rGame] = rPts;
      state.score += 5;
      state.gamesCompleted[rGame] = 5;
      saveToFirebase(); 
      // [OLD - points system] setTimeout(() => showToast(`Success! +${rPts} points added.`), 500);
      setTimeout(() => showToast(`Success! +5 points added.`), 500);
      setTimeout(() => checkBadgeUnlocks(), 1200);
    } else {
      setTimeout(() => showToast("Points already claimed for this game."), 500);
    }
  }
  
  updateHomeUI(); updateGamesUI(); renderRewardsPage(); updateProfilePage();

  startCarousel();

  // Set initial screen to Home screen
  switchTab("home");
  
  // Manage inline card banner visibility based on if the card is linked
  const slideBannerCard = document.getElementById('slide-banner-card');
  const bannerDotsWrapper = document.getElementById('banner-carousel-dots');
  const bannerTrack = document.getElementById('banner-carousel-track');
  const topBannersWrap = document.getElementById('top-banners-wrap');

  if (slideBannerCard) {
    if (state.cardId) {
      slideBannerCard.style.display = 'none';
    } else {
      slideBannerCard.style.display = 'block';
    }
  }

  if (bannerTrack) {
    bannerTrack.style.display = 'flex';
  }
  if (bannerDotsWrapper) {
    bannerDotsWrapper.style.display = 'flex';
  }
  goToBannerSlide(0);

  if (showWelcome === true && state.user) {
    document.getElementById("welcome-name").textContent = "👋 Hi, " + state.user.name + "!";
    document.getElementById("welcome-email").textContent = state.user.email;
    setTimeout(() => { document.getElementById("welcome-dialog").classList.add("open"); launchConfetti(4000); }, 400);
  }
};
// ════════════════════════════════════════
// WEBINAR CLICK TRACKING
// ════════════════════════════════════════
window.trackWebinarClick = async function(source) {
  // Only track if the user is logged in
  if (!state.uid) return;
  
  // Prevent duplicate tracking writes in the same session
  if (state['tracked_' + source]) return;
  state['tracked_' + source] = true;

  try {
    const updateData = {};
    updateData['clicked_' + source] = true; // 'clicked_banner' or 'clicked_popup'
    
    await window._fb.updateDoc(window._fb.doc(window._fb.db, 'users', state.uid), updateData);
    console.log(`Tracked click: ${source}`);
  } catch (e) {
    console.error("Tracking failed:", e);
  }
};

window.showView = function showView(id) { document.querySelectorAll(".view").forEach((v) => v.classList.remove("active")); const el = document.getElementById(id); if (el) el.classList.add("active"); };

window.switchTab = function switchTab(tab) {
  document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
  const activeTabEl = document.getElementById("tab-" + tab);
  if (activeTabEl) activeTabEl.classList.add("active");
  currentTab = tabOrder.indexOf(tab);
  
  if (tab === "home") { 
    showView("view-home"); 
    updateHomeUI(); 
  } 
  else if (tab === "education") {
    showView("view-education");
  }
  else if (tab === "games") {
    showView("view-games");
    updateGamesUI();
  }
  else if (tab === "calendar") {
    showView("view-calendar");
  }
  else if (tab === "rewards") { showView("view-rewards"); renderRewardsPage(); } 
  else if (tab === "scanner") { showView("view-scanner"); } 
  else if (tab === "profile") { 
    showView("view-profile"); 
    updateProfilePage(); 
    // Card animation: flip, wait 2s, flip back
    const cardInner = document.getElementById('card-inner');
    if (cardInner) {
      cardInner.classList.remove('flipped');
      setTimeout(() => {
        cardInner.classList.add('flipped');
        setTimeout(() => {
          cardInner.classList.remove('flipped');
        }, 2000);
      }, 400);
    }
  }

  if (tab !== "scanner") stopPointScanner();
};

// Swipe navigation removed per request

window.doLogin = async function() {
  const email = document.getElementById("login-email").value.trim(); 
  let pass = document.getElementById("login-pass").value.trim(); 
  const errEl = document.getElementById("login-error"); 
  const btn = document.getElementById("btn-login");
  errEl.textContent = ""; if (!email || !pass) { errEl.textContent = "Please fill in all fields."; return; }
  
  const rawPin = pass;
  while (pass.length > 0 && pass.length < 6) pass += "0";

  btn.textContent = "Logging in…"; btn.disabled = true;
  try {
    const cred = await window._fb.signInWithEmailAndPassword(window._fb.auth, email, pass);
    const snap = await window._fb.getDoc(window._fb.doc(window._fb.db, "users", cred.user.uid));
    if (snap.exists()) {
      const userData = snap.data();
      // Check active status
      if (userData.active === false) {
        await window._fb.signOut(window._fb.auth);
        errEl.innerHTML = '⚠️ Your account is not yet activated.<br><span style="font-size:0.85rem;color:var(--muted)">Please contact your Haleon event admin to activate your account.</span>';
        btn.textContent = "LOGIN"; btn.disabled = false;
        return;
      }
      window.bootApp(cred.user.uid, userData, false);
    } else {
      errEl.textContent = "Account data not found.";
    }
  } catch (e) { errEl.textContent = friendlyError(e.code); } finally { btn.textContent = "LOGIN"; btn.disabled = false; }
};

window.doRegister = async function() {
  const name = document.getElementById("reg-name").value.trim(); const email = document.getElementById("reg-email").value.trim(); const phone = document.getElementById("reg-phone").value.trim(); const pharmacy = document.getElementById("reg-pharmacy").value.trim(); const pass = document.getElementById("reg-pass").value; const errEl = document.getElementById("reg-error"); const btn = document.getElementById("btn-register");
  errEl.textContent = ""; if (!name || !email || !phone || !pharmacy || !pass) { errEl.textContent = "Please fill in all fields."; return; }
  if (pass.length < 6) { errEl.textContent = "Password must be at least 6 characters."; return; }
  btn.textContent = "Creating account…"; btn.disabled = true;
  try {
    const cred = await window._fb.createUserWithEmailAndPassword(window._fb.auth, email, pass);
    const uid = cred.user.uid; const memberId = uid.slice(0, 8).toUpperCase();
    const profile = { name, email, phone, pharmacy, memberId };
    const userData = { profile, score: 0, quizzesCompleted: 0, claimedBadges: [], answeredQuestions: [], gamesCompleted: {}, tier: "Student", createdAt: new Date().toISOString() };
    await window._fb.setDoc(window._fb.doc(window._fb.db, "users", uid), userData);
    syncToSheets(uid, userData); window.bootApp(uid, userData, true);
  } catch (e) { errEl.textContent = friendlyError(e.code); } finally { btn.textContent = "CREATE ACCOUNT"; btn.disabled = false; }
};

window.doFindPin = async function() {
  const email  = document.getElementById("forgot-email").value.trim();
  const errEl  = document.getElementById("forgot-error");
  const btn    = document.getElementById("btn-forgot");
  errEl.textContent = "";
  if (!email) { errEl.textContent = "Please enter your email address."; return; }
  btn.textContent = "Searching…"; btn.disabled = true;
  try {
    const { collection, query, where, getDocs } = window._fb;
    const usersRef = collection(window._fb.db, "users");
    const q = query(usersRef, where("profile.email", "==", email.toLowerCase()));
    const snap = await getDocs(q);
    if (snap.empty) {
      errEl.textContent = "No account found with this email address.";
    } else {
      const userData = snap.docs[0].data();
      const pin = userData.profile?.pin || "";
      if (!pin) {
        errEl.textContent = "PIN not found for this account. Please contact support.";
      } else {
        document.getElementById("pin-reveal-value").textContent = pin;
        document.getElementById("pin-reveal-dialog").classList.add("open");
      }
    }
  } catch (e) {
    errEl.textContent = "An error occurred. Please try again.";
    console.error("doFindPin error:", e);
  } finally {
    btn.textContent = "CHECK"; btn.disabled = false;
  }
};

window.closePinRevealDialog = function() {
  document.getElementById("pin-reveal-dialog").classList.remove("open");
  showView("view-login");
};


window.doLogout = async function() {
  await window._fb.signOut(window._fb.auth); state.uid = null; state.user = null; state.score = 0; state.quizzesCompleted = 0; state.claimedBadges = []; state.answeredQuestions = []; state.gamesCompleted = {};
  answeredSet.clear(); document.getElementById("bottom-nav").classList.remove("visible"); showView("view-login");
};

function friendlyError(code) { const map = { "auth/user-not-found": "No account found.", "auth/wrong-password": "Incorrect password.", "auth/email-already-in-use": "Email already exists.", "auth/invalid-email": "Invalid email.", "auth/weak-password": "Min 6 characters.", "auth/invalid-credential": "Incorrect email or password." }; return map[code] || "Something went wrong. Please try again."; }

async function saveToFirebase() {
  if (!state.uid) return;
  const tier = getTier().name;
  const data = { score: state.score, quizzesCompleted: state.quizzesCompleted, claimedBadges: state.claimedBadges, answeredQuestions: [...answeredSet], gamesCompleted: state.gamesCompleted, cardPointsClaimed: state.cardPointsClaimed || false, initialOnboardingClaimed: state.initialOnboardingClaimed || true, watchedVideos: state.watchedVideos || {}, tier, lastUpdated: window._fb.serverTimestamp() };
  try {
    await window._fb.updateDoc(window._fb.doc(window._fb.db, "users", state.uid), data);
    syncToSheets(state.uid, { profile: state.user, ...data, lastUpdated: new Date().toISOString() });
    showSyncStatus("✓ Synced");
  } catch (e) { showSyncStatus("⚠ Sync failed"); }
}

function showSyncStatus(msg) { const el = document.getElementById("sync-status"); if (!el) return; el.textContent = msg; el.style.opacity = "1"; setTimeout(() => { el.style.opacity = "0"; }, 2500); }

function syncToSheets(uid, data) {
  if (!SHEETS_WEBHOOK || SHEETS_WEBHOOK === "YOUR_APPS_SCRIPT_WEB_APP_URL") return;
  const badgeNames = (data.claimedBadges || []).map((id) => { const def = badgeDefs.find((b) => b.id === id); return def ? def.name : id; }).join(", ");
  const payload = { uid, name: data.profile?.name || "", email: data.profile?.email || "", phone: data.profile?.phone || "", pharmacy: data.profile?.pharmacy || "", memberId: data.profile?.memberId || "", score: data.score || 0, quizzesCompleted: data.quizzesCompleted || 0, tier: getTierInfo(data.score || 0).name, badges: badgeNames, badgesCount: (data.claimedBadges || []).length, lastUpdated: data.lastUpdated || new Date().toISOString(), pin: data.profile?.pin || "" };
  fetch(SHEETS_WEBHOOK, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
}

function getTierInfo(score) {
  const s = Number(score) || 0;
  if (s >= 2000) {
    return {
      name: "Platinum",
      nextTier: null,
      ptsToNext: 0,
      pct: 100,
      nextText: "You are in Platinum tier - Highest rank!"
    };
  } else if (s >= 1500) {
    const ptsInTier = s - 1500;
    const pct = Math.min(100, Math.max(0, (ptsInTier / 500) * 100));
    const ptsLeft = 2000 - s;
    return {
      name: "Gold",
      nextTier: "Platinum",
      ptsToNext: ptsLeft,
      pct: pct,
      nextText: `${ptsLeft} pts to Platinum tier`
    };
  } else if (s >= 1000) {
    const ptsInTier = s - 1000;
    const pct = Math.min(100, Math.max(0, (ptsInTier / 500) * 100));
    const ptsLeft = 1500 - s;
    return {
      name: "Silver",
      nextTier: "Gold",
      ptsToNext: ptsLeft,
      pct: pct,
      nextText: `${ptsLeft} pts to Gold tier`
    };
  } else if (s >= 500) {
    const ptsInTier = s - 500;
    const pct = Math.min(100, Math.max(0, (ptsInTier / 500) * 100));
    const ptsLeft = 1000 - s;
    return {
      name: "Bronze",
      nextTier: "Silver",
      ptsToNext: ptsLeft,
      pct: pct,
      nextText: `${ptsLeft} pts to Silver tier`
    };
  } else {
    const pct = Math.min(100, Math.max(0, (s / 500) * 100));
    const ptsLeft = 500 - s;
    return {
      name: "No Tier",
      nextTier: "Bronze",
      ptsToNext: ptsLeft,
      pct: pct,
      nextText: `${ptsLeft} pts to Bronze tier`
    };
  }
}

function updateTierProgressCards() {
  const info = getTierInfo(state.score);
  const views = ["home", "games", "education", "profile"];
  views.forEach((v) => {
    const nameEl = document.getElementById("tc-name-" + v);
    const ptsEl = document.getElementById("tc-pts-" + v);
    const fillEl = document.getElementById("tc-fill-" + v);
    const nextEl = document.getElementById("tc-next-" + v);

    if (nameEl) {
      if (info.name === "No Tier") {
        nameEl.parentElement.innerHTML = `<span id="tc-name-${v}">No Tier</span>`;
      } else {
        nameEl.parentElement.innerHTML = `<span id="tc-name-${v}">${info.name}</span> tier`;
      }
    }
    if (ptsEl) ptsEl.textContent = state.score.toLocaleString();
    if (fillEl) fillEl.style.width = info.pct + "%";
    if (nextEl) nextEl.textContent = info.nextText;
  });
}

function renderGiveawaysUI() {
  const giveaways = [
    { key: "pen", target: 100 },
    { key: "notebook", target: 200 },
    { key: "tote", target: 300 },
    { key: "calendar", target: 400 },
    { key: "mug", target: 500 },
    { key: "flask", target: 750 }
  ];

  const score = Number(state.score) || 0;
  const maxCircumference = 138.2;

  giveaways.forEach((gw) => {
    const cardEl = document.getElementById("gw-card-" + gw.key);
    const lockEl = document.getElementById("gw-lock-" + gw.key);
    const ringEl = document.getElementById("gw-ring-" + gw.key);
    const textEl = document.getElementById("gw-pts-left-" + gw.key);

    if (score >= gw.target) {
      if (cardEl) cardEl.classList.add("unlocked");
      if (lockEl) lockEl.classList.add("hidden");
    } else {
      if (cardEl) cardEl.classList.remove("unlocked");
      if (lockEl) lockEl.classList.remove("hidden");

      const ptsLeft = gw.target - score;
      if (textEl) textEl.textContent = ptsLeft;

      const pct = Math.min(1, Math.max(0, score / gw.target));
      const offset = maxCircumference - pct * maxCircumference;
      if (ringEl) ringEl.style.strokeDashoffset = offset;
    }
  });
}

function getTier() { 
    if (state.user && state.user.profession) {
        const prof = state.user.profession.toLowerCase();
        if (prof.includes("owner"))     return { name: "Pharmacy Owner",       cls: "card-owner" };
        if (prof.includes("pharmacist")) return { name: "Pharmacist",           cls: "card-community" };
    }
    return { name: "Haleon Partner", cls: "card-student" }; 
}

function updateHomeUI() {
  const tier = getTier();
  const completedCount = Object.keys(state.gamesCompleted || {}).length;
  const pct = Math.round((completedCount / TOTAL_GAMES) * 100);
  const circumference = 2 * Math.PI * 60;
  
  const ringEl = document.getElementById("progress-ring");
  if (ringEl) ringEl.style.strokeDashoffset = circumference - (pct / 100) * circumference;
  
  const pctEl = document.getElementById("progress-pct");
  if (pctEl) pctEl.textContent = pct + "%";
  
  const ptsEl = document.getElementById("pts-display");
  if (ptsEl) ptsEl.textContent = state.score.toLocaleString() + " Points";
  
  const tierEl = document.getElementById("tier-badge-home");
  if (tierEl) tierEl.textContent = tier.name;
  
  const userEl = document.getElementById("nav-username");
  if (state.user && userEl) userEl.textContent = state.user.name;
  
  updateTierProgressCards();
  updateBadgeStates(); updateHomeRedeemBtns(); updateQuizBannerUI(); updateOnboardingCardUI();
}

// ════════════════════════════════════════
// ONBOARDING CARD LOGIC
// ════════════════════════════════════════
window.toggleOnboardingCard = function(expand) {
  const compactEl = document.getElementById("onboarding-compact");
  const expandedEl = document.getElementById("onboarding-expanded");
  if (!compactEl || !expandedEl) return;

  if (expand) {
    compactEl.style.display = "none";
    expandedEl.style.display = "block";
  } else {
    compactEl.style.display = "block";
    expandedEl.style.display = "none";
  }
};

window.openCardLinkFromOnboarding = function(e) {
  if (e) e.stopPropagation();
  if (state.cardId) return; // Already linked
  if (typeof window.openCardLinkDialog === 'function') {
    window.openCardLinkDialog();
  }
};

window.openQuizFromOnboarding = function(e) {
  if (e) e.stopPropagation();
  if (typeof window.openQuizView === 'function') {
    window.openQuizView();
  }
};

window.updateOnboardingCardUI = function() {
  const userNameEls = document.querySelectorAll(".onboarding-user-name");
  const name = (state.user && state.user.name) ? state.user.name.split(' ')[0] : 'Partner';
  userNameEls.forEach(el => el.textContent = name);

  // Step 1: Verify Email (Done by default) -> 1
  // Step 2: Complete Profile (Done by default) -> 1
  // Step 3: Link Card -> 1 if state.cardId exists, else 0
  const isCardLinked = !!(state.cardId && state.cardId.trim() !== "");
  // Step 4: First Quiz -> 1 if state.quizzesCompleted > 0 or isQuizCompleted(), else 0
  const isQuizDone = (typeof isQuizCompleted === 'function' && isQuizCompleted()) || (state.quizzesCompleted > 0);

  let completedCount = 2; // Email and Profile pre-completed
  if (isCardLinked) completedCount++;
  if (isQuizDone) completedCount++;

  const pct = Math.round((completedCount / 4) * 100);

  // Update Compact UI
  const compactCount = document.getElementById("onboarding-compact-count");
  if (compactCount) compactCount.textContent = `${completedCount} of 4`;

  const compactFill = document.getElementById("onboarding-compact-fill");
  if (compactFill) compactFill.style.width = `${pct}%`;

  const compactNext = document.getElementById("onboarding-compact-next");
  if (compactNext) {
    if (!isCardLinked) {
      compactNext.textContent = "Next step: Link your physical card";
    } else if (!isQuizDone) {
      compactNext.textContent = "Next step: Take your first quiz";
    } else {
      compactNext.textContent = "All setup complete! 🎉";
    }
  }

  // Update Expanded UI
  const expCount = document.getElementById("onboarding-exp-count");
  if (expCount) expCount.textContent = `${completedCount} of 4`;

  const expFill = document.getElementById("onboarding-exp-fill");
  if (expFill) expFill.style.width = `${pct}%`;

  // Item 3 (Link Card)
  const itemCard = document.getElementById("onboarding-item-card");
  const cardIcon = document.getElementById("onboarding-card-icon");
  const cardBtn = document.getElementById("onboarding-card-btn");

  if (itemCard) {
    if (isCardLinked) {
      itemCard.className = "onboarding-item completed";
      if (cardIcon) cardIcon.textContent = "✓";
      if (cardBtn) cardBtn.style.display = "none";
    } else {
      itemCard.className = "onboarding-item";
      if (cardIcon) cardIcon.textContent = "💳";
      if (cardBtn) cardBtn.style.display = "inline-block";
    }
  }

  // Item 4 (Quiz)
  const itemQuiz = document.getElementById("onboarding-item-quiz");
  const quizIcon = document.getElementById("onboarding-quiz-icon");

  if (itemQuiz) {
    if (isQuizDone) {
      itemQuiz.className = "onboarding-item completed";
      if (quizIcon) quizIcon.textContent = "✓";
    } else {
      itemQuiz.className = "onboarding-item";
      if (quizIcon) quizIcon.textContent = "▶";
    }
  }

  // Badge Item
  const badgeBullet = document.getElementById("onboarding-badge-bullet");
  const badgeSub = document.getElementById("onboarding-badge-sub");

  if (isQuizDone) {
    if (badgeBullet) badgeBullet.textContent = "✓";
    if (badgeSub) badgeSub.textContent = "Unlocked!";
  } else {
    if (badgeBullet) badgeBullet.textContent = "o";
    if (badgeSub) badgeSub.textContent = "Unlocks after your first quiz";
  }
};

function updateHomeRedeemBtns() { const flask = document.getElementById("home-redeem-flask"); const pen = document.getElementById("home-redeem-pen"); if (flask) flask.disabled = state.score < 300; if (pen) pen.disabled = state.score < 100; }

function updateGamesUI() {
  const games = ['basket', 'myth', 'buzzer', 'mitohype', 'match', 'spot', 'placement', 'memory', 'spin', 'word'];
  games.forEach(g => { 
    const statusEl = document.getElementById('gstatus-' + g); 
    if (statusEl) { 
      if (state.gamesCompleted[g]) { 
        statusEl.textContent = "✓ Completed"; 
        statusEl.style.color = "var(--green)"; 
      } else { 
        statusEl.textContent = (g === 'spin') ? "1x / Week" : "Play"; 
        statusEl.style.color = "var(--muted)"; 
      } 
    } 
  });
  updateTierProgressCards();
}

const GAMES_INFO = {
  'basket': { name: 'Build Basket', icon: 'assets/Build Basket.png' },
  'myth': { name: 'Myth vs Fact', icon: 'assets/Myth & Fact.png' },
  'match': { name: 'Matching Game', icon: 'assets/Matching.png' },
  'memory': { name: 'Memory Challenge', icon: 'assets/Memory Challenge.png' },
  'mitohype': { name: 'Panadol Game', icon: 'assets/Panadol Challenge.png' },
  'spin': { name: 'Spin to Win', icon: 'assets/Spin to Win.png' },
  'spot': { name: 'Centrum Game', icon: 'assets/Magnifier.png' },
  'buzzer': { name: 'Buzzer Battle', icon: 'assets/Buzzer Battle.png' },
  'placement': { name: 'Best Place', icon: 'assets/Best Place.png' },
  'word': { name: 'Word Search', icon: 'assets/memory game/memoryGameIcon.png' }
};

window.openSpinGameWeekly = function() {
  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const lastPlayed = state.gamesCompleted['spin_last_played'] || 0;
  if (lastPlayed && (now - lastPlayed < oneWeekMs)) {
    const daysLeft = Math.ceil((oneWeekMs - (now - lastPlayed)) / (24 * 60 * 60 * 1000));
    showToast(`Spin to Win is available 1 time per week. Try again in ${daysLeft} day(s)!`);
    return;
  }
  window.openGame('game_spin.html', 'spin');
};

// ════════════════════════════════════════
// FEATURED VIDEO REWARD (+15 POINTS)
// ════════════════════════════════════════
window.claimVideoPoints = async function(pts = 15, videoId = "featured_v1", videoTitle = "the video") {
  state.watchedVideos = state.watchedVideos || {};
  
  if (state.watchedVideos[videoId] || (videoId === "featured_v1" && state.videoWatched)) {
    showToast("You have already earned points for watching this video.");
    return;
  }

  if (videoId === "featured_v1") state.videoWatched = true;
  state.watchedVideos[videoId] = pts;
  state.score += pts;

  const statusEl = document.getElementById("video-claim-status");
  if (statusEl) statusEl.textContent = `✓ +${pts} Pts Claimed`;

  showToast(`🎉 Great job! +${pts} Points added for watching ${videoTitle}!`);
  await saveToFirebase();
  updateHomeUI();
};

// ════════════════════════════════════════
// QUIZ OF THE WEEK (HALEON PRODUCTS QUIZ)
// ════════════════════════════════════════
const quizQuestions = [
  {
    q: "Which Voltaren product is primarily indicated for the local relief of muscle and joint pain?",
    options: ["Panadol Advance", "Voltaren Emulgel", "Otrivin Nasal Spray", "Sensodyne Repair & Protect"],
    correct: 1
  },
  {
    q: "Sensodyne toothpaste is specifically formulated to help manage:",
    options: ["Gum infections only", "Tooth whitening only", "Dentine hypersensitivity (tooth sensitivity)", "Dental cavities only"],
    correct: 2
  },
  {
    q: "Otrivin Nasal Spray works by:",
    options: ["Destroying bacteria in the nasal cavity", "Moisturizing the throat", "Reducing swelling in the nasal passages to relieve congestion", "Treating allergic skin reactions"],
    correct: 2
  },
  {
    q: "Panadol Advance contains which active ingredient?",
    options: ["Ibuprofen", "Diclofenac", "Paracetamol (Acetaminophen)", "Naproxen"],
    correct: 2
  },
  {
    q: "Which Haleon oral care brand is recommended for patients experiencing tooth sensitivity?",
    options: ["Parodontax", "Sensodyne", "Aquafresh", "Otrivin"],
    correct: 1
  }
];

const CURRENT_QUIZ_ID = "quiz_v1";

let quizCurrentIdx = 0;
let quizScore = 0;
let selectedOptionIdx = null;

function isQuizCompleted() {
  return state.quizCompletedId === CURRENT_QUIZ_ID || (state.quizCompleted === true && state.quizCompletedId === undefined);
}

function updateQuizBannerUI() {
  const iconEl = document.getElementById("quiz-banner-icon");
  const subEl = document.getElementById("quiz-banner-sub");
  const badgeEl = document.getElementById("quiz-banner-badge");

  if (isQuizCompleted()) {
    if (iconEl) {
      iconEl.textContent = "✓";
      iconEl.style.background = "var(--green)";
      iconEl.style.color = "#000";
    }
    if (subEl) subEl.textContent = `Completed • Earned +${state.quizLastScore !== undefined ? state.quizLastScore : 50} Points`;
    if (badgeEl) badgeEl.textContent = "Completed ✓";
  } else {
    if (iconEl) {
      iconEl.textContent = "➔";
      iconEl.style.background = "var(--green)";
      iconEl.style.color = "#000";
    }
    if (subEl) subEl.textContent = "5 Questions • Earn +10 Points per question";
    if (badgeEl) badgeEl.textContent = "Weekly Challenge";
  }
}

window.openQuizCompletedDialog = function() {
  const pts = state.quizLastScore !== undefined ? state.quizLastScore : 50;
  const ptsEl = document.getElementById("quiz-dialog-pts");
  if (ptsEl) ptsEl.textContent = `Points Earned: +${pts} Points!`;
  
  const dialog = document.getElementById("quiz-completed-dialog");
  if (dialog) dialog.classList.add("open");
};

window.closeQuizCompletedDialog = function() {
  const dialog = document.getElementById("quiz-completed-dialog");
  if (dialog) dialog.classList.remove("open");
};

window.openQuizView = function() {
  if (isQuizCompleted()) {
    openQuizCompletedDialog();
    return;
  }
  showView("view-quiz");
  startQuiz();
};

window.startQuiz = function() {
  quizCurrentIdx = 0;
  quizScore = 0;
  selectedOptionIdx = null;
  renderQuizQuestion();
};

function renderQuizQuestion() {
  selectedOptionIdx = null;
  const qObj = quizQuestions[quizCurrentIdx];
  const pct = Math.round(((quizCurrentIdx + 1) / quizQuestions.length) * 100);
  
  const fillEl = document.getElementById("quiz-progress-fill");
  if (fillEl) fillEl.style.width = pct + "%";
  
  const numEl = document.getElementById("quiz-q-num");
  if (numEl) numEl.textContent = `Question ${quizCurrentIdx + 1} of ${quizQuestions.length}`;
  
  const textEl = document.getElementById("quiz-q-text");
  if (textEl) textEl.textContent = qObj.q;

  const container = document.getElementById("quiz-options-container");
  if (container) {
    container.innerHTML = qObj.options.map((opt, i) => `
      <div class="quiz-option-pill" id="qopt-${i}" onclick="selectQuizOption(${i})">
        <div class="quiz-option-radio"></div>
        <div>${opt}</div>
      </div>
    `).join("");
  }

  const btn = document.getElementById("btn-next-quiz");
  if (btn) {
    btn.textContent = (quizCurrentIdx === quizQuestions.length - 1) ? "Submit Quiz 🚀" : "Next Question ➔";
    btn.disabled = true;
    btn.style.opacity = "0.5";
  }
}

window.selectQuizOption = function(idx) {
  selectedOptionIdx = idx;
  document.querySelectorAll(".quiz-option-pill").forEach((el, i) => {
    el.classList.toggle("selected", i === idx);
  });
  const btn = document.getElementById("btn-next-quiz");
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = "1";
  }
};

window.nextQuizQuestion = async function() {
  if (selectedOptionIdx === null) return;

  const qObj = quizQuestions[quizCurrentIdx];
  if (selectedOptionIdx === qObj.correct) {
    quizScore += 10;
  }

  quizCurrentIdx++;
  if (quizCurrentIdx < quizQuestions.length) {
    renderQuizQuestion();
  } else {
    // Quiz finished
    state.quizCompleted = true;
    state.quizCompletedId = CURRENT_QUIZ_ID;
    state.quizLastScore = quizScore;
    state.score += quizScore;
    state.quizzesCompleted = (state.quizzesCompleted || 0) + 1;
    await saveToFirebase();
    updateHomeUI();

    showToast(`🎉 Quiz Complete! You earned +${quizScore} Points!`);
    if (quizScore > 0) launchConfetti(3500);

    setTimeout(() => {
      showView("view-home");
      openQuizCompletedDialog();
    }, 1200);
  }
};

window.openGame = function(url, gameId) {
  if (state.gamesCompleted[gameId]) {
    const info = GAMES_INFO[gameId] || { name: 'Game', icon: 'assets/logo1.png' };
    const ptsStr = "Points already collected. You can play again but no more points will be added.";

    const iconEl = document.getElementById('replay-dialog-icon');
    if (iconEl) iconEl.innerHTML = `<img src="${info.icon}" style="width: 80px; height: 80px; object-fit: contain;">`;
    
    const nameEl = document.getElementById('replay-dialog-name');
    if (nameEl) nameEl.textContent = info.name;
    
    const ptsEl = document.getElementById('replay-dialog-pts');
    if (ptsEl) ptsEl.textContent = ptsStr;
    
    const dialogEl = document.getElementById('replay-dialog');
    if (dialogEl) dialogEl.classList.add('open');
    
    const playBtn = document.getElementById('replay-dialog-play-btn');
    if (playBtn) {
      playBtn.style.display = 'block';
      playBtn.onclick = function() {
        dialogEl.classList.remove('open');
        window.location.href = url + `?uid=${state.uid}&exhausted=true`;
      };
    }
  } else {
    window.location.href = url + `?uid=${state.uid}`;
  }
};

// ════════════════════════════════════════
// GAME POINTS SCANNER
// ════════════════════════════════════════
let scanStream = null; let scanTicker = null;

window.startPointScanner = async function() { 
  document.getElementById("scan-status-text").textContent = "Scanning..."; 
  document.getElementById("scan-video-wrap").style.display = "block"; 
  document.getElementById("btn-start-scan").style.display = "none"; 
  document.getElementById("btn-stop-scan").style.display = "block"; 
  try { 
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); 
    const vid = document.getElementById("scan-video"); 
    vid.srcObject = scanStream; 
    await vid.play(); 
    scanTicker = setInterval(tickScan, 200); 
  } catch (e) { 
    stopPointScanner(); showToast("Camera access denied."); 
  } 
};

window.stopPointScanner = function() { 
  if (scanTicker) clearInterval(scanTicker); 
  if (scanStream) scanStream.getTracks().forEach(t => t.stop()); 
  document.getElementById("scan-video-wrap").style.display = "none"; 
  document.getElementById("btn-start-scan").style.display = "block"; 
  document.getElementById("btn-stop-scan").style.display = "none"; 
  document.getElementById("scan-status-text").textContent = "Camera stopped"; 
};

function tickScan() { 
  const vid = document.getElementById("scan-video"); 
  if (!vid || vid.readyState < 2) return; 
  const cvs = document.createElement("canvas"); 
  cvs.width = vid.videoWidth; 
  cvs.height = vid.videoHeight; 
  const ctx = cvs.getContext("2d"); 
  ctx.drawImage(vid, 0, 0); 
  const px = ctx.getImageData(0, 0, cvs.width, cvs.height); 
  const result = jsQR(px.data, px.width, px.height, { inversionAttempts: "dontInvert" }); 
  if (result && result.data) { 
    stopPointScanner(); 
    processGameQR(result.data); 
  } 
}

async function processGameQR(raw) {
  try {
    const data = JSON.parse(raw);
    if (data.type !== "game_reward" || !data.gameId || !data.points) throw new Error();
    
    if (state.gamesCompleted[data.gameId]) {
        const info = GAMES_INFO[data.gameId] || { name: 'Game', icon: 'assets/logo1.png' };
        const pts = state.gamesCompleted[data.gameId];
        // [OLD - points system] const ptsStr = (pts === true) ? "Points Already Collected" : (pts + " Points Already Collected");
        const ptsStr = "Points already collected. You can play again but no more points will be added.";

        const iconEl = document.getElementById('replay-dialog-icon');
        if (iconEl) iconEl.innerHTML = `<img src="${info.icon}" style="width: 80px; height: 80px; object-fit: contain;">`;
        const nameEl = document.getElementById('replay-dialog-name');
        if (nameEl) nameEl.textContent = info.name;
        const ptsEl = document.getElementById('replay-dialog-pts');
        if (ptsEl) ptsEl.textContent = ptsStr;
        
        const dialogEl = document.getElementById('replay-dialog');
        if (dialogEl) dialogEl.classList.add('open');
        
        const playBtn = document.getElementById('replay-dialog-play-btn');
        if (playBtn) playBtn.style.display = 'none';

        return;
    }
    
    // [OLD - points system] state.score += data.points;
    // [OLD - points system] state.gamesCompleted[data.gameId] = data.points;
    state.score += 5;
    state.gamesCompleted[data.gameId] = 5;
    await saveToFirebase();
    // [OLD - points system] showToast(`Success! +${data.points} points added.`);
    showToast(`Success! +5 points added.`);
    updateHomeUI();
    updateGamesUI();
    updateProfilePage();
    switchTab("home");
  } catch (e) {
    showToast("Invalid QR code.");
  }
}

// ════════════════════════════════════════
// PHYSICAL CARD LINKING LOGIC
// ════════════════════════════════════════
let dialogStream = null;

window.openCardLinkDialog = function() {
  document.getElementById('card-link-step-scan').style.display = 'block';
  document.getElementById('card-link-step-success').style.display = 'none';
  document.getElementById('dialog-video-wrap').style.display = 'none';
  document.getElementById('btn-dialog-scan').style.display = 'block';
  
  document.getElementById('card-link-dialog').classList.add('open');
};

window.closeCardLinkDialog = function() {
  document.getElementById('card-link-dialog').classList.remove('open');
  window.stopDialogScanner();
};

window.startDialogScanner = async function() {
  const videoWrap = document.getElementById('dialog-video-wrap');
  const videoEl = document.getElementById('dialog-scan-video');
  const scanBtn = document.getElementById('btn-dialog-scan');
  
  videoWrap.style.display = 'block';
  scanBtn.style.display = 'none';

  try {
    dialogStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    videoEl.srcObject = dialogStream;
    videoEl.setAttribute("playsinline", true);
    await videoEl.play();
    requestAnimationFrame(tickDialogScan);
  } catch (err) {
    console.error("Camera access denied:", err);
    showToast("Please allow camera access to scan your card.");
  }
};

window.stopDialogScanner = function() {
  if (dialogStream) {
    dialogStream.getTracks().forEach(track => track.stop());
    dialogStream = null;
  }
};

function tickDialogScan() {
  if (!dialogStream) return; 
  
  const videoEl = document.getElementById('dialog-scan-video');
  if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Assuming jsQR is globally available from the HTML CDN
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    
    if (code && code.data) {
      handleSuccessfulCardLink(code.data.trim());
      return; 
    }
  }
  requestAnimationFrame(tickDialogScan);
}

async function handleSuccessfulCardLink(qrData) {
  window.stopDialogScanner();
  
  if (!state.uid) return;
  if (state.cardId) {
    showToast('Card already linked: ' + state.cardId);
    return;
  }

  // Extract just the ID value after '=' from a URL like:
  // https://www.sirkil.com/hpc.html?hid=HPC000501
  const cardId = extractCardId(qrData);

  try {
    const isFirstLink = !state.cardPointsClaimed;
    state.cardId = cardId;

    if (isFirstLink) {
      state.score += 10;
      state.cardPointsClaimed = true;
    }

    await saveToFirebase();
    
    // Update local UI
    if (isFirstLink) {
      showToast('🎉 Physical card linked! +10 Points earned!');
    } else {
      showToast('🎉 Physical card linked successfully!');
    }

    updateHomeUI();
    updateProfilePage();
    
    // Switch dialog state to success message
    document.getElementById('card-link-step-scan').style.display = 'none';
    document.getElementById('card-link-step-success').style.display = 'block';
  } catch(e) {
    console.error("Error saving card ID", e);
    showToast('Failed to link card. Please try again.');
  }
}

function extractCardId(raw) {
  // If it's a URL, extract the value after the last '='
  if (raw.includes('=')) {
    return raw.split('=').pop().trim();
  }
  return raw.trim();
}

window.finishCardLinking = function() {
  window.closeCardLinkDialog();
  
  // Remove the card banner from carousel
  const slideBannerCard = document.getElementById('slide-banner-card');
  const profileBannerCard = document.getElementById('profile-banner-card');
  const bannerDotsWrapper = document.getElementById('banner-carousel-dots');
  const bannerTrack = document.getElementById('banner-carousel-track');

  if (slideBannerCard) slideBannerCard.style.display = 'none';
  if (profileBannerCard) profileBannerCard.style.display = 'none';
  if (bannerTrack) bannerTrack.style.display = 'flex';
  if (bannerDotsWrapper) bannerDotsWrapper.style.display = 'flex';
  
  if (window.goToBannerSlide) window.goToBannerSlide(0);
  
  // Navigate back to home
  switchTab("home");
};

// ════════════════════════════════════════
// MISC & UTILS
// ════════════════════════════════════════

function updateBadgeStates() { badgeDefs.forEach((b) => { const chip = document.getElementById("badge-" + b.id); if (!chip) return; if (state.claimedBadges.includes(b.id)) chip.className = "badge-chip claimed"; else if (state.score >= b.pts) chip.className = "badge-chip claimable"; else chip.className = "badge-chip locked"; }); }

function checkBadgeUnlocks() { 
  const newlyUnlocked = badgeDefs.filter((b) => !state.claimedBadges.includes(b.id) && state.score >= b.pts); 
  if (newlyUnlocked.length === 0) return; 
  newlyUnlocked.forEach((b) => state.claimedBadges.push(b.id)); 
  updateBadgeStates(); 
  const b = newlyUnlocked[0]; 
  setTimeout(() => { 
    document.getElementById("badge-dialog-icon").innerHTML = `<img src="${b.image}" alt="Badge" style="width: 60px; height: 60px; object-fit: contain;">`;
    document.getElementById("badge-dialog-name").textContent = b.name; 
    document.getElementById("badge-dialog").classList.add("open"); 
    launchConfetti(4000); 
  }, 2200); 
  saveToFirebase(); 
}

window.tryClaimBadge = async function(id) { 
  const b = badgeDefs[id]; 
  if (state.claimedBadges.includes(id) || state.score < b.pts) return; 
  state.claimedBadges.push(id); 
  updateBadgeStates(); 
  document.getElementById("badge-dialog-icon").innerHTML = `<img src="${b.image}" alt="Badge" style="width: 60px; height: 60px; object-fit: contain;">`;
  document.getElementById("badge-dialog-name").textContent = b.name; 
  document.getElementById("badge-dialog").classList.add("open"); 
  launchConfetti(3000); 
  await saveToFirebase(); 
};

window.closeWelcomeDialog = function() { document.getElementById("welcome-dialog").classList.remove("open"); };
window.closeBadgeDialog = function() { document.getElementById("badge-dialog").classList.remove("open"); updateHomeUI(); if (document.getElementById("view-profile").classList.contains("active")) updateProfilePage(); };

let highlightIdx = 0; let highlightTimer = null;
window.goToSlide = function(idx) { 
  highlightIdx = idx; 
  const track = document.getElementById("carousel-track"); 
  if (!track || !track.parentElement) return; 
  track.style.transform = `translateX(-${idx * track.parentElement.clientWidth}px)`; 
  const dotsContainer = document.getElementById("highlights-dots-container");
  if (dotsContainer) {
    dotsContainer.querySelectorAll(".dot").forEach((d, i) => d.classList.toggle("active", i === idx)); 
  }
};

let bannerIdx = 0; let bannerTimer = null;
window.goToBannerSlide = function(idx) {
  bannerIdx = idx;
  const track = document.getElementById("banner-carousel-track");
  if (!track || !track.parentElement) return;
  track.style.transform = `translateX(-${idx * track.parentElement.clientWidth}px)`;
  const dotsContainer = document.getElementById("banner-carousel-dots");
  if (dotsContainer) {
    const dotsArray = Array.from(dotsContainer.querySelectorAll(".dot"));
    // Since some dots may be hidden, we toggle them directly by index within the array
    dotsArray.forEach((d, i) => d.classList.toggle("active", i === idx));
  }
};

function startCarousel() { 
  if (highlightTimer) clearInterval(highlightTimer); 
  highlightTimer = setInterval(() => { 
    const track = document.getElementById("carousel-track");
    if(track) {
      const slides = track.querySelectorAll(".carousel-slide");
      const total = slides.length; 
      if (total > 0) goToSlide((highlightIdx + 1) % total); 
    }
  }, 3500); 

  if (bannerTimer) clearInterval(bannerTimer);
  bannerTimer = setInterval(() => {
    const track = document.getElementById("banner-carousel-track");
    if(track) {
      const slides = Array.from(track.querySelectorAll(".carousel-slide"));
      const total = slides.length;
      if (total > 0) {
        let nextIdx = (bannerIdx + 1) % total;
        // Skip hidden slides
        while(slides[nextIdx].style.display === 'none') {
           nextIdx = (nextIdx + 1) % total;
           if(nextIdx === bannerIdx) break; // Avoid infinite loop if all hide/none are hidden
        }
        goToBannerSlide(nextIdx); 
      }
    }
  }, 3500);
}

function renderRewardsPage() { 
  const grid = document.getElementById("rewards-full-grid"); 
  const noteContainer = document.getElementById("rewards-note-container");
  const ptsEl = document.getElementById("rewards-pts-display"); 
  if (!grid) return; 
  if (ptsEl) ptsEl.textContent = state.score.toLocaleString() + " pts"; 
  
  grid.innerHTML = ""; 
  
  if (noteContainer) {
    noteContainer.innerHTML = `<div style="background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.4);border-radius:12px;padding:14px 16px;color:#fbbf24;font-size:0.88rem;font-weight:600;text-align:center;max-width:600px;margin:0 auto;">
      ⚠️ You can only redeem <strong>one reward</strong>. Choose your reward wisely.
    </div>`;
  }
  
  rewardsData.forEach((r) => { 
    const canRedeem = !state.redeemedReward && state.score >= r.pts; 
    const isLocked = !!state.redeemedReward && state.redeemedReward !== r.key;
    grid.innerHTML += `
      <div class="reward-card" style="position:relative;overflow:hidden;">
        ${isLocked ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.5);z-index:10;border-radius:inherit;display:flex;align-items:center;justify-content:center;"><img src="assets/Lock.png" alt="Locked" style="width:48px;height:48px;object-fit:contain;opacity:0.9;"></div>` : ''}
        <div class="reward-img" style="background: linear-gradient(135deg, #1a2820, #0d1a12); padding: 12px; height: 120px;">
          <img src="${r.image}" alt="${r.title}" style="width: 100%; height: 100%; object-fit: contain;">
        </div>
        <div class="reward-info">
          <div class="reward-title">${r.title}</div>
          <button class="redeem-btn" ${canRedeem ? "" : "disabled"} onclick="openRedeemQR('${r.key}','${r.title}',${r.pts})">
            ${r.pts} Pts — Redeem
          </button>
        </div>
      </div>`; 
  }); 
}
let qrTimerInterval = null; let redeemUnsubscribe = null; let redeemOpenedAt = 0;
window.openRedeemQR = function(key, title, pts) { redeemOpenedAt = Date.now(); document.getElementById('qr-dialog-title').textContent = 'Redeem: ' + title; const payload = JSON.stringify({ uid: state.uid, memberId: state.user?.memberId || '', name: state.user?.name || '', email: state.user?.email || '', phone: state.user?.phone || '', pharmacy: state.user?.pharmacy || '', reward: title, pts, key, ts: Date.now() }); const imgEl = document.getElementById('qr-dialog-img'); imgEl.style.opacity = '0.2'; imgEl.src = ''; setTimeout(() => { imgEl.onload = () => { imgEl.style.opacity = '1'; }; imgEl.onerror = () => { imgEl.style.opacity = '1'; }; imgEl.src = makeQRUrl(payload, 200) + '&t=' + Date.now(); }, 80); let secs = 60; document.getElementById('qr-timer').textContent = secs; if (qrTimerInterval) clearInterval(qrTimerInterval); qrTimerInterval = setInterval(() => { secs--; const el = document.getElementById('qr-timer'); if (el) el.textContent = secs; if (secs <= 0) { clearInterval(qrTimerInterval); closeQRDialog(); } }, 1000); document.getElementById('qr-dialog').classList.add('open'); stopRedeemListener(); if (window._fb?.onSnapshot && state.uid) { redeemUnsubscribe = window._fb.onSnapshot(window._fb.doc(window._fb.db, 'users', state.uid), snap => { if (!snap.exists()) return; const d = snap.data(); if (d.lastRedemptionAt && d.lastRedemptionAt > redeemOpenedAt) { stopRedeemListener(); showRedeemSuccess(d.lastRedemptionReward || title, d.lastRedemptionPts || pts, d.score ?? state.score, key); } }); } };
function stopRedeemListener() { if (redeemUnsubscribe) { redeemUnsubscribe(); redeemUnsubscribe = null; } }
window.closeQRDialog = function() { stopRedeemListener(); if (qrTimerInterval) clearInterval(qrTimerInterval); document.getElementById('qr-dialog').classList.remove('open'); };
function showRedeemSuccess(reward, pts, newScore, rewardKey) { closeQRDialog(); state.score = newScore; state.redeemedReward = rewardKey; updateHomeUI(); renderRewardsPage(); if (document.getElementById('view-profile')?.classList.contains('active')) updateProfilePage(); document.getElementById('redeem-success-reward').textContent = reward; document.getElementById('redeem-success-pts').textContent = '−' + pts + ' pts deducted · New balance: ' + newScore.toLocaleString() + ' pts'; document.getElementById('redeem-success-dialog').classList.add('open'); launchConfetti(3000); }
window.closeRedeemSuccessDialog = function() { document.getElementById('redeem-success-dialog').classList.remove('open'); };

function updateProfilePage() { 
  if (!state.user) return; 
  const tier = getTier(); 
  
  // Set member name on the card
  document.getElementById('card-name-back').textContent = state.user.name; 

// --- 100% RELIABLE LOCAL QR CODE GENERATION ---
  // 1. Get the phone number securely
  const userPhone = state.user?.phone || state.user?.whatsapp || '00000000000';
  const qrText = 'H' + userPhone;

  const qrContainer = document.querySelector('.cb-qr');
  
  if (qrContainer) {
    // 2. Completely empty the container to prevent ghost images from a previous account
    qrContainer.innerHTML = '';
    qrContainer.style.backgroundColor = '#ffffff';
    qrContainer.style.padding = '6px';
    
    // 3. Generate the QR code in an off-screen temporary div
    const tempDiv = document.createElement('div');
    new QRCode(tempDiv, {
        text: qrText,
        width: 150,
        height: 150,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.M
    });
    
    // 4. Force a slight delay to ensure qrcode.js finishes drawing the new data
    setTimeout(() => {
      const canvas = tempDiv.querySelector('canvas');
      if (canvas) {
        const img = document.createElement('img');
        img.src = canvas.toDataURL("image/png");
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        
        // Clear one more time just before appending to avoid double images
        qrContainer.innerHTML = '';
        qrContainer.appendChild(img);
      }
    }, 50);
  }
  // ----------------------------------

  // 1. Update Personal Info fields dynamically without assumptions
  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt || '—'; };
  if (state.user) {
    const parts = (state.user.name || '').trim().split(' ');
    const fName = state.user.firstName || (parts.length > 0 ? parts[0] : '');
    const lName = state.user.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : '');
    
    setTxt('info-fname', fName || '—'); 
    setTxt('info-lname', lName || '—'); 
    setTxt('info-email', state.user.email || '—'); 
    setTxt('info-phone', state.user.phone || state.user.whatsapp || '—'); 
    setTxt('info-pharmacy', state.user.pharmacy || '—'); 
    setTxt('info-city', state.user.city || '—'); 
    setTxt('info-profession', state.user.profession || '—'); 

    // Handle Card ID link fallback
    const cardIdEl = document.getElementById('info-card-id');
    if (cardIdEl) {
      if (state.cardId || state.user.cardId) {
        cardIdEl.textContent = state.cardId || state.user.cardId;
      } else {
        cardIdEl.innerHTML = '<a href="#" onclick="openCardLinkDialog(); return false;" style="color:var(--green); text-decoration:underline; font-weight:bold;">Link Card</a>';
      }
    }
  }

  // 2. Update My Points Accordion & Stepper
  setTxt('profile-pts-val', `${state.score.toLocaleString()} pts`);
  const tierInfo = getTierInfo(state.score);
  setTxt('profile-tier-name', tierInfo.name);
  setTxt('profile-monthly-pts', `${state.score.toLocaleString()} pts`);

  // Update Tier Cards and Giveaways UI
  updateTierProgressCards();
  renderGiveawaysUI();

  // 3. Render My Learning records dynamically
  renderMyLearningDynamic();

  // 4. Load Live Leaderboards dynamically
  loadDynamicLeaderboard();
}

function renderMyLearningDynamic() {
  const container = document.getElementById('my-learning-container');
  if (!container) return;

  const items = [];

  if (state.videoWatched) {
    items.push(`
      <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
        <span>Featured Video of the Week</span>
        <span style="color: var(--green); font-weight: 700;">Watched ✓ (+15 pts)</span>
      </div>
    `);
  }

  if (state.quizCompletedId || state.quizCompleted) {
    items.push(`
      <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
        <span>Quiz of the Week</span>
        <span style="color: var(--green); font-weight: 700;">Completed ✓</span>
      </div>
    `);
  }

  if (state.gamesCompleted) {
    Object.keys(state.gamesCompleted).forEach(gKey => {
      if (gKey === 'spin_last_played') return;
      const info = GAMES_INFO[gKey];
      const gName = info ? info.name : gKey;
      items.push(`
        <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
          <span>${gName}</span>
          <span style="color: var(--green); font-weight: 700;">Completed ✓</span>
        </div>
      `);
    });
  }

  if (items.length === 0) {
    container.innerHTML = '<div style="color: var(--muted); font-size: 0.88rem; text-align: center; padding: 16px 0;">No learning records yet</div>';
  } else {
    container.innerHTML = '<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">' + items.join('') + '</div>';
  }
}

async function loadDynamicLeaderboard() {
  const container = document.getElementById('leaderboard-list-container');
  if (!container) return;

  const meName = state.user?.name || (state.user?.firstName ? `${state.user.firstName} ${state.user.lastName || ''}`.trim() : 'You') || 'You';
  const meScore = state.score || 0;

  try {
    const { collection, query, orderBy, getDocs } = window._fb || {};
    let allUsers = [];

    if (collection && window._fb?.db) {
      const usersRef = collection(window._fb.db, 'users');
      const q = (typeof orderBy === 'function') ? query(usersRef, orderBy('score', 'desc')) : usersRef;
      const snap = await getDocs(q);

      if (!snap.empty) {
        snap.forEach((docSnap) => {
          const uData = docSnap.data();
          const name = uData.profile?.name || uData.name || uData.firstName || uData.email || 'Partner';
          const score = uData.score || uData.points || 0;
          allUsers.push({
            id: docSnap.id,
            name: name,
            score: score,
            isMe: (docSnap.id === state.uid)
          });
        });
      }
    }

    // Ensure logged in user is included
    let myIdx = allUsers.findIndex(u => u.isMe || u.id === state.uid || u.name === meName);
    if (myIdx === -1) {
      allUsers.push({ id: state.uid || 'me', name: meName, score: meScore, isMe: true });
    } else {
      allUsers[myIdx].isMe = true;
      allUsers[myIdx].score = meScore;
    }

    // Sort strictly by score descending
    allUsers.sort((a, b) => b.score - a.score);
    myIdx = allUsers.findIndex(u => u.isMe || u.id === state.uid || u.name === meName);

    // Pick range: 1 real user above (myIdx - 1), logged in user (myIdx), 1 real user below (myIdx + 1)
    let startIdx = Math.max(0, myIdx - 1);
    let endIdx = Math.min(allUsers.length - 1, myIdx + 1);

    if (myIdx === 0 && allUsers.length > 1) {
      endIdx = Math.min(allUsers.length - 1, 2);
    } else if (myIdx === allUsers.length - 1 && allUsers.length >= 3) {
      startIdx = Math.max(0, allUsers.length - 3);
    }

    let html = '';
    for (let i = startIdx; i <= endIdx; i++) {
      const u = allUsers[i];
      const rankNum = i + 1;
      const isMe = (i === myIdx) || u.isMe || (u.id === state.uid);

      html += `
        <div style="background: ${isMe ? 'var(--green-dim)' : 'var(--surface)'}; border: 1px solid ${isMe ? 'var(--green)' : 'var(--border)'}; border-radius: 10px; padding: 10px 14px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
          <span style="color: ${isMe ? '#fff' : 'var(--text)'}; font-weight: ${isMe ? '700' : '500'};">#${rankNum} ${u.name} ${isMe ? '(You)' : ''}</span>
          <strong style="color: ${isMe ? 'var(--green)' : 'var(--muted)'};">${u.score.toLocaleString()} pts</strong>
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (e) {
    console.warn("Leaderboard live fetch:", e);
    container.innerHTML = `
      <div style="background: var(--green-dim); border: 1px solid var(--green); border-radius: 10px; padding: 10px 14px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #fff; font-weight: 700;">#1 ${meName} (You)</span>
        <strong style="color: var(--green);">${meScore.toLocaleString()} pts</strong>
      </div>
    `;
  }
}

window.toggleAccordion = function(id) {
  const card = document.getElementById(id);
  if (card) {
    card.classList.toggle('open');
  }
};

window.flipCard = function() { document.getElementById("card-inner").classList.toggle("flipped"); };

window.registerEvent = function(url) {
  if (url && url !== '#') {
    window.open(url, '_blank');
  } else {
    showToast('Registration link will be available soon!');
  }
};

window.addToCalendar = function(title, details, location, startTimeStr, endTimeStr) {
  try {
    const start = new Date(startTimeStr);
    const end = new Date(endTimeStr);

    const formatDateStr = (d) => {
      return d.toISOString().replace(/-|:|\.\d+/g, '');
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Haleon Partners Club//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `SUMMARY:${title}`,
      `DESCRIPTION:${details}`,
      `LOCATION:${location}`,
      `DTSTART:${formatDateStr(start)}`,
      `DTEND:${formatDateStr(end)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('📅 Mobile Calendar event file created!');
  } catch (e) {
    console.error("Calendar add error:", e);
    showToast('Calendar event created!');
  }
};

function launchConfetti(duration) {
  const canvas = document.getElementById("confetti-canvas");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.style.display = "block";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const pieces = [];
  const colors = ["#4ade80", "#22c55e", "#f0f4f8", "#facc15", "#60a5fa", "#f472b6"];
  for (let i = 0; i < 100; i++) pieces.push({ x: Math.random() * canvas.width, y: -10 - Math.random() * 200, r: 4 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)], vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, rot: Math.random() * 360, rs: (Math.random() - 0.5) * 6 });
  const end = Date.now() + duration;
  (function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180); ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore();
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.rs;
    });
    if (Date.now() < end) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = "none"; }
  })();
}
window.showToast = function(msg) { const toast = document.getElementById("toast"); toast.textContent = msg; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2400); };

// ── PREVIOUS WEBINARS DATA & DEDICATED PLAYER SCREEN ──
let WEBINARS_DATA = [];

async function loadWebinarsJSON() {
  try {
    const res = await fetch('webinars.json');
    if (res.ok) {
      WEBINARS_DATA = await res.json();
    } else {
      console.warn("webinars.json not found");
      WEBINARS_DATA = [];
    }
  } catch (e) {
    console.warn("Error fetching webinars.json:", e);
    WEBINARS_DATA = [];
  }
  buildWebinarFilterChips();
  renderWebinars();
}

function buildWebinarFilterChips() {
  const container = document.getElementById('webinar-filter-chips');
  if (!container) return;

  const speakersSet = new Set();
  const brandsSet = new Set();

  WEBINARS_DATA.forEach(w => {
    (w.speakers || []).forEach(s => speakersSet.add(s));
    (w.brands || []).forEach(b => brandsSet.add(b));
  });

  let chipsHTML = `<div class="edu-chip active" onclick="setWebinarFilter('all', this)">All</div>`;

  speakersSet.forEach(s => {
    chipsHTML += `<div class="edu-chip" onclick="setWebinarFilter('speaker:${s}', this)">👨‍⚕️ ${s}</div>`;
  });

  brandsSet.forEach(b => {
    chipsHTML += `<div class="edu-chip" onclick="setWebinarFilter('brand:${b}', this)">🏷️ ${b}</div>`;
  });

  chipsHTML += `<div class="edu-chip" onclick="setWebinarFilter('cert:true', this)">🎓 Has Certificate</div>`;

  container.innerHTML = chipsHTML;
}

let currentWebinarFilter = 'all';

window.setWebinarFilter = function(filterVal, chipEl) {
  currentWebinarFilter = filterVal;
  const container = document.getElementById('webinar-filter-chips');
  if (container) {
    container.querySelectorAll('.edu-chip').forEach(c => c.classList.remove('active'));
  }
  if (chipEl) chipEl.classList.add('active');
  renderWebinars();
};

window.filterWebinars = function() {
  renderWebinars();
};

window.renderWebinars = function() {
  const container = document.getElementById('webinars-grid-container');
  if (!container) return;

  const query = (document.getElementById('webinar-search-input')?.value || '').toLowerCase().trim();

  const filtered = WEBINARS_DATA.filter(w => {
    let passTag = true;
    if (currentWebinarFilter !== 'all') {
      if (currentWebinarFilter.startsWith('speaker:')) {
        const sp = currentWebinarFilter.replace('speaker:', '');
        passTag = (w.speakers || []).includes(sp);
      } else if (currentWebinarFilter.startsWith('brand:')) {
        const br = currentWebinarFilter.replace('brand:', '');
        passTag = (w.brands || []).includes(br);
      } else if (currentWebinarFilter === 'cert:true') {
        passTag = (w.hasCertificate === true);
      }
    }

    let passSearch = true;
    if (query) {
      const matchTitle = (w.title || '').toLowerCase().includes(query);
      const matchSpeaker = (w.speakers || []).some(s => s.toLowerCase().includes(query));
      const matchBrand = (w.brands || []).some(b => b.toLowerCase().includes(query));
      const matchSpecialty = (w.specialties || []).some(sp => sp.toLowerCase().includes(query));
      passSearch = (matchTitle || matchSpeaker || matchBrand || matchSpecialty);
    }

    return passTag && passSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color: var(--muted); font-size: 0.95rem; text-align: center; grid-column: 1/-1; padding: 40px 16px; background: var(--surface2); border: 1px solid var(--border); border-radius: 16px; margin-top: 10px;">📭 No content available for now</div>';
    return;
  }

  container.innerHTML = filtered.map(w => {
    const speakersStr = (w.speakers || []).join(', ');
    const brandsBadges = (w.brands || []).map(b => `<span style="background: rgba(74, 222, 128, 0.12); color: var(--green); border: 1px solid rgba(74, 222, 128, 0.3); font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 12px;">${b}</span>`).join(' ');

    return `
      <div class="edu-item-card" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">${brandsBadges}</div>
            ${w.hasCertificate ? '<span style="background: rgba(96, 165, 250, 0.15); color: #60a5fa; border: 1px solid rgba(96, 165, 250, 0.3); font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 12px;">🎓 Certificate</span>' : ''}
          </div>
          <div class="edu-item-title" style="font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 6px; line-height: 1.3;">${w.title}</div>
          <div class="edu-item-meta" style="font-size: 0.8rem; color: var(--muted); display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;">
            <div>👨‍⚕️ <strong>Speakers:</strong> ${speakersStr}</div>
            ${w.duration ? `<div>⏱️ <strong>Duration:</strong> ${w.duration}</div>` : ''}
          </div>
        </div>
        <button class="btn-primary" style="padding: 10px; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="openWebinarPlayerScreen('${w.id}')">
          <span>▶</span> Watch Recorded Session
        </button>
      </div>
    `;
  }).join('');
};

function formatDriveUrl(url) {
  if (!url) return '';
  if (url.includes('drive.google.com')) {
    if (url.endsWith('/view')) return url.replace('/view', '/preview');
    if (url.includes('/view?')) return url.replace(/\/view\?/, '/preview?');
  }
  return url;
}

let activeWebinarDriveUrl = '';

window.openWebinarPlayerScreen = function(id) {
  const w = WEBINARS_DATA.find(item => item.id === id);
  if (!w) return;

  activeWebinarDriveUrl = formatDriveUrl(w.driveUrl);

  const titleEl = document.getElementById('player-screen-title');
  const iframeEl = document.getElementById('player-screen-iframe');
  const tagsEl = document.getElementById('player-screen-tags');
  const descEl = document.getElementById('player-screen-desc');

  if (titleEl) titleEl.textContent = w.title;
  if (iframeEl) iframeEl.src = activeWebinarDriveUrl;
  if (descEl) descEl.textContent = w.description || 'Recorded session video.';

  if (tagsEl) {
    let tagsHTML = '';
    (w.speakers || []).forEach(s => {
      tagsHTML += `<span style="background: var(--surface); color: #fff; border: 1px solid var(--border); font-size: 0.75rem; padding: 4px 10px; border-radius: 12px;">👨‍⚕️ ${s}</span>`;
    });
    (w.brands || []).forEach(b => {
      tagsHTML += `<span style="background: var(--surface); color: var(--green); border: 1px solid rgba(74,222,128,0.3); font-size: 0.75rem; padding: 4px 10px; border-radius: 12px;">🏷️ ${b}</span>`;
    });
    (w.specialties || []).forEach(sp => {
      tagsHTML += `<span style="background: var(--surface); color: var(--text); border: 1px solid var(--border); font-size: 0.75rem; padding: 4px 10px; border-radius: 12px;">🩺 ${sp}</span>`;
    });
    if (w.hasCertificate) {
      tagsHTML += `<span style="background: rgba(96, 165, 250, 0.2); color: #60a5fa; border: 1px solid #60a5fa; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 12px;">🎓 Certificate Included</span>`;
    }
    tagsEl.innerHTML = tagsHTML;
  }

  showView('view-webinar-player');
};

window.toggleVideoFullscreen = function() {
  const overlay = document.getElementById('webinar-landscape-overlay');
  const overlayIframe = document.getElementById('landscape-overlay-iframe');

  if (!overlay || !overlayIframe) return;

  if (overlay.style.display === 'none' || !overlay.style.display) {
    overlayIframe.src = activeWebinarDriveUrl;
    overlay.style.display = 'flex';

    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(() => {});
    } else if (overlay.webkitRequestFullscreen) {
      overlay.webkitRequestFullscreen();
    }

    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } else {
    closeLandscapeOverlay();
  }
};

window.closeLandscapeOverlay = function() {
  const overlay = document.getElementById('webinar-landscape-overlay');
  const overlayIframe = document.getElementById('landscape-overlay-iframe');
  if (overlayIframe) overlayIframe.src = '';
  if (overlay) overlay.style.display = 'none';

  if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }

  if (screen.orientation && screen.orientation.unlock) {
    screen.orientation.unlock();
  }
};

// ── EXPERT PRESENTATIONS DATA & DOWNLOADS ──
let PRESENTATIONS_DATA = [];

async function loadPresentationsJSON() {
  try {
    const res = await fetch('presentations.json');
    if (res.ok) {
      PRESENTATIONS_DATA = await res.json();
    } else {
      console.warn("presentations.json not found");
      PRESENTATIONS_DATA = [];
    }
  } catch (e) {
    console.warn("Error fetching presentations.json:", e);
    PRESENTATIONS_DATA = [];
  }
  renderPresentations();
}

window.renderPresentations = function() {
  const container = document.getElementById('presentations-grid-container');
  if (!container) return;

  const query = (document.getElementById('presentation-search-input')?.value || '').toLowerCase().trim();

  const filtered = PRESENTATIONS_DATA.filter(p => {
    if (!query) return true;
    return (p.title || '').toLowerCase().includes(query) || (p.fileType || '').toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color: var(--muted); font-size: 0.95rem; text-align: center; grid-column: 1/-1; padding: 40px 16px; background: var(--surface2); border: 1px solid var(--border); border-radius: 16px; margin-top: 10px;">📭 No content available for now</div>';
    return;
  }

  container.innerHTML = filtered.map(p => `
    <div class="edu-item-card" style="display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
          <span style="font-size: 1.4rem;">${p.icon || '📄'}</span>
          <span style="background: rgba(74, 222, 128, 0.12); color: var(--green); border: 1px solid rgba(74, 222, 128, 0.3); font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 12px;">${p.fileType}</span>
        </div>
        <div class="edu-item-title" style="font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 6px; line-height: 1.3;">${p.title}</div>
        <div class="edu-item-meta" style="font-size: 0.8rem; color: var(--muted); margin-bottom: 12px;">
          📦 <strong>File Size:</strong> ${p.fileSize}
        </div>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 8px;">
        <button class="btn-primary" style="flex: 1; padding: 10px; font-size: 0.82rem; display: flex; align-items: center; justify-content: center; gap: 5px;" onclick="openDocumentViewerModal('${p.id}')">
          <span>📄</span> View
        </button>
        <a href="${p.fileUrl}" download="${p.title}" class="btn-secondary" style="flex: 1; padding: 10px; font-size: 0.82rem; display: flex; align-items: center; justify-content: center; gap: 5px; text-decoration: none;" onclick="showToast('Downloading presentation...')">
          <span>📥</span> Download
        </a>
      </div>
    </div>
  `).join('');
};

window.openDocumentViewerModal = function(id) {
  const p = PRESENTATIONS_DATA.find(item => item.id === id);
  if (!p) return;

  const modal = document.getElementById('document-viewer-modal');
  const titleEl = document.getElementById('doc-viewer-title');
  const iframeEl = document.getElementById('doc-viewer-iframe');
  const downloadBtn = document.getElementById('doc-viewer-download-btn');

  if (titleEl) titleEl.textContent = p.title;
  if (iframeEl) iframeEl.src = p.fileUrl;
  if (downloadBtn) {
    downloadBtn.href = p.fileUrl;
    downloadBtn.download = p.title;
  }

  if (modal) modal.style.display = 'flex';
};

window.closeDocumentViewerModal = function() {
  const modal = document.getElementById('document-viewer-modal');
  const iframeEl = document.getElementById('doc-viewer-iframe');
  if (iframeEl) iframeEl.src = '';
  if (modal) modal.style.display = 'none';
};

// ── PRODUCT KNOWLEDGE CENTER DATA & VIDEOS ──
let KNOWLEDGE_CENTER_DATA = {};

async function loadKnowledgeCenterJSON() {
  try {
    const res = await fetch('knowledge_center.json');
    if (res.ok) {
      KNOWLEDGE_CENTER_DATA = await res.json();
    } else {
      console.warn("knowledge_center.json not found");
    }
  } catch (e) {
    console.warn("Error fetching knowledge_center.json:", e);
  }
}

let activeBrandKey = '';

window.openBrandVideosScreen = function(brandKey) {
  activeBrandKey = brandKey;
  const brandObj = KNOWLEDGE_CENTER_DATA[brandKey];

  const titleEl = document.getElementById('brand-videos-top-title');
  const subEl = document.getElementById('brand-videos-sub');

  if (titleEl) titleEl.textContent = `${brandObj ? brandObj.brandName : brandKey} Videos 🎬`;
  if (subEl) subEl.textContent = brandObj ? brandObj.description : 'Explore brand educational & promotional videos';

  renderBrandVideos(brandKey);
  showView('view-brand-videos');
};

// ── KNOWLEDGE CAPSULES DATA & LOADER ──
let CAPSULES_DATA = [];

async function loadCapsulesJSON() {
  try {
    const res = await fetch('capsules.json');
    if (res.ok) {
      CAPSULES_DATA = await res.json();
    } else {
      CAPSULES_DATA = [];
    }
  } catch (e) {
    CAPSULES_DATA = [];
  }
  renderCapsules();
}

window.renderCapsules = function() {
  const container = document.getElementById('capsules-grid-container');
  if (!container) return;

  if (!CAPSULES_DATA || CAPSULES_DATA.length === 0) {
    container.innerHTML = '<div style="color: var(--muted); font-size: 0.95rem; text-align: center; grid-column: 1/-1; padding: 40px 16px; background: var(--surface2); border: 1px solid var(--border); border-radius: 16px; margin-top: 10px;">📭 No content available for now</div>';
    return;
  }

  container.innerHTML = CAPSULES_DATA.map(c => `
    <div class="edu-item-card">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
        <div class="edu-item-title">${c.title}</div>
        <span style="background: rgba(74, 222, 128, 0.15); color: var(--green); border: 1px solid rgba(74, 222, 128, 0.3); font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 12px; flex-shrink: 0;">+${c.pts || 15} pts</span>
      </div>
      <div class="edu-item-meta">${c.duration || '3 min'} video • ${c.category || 'Clinical Overview'}</div>
      <button class="btn-secondary" style="padding: 8px; margin-top: 10px;" onclick="playBrandVideo('${c.url}', '${c.title.replace(/'/g, "\\'")}', null, ${c.pts || 15}, '${c.id || c.title}')">▶ Play Capsule</button>
    </div>
  `).join('');
};

window.renderBrandVideos = function(brandKey) {
  const container = document.getElementById('brand-videos-grid-container');
  if (!container) return;

  const brandObj = KNOWLEDGE_CENTER_DATA[brandKey];
  const videos = brandObj ? brandObj.videos : [];

  if (!videos || videos.length === 0) {
    container.innerHTML = '<div style="color: var(--muted); font-size: 0.95rem; text-align: center; grid-column: 1/-1; padding: 40px 16px; background: var(--surface2); border: 1px solid var(--border); border-radius: 16px; margin-top: 10px;">📭 No content available for now</div>';
    return;
  }

  container.innerHTML = videos.map(v => `
    <div class="brand-video-card" onclick="playBrandVideo('${v.url}', '${v.title.replace(/'/g, "\\'")}', null, ${v.pts || 10}, '${v.id || v.title}')">
      <div class="brand-video-thumb-box">
        <video src="${v.url}#t=1" preload="metadata" muted playsinline></video>
        <div class="brand-video-play-badge">▶</div>
      </div>
      <div class="brand-video-info">
        <div class="brand-video-title">${v.title}</div>
        <div style="font-size: 0.72rem; color: var(--muted); display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--green); font-weight: 700;">+${v.pts || 10} pts</span>
          ${v.duration ? `<span style="background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 6px;">${v.duration}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
};

window.updateMysteryShopperProgress = function() {
  const watched = state.mysteryShopperWatched || { v1: false, v2: false };
  const count = (watched.v1 ? 1 : 0) + (watched.v2 ? 1 : 0);
  const btn = document.getElementById('mystery-shopper-question-btn');
  const completedCard = document.getElementById('mystery-shopper-completed-card');
  const compImg = document.getElementById('mystery-completed-reward-img');
  const compTitle = document.getElementById('mystery-completed-reward-title');

  if (state.mysteryShopperCompleted && state.mysteryShopperReward) {
    if (btn) {
      btn.disabled = true;
      btn.className = 'mystery-question-btn unlocked';
      btn.style.animation = 'none';
      btn.style.opacity = '0.85';
      btn.innerHTML = `✅ Challenge Completed! (${count}/2)`;
    }
    if (completedCard) {
      completedCard.style.display = 'block';
      if (compImg) compImg.src = state.mysteryShopperReward.image;
      if (compTitle) compTitle.textContent = state.mysteryShopperReward.name;
    }
  } else {
    if (completedCard) completedCard.style.display = 'none';
    if (!btn) return;
    if (count < 2) {
      btn.disabled = true;
      btn.className = 'mystery-question-btn disabled';
      btn.innerHTML = `🔒 Watch Videos (${count}/2)`;
    } else {
      btn.disabled = false;
      btn.className = 'mystery-question-btn unlocked';
      btn.innerHTML = `✨ Answer Question & Spin Wheel (2/2)`;
    }
  }
};

window.playBrandVideo = function(videoUrl, videoTitle, mysteryId, pts = 10, videoId = null, startAtTime = 0) {
  const modal = document.getElementById('brand-video-player-modal');
  const titleEl = document.getElementById('brand-video-modal-title');
  const videoEl = document.getElementById('brand-video-element');

  if (titleEl) titleEl.textContent = videoTitle || 'Brand Video';
  if (videoEl) {
    videoEl.src = videoUrl;
    const vId = videoId || videoTitle || 'v_' + Date.now();

    if (startAtTime && startAtTime > 0) {
      videoEl.currentTime = startAtTime;
    }

    videoEl.ontimeupdate = function() {
      if (videoEl.currentTime > 2 && (videoEl.duration ? (videoEl.duration - videoEl.currentTime > 3) : true)) {
        window.saveVideoProgress(videoUrl, videoTitle, videoEl.currentTime, mysteryId, pts, vId, false);
      }
    };

    videoEl.onended = function() {
      window.clearVideoProgress();
      if (typeof claimVideoPoints === 'function') {
        claimVideoPoints(pts, vId, videoTitle);
      }
    };
    videoEl.play().catch(() => {});
  }

  if (mysteryId) {
    if (!state.mysteryShopperWatched) state.mysteryShopperWatched = { v1: false, v2: false };
    state.mysteryShopperWatched[mysteryId] = true;
    try {
      localStorage.setItem('mysteryShopperWatched', JSON.stringify(state.mysteryShopperWatched));
    } catch(e) {}
    window.updateMysteryShopperProgress();
  }

  if (modal) modal.style.display = 'flex';
};

window.closeBrandVideoPlayerModal = function() {
  const modal = document.getElementById('brand-video-player-modal');
  const videoEl = document.getElementById('brand-video-element');
  if (videoEl) {
    videoEl.pause();
    videoEl.src = '';
  }
  if (modal) modal.style.display = 'none';
};

window.openMysteryShopperView = function() {
  if (typeof updateMysteryShopperProgress === 'function') {
    updateMysteryShopperProgress();
  }
  showView('view-mystery');
};

window.toggleMysteryShopperVideos = function() {
  const container = document.getElementById('mystery-shopper-videos-container');
  const arrow = document.getElementById('mystery-arrow-icon');
  if (!container) return;

  if (container.style.display === 'none' || !container.style.display) {
    container.style.display = 'block';
    if (arrow) arrow.style.transform = 'rotate(90deg)';
  } else {
    container.style.display = 'none';
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  }
};

let selectedMysteryOptionIndex = null;

window.openMysteryShopperQuestionModal = function() {
  const watched = state.mysteryShopperWatched || { v1: false, v2: false };
  const count = (watched.v1 ? 1 : 0) + (watched.v2 ? 1 : 0);
  if (count < 2) {
    if (typeof showToast === 'function') showToast('Please watch both videos to unlock the question!');
    return;
  }
  selectedMysteryOptionIndex = null;
  const options = document.querySelectorAll('.mystery-option-btn');
  options.forEach(opt => opt.classList.remove('selected'));
  const submitBtn = document.getElementById('mystery-submit-btn');
  if (submitBtn) {
    submitBtn.style.opacity = '0.5';
    submitBtn.style.pointerEvents = 'none';
  }
  const modal = document.getElementById('mystery-shopper-question-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeMysteryShopperQuestionModal = function() {
  const modal = document.getElementById('mystery-shopper-question-modal');
  if (modal) modal.style.display = 'none';
};

window.selectMysteryOption = function(idx) {
  selectedMysteryOptionIndex = idx;
  const options = document.querySelectorAll('.mystery-option-btn');
  options.forEach((opt, index) => {
    if (index === idx) {
      opt.classList.add('selected');
    } else {
      opt.classList.remove('selected');
    }
  });
  const submitBtn = document.getElementById('mystery-submit-btn');
  if (submitBtn) {
    submitBtn.style.opacity = '1';
    submitBtn.style.pointerEvents = 'auto';
  }
};

// ── MYSTERY SHOPPER GIVEAWAY WHEEL LOGIC ──
const mysteryGiveaways = [
  { id: 'wireless_charger', name: 'Wireless Charger', image: 'assets/Mystery Shopper/Wireless_Charger.png', color: '#1e1b4b' },
  { id: 'power_bank', name: 'Power Bank', image: 'assets/Mystery Shopper/Power_Bank.png', color: '#0f172a' },
  { id: 'kettle', name: 'Kettle', image: 'assets/Mystery Shopper/Kettle.png', color: '#312e81' },
  { id: 'desk_organizer', name: 'Desk Organizer', image: 'assets/Mystery Shopper/Desk_Organizer.png', color: '#1e293b' },
  { id: 'desk_fan', name: 'Desk Fan', image: 'assets/Mystery Shopper/Disk_Fan.png', color: '#312e81' },
  { id: 'coffee_maker', name: 'Coffee Maker', image: 'assets/Mystery Shopper/Coffee_Maker.png', color: '#0f172a' }
];

let mysteryWheelSpinning = false;
let currentWonGiveaway = null;
const loadedGiveawayImages = {};

function preloadGiveawayImages(callback) {
  let loadedCount = 0;
  mysteryGiveaways.forEach(item => {
    if (loadedGiveawayImages[item.id] && loadedGiveawayImages[item.id].complete) {
      loadedCount++;
      if (loadedCount === mysteryGiveaways.length && callback) callback();
      return;
    }
    const img = new Image();
    img.src = item.image;
    img.onload = () => {
      loadedGiveawayImages[item.id] = img;
      loadedCount++;
      if (typeof window.drawMysteryWheel === 'function') window.drawMysteryWheel();
      if (loadedCount === mysteryGiveaways.length && callback) callback();
    };
    img.onerror = () => {
      loadedCount++;
      if (loadedCount === mysteryGiveaways.length && callback) callback();
    };
  });
}

window.drawMysteryWheel = function() {
  const canvas = document.getElementById('mystery-wheel');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const center = canvas.width / 2;
  const radius = center;
  const numSlices = mysteryGiveaways.length;
  const arc = (2 * Math.PI) / numSlices;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < numSlices; i++) {
    const item = mysteryGiveaways[i];
    const angle = i * arc - (Math.PI / 2);

    // Slice background
    ctx.beginPath();
    ctx.fillStyle = item.color;
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, angle, angle + arc, false);
    ctx.fill();

    // Slice border
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.4)';
    ctx.moveTo(center, center);
    ctx.lineTo(center + Math.cos(angle) * radius, center + Math.sin(angle) * radius);
    ctx.stroke();

    // Context rotation for content
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(angle + arc / 2);

    // Draw Image (Large, text removed)
    const imgObj = loadedGiveawayImages[item.id];
    if (imgObj && imgObj.complete && imgObj.naturalWidth !== 0) {
      const maxImgSize = 115;
      let w = imgObj.naturalWidth || maxImgSize;
      let h = imgObj.naturalHeight || maxImgSize;
      const scale = Math.min(maxImgSize / w, maxImgSize / h);
      w = w * scale;
      h = h * scale;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 10;
      ctx.drawImage(imgObj, radius * 0.58 - (w / 2), -h / 2, w, h);
    }

    ctx.restore();
  }

  // Outer glowing ring
  ctx.beginPath();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#818cf8';
  ctx.arc(center, center, radius - 3, 0, 2 * Math.PI);
  ctx.stroke();
};

window.openMysteryShopperWheelModal = function() {
  preloadGiveawayImages();
  const canvas = document.getElementById('mystery-wheel');
  if (canvas) {
    canvas.style.transition = 'none';
    canvas.style.transform = 'rotate(0deg)';
  }
  mysteryWheelSpinning = false;
  const btn = document.getElementById('mystery-spin-btn');
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
  window.drawMysteryWheel();
  const modal = document.getElementById('mystery-shopper-wheel-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeMysteryShopperWheelModal = function() {
  const modal = document.getElementById('mystery-shopper-wheel-modal');
  if (modal) modal.style.display = 'none';
};

function playMysteryWinSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime);
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
    osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch(e) {}
}

window.spinMysteryWheel = function() {
  if (mysteryWheelSpinning) return;
  mysteryWheelSpinning = true;

  const btn = document.getElementById('mystery-spin-btn');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  }

  const numSlices = mysteryGiveaways.length;
  const winIdx = Math.floor(Math.random() * numSlices);
  currentWonGiveaway = mysteryGiveaways[winIdx];

  const sliceAngle = 360 / numSlices;
  const randomOffset = Math.floor(Math.random() * 32) - 16;
  const totalSpins = 5;
  const targetRotation = (360 * totalSpins) - (winIdx * sliceAngle + sliceAngle / 2) + randomOffset;

  const canvas = document.getElementById('mystery-wheel');
  if (canvas) {
    canvas.style.transition = 'transform 4.5s cubic-bezier(0.15, 0.85, 0.15, 1)';
    canvas.style.transform = `rotate(${targetRotation}deg)`;
  }

  setTimeout(() => {
    window.handleMysteryWheelResult(currentWonGiveaway);
  }, 4600);
};

window.handleMysteryWheelResult = function(item) {
  mysteryWheelSpinning = false;
  window.closeMysteryShopperWheelModal();

  playMysteryWinSound();
  if (typeof launchConfetti === 'function') launchConfetti(3000);

  const rewardImg = document.getElementById('mystery-reward-img');
  const rewardTitle = document.getElementById('mystery-reward-title');
  if (rewardImg) rewardImg.src = item.image;
  if (rewardTitle) rewardTitle.textContent = item.name;

  const rewardModal = document.getElementById('mystery-shopper-reward-modal');
  if (rewardModal) rewardModal.style.display = 'flex';
};

window.completeMysteryShopperChallenge = function() {
  const rewardModal = document.getElementById('mystery-shopper-reward-modal');
  if (rewardModal) rewardModal.style.display = 'none';

  if (currentWonGiveaway) {
    state.mysteryShopperCompleted = true;
    state.mysteryShopperReward = currentWonGiveaway;
    try {
      localStorage.setItem('mysteryShopperCompleted', 'true');
      localStorage.setItem('mysteryShopperReward', JSON.stringify(currentWonGiveaway));
    } catch(e) {}
  }

  window.updateMysteryShopperProgress();

  if (typeof showToast === 'function') {
    showToast('🎉 Challenge completed! Reward collected.');
  }
};

window.submitMysteryShopperQuestion = function() {
  if (selectedMysteryOptionIndex === null) return;
  
  if (typeof showToast === 'function') {
    showToast('🎉 Question answered! Opening Giveaway Wheel...');
  }
  closeMysteryShopperQuestionModal();

  setTimeout(() => {
    window.openMysteryShopperWheelModal();
  }, 400);
};

// ── VIDEO PLAYBACK PROGRESS & CONTINUE WATCHING TRACKING ──
function formatTimeSeconds(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

window.saveVideoProgress = function(url, title, currentTime, mysteryId = null, pts = 10, videoId = null, isFeatured = false) {
  if (!currentTime || currentTime < 2) return;
  const progressData = {
    url: url || '',
    title: title || 'Video',
    currentTime: Math.floor(currentTime),
    mysteryId: mysteryId || null,
    pts: pts || 10,
    videoId: videoId || null,
    isFeatured: !!isFeatured,
    timestamp: Date.now()
  };
  try {
    localStorage.setItem('lastWatchedVideo', JSON.stringify(progressData));
  } catch(e) {}
  window.updateContinueWatchingUI();
};

window.clearVideoProgress = function() {
  try {
    localStorage.removeItem('lastWatchedVideo');
  } catch(e) {}
  window.updateContinueWatchingUI();
};

window.updateContinueWatchingUI = function() {
  const container = document.getElementById('continue-watching-section');
  const titleEl = document.getElementById('continue-video-title');
  const timeEl = document.getElementById('continue-video-time');
  if (!container) return;

  let saved = null;
  try {
    const raw = localStorage.getItem('lastWatchedVideo');
    if (raw) saved = JSON.parse(raw);
  } catch(e) {}

  if (saved && saved.title && saved.currentTime > 2) {
    container.style.display = 'block';
    if (titleEl) titleEl.textContent = saved.title;
    if (timeEl) timeEl.textContent = `Resume at ${formatTimeSeconds(saved.currentTime)}`;
  } else {
    container.style.display = 'none';
  }
};

window.resumeLastVideo = function() {
  let saved = null;
  try {
    const raw = localStorage.getItem('lastWatchedVideo');
    if (raw) saved = JSON.parse(raw);
  } catch(e) {}

  if (!saved) return;

  if (saved.isFeatured) {
    showView('view-home');
    const featuredVid = document.getElementById('featured-video-player');
    if (featuredVid) {
      featuredVid.currentTime = saved.currentTime;
      featuredVid.play().catch(() => {});
      featuredVid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else {
    if (saved.mysteryId) {
      showView('view-mystery');
    }
    window.playBrandVideo(saved.url, saved.title, saved.mysteryId, saved.pts, saved.videoId, saved.currentTime);
  }
};

function initFeaturedVideoTracking() {
  const vid = document.getElementById('featured-video-player');
  if (!vid) return;
  vid.ontimeupdate = function() {
    if (vid.currentTime > 2 && (vid.duration ? (vid.duration - vid.currentTime > 3) : true)) {
      window.saveVideoProgress('assets/Haleon Mobile App_Hz.mp4', 'About The Program', vid.currentTime, null, 15, 'featured', true);
    }
  };
  vid.onended = function() {
    window.clearVideoProgress();
    if (typeof claimVideoPoints === 'function') claimVideoPoints(15, 'featured', 'About The Program');
  };
}

window.addEventListener("DOMContentLoaded", () => {
  startCarousel();
  loadWebinarsJSON();
  loadPresentationsJSON();
  loadKnowledgeCenterJSON();
  loadCapsulesJSON();
  window.updateMysteryShopperProgress();
  window.updateContinueWatchingUI();
  initFeaturedVideoTracking();
  const lbl = document.querySelector('.progress-label');
  if(lbl) lbl.textContent = "Games Completed";
});