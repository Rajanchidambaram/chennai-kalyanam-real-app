const state = {
  mobile: localStorage.getItem("ck_mobile") || "",
  adminToken: localStorage.getItem("ck_admin_token") || "",
  contactAccess: false,
  profiles: [],
  account: null,
  activeProfileId: "",
  compareIds: []
};

const $ = (selector) => document.querySelector(selector);

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .replace(".", "")
    .slice(0, 2)
    .toUpperCase();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function photoMarkup(profile, className = "profile-photo") {
  const name = escapeHtml(profile.name);
  const fallback = `<div class="avatar">${initials(profile.name)}</div>`;
  if (!profile.photoUrl) return `<div class="${className} no-photo">${fallback}</div>`;
  return `
    <div class="${className}">
      <img src="${escapeHtml(profile.photoUrl)}" alt="${name} profile photo" loading="lazy" onerror="this.hidden = true; this.nextElementSibling.hidden = false; this.parentElement.classList.add('no-photo');">
      <div class="avatar" hidden>${initials(profile.name)}</div>
    </div>
  `;
}

async function api(path, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  if (options.admin && state.adminToken) {
    headers.authorization = `Bearer ${state.adminToken}`;
  }
  const response = await fetch(path, {
    headers,
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formJson(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function syncMemberBar() {
  $("#viewerMobile").value = state.mobile;
  $("#memberMobile").textContent = state.mobile || "Not verified";
  $("#memberAccess").textContent = state.contactAccess ? "Contact access active" : "Contact access locked";
}

function savedProfileIds() {
  return new Set((state.account?.shortlists || []).map((item) => item.profileId));
}

function profileSummary(profile) {
  if (!profile) return "";
  const salary = profile.salaryRange || profile.income || "Salary not disclosed";
  const company = profile.companyName ? ` / ${profile.companyName}` : "";
  return `${profile.location} / ${profile.job}${company} / ${salary}`;
}

function occupationSummary(profile) {
  const company = profile.companyName ? `, ${profile.companyName}` : "";
  return `${profile.job || "Not added"}${company}`;
}

function salarySummary(profile) {
  return profile.salaryRange || profile.income || "Salary not disclosed";
}

function shortEducation(value) {
  return value === "Engineering" ? "Engg" : value;
}

function salaryRank(profile) {
  const salary = salarySummary(profile);
  const ranks = {
    "Not disclosed": 0,
    "Below Rs. 5 LPA": 1,
    "Rs. 5-10 LPA": 2,
    "Rs. 10-20 LPA": 3,
    "Rs. 20-50 LPA": 4,
    "Rs. 50 LPA+": 5
  };
  return ranks[salary] ?? 0;
}

function sortProfiles(profiles) {
  const sortBy = $("#sortFilter").value;
  return [...profiles].sort((first, second) => {
    if (sortBy === "salaryHigh") return salaryRank(second) - salaryRank(first);
    if (sortBy === "salaryLow") return salaryRank(first) - salaryRank(second);
    if (sortBy === "ageLow") return Number(first.age) - Number(second.age);
    if (sortBy === "ageHigh") return Number(second.age) - Number(first.age);
    return 0;
  });
}

function updateCompareStatus() {
  const count = state.compareIds.length;
  $("#compareStatus").textContent = count === 2
    ? "2 profiles selected. Ready to compare."
    : `${count} selected. Select 2 profiles to compare.`;
}

function syncCompareSelection() {
  document.querySelectorAll("[data-compare-profile]").forEach((input) => {
    input.checked = state.compareIds.includes(input.dataset.compareProfile);
  });
  updateCompareStatus();
}

function comparisonCell(value, isDifferent) {
  return isDifferent ? `<strong>${value}</strong>` : `<span>${value}</span>`;
}

function renderComparePanel() {
  const selected = state.compareIds
    .map((id) => state.profiles.find((profile) => profile.id === id))
    .filter(Boolean);

  if (selected.length !== 2) {
    $("#comparePanel").hidden = true;
    showToast("Select exactly 2 profiles to compare");
    return;
  }

  const [first, second] = selected;
  const rows = [
    ["Age", `${first.age} yrs`, `${second.age} yrs`],
    ["Occupation", occupationSummary(first), occupationSummary(second)],
    ["Salary", salarySummary(first), salarySummary(second)]
  ];

  $("#comparePanel").innerHTML = `
    <div class="compare-head">
      <h3>Profile comparison</h3>
      <p>${first.name} vs ${second.name}</p>
    </div>
    <div class="compare-grid">
      <span></span>
      <strong>${first.name}</strong>
      <strong>${second.name}</strong>
      ${rows
        .map(([label, firstValue, secondValue]) => {
          const different = firstValue !== secondValue;
          return `
            <span>${label}</span>
            ${comparisonCell(firstValue, different)}
            ${comparisonCell(secondValue, different)}
          `;
        })
        .join("")}
    </div>
  `;
  $("#comparePanel").hidden = false;
}

function setFormValue(form, name, value) {
  const field = form.elements[name];
  if (!field) return;
  field.value = value ?? "";
}

function populateProfileForm(form, profile) {
  [
    "name",
    "profileFor",
    "gender",
    "age",
    "location",
    "education",
    "job",
    "companyName",
    "income",
    "salaryRange",
    "height",
    "photoUrl",
    "fitness",
    "diet",
    "smoking",
    "drinking",
    "horoscope",
    "family",
    "about",
    "preference"
  ].forEach((field) => setFormValue(form, field, profile?.[field]));
}

function setSelectValue(selector, value) {
  const select = $(selector);
  if ([...select.options].some((option) => option.value === value)) {
    select.value = value;
  }
}

async function copyText(text, label = "Copied") {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement("input");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  showToast(`${label}: ${text}`);
}

function matchGenderForCurrentMember() {
  const gender = state.account?.profile?.gender;
  if (gender === "Bride") return "Groom";
  if (gender === "Groom") return "Bride";
  return "all";
}

function lifestyleBadges(profile) {
  const badges = [];
  if (String(profile.smoking || "").toLowerCase() === "no") {
    badges.push(`
      <span class="lifestyle-badge" aria-label="Non-smoker" title="Non-smoker">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 14h11v4H3z"></path>
          <path d="M17 14h2v4h-2z"></path>
          <path d="M21 14h1v4h-1z"></path>
          <path d="M4 4l16 16"></path>
        </svg>
        <span>Non-smoker</span>
      </span>
    `);
  }
  if (String(profile.drinking || "").toLowerCase() === "no") {
    badges.push(`
      <span class="lifestyle-badge" aria-label="Non-alcoholic" title="Non-alcoholic">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 3h4"></path>
          <path d="M11 3v4l-2 3v10h6V10l-2-3V3"></path>
          <path d="M4 4l16 16"></path>
        </svg>
        <span>Non-alcoholic</span>
      </span>
    `);
  }
  return badges.join("");
}

function parseAiSearch(text) {
  const query = text.toLowerCase();
  const understood = [];

  if (query.includes("bride")) {
    understood.push("bride/groom matching is automatic after login");
  }
  if (query.includes("groom")) {
    understood.push("bride/groom matching is automatic after login");
  }

  if (query.includes("velachery")) {
    $("#locationFilter").value = "Velachery";
    understood.push("Velachery");
  } else if (query.includes("anna nagar")) {
    $("#locationFilter").value = "Anna Nagar";
    understood.push("Anna Nagar");
  } else if (query.includes("tambaram")) {
    $("#locationFilter").value = "Tambaram";
    understood.push("Tambaram");
  } else if (query.includes("t. nagar") || query.includes("tnagar")) {
    $("#locationFilter").value = "T. Nagar";
    understood.push("T. Nagar");
  }

  if (query.includes("doctor") || query.includes("medicine")) {
    $("#educationFilter").value = "Medicine";
    $("#jobFilter").value = "Doctor";
    understood.push("Doctor/Medicine");
  } else if (query.includes("mba")) {
    $("#educationFilter").value = "MBA";
    understood.push("MBA");
  } else if (query.includes("engineer") || query.includes("it") || query.includes("software")) {
    $("#educationFilter").value = "Engineering";
    $("#jobFilter").value = query.includes("software") || query.includes("it") ? "Software" : "Engineer";
    understood.push("Engineering/IT");
  } else if (query.includes("business")) {
    $("#jobFilter").value = "Business";
    understood.push("Business");
  }

  if (query.includes("below 28") || query.includes("under 28")) {
    $("#ageFilter").value = "21-26";
    understood.push("younger age range");
  } else if (query.includes("below 30") || query.includes("under 30")) {
    $("#ageFilter").value = "27-32";
    understood.push("around below 30");
  }

  if (query.includes("50 lpa")) {
    setSelectValue("#salaryFilter", "Rs. 50 LPA+");
    understood.push("Rs. 50 LPA+");
  } else if (query.includes("20") || query.includes("15") || query.includes("10-20") || query.includes("10 lpa")) {
    setSelectValue("#salaryFilter", "Rs. 10-20 LPA");
    understood.push("Rs. 10-20 LPA");
  } else if (query.includes("5-10") || query.includes("8 lpa") || query.includes("5 lpa")) {
    setSelectValue("#salaryFilter", "Rs. 5-10 LPA");
    understood.push("Rs. 5-10 LPA");
  }

  if (query.includes("athletic")) {
    setSelectValue("#fitnessFilter", "Athletic");
    understood.push("Athletic");
  } else if (query.includes("regular fitness") || query.includes("gym")) {
    setSelectValue("#fitnessFilter", "Regular fitness");
    understood.push("Regular fitness");
  } else if (query.includes("health")) {
    setSelectValue("#fitnessFilter", "Health-focused");
    understood.push("Health-focused");
  } else if (query.includes("fit") || query.includes("active")) {
    setSelectValue("#fitnessFilter", "Active lifestyle");
    understood.push("Active lifestyle");
  }

  if (query.includes("non-smoker") || query.includes("no smoking")) {
    understood.push("non-smoker noted");
  }

  return understood;
}

async function loadAccount() {
  const mobile = $("#viewerMobile").value.trim() || state.mobile;
  if (!mobile) {
    $("#accountSummary").innerHTML = '<p class="status">Enter a mobile number to load account summary.</p>';
    syncMemberBar();
    return;
  }

  state.mobile = mobile;
  localStorage.setItem("ck_mobile", mobile);
  const data = await api(`/api/account?mobile=${encodeURIComponent(mobile)}`);
  state.account = data;
  data.receivedInterests ||= [];
  state.contactAccess = data.contactAccess;
  syncMemberBar();

  $("#accountSummary").innerHTML = `
    <span><strong>User</strong>${data.user ? data.user.status : "Not created"}</span>
    <span><strong>Mobile OTP</strong>${data.user?.mobileVerified ? "Verified" : "Not verified"}</span>
    <span><strong>Profile</strong>${data.profile ? `${data.profile.id} - ${data.profile.verificationStatus}` : "No profile"}</span>
    <span><strong>Interests sent</strong>${data.interests.length}</span>
    <span><strong>Received messages</strong>${data.receivedInterests.length}</span>
    <span><strong>Saved profiles</strong>${data.shortlists.length}</span>
    <span><strong>Hidden profiles</strong>${data.blocks.length}</span>
    <span><strong>Subscription</strong>${data.activeSubscription ? `${data.activeSubscription.plan} active` : "No active plan"}</span>
    <span><strong>Contact access</strong>${data.contactAccess ? "Unlocked" : "Locked"}</span>
  `;

  if (data.profile) {
    const completeness = data.profileCompleteness;
    $("#myProfileSummary").innerHTML = `
      <span><strong>Profile ID</strong>${data.profile.id}</span>
      <span><strong>Status</strong>${data.profile.verificationStatus}</span>
      <span><strong>Visibility</strong>${data.profile.visibilityStatus}</span>
      <div class="completeness">
        <span><strong>Completeness</strong>${completeness.percent}%</span>
        <div class="progress" aria-label="Profile completeness"><span style="width: ${completeness.percent}%"></span></div>
      </div>
      ${
        completeness.missing.length
          ? `<div><strong>Missing</strong><ul class="missing-list">${completeness.missing.map((item) => `<li>${item}</li>`).join("")}</ul></div>`
          : "<span><strong>Missing</strong>Nothing important</span>"
      }
    `;
  } else {
    $("#myProfileSummary").innerHTML = '<p class="status">No profile yet. Create one with OTP verification.</p>';
  }

  renderMemberActivity(data);

  await loadProfiles();
}

function renderMemberActivity(data) {
  $("#savedProfilesList").innerHTML = data.shortlists.length
    ? data.shortlists
        .map((item) => {
          const profile = item.profile;
          return `
          <div class="activity-item saved-profile-item">
            <div>
              <strong>${profile?.name || item.profileId}${profile?.age ? ` <span>${profile.age} yrs</span>` : ""}</strong>
              <p>
                <span>${item.profileId}${profile?.gender ? ` - ${profile.gender}` : ""}</span>
                <button class="copy-id-button" type="button" data-copy-saved="${item.profileId}" aria-label="Copy profile ID ${item.profileId}">Copy ID</button>
              </p>
            </div>
            ${profile ? `<small>${profileSummary(profile)}</small>` : '<small>Profile details unavailable</small>'}
            ${profile ? `<div class="saved-badges">${lifestyleBadges(profile)}</div>` : ""}
            <div class="activity-actions">
              <button type="button" data-view-saved="${item.profileId}">View</button>
              <button class="secondary" type="button" data-remove-saved="${item.profileId}">Remove</button>
            </div>
          </div>
        `;
        })
        .join("")
    : '<p class="status">Save profiles from Browse to compare later.</p>';

  $("#sentInterestsList").innerHTML = data.interests.length
    ? data.interests
        .map((item) => `
          <div class="activity-item">
            <strong>${item.profile?.name || item.toProfileId}</strong>
            <span>Status: ${item.status}. Sent on ${new Date(item.createdAt).toLocaleDateString()}.</span>
            ${item.message ? `<small>${escapeHtml(item.message)}</small>` : ""}
            <div class="activity-actions">
              <button type="button" data-view-interest="${item.toProfileId}">View</button>
            </div>
          </div>
        `)
        .join("")
    : '<p class="status">Sent interests will appear here.</p>';

  $("#receivedInterestsList").innerHTML = data.receivedInterests.length
    ? data.receivedInterests
        .map((item) => `
          <div class="activity-item">
            <strong>${item.fromProfile?.name || "Interested family"}</strong>
            <span>From: ${item.fromProfile?.id || item.fromMobile}. Sent on ${new Date(item.createdAt).toLocaleDateString()}.</span>
            ${item.message ? `<small>${escapeHtml(item.message)}</small>` : "<small>No message added.</small>"}
            <div class="activity-actions">
              ${
                item.fromProfile
                  ? `<button type="button" data-view-received="${item.fromProfile.id}">View sender</button>`
                  : ""
              }
              <button type="button" data-view-interest="${item.toProfileId}">View my profile</button>
            </div>
          </div>
        `)
        .join("")
    : '<p class="status">Messages from interested families will appear here.</p>';

  $("#hiddenProfilesList").innerHTML = data.blocks.length
    ? data.blocks
        .map((item) => `
          <div class="activity-item">
            <strong>${item.profile?.name || item.profileId}</strong>
            <small>${item.profile ? profileSummary(item.profile) : "Profile details unavailable"}</small>
            <div class="activity-actions">
              <button type="button" data-view-hidden="${item.profileId}">View</button>
              <button class="secondary" type="button" data-unhide-profile="${item.profileId}">Unhide</button>
            </div>
          </div>
        `)
        .join("")
    : '<p class="status">Use Hide in Browse to remove profiles you do not want to see.</p>';
}

async function loadProfiles() {
  const matchGender = matchGenderForCurrentMember();
  const params = new URLSearchParams({
    gender: matchGender,
    age: $("#ageFilter").value,
    location: $("#locationFilter").value,
    education: $("#educationFilter").value,
    salary: $("#salaryFilter").value,
    fitness: $("#fitnessFilter").value,
    job: $("#jobFilter").value.trim(),
    profileId: $("#profileIdFilter").value.trim(),
    viewerMobile: state.mobile
  });

  $("#profileStatus").textContent = "Loading profiles...";
  const data = await api(`/api/profiles?${params.toString()}`);
  state.profiles = sortProfiles(data.profiles);
  state.compareIds = state.compareIds.filter((id) => data.profiles.some((profile) => profile.id === id));
  const matchText = matchGender === "all" ? "all bride and groom profiles" : `${matchGender} profiles for this member`;
  const sortText = $("#sortFilter").value === "default" ? "" : ` Sorted by ${$("#sortFilter").selectedOptions[0].text.toLowerCase()}.`;
  const profileIdText = $("#profileIdFilter").value.trim() ? ` Matching profile ID "${$("#profileIdFilter").value.trim()}".` : "";
  $("#profileStatus").textContent = `Showing ${data.profiles.length} ${matchText}. Contact is ${state.contactAccess ? "unlocked for this mobile" : "locked until payment"}.${profileIdText}${sortText}`;
  renderProfiles();
  syncCompareSelection();
  if (state.compareIds.length !== 2) $("#comparePanel").hidden = true;
}

function renderProfiles() {
  const grid = $("#profilesGrid");

  if (!state.profiles.length) {
    grid.innerHTML = '<p class="status">No public profiles match this search yet.</p>';
    return;
  }

  grid.innerHTML = state.profiles
    .map((profile) => {
      const saved = savedProfileIds().has(profile.id);
      const summary = profileSummary(profile);
      return `
      <article class="profile-row">
        <div class="row-main" data-view="${profile.id}" aria-label="View ${profile.name}">
          ${photoMarkup(profile)}
          <div class="row-identity">
            <h3>${profile.name} <span>${profile.age} yrs</span></h3>
            <p>
              <span>${profile.id} - ${profile.gender}</span>
              <button class="copy-id-button" type="button" data-copy-id="${profile.id}" aria-label="Copy profile ID ${profile.id}">Copy ID</button>
            </p>
            <strong class="row-summary">${summary}</strong>
          </div>
        </div>
        <div class="row-actions">
          <label class="compare-check">
            <input type="checkbox" data-compare-profile="${profile.id}" ${state.compareIds.includes(profile.id) ? "checked" : ""}>
            Compare
          </label>
          <button type="button" data-action-view="${profile.id}">View</button>
          <button type="button" data-shortlist="${profile.id}">${saved ? "Saved" : "Save"}</button>
          <button type="button" data-interest="${profile.id}" aria-label="Send message request to ${profile.name}">Send Msg</button>
          <button class="secondary" type="button" data-hide-profile="${profile.id}">Hide</button>
        </div>
        <div class="row-tags">
          <span>${shortEducation(profile.education)}</span>
          <span>${profile.fitness || "Fitness not specified"}</span>
          ${lifestyleBadges(profile)}
          <button class="link-button" type="button" data-report="${profile.id}">Report</button>
        </div>
      </article>
    `;
    })
    .join("");
}

function profilePosition(profileId) {
  return state.profiles.findIndex((profile) => profile.id === profileId);
}

async function openProfile(profileId) {
  state.activeProfileId = profileId;
  const data = await api(`/api/profiles/${profileId}?viewerMobile=${encodeURIComponent(state.mobile)}`);
  const profile = data.profile;
  const index = profilePosition(profileId);
  const total = state.profiles.length;
  $("#profileModalBody").innerHTML = `
    <div class="profile-detail-head">
      ${photoMarkup(profile, "profile-detail-photo")}
      <div>
        <p class="eyebrow">${profile.verificationStatus} profile</p>
        <h2 id="profileModalTitle">${profile.name}</h2>
        <p class="status">
          ${profile.id} - ${profile.gender}, ${profile.age}, ${profile.location}
          <button class="copy-id-button" type="button" data-copy-id="${profile.id}" aria-label="Copy profile ID ${profile.id}">Copy ID</button>
        </p>
      </div>
    </div>
    <div class="profile-detail-body">
      <div class="profile-nav-row">
        <button class="secondary" type="button" data-profile-nav="prev">Previous</button>
        <span>${index >= 0 ? index + 1 : "-"} of ${total || "-"}</span>
        <button type="button" data-profile-nav="next">Next</button>
      </div>
      <div class="lifestyle-row">${lifestyleBadges(profile)}</div>
      <p>${profile.about}</p>
      <div class="detail-grid">
        <span><strong>Profile for</strong>${profile.profileFor}</span>
        <span><strong>Education</strong>${shortEducation(profile.education)}</span>
        <span><strong>Profession</strong>${profile.job}</span>
        <span><strong>Company</strong>${profile.companyName || "Not disclosed"}</span>
        <span><strong>Income</strong>${profile.income}</span>
        <span><strong>Salary range</strong>${profile.salaryRange || profile.income}</span>
        <span><strong>Photo status</strong>${profile.photoStatus}</span>
        <span><strong>Height</strong>${profile.height || "Not specified"}</span>
        <span><strong>Fitness</strong>${profile.fitness || "Not specified"}</span>
        <span><strong>Diet</strong>${profile.diet || "Not specified"}</span>
        <span><strong>Smoking</strong>${profile.smoking || "Not specified"}</span>
        <span><strong>Drinking</strong>${profile.drinking || "Not specified"}</span>
        <span><strong>Family</strong>${profile.family}</span>
        <span><strong>Preference</strong>${profile.preference}</span>
        <span><strong>Horoscope</strong>${profile.horoscope}</span>
      </div>
      <p class="privacy-box">Contact: ${profile.contactLocked ? "Hidden until subscription payment" : profile.contact}</p>
      <div class="profile-detail-actions">
        <button type="button" data-modal-shortlist="${profile.id}">Save profile</button>
        <button type="button" data-modal-interest="${profile.id}">Send interest</button>
        <button class="secondary" type="button" data-modal-report="${profile.id}">Report</button>
      </div>
    </div>
  `;
  $("#profileModal").hidden = false;
}

function closeProfile() {
  $("#profileModal").hidden = true;
}

async function navigateProfile(direction) {
  if (!state.profiles.length || !state.activeProfileId) return;
  const currentIndex = profilePosition(state.activeProfileId);
  if (currentIndex < 0) return;
  const nextIndex = direction === "next"
    ? Math.min(currentIndex + 1, state.profiles.length - 1)
    : Math.max(currentIndex - 1, 0);
  if (nextIndex !== currentIndex) {
    await openProfile(state.profiles[nextIndex].id);
  }
}

async function loadAdmin() {
  if (!state.adminToken) {
    $("#adminStats").innerHTML = "";
    $("#adminList").innerHTML = '<p class="status">Enter the demo admin PIN to view and approve profiles.</p>';
    return;
  }

  const data = await api("/api/admin/dashboard", { admin: true });
  $("#adminLoginStatus").textContent = "Admin logged in. Approval actions are available.";
  $("#adminStats").innerHTML = `
    <article class="stat"><strong>${data.stats.pendingProfiles}</strong><span>Admin review</span></article>
    <article class="stat"><strong>${data.stats.publicProfiles}</strong><span>Public profiles</span></article>
    <article class="stat"><strong>${data.stats.reportsOpen}</strong><span>Open reports</span></article>
    <article class="stat"><strong>Rs. ${data.stats.revenueRupees}</strong><span>Demo revenue</span></article>
  `;

  const list = $("#adminList");
  if (!data.pending.length) {
    list.innerHTML = '<p class="status">No pending admin work. Nice and clean.</p>';
    return;
  }

  list.innerHTML = data.pending
    .map((profile) => `
      <article class="admin-card">
        <div>
          <h3>${profile.id} - ${profile.name}</h3>
          <p class="status">${profile.gender}, ${profile.age}, ${profile.location}. Status: ${profile.verificationStatus}. Photo: ${profile.photoStatus}.</p>
        </div>
        <div class="admin-card-actions">
          <button type="button" data-admin-profile="${profile.id}" data-action="approve">Approve</button>
          <button class="secondary" type="button" data-admin-profile="${profile.id}" data-action="request_correction">Request correction</button>
          <button class="secondary" type="button" data-admin-profile="${profile.id}" data-action="reject">Reject</button>
        </div>
      </article>
    `)
    .join("");
}

$("#refreshProfiles").addEventListener("click", loadProfiles);
$("#refreshAdmin").addEventListener("click", loadAdmin);
$("#loadAccount").addEventListener("click", () => loadAccount().catch((error) => showToast(error.message)));
$("#compareProfiles").addEventListener("click", renderComparePanel);
$("#clearCompare").addEventListener("click", () => {
  state.compareIds = [];
  $("#comparePanel").hidden = true;
  syncCompareSelection();
});
$("#fillEditProfile").addEventListener("click", () => {
  if (!state.account?.profile) {
    showToast("Load an account with a profile first.");
    return;
  }
  populateProfileForm($("#editProfileForm"), state.account.profile);
  location.hash = "#editProfilePanel";
});
$("#aiSearchButton").addEventListener("click", async () => {
  const text = $("#aiSearchInput").value.trim();
  if (!text) {
    $("#aiSearchSummary").textContent = "Type a sentence like: groom earning 10-20 LPA, regular fitness, Chennai.";
    return;
  }
  const understood = parseAiSearch(text);
  $("#aiSearchSummary").textContent = understood.length
    ? `AI understood: ${understood.join(", ")}.`
    : "AI could not map this yet. Try salary, fitness, job, age, or Chennai area.";
  await loadProfiles();
});
$("#clearAiSearch").addEventListener("click", async () => {
  $("#aiSearchInput").value = "";
  $("#aiSearchSummary").textContent = "Try salary, fitness, job, age, and location in one sentence. Bride/groom matching is automatic after login.";
  $("#ageFilter").value = "all";
  $("#locationFilter").value = "all";
  $("#educationFilter").value = "all";
  $("#salaryFilter").value = "all";
  $("#fitnessFilter").value = "all";
  $("#jobFilter").value = "";
  $("#profileIdFilter").value = "";
  $("#sortFilter").value = "default";
  await loadProfiles();
});
$("#adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(formJson(event.currentTarget))
    });
    state.adminToken = result.token;
    localStorage.setItem("ck_admin_token", result.token);
    $("#adminLoginStatus").textContent = `Admin logged in until ${new Date(result.expiresAt).toLocaleTimeString()}.`;
    await loadAdmin();
    showToast("Admin login successful");
  } catch (error) {
    $("#adminLoginStatus").textContent = error.message;
  }
});
["#ageFilter", "#locationFilter", "#educationFilter", "#salaryFilter", "#fitnessFilter", "#jobFilter", "#profileIdFilter", "#sortFilter"].forEach((selector) => {
  $(selector).addEventListener("change", loadProfiles);
});
["#jobFilter", "#profileIdFilter"].forEach((selector) => $(selector).addEventListener("input", () => {
  window.clearTimeout(loadProfiles.jobTimer);
  loadProfiles.jobTimer = window.setTimeout(loadProfiles, 250);
}));

