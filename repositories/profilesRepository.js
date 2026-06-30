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

function listPublicProfiles(db, query, blockedIds = new Set()) {
  return applyProfileFilters(db.profiles, query).filter((profile) => !blockedIds.has(profile.id));
}

function findProfileById(db, profileId) {
  return db.profiles.find((profile) => profile.id === profileId) || null;
}

function findPublicProfileById(db, profileId) {
  const profile = findProfileById(db, profileId);
  return profile?.visibilityStatus === "public" ? profile : null;
}

function findProfileForUserOrMobile(db, user, mobile) {
  return db.profiles.find((profile) => {
    return (user && profile.userId === user.id) || profile.mobile === mobile;
  }) || null;
}

function findProfileForMobile(db, mobile) {
  return db.profiles.find((profile) => profile.mobile === mobile) || null;
}

function findProfileByMobileOrUserId(db, value) {
  return db.profiles.find((profile) => profile.mobile === value || profile.userId === value) || null;
}

function addProfile(db, profile) {
  db.profiles.push(profile);
  return profile;
}

function countProfilesForReview(db) {
  return db.profiles.filter((profile) => profile.verificationStatus !== "approved").length;
}

function countPublicProfiles(db) {
  return db.profiles.filter((profile) => profile.visibilityStatus === "public").length;
}

function listProfilesForReview(db) {
  return db.profiles.filter((profile) => profile.verificationStatus !== "approved");
}

module.exports = {
  addProfile,
  countProfilesForReview,
  countPublicProfiles,
  findProfileById,
  findProfileByMobileOrUserId,
  findProfileForMobile,
  findProfileForUserOrMobile,
  findPublicProfileById,
  listProfilesForReview,
  listPublicProfiles
};
