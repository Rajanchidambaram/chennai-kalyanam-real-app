const BASE_URL = process.env.BASE_URL || "http://localhost:4174";
const TEST_MOBILE = "+91 94444 55555";
const ADMIN_PIN = "246810";

let passed = 0;
let adminToken = "";

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${data.error || text}`);
  }
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
}

async function expectError(path, options, expectedText) {
  try {
    await request(path, options);
  } catch (error) {
    assert(error.message.includes(expectedText), `Expected error contains "${expectedText}"`);
    return;
  }
  throw new Error(`Expected ${path} to fail`);
}

async function run() {
  console.log(`Running smoke tests against ${BASE_URL}`);

  await request("/api/test/reset", {
    method: "POST",
    headers: { "x-test-reset": "allow" }
  });

  const health = await request("/api/health");
  assert(health.ok === true, "Health API returns ok");

  const publicProfiles = await request("/api/profiles");
  assert(publicProfiles.profiles.length === 2, "Only approved public profiles show in browse");
  assert(publicProfiles.profiles.every((profile) => profile.contactLocked), "Contacts are locked before payment");

  const salaryProfiles = await request(`/api/profiles?salary=${encodeURIComponent("Rs. 10-20 LPA")}`);
  assert(salaryProfiles.profiles.length === 1, "Salary filter returns matching approved profiles");

  const fitnessProfiles = await request(`/api/profiles?fitness=${encodeURIComponent("Active lifestyle")}`);
  assert(fitnessProfiles.profiles.length === 2, "Fitness filter returns active lifestyle profiles");

  await expectError("/api/admin/dashboard", {}, "Admin login required");
  const adminLogin = await request("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ pin: ADMIN_PIN })
  });
  adminToken = adminLogin.token;
  assert(Boolean(adminToken), "Admin login returns a session token");

  await expectError(
    "/api/profiles",
    {
      method: "POST",
      body: JSON.stringify({
        mobile: TEST_MOBILE,
        name: "Blocked Profile",
        gender: "Bride",
        age: 26,
        location: "Velachery",
        education: "Engineering"
      })
    },
    "Verify OTP"
  );

  const otp = await request("/api/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ mobile: TEST_MOBILE })
  });
  assert(otp.demoOtp === "123456", "Demo OTP request returns 123456");

  await expectError(
    "/api/auth/verify-otp",
    {
      method: "POST",
      body: JSON.stringify({ mobile: TEST_MOBILE, code: "000000" })
    },
    "Invalid OTP"
  );

  const verify = await request("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ mobile: TEST_MOBILE, code: "123456" })
  });
  assert(verify.user.mobileVerified === true, "OTP verification marks mobile verified");

  const created = await request("/api/profiles", {
    method: "POST",
    body: JSON.stringify({
      mobile: TEST_MOBILE,
      name: "QA Test Profile",
      profileFor: "Self",
      gender: "Bride",
      age: 26,
      location: "Velachery",
      education: "Engineering",
      job: "QA Analyst",
      salaryRange: "Rs. 5-10 LPA",
      fitness: "Regular fitness"
    })
  });
  assert(created.profile.visibilityStatus === "hidden", "New profile stays hidden before admin approval");

  let accountBeforeEdit = await request(`/api/account?mobile=${encodeURIComponent(TEST_MOBILE)}`);
  assert(accountBeforeEdit.profileCompleteness.percent < 100, "Account reports incomplete profile before edit");

  const edited = await request("/api/profiles/me", {
    method: "PATCH",
    body: JSON.stringify({
      mobile: TEST_MOBILE,
      name: "QA Test Profile",
      profileFor: "Self",
      gender: "Bride",
      age: 26,
      location: "Velachery",
      education: "Engineering",
      job: "QA Analyst",
      salaryRange: "Rs. 5-10 LPA",
      height: "5 ft 5 in",
      fitness: "Regular fitness",
      diet: "Vegetarian",
      smoking: "No",
      drinking: "No",
      family: "QA family details",
      about: "QA profile about text",
      preference: "Looking for a respectful Chennai match",
      horoscope: "Available"
    })
  });
  assert(edited.profileCompleteness.percent === 100, "Profile edit can complete required profile fields");

  let admin = await request("/api/admin/dashboard", {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assert(admin.pending.some((profile) => profile.id === created.profile.id), "New profile appears in admin review");

  const approved = await request(`/api/admin/profiles/${created.profile.id}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ action: "approve" })
  });
  assert(approved.profile.visibilityStatus === "public", "Admin approval publishes profile");

  const profileAfterApproval = await request(`/api/profiles/${created.profile.id}`);
  assert(profileAfterApproval.profile.contactLocked === true, "Approved profile contact remains locked without subscription");

  const interest = await request("/api/interests", {
    method: "POST",
    body: JSON.stringify({ fromMobile: TEST_MOBILE, toProfileId: "CK1028" })
  });
  assert(interest.interest.status === "sent", "Interest can be sent");

  const shortlist = await request("/api/shortlists", {
    method: "POST",
    body: JSON.stringify({ mobile: TEST_MOBILE, profileId: "CK1028" })
  });
  assert(shortlist.shortlist.profileId === "CK1028", "Profile can be saved to shortlist");

  const duplicateShortlist = await request("/api/shortlists", {
    method: "POST",
    body: JSON.stringify({ mobile: TEST_MOBILE, profileId: "CK1028" })
  });
  assert(duplicateShortlist.message === "Profile already saved", "Duplicate shortlist is blocked");

  const duplicateInterest = await request("/api/interests", {
    method: "POST",
    body: JSON.stringify({ fromMobile: TEST_MOBILE, toProfileId: "CK1028" })
  });
  assert(duplicateInterest.message === "Interest already sent", "Duplicate interest is blocked");

  const report = await request("/api/reports", {
    method: "POST",
    body: JSON.stringify({ profileId: "CK1028", reason: "QA suspicious profile report" })
  });
  assert(report.report.status === "open", "Report opens admin review");

  const payment = await request("/api/payments/demo-checkout", {
    method: "POST",
    body: JSON.stringify({ mobile: TEST_MOBILE, plan: "monthly" })
  });
  assert(payment.subscription.status === "active", "Demo payment creates active subscription");

  const unlockedProfile = await request(`/api/profiles/CK1028?viewerMobile=${encodeURIComponent(TEST_MOBILE)}`);
  assert(unlockedProfile.profile.contactLocked === false, "Active subscription unlocks contact details");

  const account = await request(`/api/account?mobile=${encodeURIComponent(TEST_MOBILE)}`);
  assert(account.contactAccess === true, "Account summary shows contact access");
  assert(account.interests.length === 1, "Account summary shows sent interest");
  assert(account.shortlists.length === 1, "Account summary shows saved profile");

  const removeShortlist = await request(`/api/shortlists/CK1028?mobile=${encodeURIComponent(TEST_MOBILE)}`, {
    method: "DELETE"
  });
  assert(removeShortlist.message === "Profile removed from shortlist", "Saved profile can be removed");

  console.log(`\nAll ${passed} smoke checks passed.`);
}

run().catch((error) => {
  console.error(`\nFAIL: ${error.message}`);
  process.exit(1);
});