$("#otpForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    const data = formJson(form);
    state.mobile = data.mobile;
    localStorage.setItem("ck_mobile", data.mobile);
    syncMemberBar();
    const result = await api("/api/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ mobile: data.mobile })
    });
    $("#otpStatus").textContent = result.message;
    showToast("Demo OTP is 123456");
  } catch (error) {
    $("#otpStatus").textContent = error.message;
  }
});

$("#verifyOtp").addEventListener("click", async () => {
  try {
    const data = formJson($("#otpForm"));
    const result = await api("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ mobile: data.mobile, code: data.code })
    });
    state.mobile = data.mobile;
    localStorage.setItem("ck_mobile", data.mobile);
    $("#otpStatus").textContent = `${result.message}. User role: ${result.user.role}.`;
    await loadAccount();
    showToast("Mobile verified");
  } catch (error) {
    $("#otpStatus").textContent = error.message;
  }
});

$("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const profile = formJson(event.currentTarget);
    profile.mobile = state.mobile || formJson($("#otpForm")).mobile;
    const result = await api("/api/profiles", {
      method: "POST",
      body: JSON.stringify(profile)
    });
    $("#profileCreateStatus").textContent = `${result.profile.id} created. It is hidden until admin approval.`;
    event.currentTarget.reset();
    await loadAccount();
    await loadAdmin();
    showToast("Profile sent to admin approval");
  } catch (error) {
    $("#profileCreateStatus").textContent = error.message;
  }
});

