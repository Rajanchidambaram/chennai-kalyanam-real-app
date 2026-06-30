const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ensureCollections, ensureDatabase, readDb, resetDb, writeDb } = require("./repositories/jsonDatabase");

const PORT = Number(process.env.PORT || 4174);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const ADMIN_PIN = process.env.ADMIN_PIN || "246810";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function makeId(prefix) {
  return `${prefix}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function publicProfile(profile, hasContactAccess = false) {
  const { mobile, ...safeProfile } = profile;
  return {
    ...safeProfile,
    contact: hasContactAccess ? "+91 9XXXX XXXXX" : null,
    contactLocked: !hasContactAccess
  };
}

function profileCompleteness(profile) {
  if (!profile) return { percent: 0, missing: [] };
  const fields = [
    ["name", "Full name"],
    ["gender", "Bride/Groom"],
    ["age", "Age"],
    ["location", "Area"],
    ["education", "Education"],
    ["job", "Job"],
    ["companyName", "Company name"],
    ["salaryRange", "Salary range"],
    ["height", "Height"],
    ["fitness", "Fitness"],
    ["diet", "Diet"],
    ["family", "Family details"],
    ["about", "About profile"],
    ["preference", "Partner preference"],
    ["horoscope", "Horoscope"]
  ];
  const missing = fields
    .filter(([key]) => {
      const value = profile[key];
      return !value || value === "Not added" || value === "Not specified" || value === "Not disclosed" || value === "Preference not added";
    })
    .map(([, label]) => label);
  return {
    percent: Math.round(((fields.length - missing.length) / fields.length) * 100),
    missing
  };
}

function applyProfileUpdates(profile, body) {
  const editableFields = [
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
    "family",
    "about",
    "preference",
    "horoscope"
  ];
  editableFields.forEach((field) => {
    if (body[field] !== undefined) {
      profile[field] = field === "age" ? Number(body[field]) : body[field];
    }
  });
  profile.verificationStatus = "pending";
  profile.visibilityStatus = "hidden";
  profile.updatedAt = new Date().toISOString();
}

function hasActiveSubscription(db, mobile) {
  if (!mobile) return false;
  const now = Date.now();
  return db.subscriptions.some((subscription) => {
    return (
      subscription.mobile === mobile &&
      subscription.status === "active" &&
      new Date(subscription.endsAt).getTime() > now
    );
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

function requireAdmin(req, db) {
  db.adminSessions ||= [];
  const token = getBearerToken(req);
  const session = db.adminSessions.find((item) => item.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return session;
}

function applyProfileFilters(profiles, query) {
  return profiles.filter((profile) => {
    if (profile.visibilityStatus !== "public") return false;
    if (query.profileId && !profile.id.toLowerCase().includes(query.profileId.toLowerCase())) return false;
    if (query.gender && query.gender !== "all" && profile.gender !== query.gender) return false;
    if (query.location && query.location !== "all" && profile.location !== query.location) return false;
    if (query.education && query.education !== "all" && profile.education !== query.education) return false;
    if (query.salary && query.salary !== "all" && profile.salaryRange !== query.salary) return false;
    if (query.fitness && query.fitness !== "all" && profile.fitness !== query.fitness) return false;
    if (query.job && !String(profile.job || "").toLowerCase().includes(query.job.toLowerCase())) return false;
    if (query.age && query.age !== "all") {
      const [min, max] = query.age.split("-").map(Number);
      if (profile.age < min || profile.age > max) return false;
    }
    return true;
  });
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": contentTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

async function handleApi(req, res, url) {
  const db = readDb();
  ensureCollections(db);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, app: "ChennaiKalyanam", now: new Date().toISOString() });
  }

  if (req.method === "POST" && pathname === "/api/test/reset") {
    if (req.headers["x-test-reset"] !== "allow") {
      return sendError(res, 403, "Test reset is not allowed");
    }
    resetDb();
    return sendJson(res, 200, { message: "Demo database reset to seed data" });
  }

  if (req.method === "GET" && pathname === "/api/profiles") {
    const viewerMobile = url.searchParams.get("viewerMobile");
    const hasContactAccess = hasActiveSubscription(db, viewerMobile);
    const blockedIds = new Set(db.blocks.filter((item) => item.mobile === viewerMobile).map((item) => item.profileId));
    const profiles = applyProfileFilters(db.profiles, Object.fromEntries(url.searchParams.entries()))
      .filter((profile) => !blockedIds.has(profile.id));
    return sendJson(res, 200, { profiles: profiles.map((profile) => publicProfile(profile, hasContactAccess)) });
  }

  if (req.method === "GET" && pathname.startsWith("/api/profiles/")) {
    const id = pathname.split("/").pop();
    const viewerMobile = url.searchParams.get("viewerMobile");
    const profile = db.profiles.find((item) => item.id === id);
    if (!profile) return sendError(res, 404, "Profile not found");
    if (profile.visibilityStatus !== "public") return sendError(res, 403, "Profile is not public");
    return sendJson(res, 200, { profile: publicProfile(profile, hasActiveSubscription(db, viewerMobile)) });
  }

  if (req.method === "GET" && pathname === "/api/account") {
    const mobile = url.searchParams.get("mobile");
    if (!mobile) return sendError(res, 400, "mobile is required");
    const user = db.users.find((item) => item.mobile === mobile) || null;
    const subscriptions = db.subscriptions.filter((item) => item.mobile === mobile);
    const activeSubscription = subscriptions.find((item) => item.status === "active" && new Date(item.endsAt).getTime() > Date.now()) || null;
    const interests = db.interests
      .filter((item) => item.fromMobile === mobile)
      .map((interest) => ({
        ...interest,
        profile: db.profiles.find((profileItem) => profileItem.id === interest.toProfileId) || null
      }));
    const profile = db.profiles.find((item) => {
      return (user && item.userId === user.id) || item.mobile === mobile;
    }) || null;
    const receivedInterests = profile
      ? db.interests
          .filter((item) => item.toProfileId === profile.id)
          .map((interest) => ({
            ...interest,
            fromProfile: db.profiles.find((profileItem) => {
              return profileItem.mobile === interest.fromMobile || profileItem.userId === interest.fromMobile;
            }) || null
          }))
      : [];
    const shortlists = db.shortlists
      .filter((item) => item.mobile === mobile)
      .map((shortlist) => ({
        ...shortlist,
        profile: db.profiles.find((profileItem) => profileItem.id === shortlist.profileId) || null
      }));
    const blocks = db.blocks
      .filter((item) => item.mobile === mobile)
      .map((block) => ({
        ...block,
        profile: db.profiles.find((profileItem) => profileItem.id === block.profileId) || null
      }));
    return sendJson(res, 200, {
      user,
      profile,
      profileCompleteness: profileCompleteness(profile),
      interests,
      receivedInterests,
      shortlists,
      blocks,
      subscriptions,
      activeSubscription,
      contactAccess: Boolean(activeSubscription)
    });
  }

  if (req.method === "PATCH" && pathname === "/api/profiles/me") {
    const body = await parseBody(req);
    if (!body.mobile) return sendError(res, 400, "mobile is required");
    const user = db.users.find((item) => item.mobile === body.mobile);
    if (!user || !user.mobileVerified) return sendError(res, 403, "Verify OTP before updating profile");
    const profile = db.profiles.find((item) => item.userId === user.id || item.mobile === body.mobile);
    if (!profile) return sendError(res, 404, "Profile not found for this mobile");

    applyProfileUpdates(profile, body);
    writeDb(db);
    return sendJson(res, 200, {
      message: "Profile updated and sent back to admin review",
      profile,
      profileCompleteness: profileCompleteness(profile)
    });
  }

  if (req.method === "POST" && pathname === "/api/auth/request-otp") {
    const body = await parseBody(req);
    if (!body.mobile) return sendError(res, 400, "Mobile number is required");
    db.otpRequests.push({
      id: makeId("OTP"),
      mobile: body.mobile,
      code: "123456",
      verified: false,
      createdAt: new Date().toISOString()
    });
    writeDb(db);
    return sendJson(res, 200, { message: "OTP sent for demo. Use 123456.", demoOtp: "123456" });
  }

  if (req.method === "POST" && pathname === "/api/auth/verify-otp") {
    const body = await parseBody(req);
    const otp = [...db.otpRequests].reverse().find((item) => item.mobile === body.mobile);
    if (!otp || body.code !== otp.code) return sendError(res, 400, "Invalid OTP");
    otp.verified = true;

    let user = db.users.find((item) => item.mobile === body.mobile);
    if (!user) {
      user = { id: makeId("USR"), mobile: body.mobile, role: "member", status: "active", mobileVerified: true };
      db.users.push(user);
    } else {
      user.mobileVerified = true;
    }

    writeDb(db);
    return sendJson(res, 200, { message: "OTP verified", user });
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    const body = await parseBody(req);
    if (body.pin !== ADMIN_PIN) return sendError(res, 401, "Invalid admin PIN");

    db.adminSessions ||= [];
    const session = {
      token: crypto.randomBytes(24).toString("hex"),
      role: "admin",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
    };
    db.adminSessions.push(session);
    writeDb(db);
    return sendJson(res, 200, { message: "Admin login successful", token: session.token, expiresAt: session.expiresAt });
  }

  if (req.method === "POST" && pathname === "/api/profiles") {
    const body = await parseBody(req);
    const required = ["mobile", "name", "gender", "age", "location", "education"];
    const missing = required.filter((field) => !body[field]);
    if (missing.length) return sendError(res, 400, `Missing fields: ${missing.join(", ")}`);

    const user = db.users.find((item) => item.mobile === body.mobile);
    if (!user || !user.mobileVerified) {
      return sendError(res, 403, "Verify OTP before creating a profile");
    }

    const profile = {
      id: makeId("CK"),
      userId: user.id,
      mobile: body.mobile,
      name: body.name,
      profileFor: body.profileFor || "Self",
      gender: body.gender,
      age: Number(body.age),
      location: body.location,
      education: body.education,
      job: body.job || "Not added",
      companyName: body.companyName || "",
      income: body.income || "Not disclosed",
      salaryRange: body.salaryRange || body.income || "Not disclosed",
      height: body.height || "Not specified",
      photoUrl: body.photoUrl || "",
      fitness: body.fitness || "Not specified",
      diet: body.diet || "Not specified",
      smoking: body.smoking || "Not specified",
      drinking: body.drinking || "Not specified",
      family: body.family || "Family details pending",
      about: body.about || "Profile submitted for admin review.",
      preference: body.preference || "Preference not added",
      horoscope: body.horoscope || "Optional",
      verificationStatus: "pending",
      visibilityStatus: "hidden",
      photoStatus: "pending",
      mobileVerified: true,
      createdAt: new Date().toISOString()
    };

    db.profiles.push(profile);
    writeDb(db);
    return sendJson(res, 201, { message: "Profile created and sent to admin approval", profile });
  }

  if (req.method === "POST" && pathname === "/api/interests") {
    const body = await parseBody(req);
    if (!body.fromMobile || !body.toProfileId) return sendError(res, 400, "fromMobile and toProfileId are required");
    const existing = db.interests.find((item) => item.fromMobile === body.fromMobile && item.toProfileId === body.toProfileId);
    if (existing) return sendJson(res, 200, { message: "Interest already sent", interest: existing });

    const interest = {
      id: makeId("INT"),
      fromMobile: body.fromMobile,
      toProfileId: body.toProfileId,
      message: String(body.message || "").trim().slice(0, 240),
      status: "sent",
      createdAt: new Date().toISOString()
    };
    db.interests.push(interest);
    writeDb(db);
    return sendJson(res, 201, { message: "Interest sent", interest });
  }

  if (req.method === "POST" && pathname === "/api/shortlists") {
    const body = await parseBody(req);
    if (!body.mobile || !body.profileId) return sendError(res, 400, "mobile and profileId are required");
    const profile = db.profiles.find((item) => item.id === body.profileId && item.visibilityStatus === "public");
    if (!profile) return sendError(res, 404, "Public profile not found");
    const existing = db.shortlists.find((item) => item.mobile === body.mobile && item.profileId === body.profileId);
    if (existing) return sendJson(res, 200, { message: "Profile already saved", shortlist: existing });

    const shortlist = {
      id: makeId("SAV"),
      mobile: body.mobile,
      profileId: body.profileId,
      createdAt: new Date().toISOString()
    };
    db.shortlists.push(shortlist);
    writeDb(db);
    return sendJson(res, 201, { message: "Profile saved to shortlist", shortlist });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/shortlists/")) {
    const profileId = pathname.split("/").pop();
    const mobile = url.searchParams.get("mobile");
    if (!mobile) return sendError(res, 400, "mobile is required");
    const before = db.shortlists.length;
    db.shortlists = db.shortlists.filter((item) => !(item.mobile === mobile && item.profileId === profileId));
    writeDb(db);
    return sendJson(res, 200, {
      message: before === db.shortlists.length ? "Profile was not in shortlist" : "Profile removed from shortlist"
    });
  }

  if (req.method === "POST" && pathname === "/api/blocks") {
    const body = await parseBody(req);
    if (!body.mobile || !body.profileId) return sendError(res, 400, "mobile and profileId are required");
    const profile = db.profiles.find((item) => item.id === body.profileId && item.visibilityStatus === "public");
    if (!profile) return sendError(res, 404, "Public profile not found");
    const existing = db.blocks.find((item) => item.mobile === body.mobile && item.profileId === body.profileId);
    if (existing) return sendJson(res, 200, { message: "Profile already hidden", block: existing });

    const block = {
      id: makeId("BLK"),
      mobile: body.mobile,
      profileId: body.profileId,
      createdAt: new Date().toISOString()
    };
    db.blocks.push(block);
    writeDb(db);
    return sendJson(res, 201, { message: "Profile hidden from browse", block });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/blocks/")) {
    const profileId = pathname.split("/").pop();
    const mobile = url.searchParams.get("mobile");
    if (!mobile) return sendError(res, 400, "mobile is required");
    const before = db.blocks.length;
    db.blocks = db.blocks.filter((item) => !(item.mobile === mobile && item.profileId === profileId));
    writeDb(db);
    return sendJson(res, 200, {
      message: before === db.blocks.length ? "Profile was not hidden" : "Profile restored to browse"
    });
  }

  if (req.method === "POST" && pathname === "/api/reports") {
    const body = await parseBody(req);
    if (!body.profileId || !body.reason) return sendError(res, 400, "profileId and reason are required");
    const report = {
      id: makeId("RPT"),
      profileId: body.profileId,
      reason: body.reason,
      details: body.details || "",
      status: "open",
      createdAt: new Date().toISOString()
    };
    db.reports.push(report);
    writeDb(db);
    return sendJson(res, 201, { message: "Report created for admin review", report });
  }

  if (req.method === "POST" && pathname === "/api/payments/demo-checkout") {
    const body = await parseBody(req);
    if (!body.mobile || !body.plan) return sendError(res, 400, "mobile and plan are required");
    const amount = body.plan === "family" ? 49900 : 19900;
    const payment = {
      id: makeId("PAY"),
      mobile: body.mobile,
      plan: body.plan,
      amountPaise: amount,
      status: "paid",
      createdAt: new Date().toISOString()
    };
    const subscription = {
      id: makeId("SUB"),
      mobile: body.mobile,
      plan: body.plan,
      status: "active",
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + (body.plan === "family" ? 90 : 30) * 86400000).toISOString()
    };
    db.payments.push(payment);
    db.subscriptions.push(subscription);
    writeDb(db);
    return sendJson(res, 201, { message: "Demo payment completed. Contact access unlocked.", payment, subscription });
  }

  if (req.method === "GET" && pathname === "/api/admin/dashboard") {
    if (!requireAdmin(req, db)) return sendError(res, 401, "Admin login required");
    const reviewProfiles = db.profiles.filter((item) => item.verificationStatus !== "approved").length;
    const reportsOpen = db.reports.filter((item) => item.status === "open").length;
    const publicProfiles = db.profiles.filter((item) => item.visibilityStatus === "public").length;
    const revenuePaise = db.payments.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amountPaise, 0);
    return sendJson(res, 200, {
      stats: { pendingProfiles: reviewProfiles, reportsOpen, publicProfiles, revenueRupees: revenuePaise / 100 },
      pending: db.profiles.filter((item) => item.verificationStatus !== "approved"),
      reports: db.reports
    });
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/admin/profiles/")) {
    if (!requireAdmin(req, db)) return sendError(res, 401, "Admin login required");
    const id = pathname.split("/").pop();
    const body = await parseBody(req);
    const profile = db.profiles.find((item) => item.id === id);
    if (!profile) return sendError(res, 404, "Profile not found");

    if (body.action === "approve") {
      profile.verificationStatus = "approved";
      profile.visibilityStatus = "public";
      profile.photoStatus = "approved";
    } else if (body.action === "reject") {
      profile.verificationStatus = "rejected";
      profile.visibilityStatus = "hidden";
    } else if (body.action === "request_correction") {
      profile.verificationStatus = "correction_requested";
      profile.visibilityStatus = "hidden";
    } else {
      return sendError(res, 400, "Unknown admin action");
    }

    profile.updatedAt = new Date().toISOString();
    writeDb(db);
    return sendJson(res, 200, { message: "Profile updated", profile });
  }

  return sendError(res, 404, "API route not found");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, 500, error.message || "Server error");
  }
});

ensureDatabase();
server.listen(PORT, () => {
  console.log(`ChennaiKalyanam app running at http://localhost:${PORT}`);
});