$("#editProfileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (!state.mobile) throw new Error("Load or verify mobile before editing profile");
    const profile = formJson(event.currentTarget);
    profile.mobile = state.mobile;
    const result = await api("/api/profiles/me", {
      method: "PATCH",
      body: JSON.stringify(profile)
    });
    $("#editProfileStatus").textContent = `${result.profile.id} updated. Completeness: ${result.profileCompleteness.percent}%. Sent to admin review.`;
    await loadAccount();
    await loadAdmin();
    showToast("Profile updated");
  } catch (error) {
    $("#editProfileStatus").textContent = error.message;
  }
});

$("#savedProfilesList").addEventListener("click", async (event) => {
  const target = event.target.closest("[data-view-saved], [data-remove-saved], [data-copy-saved]");
  if (!target) return;
  const viewId = target.dataset.viewSaved;
  const removeId = target.dataset.removeSaved;
  const copyId = target.dataset.copySaved;
  try {
    if (copyId) await copyText(copyId, "Profile ID copied");
    if (viewId) await openProfile(viewId);
    if (removeId) {
      if (!state.mobile) throw new Error("Load mobile before removing saved profile");
      const result = await api(`/api/shortlists/${removeId}?mobile=${encodeURIComponent(state.mobile)}`, {
        method: "DELETE"
      });
      await loadAccount();
      showToast(result.message);
    }
  } catch (error) {
    showToast(error.message);
  }
});

$("#sentInterestsList").addEventListener("click", async (event) => {
  const target = event.target.closest("[data-view-interest]");
  if (!target) return;
  const viewId = target.dataset.viewInterest;
  if (!viewId) return;
  try {
    await openProfile(viewId);
  } catch (error) {
    showToast(error.message);
  }
});

$("#receivedInterestsList").addEventListener("click", async (event) => {
  const target = event.target.closest("[data-view-received], [data-view-interest]");
  if (!target) return;
  const viewReceivedId = target.dataset.viewReceived;
  const viewOwnId = target.dataset.viewInterest;
  try {
    if (viewReceivedId) await openProfile(viewReceivedId);
    if (viewOwnId) await openProfile(viewOwnId);
  } catch (error) {
    showToast(error.message);
  }
});

$("#hiddenProfilesList").addEventListener("click", async (event) => {
  const target = event.target.closest("[data-view-hidden], [data-unhide-profile]");
  if (!target) return;
  const viewId = target.dataset.viewHidden;
  const unhideId = target.dataset.unhideProfile;
  try {
    if (viewId) await openProfile(viewId);
    if (unhideId) await unhideProfile(unhideId);
  } catch (error) {
    showToast(error.message);
  }
});

async function saveProfile(profileId) {
  const mobile = state.mobile || prompt("Enter your mobile number to save profile");
  if (!mobile) return;
  state.mobile = mobile;
  localStorage.setItem("ck_mobile", mobile);
  const result = await api("/api/shortlists", {
    method: "POST",
    body: JSON.stringify({ mobile, profileId })
  });
  await loadAccount();
  showToast(result.message);
}

async function hideProfile(profileId) {
  const mobile = state.mobile || prompt("Enter your mobile number to hide profile");
  if (!mobile) return;
  state.mobile = mobile;
  localStorage.setItem("ck_mobile", mobile);
  const result = await api("/api/blocks", {
    method: "POST",
    body: JSON.stringify({ mobile, profileId })
  });
  state.compareIds = state.compareIds.filter((id) => id !== profileId);
  await loadAccount();
  showToast(result.message);
}

async function unhideProfile(profileId) {
  if (!state.mobile) throw new Error("Load mobile before restoring hidden profile");
  const result = await api(`/api/blocks/${profileId}?mobile=${encodeURIComponent(state.mobile)}`, {
    method: "DELETE"
  });
  await loadAccount();
  showToast(result.message);
}

async function sendInterest(profileId) {
  const mobile = state.mobile || prompt("Enter your mobile number to send message");
  if (!mobile) return;
  const message = prompt("Short message", "We liked this profile. Please connect if interested.");
  if (message === null) return;
  state.mobile = mobile;
  localStorage.setItem("ck_mobile", mobile);
  const result = await api("/api/interests", {
    method: "POST",
    body: JSON.stringify({ fromMobile: mobile, toProfileId: profileId, message })
  });
  await loadAccount();
  showToast(result.message);
}

async function reportProfile(profileId) {
  const reason = prompt("Reason for report", "Suspicious or duplicate profile");
  if (!reason) return;
  const result = await api("/api/reports", {
    method: "POST",
    body: JSON.stringify({ profileId, reason })
  });
  await loadAdmin();
  showToast(result.message);
}

$("#profilesGrid").addEventListener("change", (event) => {
  const input = event.target.closest("[data-compare-profile]");
  if (!input) return;
  const profileId = input.dataset.compareProfile;
  if (input.checked) {
    if (!state.compareIds.includes(profileId)) state.compareIds.push(profileId);
    if (state.compareIds.length > 2) {
      const removed = state.compareIds.shift();
      const removedInput = document.querySelector(`[data-compare-profile="${removed}"]`);
      if (removedInput) removedInput.checked = false;
      showToast("Only 2 profiles can be compared at a time");
    }
  } else {
    state.compareIds = state.compareIds.filter((id) => id !== profileId);
  }
  updateCompareStatus();
  if (state.compareIds.length === 2) renderComparePanel();
  if (state.compareIds.length < 2) $("#comparePanel").hidden = true;
});

$("#profilesGrid").addEventListener("click", async (event) => {
  const target = event.target.closest("[data-view], [data-action-view], [data-interest], [data-shortlist], [data-report], [data-hide-profile], [data-copy-id]");
  if (!target) return;
  const copyId = target.dataset.copyId;
  const viewId = target.dataset.view || target.dataset.actionView;
  const interestId = target.dataset.interest;
  const shortlistId = target.dataset.shortlist;
  const reportId = target.dataset.report;
  const hideId = target.dataset.hideProfile;

  try {
    if (copyId) {
      event.stopPropagation();
      await copyText(copyId, "Profile ID copied");
      return;
    }

    if (viewId) {
      await openProfile(viewId);
    }

    if (interestId) {
      await sendInterest(interestId);
    }

    if (shortlistId) {
      await saveProfile(shortlistId);
    }

    if (reportId) {
      await reportProfile(reportId);
    }

    if (hideId) {
      await hideProfile(hideId);
    }
  } catch (error) {
    showToast(error.message);
  }
});

$("#profileModalBody").addEventListener("click", async (event) => {
  const target = event.target.closest("[data-profile-nav], [data-modal-shortlist], [data-modal-interest], [data-modal-report], [data-copy-id]");
  if (!target) return;
  const copyId = target.dataset.copyId;
  const nav = target.dataset.profileNav;
  const saveId = target.dataset.modalShortlist;
  const interestId = target.dataset.modalInterest;
  const reportId = target.dataset.modalReport;
  try {
    if (copyId) await copyText(copyId, "Profile ID copied");
    if (nav) await navigateProfile(nav === "next" ? "next" : "prev");
    if (saveId) await saveProfile(saveId);
    if (interestId) await sendInterest(interestId);
    if (reportId) await reportProfile(reportId);
  } catch (error) {
    showToast(error.message);
  }
});

$("#interestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/api/interests", {
      method: "POST",
      body: JSON.stringify(formJson(event.currentTarget))
    });
    $("#interestStatus").textContent = result.message;
    await loadAccount();
  } catch (error) {
    $("#interestStatus").textContent = error.message;
  }
});

$("#paymentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/api/payments/demo-checkout", {
      method: "POST",
      body: JSON.stringify(formJson(event.currentTarget))
    });
    state.mobile = formJson(event.currentTarget).mobile;
    localStorage.setItem("ck_mobile", state.mobile);
    $("#paymentStatus").textContent = `${result.message} Subscription ends ${new Date(result.subscription.endsAt).toLocaleDateString()}.`;
    await loadAccount();
    await loadAdmin();
  } catch (error) {
    $("#paymentStatus").textContent = error.message;
  }
});

$("#adminList").addEventListener("click", async (event) => {
  const profileId = event.target.dataset.adminProfile;
  const action = event.target.dataset.action;
  if (!profileId || !action) return;

  try {
    const result = await api(`/api/admin/profiles/${profileId}`, {
      method: "PATCH",
      admin: true,
      body: JSON.stringify({ action })
    });
    showToast(result.message);
    await loadProfiles();
    await loadAdmin();
  } catch (error) {
    showToast(error.message);
  }
});

$("#closeProfileModal").addEventListener("click", closeProfile);
$("#profileModal").addEventListener("click", (event) => {
  if (event.target === $("#profileModal")) closeProfile();
});
let swipeStartX = 0;
let swipeStartY = 0;
$("#profileModalBody").addEventListener("pointerdown", (event) => {
  swipeStartX = event.clientX;
  swipeStartY = event.clientY;
});
$("#profileModalBody").addEventListener("pointerup", async (event) => {
  const deltaX = event.clientX - swipeStartX;
  const deltaY = event.clientY - swipeStartY;
  if (Math.abs(deltaX) < 70 || Math.abs(deltaY) > 70) return;
  try {
    await navigateProfile(deltaX < 0 ? "next" : "prev");
  } catch (error) {
    showToast(error.message);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeProfile();
  if (!$("#profileModal").hidden && event.key === "ArrowLeft") navigateProfile("prev").catch((error) => showToast(error.message));
  if (!$("#profileModal").hidden && event.key === "ArrowRight") navigateProfile("next").catch((error) => showToast(error.message));
});

syncMemberBar();
Promise.all([loadProfiles(), loadAdmin(), state.mobile ? loadAccount() : Promise.resolve()]).catch((error) => showToast(error.message));
