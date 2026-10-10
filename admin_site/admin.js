// Sri Devi Arts & Science College - Admin CMS Controller
(function () {
  let siteContent = null;
  let selectedUploadFile = null;
  let activeModalPhotoId = null;
  let activeGalleryScope = "campus";

  // Authentication State
  let authToken = sessionStorage.getItem("sdasc_admin_token") || localStorage.getItem("sdasc_admin_token") || "";
  let currentUser = null;
  let applicationsList = [];
  let enquiriesList = [];
  let usersList = [];

  // Department Template Editor State
  let activeEditingDeptProgId = null;
  let activeSemesterIndex = 0;
  let currentDeptSyllabus = [];

  // Admissions Filter State
  let appFilters = {
    search: "",
    status: "all",
    community: "all",
    department: "all",
  };

  const API_BASE = ""; // Relative to origin

  // Elements
  const dbStatusBadge = document.getElementById("dbStatusBadge");
  const dbStatusText = document.getElementById("dbStatusText");
  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const toastContainer = document.getElementById("toastContainer");

  // Tab buttons
  const navTabs = document.querySelectorAll(".nav-tab");
  const tabPanels = document.querySelectorAll(".tab-panel");

  // Helper for authenticated fetch
  function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (!authToken) {
      authToken = sessionStorage.getItem("sdasc_admin_token") || localStorage.getItem("sdasc_admin_token") || "";
    }
    if (authToken) {
      if (options.headers instanceof Headers) {
        options.headers.set("Authorization", `Bearer ${authToken}`);
      } else {
        options.headers["Authorization"] = `Bearer ${authToken}`;
      }
    }
    options.credentials = options.credentials || "same-origin";
    return fetch(url, options);
  }

  // Init
  async function init() {
    setupAuthHandlers();
    setupUserManagement();
    setupDepartmentEditor();
    setupTabNavigation();
    setupGalleryUploader();
    setupForms();
    setupModals();

    const isAuthenticated = await checkAuthStatus();
    if (isAuthenticated) {
      await loadInitialData();
    }
  }

  async function loadInitialData() {
    try {
      await checkDbHealth();
    } catch (e) {
      console.warn("DB health check error:", e);
    }

    const tabs = currentUser?.allowed_tabs || [];
    const promises = [];

    if (tabs.includes("content") || tabs.includes("gallery") || tabs.includes("notices") || tabs.includes("programmes") || tabs.includes("stats") || tabs.includes("dashboard")) {
      promises.push(loadContent().catch(err => console.warn("Content load error:", err)));
    }
    if (tabs.includes("applications") || tabs.includes("dashboard")) {
      promises.push(loadApplications().catch(err => console.warn("Applications load error:", err)));
    }
    if (tabs.includes("enquiries") || tabs.includes("dashboard")) {
      promises.push(loadEnquiries().catch(err => console.warn("Enquiries load error:", err)));
    }
    if (tabs.includes("users")) {
      promises.push(loadUsers().catch(err => console.warn("Users load error:", err)));
    }

    await Promise.allSettled(promises);
    renderDashboard();
  }

  // ================= ROLE-BASED ACCESS CONTROL (RBAC) =================
  function applyRolePermissions(user) {
    if (!user) return;
    
    // Determine allowed tabs
    let allowedTabs = user.allowed_tabs;
    if (!allowedTabs || !allowedTabs.length) {
      if (user.role === "Admin") allowedTabs = ["dashboard", "applications", "enquiries", "users"];
      else if (user.role === "Content Editor") allowedTabs = ["programmes", "content", "gallery", "notices", "stats"];
      else if (user.role === "Super Admin") allowedTabs = ["dashboard", "gallery", "notices", "programmes", "stats", "content", "applications", "enquiries", "users"];
      else allowedTabs = ["applications", "enquiries"]; // Sub-Admin default
    } else {
      allowedTabs = allowedTabs.filter((t) => t !== "preview");
    }

    user.allowed_tabs = allowedTabs;

    // Filter sidebar navigation buttons
    navTabs.forEach((tab) => {
      const tabName = tab.getAttribute("data-tab");
      const isAllowed = allowedTabs.includes(tabName);
      tab.classList.toggle("role-hidden", !isAllowed);
    });

    // Update navigation label for Academics tab depending on user role
    const navProgLabel = document.querySelector('.nav-tab[data-tab="programmes"] span:not(.badge)');
    if (navProgLabel) {
      if (user.role === "Content Editor" && user.department) {
        navProgLabel.textContent = "My Department Page";
      } else {
        navProgLabel.textContent = "Department Pages";
      }
    }

    // Control visibility of Super Admin actions like Reset Demo Data
    const btnReset = document.getElementById("btnResetDefaults");
    if (btnReset) {
      btnReset.style.display = (user.is_primary_admin || user.role === "Super Admin") ? "inline-flex" : "none";
    }

    // Role scope switcher (only for primary admin doomsday)
    const scopeWrap = document.getElementById("scopeSwitcherWrap");
    const scopeSelect = document.getElementById("selectRoleScope");
    if (scopeWrap && scopeSelect) {
      if (user.is_primary_admin) {
        scopeWrap.style.display = "flex";
        scopeSelect.value = user.view_scope || user.role || "Admin";
      } else {
        scopeWrap.style.display = "none";
      }
    }

    // If current active tab is not allowed, switch to user's designated primary tab
    const activeTabElem = document.querySelector(".nav-tab.active:not(.role-hidden)");
    if (!activeTabElem) {
      let defaultTab = "users";
      if (user.role === "Sub-Admin" || user.role === "Admissions Officer") defaultTab = "applications";
      else if (user.role === "Content Editor") defaultTab = "programmes";
      else if (user.role === "Super Admin") defaultTab = "dashboard";
      else defaultTab = allowedTabs[0] || "users";

      switchTab(defaultTab);
    }
  }

  // ================= TAB NAVIGATION =================
  function setupTabNavigation() {
    navTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabName = tab.getAttribute("data-tab");
        switchTab(tabName);
      });
    });

    // Role scope simulation listener (for doomsday testing)
    const selectScope = document.getElementById("selectRoleScope");
    if (selectScope) {
      selectScope.addEventListener("change", async (e) => {
        const newScope = e.target.value;
        try {
          const res = await authFetch("/api/auth/scope", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope: newScope })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            currentUser = data.user;
            updateUserSessionUI();
            showToast(`Switched view to ${data.user.role_label}`, "info");
            
            // Reload relevant section data
            const tabs = currentUser.allowed_tabs || [];
            if (tabs.includes("applications")) loadApplications();
            if (tabs.includes("enquiries")) loadEnquiries();
            if (tabs.includes("users")) loadUsers();
            if (tabs.includes("content") || tabs.includes("gallery")) loadContent();
          } else {
            showToast(data.error || "Failed to switch role view", "error");
          }
        } catch (err) {
          showToast("Error communicating with server", "error");
        }
      });
    }

    document.getElementById("btnSyncMongo")?.addEventListener("click", async () => {
      showToast("Refreshing data from MongoDB...", "info");
      await checkDbHealth();
      await loadContent();
    });

    document.getElementById("btnSaveAll")?.addEventListener("click", async () => {
      await saveHeroAndGeneralContent();
    });

    document.getElementById("btnResetDefaults")?.addEventListener("click", async () => {
      if (confirm("Reset all college site content and gallery back to initial demo defaults in MongoDB?")) {
        await resetDemoData();
      }
    });
  }

  window.switchTab = function (tabName) {
    // RBAC Security Check
    if (currentUser && currentUser.allowed_tabs && !currentUser.allowed_tabs.includes(tabName)) {
      showToast(`Access Restricted: Your assigned role (${currentUser.role_label || currentUser.role}) cannot access this section.`, "error");
      const fallbackTab = currentUser.allowed_tabs[0] || "users";
      switchTab(fallbackTab);
      return;
    }

    navTabs.forEach((t) => t.classList.toggle("active", t.getAttribute("data-tab") === tabName));
    tabPanels.forEach((p) => p.classList.toggle("active", p.id === `tab-${tabName}`));

    const titles = {
      dashboard: ["Dashboard Overview", "Central institutional metrics and overview"],
      gallery: ["Campus Gallery & Photos", "Upload and organize high-resolution event and campus images"],
      notices: ["Campus Bulletin & Notices", "Post timely academic, fest, and cultural updates on the homepage"],
      programmes: [
        currentUser?.role === "Content Editor" ? "My Department Page" : "Department Pages & Academics",
        "Customize full static course templates, semester syllabus, and department facilities"
      ],
      stats: ["Key Statistics", "Highlight institutional achievements and metrics"],
      content: ["Hero & General Content", "Customize top announcement bar, Ponneri address, and contacts"],
      applications: ["Online Admission Applications (2026–27)", "Review student candidate registrations submitted via the website"],
      enquiries: ["Public Enquiries & Messages", "Manage questions and feedback from parents, students, and recruiters"],
      users: ["User Accounts & Permissions", "Create and manage administrative credentials and sub-admin roles"],
    };

    if (titles[tabName]) {
      pageTitle.textContent = titles[tabName][0];
      pageSubtitle.textContent = titles[tabName][1];
    }

    // Toggle Save Changes button: only visible on content tab
    const btnSave = document.getElementById("btnSaveAll");
    if (btnSave) {
      btnSave.style.display = (tabName === "content") ? "inline-flex" : "none";
    }

    if (tabName === "dashboard") {
      if (siteContent) renderDashboard();
      else loadContent();
    }
    if (tabName === "programmes") {
      if (siteContent) {
        renderDepartmentEditor();
        renderProgrammes();
      } else {
        loadContent();
      }
    }
    if (tabName === "applications") loadApplications();
    if (tabName === "enquiries") loadEnquiries();
    if (tabName === "users") loadUsers();
  };

  // ================= HEALTH & CONTENT API =================
  async function checkDbHealth() {
    const dashDb = document.getElementById("dashDbStatus");
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("Health check failed");
      const data = await res.json();
      if (data.mongodb_connected) {
        if (dbStatusBadge) dbStatusBadge.className = "db-status-chip";
        if (dbStatusText) dbStatusText.textContent = "MongoDB Connected";
        if (dashDb) dashDb.textContent = "Active";
      } else {
        if (dbStatusBadge) dbStatusBadge.className = "db-status-chip offline";
        if (dbStatusText) dbStatusText.textContent = "MongoDB Offline (JSON Mode)";
        if (dashDb) dashDb.textContent = "JSON Fallback";
      }
    } catch (err) {
      if (dbStatusBadge) dbStatusBadge.className = "db-status-chip offline";
      if (dbStatusText) dbStatusText.textContent = "Server Offline (Local)";
      if (dashDb) dashDb.textContent = "Offline";
    }
  }

  async function loadContent() {
    try {
      const res = await fetch("/api/content");
      if (!res.ok) throw new Error("Could not fetch content");
      siteContent = await res.json();
      localStorage.setItem("sridevi_content", JSON.stringify(siteContent));
    } catch (err) {
      console.warn("Falling back to localStorage or seed:", err);
      const cached = localStorage.getItem("sridevi_content");
      if (cached) {
        siteContent = JSON.parse(cached);
      }
    }

    if (siteContent) {
      populateDepartmentDropdowns();
      renderDashboard();
      renderGallery();
      renderNotices();
      renderDepartmentEditor();
      renderProgrammes();
      renderStats();
      populateContentFields();
    }
  }

  // ================= RENDER METHODS =================
  function renderDashboard() {
    if (!siteContent) return;
    const photos = siteContent.photos || [];
    const notices = siteContent.notices || [];
    const progs = siteContent.programmes || [];

    const elPhotos = document.getElementById("dashTotalPhotos");
    const elNotices = document.getElementById("dashTotalNotices");
    const elProgs = document.getElementById("dashTotalProgrammes");
    const elApps = document.getElementById("dashTotalApps");
    const elEnqs = document.getElementById("dashTotalEnquiries");

    if (elPhotos) elPhotos.textContent = photos.length;
    if (elNotices) elNotices.textContent = notices.length;
    if (elProgs) elProgs.textContent = progs.length;
    if (elApps) elApps.textContent = applicationsList ? applicationsList.length : 0;
    if (elEnqs) elEnqs.textContent = enquiriesList ? enquiriesList.length : 0;

    const bPhotos = document.getElementById("badgePhotoCount");
    const bNotices = document.getElementById("badgeNoticeCount");
    const bProgs = document.getElementById("badgeProgCount");
    const bApps = document.getElementById("badgeAppCount");
    const bEnqs = document.getElementById("badgeEnqCount");
    const bUsers = document.getElementById("badgeUserCount");

    if (bPhotos) bPhotos.textContent = photos.length;
    if (bNotices) bNotices.textContent = notices.length;
    if (bProgs) bProgs.textContent = progs.length;
    if (bApps && applicationsList) bApps.textContent = applicationsList.length;
    if (bEnqs && enquiriesList) bEnqs.textContent = enquiriesList.length;
    if (bUsers && usersList) bUsers.textContent = usersList.length;

    // Mini Gallery Strip
    const strip = document.getElementById("dashGalleryStrip");
    if (strip) {
      strip.innerHTML = photos
        .slice(0, 6)
        .map(
          (p) => `
          <div class="mini-thumb" onclick="openPhotoModal('${p.id}')">
            <img src="/${p.src.replace(/^\//, '')}" alt="${escapeHtml(p.label)}" loading="lazy" />
            <span>${escapeHtml(p.label)}</span>
          </div>`,
        )
        .join("");
    }
  }

  function renderGallery() {
    const scopeSelect = document.getElementById("selectGalleryScope");
    const progs = siteContent?.programmes || [];

    // Check if user is Content Editor assigned to a specific department
    const isContributor = currentUser && currentUser.role === "Content Editor";
    const userDept = (currentUser?.department || "").toLowerCase().trim();

    if (scopeSelect) {
      let matchedProgId = null;
      if (isContributor && userDept) {
        const found = progs.find((p) => (p.department || "").toLowerCase() === userDept || (p.title || "").toLowerCase().includes(userDept));
        if (found) matchedProgId = found.id;
      }

      // If contributor, force scope to their department
      if (matchedProgId && activeGalleryScope === "campus") {
        activeGalleryScope = matchedProgId;
      }

      // Populate options
      let optionsHtml = "";
      if (!isContributor) {
        optionsHtml += `<option value="campus" ${activeGalleryScope === "campus" ? "selected" : ""}>🏫 Main College Homepage (Campus-Wide)</option>`;
      }
      if (progs.length) {
        optionsHtml += `<optgroup label="Department Galleries">`;
        progs.forEach((p) => {
          if (isContributor && matchedProgId && p.id !== matchedProgId) return;
          const label = p.department ? `${p.department} (${p.title})` : p.title;
          optionsHtml += `<option value="${escapeHtml(p.id)}" ${activeGalleryScope === p.id ? "selected" : ""}>🏛️ ${escapeHtml(label)}</option>`;
        });
        optionsHtml += `</optgroup>`;
      }
      scopeSelect.innerHTML = optionsHtml;

      if (!scopeSelect.dataset.listenerAttached) {
        scopeSelect.dataset.listenerAttached = "true";
        scopeSelect.addEventListener("change", (e) => {
          activeGalleryScope = e.target.value;
          renderGallery();
        });
      }
    }

    let photos = [];
    let scopeTitle = "Main College Homepage Gallery (Campus-Wide)";
    let scopeSubtitle = "These photos appear exclusively on the college homepage photo mosaic (/index.html). Department pages have separate galleries.";
    let uploadHeading = "Upload Image to Main College Homepage";
    let uploadDesc = "Photos uploaded here appear exclusively on the main college homepage photo mosaic (/index.html).";

    if (activeGalleryScope === "campus") {
      photos = siteContent?.photos || [];
    } else {
      const targetProg = progs.find((p) => p.id === activeGalleryScope);
      if (targetProg) {
        photos = targetProg.gallery || [];
        const deptName = targetProg.department || targetProg.title;
        scopeTitle = `${deptName} Visual Gallery`;
        scopeSubtitle = `These photos appear exclusively on the ${targetProg.title} department page (/course.html?id=${targetProg.id}). Homepage photos are unaffected.`;
        uploadHeading = `Upload Image to ${deptName} Gallery`;
        uploadDesc = `Photos uploaded here are stored directly inside this department's gallery.`;
      } else {
        photos = siteContent?.photos || [];
      }
    }

    // Update banner & headings
    const titleEl = document.getElementById("galleryScopeTitle");
    const subEl = document.getElementById("galleryScopeSubtitle");
    const upHeadEl = document.getElementById("galleryUploadHeading");
    const upDescEl = document.getElementById("galleryUploadDesc");
    const countLabel = document.getElementById("galleryCountLabel");

    if (titleEl) titleEl.textContent = scopeTitle;
    if (subEl) subEl.textContent = scopeSubtitle;
    if (upHeadEl) upHeadEl.textContent = uploadHeading;
    if (upDescEl) upDescEl.textContent = uploadDesc;
    if (countLabel) countLabel.textContent = photos.length;

    const grid = document.getElementById("galleryGrid");
    if (!grid) return;

    const searchTerm = (document.getElementById("gallerySearchInput")?.value || "").toLowerCase();
    const filtered = photos.filter((p) => (p.label || "").toLowerCase().includes(searchTerm));

    if (!filtered.length) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
        No photos found in ${escapeHtml(scopeTitle)}. Select an image file above to add images.
      </div>`;
      return;
    }

    grid.innerHTML = filtered
      .map(
        (p) => `
        <div class="photo-card" data-id="${p.id}">
          <div class="photo-card-img-wrap" onclick="openPhotoModal('${p.id}')">
            <img src="/${p.src.replace(/^\//, '')}" alt="${escapeHtml(p.label)}" loading="lazy" />
          </div>
          <div class="photo-card-body">
            <span class="photo-caption" title="${escapeHtml(p.label)}">${escapeHtml(p.label)}</span>
            <div class="photo-card-actions">
              <span class="photo-badge">${p.src.startsWith('uploads/') ? 'Uploaded' : (activeGalleryScope === 'campus' ? 'Campus' : 'Dept')}</span>
              <button type="button" class="btn-icon-danger" title="Remove Photo" onclick="deletePhoto('${p.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        </div>`,
      )
      .join("");
  }

  function renderNotices() {
    const notices = siteContent.notices || [];
    const list = document.getElementById("noticesList");
    if (!notices.length) {
      list.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">No active bulletin notices.</div>`;
      return;
    }

    list.innerHTML = notices
      .map(
        (n) => `
        <div class="notice-item" data-id="${n.id}">
          <div class="notice-date-badge">
            <strong>${escapeHtml(n.day)}</strong>
            <small>${escapeHtml(n.month)}</small>
          </div>
          <div class="notice-content">
            <h5>${escapeHtml(n.title)}</h5>
            <span>${escapeHtml(n.link || '#contact')}</span>
          </div>
          <button type="button" class="btn-icon-danger" title="Remove notice" onclick="deleteNotice('${n.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>`,
      )
      .join("");
  }

  function renderProgrammes() {
    const progs = siteContent.programmes || [];
    const list = document.getElementById("programmesList");
    const progNumberInput = document.getElementById("progNumber");
    if (progNumberInput) {
      progNumberInput.value = `${String(progs.length + 1).padStart(2, "0")} / SCIENCE`;
    }

    if (!progs.length) {
      list.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">No academic programmes defined.</div>`;
      return;
    }

    list.innerHTML = progs
      .map(
        (p) => `
        <div class="prog-item" data-id="${p.id}">
          <div class="prog-info">
            <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px; flex-wrap: wrap;">
              <span class="badge">${escapeHtml(p.number || 'COURSE')}</span>
              <span class="badge-pill purple">${escapeHtml(p.category || 'General')}</span>
              <span style="font-size: 11px; color: var(--muted);">${escapeHtml(p.duration || '3 Yrs')}</span>
            </div>
            <h4>${escapeHtml(p.title)}</h4>
            <small style="color: var(--muted); display: block; margin-bottom: 4px;">${escapeHtml(p.department || '')}</small>
            <p>${escapeHtml(p.desc)}</p>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end; justify-content: flex-start;">
            <a href="/course.html?id=${encodeURIComponent(p.id)}" target="_blank" class="btn-secondary text-xs" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:600;" title="View Live Course Full Page">🌐 View Full Page ↗</a>
            <button type="button" class="btn-action-edit" title="Edit department page template" onclick="openEditProgModal('${p.id}')">✏️ Edit</button>
            <button type="button" class="btn-icon-danger" title="Remove programme" onclick="deleteProgramme('${p.id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>`,
      )
      .join("");
  }

  // ================= DEPARTMENT PAGES & TEMPLATE CONTENT EDITOR =================
  function enrichProgrammeWithSmartDefaults(c) {
    const copy = { ...c };
    const title = (copy.title || "").toLowerCase();
    const dept = (copy.department || "").toLowerCase();
    const cat = (copy.category || "").toLowerCase();
    const isPG = cat.includes("postgraduate") || title.includes("m.a") || title.includes("m.sc") || title.includes("m.com") || (copy.duration || "").includes("2 Year");
    const isCS = cat.includes("computer") || dept.includes("computer") || title.includes("bca") || title.includes("computer");
    const isAI = title.includes("ai") || title.includes("artificial intelligence");
    const isComm = cat.includes("commerce") || dept.includes("commerce") || title.includes("b.com");
    const isMgmt = cat.includes("management") || title.includes("bba") || dept.includes("business");

    if (!copy.degree_level) {
      copy.degree_level = isPG ? "Postgraduate (PG)" : "Undergraduate (UG)";
    }
    if (!copy.affiliation) {
      copy.affiliation = "Affiliated to University of Madras";
    }
    if (!copy.medium) {
      copy.medium = "English & Tamil Mentoring";
    }
    if (!copy.eligibility) {
      if (isPG) {
        copy.eligibility = "Bachelor's Degree in the relevant or allied discipline from the University of Madras or any recognized university with minimum passing marks.";
      } else if (isCS || isAI) {
        copy.eligibility = "Pass in Higher Secondary (+2) Examination conducted by the Government of Tamil Nadu with Mathematics / Computer Science / Statistics or equivalent.";
      } else if (isComm) {
        copy.eligibility = "Pass in Higher Secondary (+2) Examination with Commerce, Accountancy, and Mathematics or Economics or equivalent.";
      } else if (isMgmt) {
        copy.eligibility = "Pass in Higher Secondary (+2) Examination in any stream (Science, Commerce, or Humanities) from a recognized Board.";
      } else {
        copy.eligibility = "Pass in Higher Secondary (+2) Examination conducted by the Government of Tamil Nadu or equivalent recognized board examination.";
      }
    }

    if (!copy.overview) {
      copy.overview = copy.desc || `The ${copy.title} programme at Sridevi Arts and Science College is designed in affiliation with the historic University of Madras. With experienced faculty mentors, contemporary laboratories, and continuous placement preparation, the curriculum empowers students with analytical rigor and industry-aligned competence for purposeful career trajectories.`;
    }

    if (!copy.highlights || !copy.highlights.length) {
      copy.highlights = [
        "Rigorous University of Madras accredited curriculum updated with latest academic benchmarks.",
        "Hands-on practical training in specialized department laboratories and modern computing centers.",
        "Student clubs, department seminars, industry guest lectures, and inter-collegiate symposiums.",
        "100% pre-placement coaching in quantitative aptitude, soft skills, and corporate interview readiness.",
        "Eligible for Tamil Nadu Postmatric SC/ST government scholarships and institutional merit fee concessions."
      ];
    }

    if (!copy.syllabus || !copy.syllabus.length) {
      if (isPG) {
        copy.syllabus = [
          { semester: "Semester I", subjects: [`Advanced Foundations in ${copy.title} - Core I`, "Research Methodologies & Analysis", "Specialized Core Discipline - Paper II", "Elective Specialization Course I", "Soft Skills & Academic Writing"] },
          { semester: "Semester II", subjects: ["Theoretical Frameworks & Advanced Principles", "Domain Application & Applied Studies", "Interdisciplinary Elective Paper", "Department Practical & Seminar Work", "Human Rights & Values"] },
          { semester: "Semester III", subjects: ["Contemporary Developments & Current Issues", "Advanced Statistical or Quantitative Tools", "Specialization Paper II", "Internship Training / Field Study Report", "Project Proposal & Preliminary Defense"] },
          { semester: "Semester IV", subjects: ["Strategic Domain Perspectives", "Master's Research Dissertation Work", "Comprehensive Viva Voce Examination", "Professional Ethics & Publication Seminar"] }
        ];
      } else {
        copy.syllabus = [
          { semester: "Semester I", subjects: [`Core Foundations of ${copy.title} - Part I`, "Allied Course I & Analytical Methods", "Foundation Language (Tamil / Hindi)", "Communicative English & Grammar", "Practical Laboratory / Workshop Session"] },
          { semester: "Semester II", subjects: [`Core Principles of ${copy.title} - Part II`, "Allied Course II & Quantitative Techniques", "Foundation Language - Part II", "General English for Professional Careers", "Value Education & Environmental Awareness"] },
          { semester: "Semester III", subjects: ["Intermediate Core Course - Part III", "Applied Principles & Case Studies", "Allied Specialized Discipline Paper", "Department Practical Lab / Project Phase I", "Soft Skills & Personality Development"] },
          { semester: "Semester IV", subjects: ["Advanced Subject Modules - Part IV", "Regulatory Frameworks & Industry Applications", "Skill-Based Elective Paper I", "Practical Laboratory / Field Study", "Environmental Studies & Sustainability"] },
          { semester: "Semester V", subjects: ["Specialized Elective Concentration I", "Advanced Core Course - Part V", "Skill-Based Elective Paper II", "Mini-Project & Case Presentation", "Pre-Placement Technical Bootcamp"] },
          { semester: "Semester VI", subjects: ["Contemporary Trends & Modern Applications", "Specialized Elective Concentration II", "Entrepreneurship & Professional Ethics", "Major Capstone Project Work", "Comprehensive Project Viva Voce"] }
        ];
      }
    }

    if (!copy.career_prospects || !copy.career_prospects.length) {
      if (isCS || isAI) {
        copy.career_prospects = ["Software Development Engineer (SDE)", "Data Analyst & Visualization Associate", "Web Engineer & Cloud Trainee", "Systems Analyst & Technical Support", "IT Consultant in Corporate Hubs"];
      } else if (isComm || isMgmt) {
        copy.career_prospects = ["Financial & Business Analyst", "Corporate Operations Executive", "Taxation & Audit Associate", "Banking & Relationship Manager", "Enterprise Team Lead & Entrepreneur"];
      } else {
        copy.career_prospects = ["Professional Associate in Corporate & Public Sectors", "Content Specialist & Media Associate", "Civil Services & State PSC Officer", "Educational Trainer & Language Consultant", "Higher Studies & Academic Research Fellow"];
      }
    }

    if (!copy.higher_studies || !copy.higher_studies.length) {
      copy.higher_studies = isPG
        ? ["Ph.D Research Fellowship", "UGC-NET / SET Lectureship", "Post-Doctoral Studies"]
        : ["Master's Degree (M.Sc / M.Com / M.A / MCA)", "Master of Business Administration (MBA)", "Professional Certifications & Public Examinations"];
    }

    if (!copy.facilities || !copy.facilities.length) {
      copy.facilities = [
        "Department High-Performance Computing & Software Lab",
        "Central Digital Reference Library with IEEE & Delnet E-Resources",
        "Interactive Smart AV Classrooms with High-Speed Campus Wi-Fi",
        "Dedicated Career Placement & Training Cell with Corporate Interview Cabins"
      ];
    }

    if (!copy.gallery || !Array.isArray(copy.gallery)) {
      copy.gallery = [];
    }

    return copy;
  }

  function populateDepartmentDropdowns() {
    const progs = siteContent?.programmes || [];
    const depts = [];
    progs.forEach((p) => {
      const d = (p.department || "").trim();
      if (d && !depts.includes(d)) depts.push(d);
    });
    if (!depts.length) {
      depts.push("Department of Computer Science", "Department of Commerce", "Department of Computer Applications", "Department of Mathematics");
    }

    // Populate #newDepartment (Create User Modal)
    const newDeptSelect = document.getElementById("newDepartment");
    if (newDeptSelect) {
      const prev = newDeptSelect.value;
      newDeptSelect.innerHTML = `<option value="">-- Choose Candidate Department --</option>` +
        depts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
      if (prev && depts.includes(prev)) newDeptSelect.value = prev;
      else if (depts.length) newDeptSelect.value = depts[0];
    }

    // Populate #editDepartment (Edit User Modal)
    const editDeptSelect = document.getElementById("editDepartment");
    if (editDeptSelect) {
      const prev = editDeptSelect.value;
      editDeptSelect.innerHTML = `<option value="">-- Choose Candidate Department --</option>` +
        depts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
      if (prev) editDeptSelect.value = prev;
    }

    // Populate #selectActiveDept (Top bar in Academics tab)
    const activeDeptSelect = document.getElementById("selectActiveDept");
    if (activeDeptSelect) {
      const prev = activeDeptSelect.value;
      activeDeptSelect.innerHTML = progs.map((p) => {
        const label = p.department ? `${p.department} (${p.title})` : p.title;
        return `<option value="${escapeHtml(p.id)}">${escapeHtml(label)}</option>`;
      }).join("");
      if (prev && progs.some((p) => p.id === prev)) {
        activeDeptSelect.value = prev;
      }
    }
  }

  function renderDynamicList(containerId, items, placeholder) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = (items && items.length)
      ? items.map((item, idx) => `
        <div class="dynamic-item-row" data-index="${idx}">
          <span class="drag-handle" style="cursor: grab; color: var(--muted); user-select: none;">☰</span>
          <input type="text" class="form-control list-input" value="${escapeHtml(item)}" placeholder="${escapeHtml(placeholder)}" style="flex: 1; padding: 7px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: 6px;" />
          <button type="button" class="btn-del-item" title="Remove item" style="background: none; border: none; color: #ef4444; font-size: 18px; cursor: pointer; padding: 0 6px;">&times;</button>
        </div>
      `).join("")
      : `<div class="empty-list-note" style="color: var(--muted); font-size: 12px; font-style: italic; padding: 6px 0;">No items added yet. Click "+ Add" above to add.</div>`;

    container.querySelectorAll(".btn-del-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.closest(".dynamic-item-row")?.remove();
        if (!container.querySelectorAll(".dynamic-item-row").length) {
          container.innerHTML = `<div class="empty-list-note" style="color: var(--muted); font-size: 12px; font-style: italic; padding: 6px 0;">No items added yet. Click "+ Add" above to add.</div>`;
        }
      });
    });
  }

  function addDynamicListItem(containerId, value = "", placeholder = "") {
    const container = document.getElementById(containerId);
    if (!container) return;
    const emptyNote = container.querySelector(".empty-list-note");
    if (emptyNote) emptyNote.remove();

    const row = document.createElement("div");
    row.className = "dynamic-item-row";
    row.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 8px;";
    row.innerHTML = `
      <span class="drag-handle" style="cursor: grab; color: var(--muted); user-select: none;">☰</span>
      <input type="text" class="form-control list-input" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" style="flex: 1; padding: 7px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: 6px;" />
      <button type="button" class="btn-del-item" title="Remove item" style="background: none; border: none; color: #ef4444; font-size: 18px; cursor: pointer; padding: 0 6px;">&times;</button>
    `;

    row.querySelector(".btn-del-item").addEventListener("click", () => {
      row.remove();
      if (!container.querySelectorAll(".dynamic-item-row").length) {
        container.innerHTML = `<div class="empty-list-note" style="color: var(--muted); font-size: 12px; font-style: italic; padding: 6px 0;">No items added yet. Click "+ Add" above to add.</div>`;
      }
    });

    container.appendChild(row);
    const input = row.querySelector(".list-input");
    if (input) input.focus();
  }

  function collectDynamicListValues(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll(".list-input"))
      .map((el) => el.value.trim())
      .filter(Boolean);
  }

  function renderSemesterTabs() {
    const bar = document.getElementById("deptSemTabsBar");
    if (!bar) return;
    if (!currentDeptSyllabus || !currentDeptSyllabus.length) {
      bar.innerHTML = "";
      return;
    }

    bar.innerHTML = currentDeptSyllabus.map((sem, idx) => `
      <button type="button" class="sem-pill-btn ${idx === activeSemesterIndex ? 'active' : ''}" data-idx="${idx}">
        ${escapeHtml(sem.semester || `Semester ${idx + 1}`)}
      </button>
    `).join("");

    bar.querySelectorAll(".sem-pill-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        syncCurrentSemesterSubjects();
        activeSemesterIndex = parseInt(btn.getAttribute("data-idx"), 10) || 0;
        renderSemesterTabs();
        renderCurrentSemesterSubjects();
      });
    });
  }

  function renderCurrentSemesterSubjects() {
    const sem = currentDeptSyllabus[activeSemesterIndex] || { semester: "Semester I", subjects: [] };
    const titleEl = document.getElementById("activeSemesterTitle");
    if (titleEl) {
      titleEl.textContent = `${sem.semester || `Semester ${activeSemesterIndex + 1}`} — Core Papers & Subjects (${(sem.subjects || []).length})`;
    }
    renderDynamicList("activeSemSubjectsList", sem.subjects || [], "e.g. Core Paper: Data Structures & Algorithms");
  }

  function syncCurrentSemesterSubjects() {
    if (!currentDeptSyllabus || !currentDeptSyllabus[activeSemesterIndex]) return;
    currentDeptSyllabus[activeSemesterIndex].subjects = collectDynamicListValues("activeSemSubjectsList");
  }

  function renderDeptGalleryGrid(gallery) {
    const grid = document.getElementById("deptGalleryGrid");
    if (!grid) return;
    if (!gallery || !gallery.length) {
      grid.innerHTML = `<div class="dept-gallery-empty-state">
        <p style="margin: 0; font-size: 13px; font-weight: 600; color: var(--navy);">No photos added to this department gallery yet.</p>
        <span style="font-size: 11.5px; color: var(--muted); margin-top: 4px; display: block;">Use "Upload Image to Department" above or click "+ Add Image URL" to add laboratory and departmental facilities.</span>
      </div>`;
      return;
    }

    grid.innerHTML = gallery.map((item, idx) => `
      <div class="dept-gallery-card" data-idx="${idx}" data-id="${escapeHtml(item.id || '')}">
        <div class="dept-gallery-card-thumb">
          <img src="/${(item.src || '').replace(/^\//, '')}" alt="${escapeHtml(item.label || '')}" onerror="this.src='/assets/sdasc/campus/112226_1625242314.jpeg'" />
          <span class="dept-gallery-card-thumb-badge">${(item.src || '').startsWith('uploads/') ? 'Uploaded' : 'Facility Photo'}</span>
        </div>
        <div class="dept-gallery-card-body">
          <div>
            <label>Caption / Title</label>
            <input type="text" class="dept-photo-label-input" value="${escapeHtml(item.label || '')}" placeholder="e.g. AI & Robotics Computing Lab" />
          </div>
          <div>
            <label>Image Source Path</label>
            <input type="text" class="dept-photo-src-input" value="${escapeHtml(item.src || '')}" placeholder="uploads/... or assets/..." />
          </div>
          <div class="dept-gallery-card-actions">
            <span style="font-size: 10px; color: var(--muted);">${escapeHtml(item.id || `dept-photo-${idx+1}`)}</span>
            <button type="button" class="btn-del-photo" data-idx="${idx}" title="Remove photo from this department">
              🗑 Remove
            </button>
          </div>
        </div>
      </div>
    `).join("");

    grid.querySelectorAll(".btn-del-photo").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.closest(".dept-gallery-card")?.remove();
        if (!grid.querySelectorAll(".dept-gallery-card").length) {
          renderDeptGalleryGrid([]);
        }
      });
    });

    grid.querySelectorAll(".dept-photo-src-input").forEach((inp) => {
      inp.addEventListener("input", (e) => {
        const card = e.target.closest(".dept-gallery-card");
        const img = card?.querySelector(".dept-gallery-card-thumb img");
        if (img) img.src = "/" + e.target.value.trim().replace(/^\//, "");
      });
    });
  }

  function collectDeptGalleryPhotos() {
    const grid = document.getElementById("deptGalleryGrid");
    if (!grid) return [];
    const cards = grid.querySelectorAll(".dept-gallery-card");
    const result = [];
    cards.forEach((card, idx) => {
      const src = card.querySelector(".dept-photo-src-input")?.value.trim() || "";
      const label = card.querySelector(".dept-photo-label-input")?.value.trim() || `Department Photo ${idx + 1}`;
      const id = card.getAttribute("data-id") || `dept-photo-${Date.now()}-${idx}`;
      if (src) {
        result.push({ id, src, label });
      }
    });
    return result;
  }

  function loadDeptPageEditor(progId) {
    const progs = siteContent?.programmes || [];
    const p = progs.find((item) => item.id === progId) || progs[0];
    if (!p) return;

    activeEditingDeptProgId = p.id;
    const enriched = enrichProgrammeWithSmartDefaults(p);

    const selectDept = document.getElementById("selectActiveDept");
    if (selectDept && selectDept.value !== p.id) {
      selectDept.value = p.id;
    }

    const liveUrl = `/course.html?id=${encodeURIComponent(p.id)}`;
    const linkTop = document.getElementById("btnLiveDeptPageTop");
    const linkBottom = document.getElementById("btnLiveDeptPageBottom");
    if (linkTop) linkTop.href = liveUrl;
    if (linkBottom) linkBottom.href = liveUrl;

    setVal("deptProgId", p.id);
    setVal("deptProgTitle", enriched.title || "");
    setVal("deptProgName", enriched.department || "");
    setVal("deptProgNumber", enriched.number || "");
    setVal("deptProgCategory", enriched.category || "Computer Science");
    setVal("deptProgDegreeLevel", enriched.degree_level || "Undergraduate (UG)");
    setVal("deptProgDuration", enriched.duration || "3 Years (UG)");
    setVal("deptProgAffiliation", enriched.affiliation || "Affiliated to University of Madras");
    setVal("deptProgMedium", enriched.medium || "English & Tamil Mentoring");
    setVal("deptProgImage", enriched.image || "");
    setVal("deptProgLink", enriched.link || "#apply-modal");

    setVal("deptProgDesc", enriched.desc || "");
    setVal("deptProgOverview", enriched.overview || "");
    setVal("deptProgEligibility", enriched.eligibility || "");

    renderDynamicList("deptHighlightsList", enriched.highlights || [], "e.g. State-of-the-art computer labs with 100+ high-end systems");
    renderDynamicList("deptFacilitiesList", enriched.facilities || [], "e.g. Advanced AI & Cloud Computing Lab");
    renderDynamicList("deptCareersList", enriched.career_prospects || [], "e.g. Software Development Engineer (SDE)");
    renderDynamicList("deptHigherStudiesList", enriched.higher_studies || [], "e.g. M.Sc Computer Science / MCA");

    currentDeptSyllabus = JSON.parse(JSON.stringify(enriched.syllabus || []));
    activeSemesterIndex = 0;
    renderSemesterTabs();
    renderCurrentSemesterSubjects();
    renderDeptGalleryGrid(enriched.gallery || []);
  }

  function renderDepartmentEditor() {
    if (!siteContent) return;
    const progs = siteContent.programmes || [];
    if (!progs.length) return;

    populateDepartmentDropdowns();

    const isContributor = currentUser && currentUser.role === "Content Editor";
    const userDept = currentUser?.department;

    const banner = document.getElementById("deptContributorBanner");
    const bannerDeptName = document.getElementById("bannerDeptName");
    const deptPicker = document.getElementById("deptPickerWrapper");
    const catalogueWrap = document.getElementById("superAdminCatalogueWrap");
    const heading = document.getElementById("deptEditorHeading");
    const subheading = document.getElementById("deptEditorSubheading");

    let targetProg = null;
    if (isContributor && userDept) {
      targetProg = progs.find((p) => p.department && p.department.toLowerCase() === userDept.toLowerCase());
      if (!targetProg) {
        targetProg = progs.find((p) => p.department && userDept.toLowerCase().includes(p.department.toLowerCase()));
      }
    }

    if (!targetProg) {
      if (activeEditingDeptProgId) {
        targetProg = progs.find((p) => p.id === activeEditingDeptProgId);
      }
    }
    if (!targetProg) targetProg = progs[0];

    if (isContributor) {
      if (banner) banner.style.display = "flex";
      if (bannerDeptName) bannerDeptName.textContent = userDept || targetProg.department || "Your Department";
      if (deptPicker) deptPicker.style.display = "none";
      if (catalogueWrap) catalogueWrap.style.display = "none";
      if (heading) heading.textContent = `${userDept || targetProg.department || 'Department'} — Contributor Editor`;
      if (subheading) subheading.textContent = "You are assigned as the contributor for this department page. All content and syllabus changes sync live to the static website.";
    } else {
      if (banner) banner.style.display = "none";
      if (deptPicker) deptPicker.style.display = "flex";
      if (catalogueWrap) catalogueWrap.style.display = "block";
      if (heading) heading.textContent = "Department Page Content Editor";
      if (subheading) subheading.textContent = "Customize the live static template for this department. All syllabus, eligibility, and media sync instantly to the public course page.";
    }

    loadDeptPageEditor(targetProg.id);
  }

  async function saveDepartmentPageTemplate(e) {
    if (e) e.preventDefault();
    const progId = document.getElementById("deptProgId")?.value;
    if (!progId) {
      showToast("No department programme selected", "error");
      return;
    }

    syncCurrentSemesterSubjects();

    const title = document.getElementById("deptProgTitle")?.value.trim() || "";
    const department = document.getElementById("deptProgName")?.value.trim() || title;
    const number = document.getElementById("deptProgNumber")?.value.trim() || "";
    const category = document.getElementById("deptProgCategory")?.value || "Computer Science";
    const degree_level = document.getElementById("deptProgDegreeLevel")?.value || "Undergraduate (UG)";
    const duration = document.getElementById("deptProgDuration")?.value.trim() || "3 Years (UG)";
    const affiliation = document.getElementById("deptProgAffiliation")?.value.trim() || "Affiliated to University of Madras";
    const medium = document.getElementById("deptProgMedium")?.value.trim() || "English & Tamil Mentoring";
    const image = document.getElementById("deptProgImage")?.value.trim() || "";
    const link = document.getElementById("deptProgLink")?.value.trim() || "#apply-modal";
    const desc = document.getElementById("deptProgDesc")?.value.trim() || "";
    const overview = document.getElementById("deptProgOverview")?.value.trim() || "";
    const eligibility = document.getElementById("deptProgEligibility")?.value.trim() || "";

    const highlights = collectDynamicListValues("deptHighlightsList");
    const facilities = collectDynamicListValues("deptFacilitiesList");
    const career_prospects = collectDynamicListValues("deptCareersList");
    const higher_studies = collectDynamicListValues("deptHigherStudiesList");
    const syllabus = currentDeptSyllabus;
    const gallery = collectDeptGalleryPhotos();

    const payload = {
      title,
      department,
      number,
      category,
      degree_level,
      duration,
      affiliation,
      medium,
      image,
      link,
      desc,
      overview,
      eligibility,
      highlights,
      facilities,
      career_prospects,
      higher_studies,
      syllabus,
      gallery
    };

    const saveBtn = document.getElementById("btnSaveDeptPage");
    const feedback = document.getElementById("deptSaveFeedback");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span>⏳ Saving Department Page...</span>`;
    }
    if (feedback) feedback.textContent = "";

    try {
      const res = await authFetch(`/api/programmes/${encodeURIComponent(progId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Department page '${title}' saved successfully!`, "success");
        if (feedback) {
          feedback.innerHTML = `<span style="color: #166534; font-weight: 600;">✓ Saved to live site (${new Date().toLocaleTimeString()})</span>`;
        }
        await loadContent();
      } else {
        showToast(data.error || "Failed to save department page template", "error");
        if (feedback) feedback.textContent = data.error || "Save failed";
      }
    } catch (err) {
      showToast("Server error: " + err.message, "error");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<span>💾 Save Department Page</span>`;
      }
    }
  }

  function setupDepartmentEditor() {
    document.getElementById("selectActiveDept")?.addEventListener("change", (e) => {
      loadDeptPageEditor(e.target.value);
    });

    document.getElementById("btnAddHighlightItem")?.addEventListener("click", () => {
      addDynamicListItem("deptHighlightsList", "", "e.g. Modern computing laboratory with high-speed internet");
    });

    document.getElementById("btnAddFacilityItem")?.addEventListener("click", () => {
      addDynamicListItem("deptFacilitiesList", "", "e.g. Specialized Computer Vision & AI Research Lab");
    });

    document.getElementById("btnAddCareerItem")?.addEventListener("click", () => {
      addDynamicListItem("deptCareersList", "", "e.g. Software Development Engineer (SDE)");
    });

    document.getElementById("btnAddHigherStudyItem")?.addEventListener("click", () => {
      addDynamicListItem("deptHigherStudiesList", "", "e.g. M.Sc / MCA / M.Phil Research");
    });

    document.getElementById("btnAddSubjectItem")?.addEventListener("click", () => {
      addDynamicListItem("activeSemSubjectsList", "", "e.g. Core Paper: Data Structures & Algorithms");
    });

    document.getElementById("btnResetSyllabusTemplate")?.addEventListener("click", () => {
      const progs = siteContent?.programmes || [];
      const p = progs.find((item) => item.id === activeEditingDeptProgId) || progs[0];
      if (p) {
        const dummy = { ...p, syllabus: [] };
        const enriched = enrichProgrammeWithSmartDefaults(dummy);
        currentDeptSyllabus = JSON.parse(JSON.stringify(enriched.syllabus));
        activeSemesterIndex = 0;
        renderSemesterTabs();
        renderCurrentSemesterSubjects();
        showToast("Curriculum reset to standard semester modules", "info");
      }
    });

    document.getElementById("btnTriggerDeptUpload")?.addEventListener("click", () => {
      document.getElementById("deptGalleryFileInput")?.click();
    });

    document.getElementById("deptGalleryFileInput")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        showToast("Please select a valid image file", "error");
        return;
      }
      if (!activeEditingDeptProgId) {
        showToast("Please select a department first", "error");
        return;
      }

      const progressWrap = document.getElementById("deptUploadProgressWrap");
      const progressText = document.getElementById("deptUploadProgressText");
      if (progressWrap) progressWrap.style.display = "flex";
      if (progressText) progressText.textContent = `Uploading ${file.name} to department gallery...`;

      const caption = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("label", caption);
      formData.append("section", "photos");
      formData.append("prog_id", activeEditingDeptProgId);

      try {
        const res = await authFetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast("Photo uploaded directly to department gallery!", "success");
          const currentList = collectDeptGalleryPhotos();
          currentList.unshift({
            id: data.photo?.id || `dept-photo-${Date.now()}`,
            src: data.photo?.src || data.url || "",
            label: data.photo?.label || caption,
          });
          renderDeptGalleryGrid(currentList);
          await loadContent();
        } else {
          showToast(data.error || "Upload failed", "error");
        }
      } catch (err) {
        showToast("Upload error: " + err.message, "error");
      } finally {
        if (progressWrap) progressWrap.style.display = "none";
        e.target.value = "";
      }
    });

    document.getElementById("btnAddDeptPhotoItem")?.addEventListener("click", () => {
      const currentList = collectDeptGalleryPhotos();
      currentList.push({
        id: `dept-photo-${Date.now()}`,
        src: "assets/sdasc/campus/112226_1625242314.jpeg",
        label: "Department Facility / Lab",
      });
      renderDeptGalleryGrid(currentList);
      const grid = document.getElementById("deptGalleryGrid");
      const lastInput = grid?.querySelector(".dept-gallery-card:last-child .dept-photo-label-input");
      if (lastInput) lastInput.focus();
    });

    document.getElementById("formDeptTemplateEditor")?.addEventListener("submit", saveDepartmentPageTemplate);

    // Modal Add Programme
    const btnOpenAdd = document.getElementById("btnOpenAddProgModal");
    const modalAdd = document.getElementById("modalAddProg");
    const btnCloseAdd = document.getElementById("btnCloseAddProgModal");
    const btnCancelAdd = document.getElementById("btnCancelAddProg");

    function closeAddProgModal() {
      if (modalAdd) modalAdd.classList.add("hidden");
      document.getElementById("formAddProg")?.reset();
    }

    if (btnOpenAdd && modalAdd) {
      btnOpenAdd.addEventListener("click", () => {
        modalAdd.classList.remove("hidden");
      });
    }
    if (btnCloseAdd) btnCloseAdd.addEventListener("click", closeAddProgModal);
    if (btnCancelAdd) btnCancelAdd.addEventListener("click", closeAddProgModal);
    if (modalAdd) {
      modalAdd.addEventListener("click", (e) => {
        if (e.target === modalAdd) closeAddProgModal();
      });
    }
  }

  function renderStats() {
    const stats = siteContent.stats || [];
    const grid = document.getElementById("statsEditorGrid");
    grid.innerHTML = stats
      .map(
        (s) => `
        <div class="stat-edit-card" data-id="${s.id}">
          <input type="text" class="val-input" value="${escapeHtml(s.value)}" onchange="updateStatValue('${s.id}', this.value)" placeholder="e.g. 25+" />
          <input type="text" class="lbl-input" value="${escapeHtml(s.label)}" onchange="updateStatLabel('${s.id}', this.value)" placeholder="Label description" />
          <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
            <button type="button" class="btn-icon-danger text-xs" onclick="deleteStat('${s.id}')">Remove</button>
          </div>
        </div>`,
      )
      .join("");
  }

  function populateContentFields() {
    const u = siteContent.utility || {};
    const h = siteContent.hero || {};
    const a = siteContent.about || {};
    const c = siteContent.contact || {};

    setVal("fieldUtilityBanner", u.announcement || "");
    setVal("fieldHeroEyebrow", h.eyebrow || "");
    setVal("fieldHeroTitle", h.title || "");
    setVal("fieldHeroCopy", h.copy || "");

    setVal("fieldAboutTitle", a.title || "");
    setVal("fieldAboutP1", a.p1 || "");
    setVal("fieldAboutP2", a.p2 || "");
    setVal("fieldAboutBadge", a.badge || "");

    setVal("fieldContactPhone", c.phone || "");
    setVal("fieldContactEmail", c.email || "");
    setVal("fieldContactAddress", c.address || "");
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  // ================= UPLOAD HANDLING =================
  function setupGalleryUploader() {
    const dropzone = document.getElementById("galleryDropzone");
    const fileInput = document.getElementById("galleryFileInput");
    const preview = document.getElementById("uploadPreview");
    const dropContent = document.getElementById("dropzoneContent");
    const previewImg = document.getElementById("previewImg");
    const previewName = document.getElementById("previewFileName");
    const previewSize = document.getElementById("previewFileSize");
    const previewCaption = document.getElementById("previewCaption");
    const btnConfirm = document.getElementById("btnConfirmUpload");
    const btnCancel = document.getElementById("btnCancelUpload");

    // Dashboard mini dropzone
    const dashDropzone = document.getElementById("dashDropzone");
    const dashFileInput = document.getElementById("dashFileInput");

    if (dashDropzone && dashFileInput) {
      dashDropzone.addEventListener("click", () => dashFileInput.click());
      dashFileInput.addEventListener("change", (e) => {
        if (e.target.files.length) {
          handleFileSelection(e.target.files[0]);
          switchTab("gallery");
        }
      });
    }

    dropzone.addEventListener("click", (e) => {
      if (e.target.closest("#uploadPreview")) return;
      fileInput.click();
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length) handleFileSelection(e.target.files[0]);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      if (e.dataTransfer.files.length) {
        handleFileSelection(e.dataTransfer.files[0]);
      }
    });

    function handleFileSelection(file) {
      if (!file.type.startsWith("image/")) {
        showToast("Please select a valid image file", "error");
        return;
      }
      selectedUploadFile = file;
      previewImg.src = URL.createObjectURL(file);
      previewName.textContent = file.name;
      previewSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + " MB";
      previewCaption.value = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

      dropContent.classList.add("hidden");
      preview.classList.remove("hidden");
    }

    btnCancel.addEventListener("click", () => {
      selectedUploadFile = null;
      fileInput.value = "";
      dropContent.classList.remove("hidden");
      preview.classList.add("hidden");
    });

    btnConfirm.addEventListener("click", async () => {
      if (!selectedUploadFile) return;
      const label = previewCaption.value.trim() || "Campus Photo";

      btnConfirm.disabled = true;
      btnConfirm.textContent = "Uploading to MongoDB...";

      const formData = new FormData();
      formData.append("file", selectedUploadFile);
      formData.append("label", label);
      formData.append("section", "photos");
      if (activeGalleryScope && activeGalleryScope !== "campus") {
        formData.append("prog_id", activeGalleryScope);
      }

      try {
        const res = await authFetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (res.ok && data.success) {
          const successMsg = activeGalleryScope === "campus"
            ? "Campus photo uploaded to homepage gallery!"
            : "Photo uploaded directly to department gallery!";
          showToast(successMsg, "success");
          selectedUploadFile = null;
          fileInput.value = "";
          dropContent.classList.remove("hidden");
          preview.classList.add("hidden");
          await loadContent();
        } else {
          showToast(data.error || "Upload failed", "error");
        }
      } catch (err) {
        showToast("Error communicating with server: " + err.message, "error");
      } finally {
        btnConfirm.disabled = false;
        btnConfirm.textContent = "Upload to MongoDB";
      }
    });

    // Search filter
    document.getElementById("gallerySearchInput")?.addEventListener("input", () => {
      renderGallery();
    });
  }

  // ================= CRUD FOR NOTICES, PROGRAMMES, STATS =================
  function setupForms() {
    // Quick Notice Form from Dashboard
    document.getElementById("dashQuickNoticeForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const day = document.getElementById("dashNoticeDay").value.trim();
      const month = document.getElementById("dashNoticeMonth").value.trim().toUpperCase();
      const title = document.getElementById("dashNoticeTitle").value.trim();

      await addNoticeApi({ day, month, title, link: "#contact" });
      document.getElementById("dashQuickNoticeForm").reset();
    });

    // Add Notice Form
    document.getElementById("formAddNotice")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const day = document.getElementById("noticeDay").value.trim();
      const month = document.getElementById("noticeMonth").value.trim().toUpperCase();
      const title = document.getElementById("noticeTitle").value.trim();
      const link = document.getElementById("noticeLink").value.trim() || "#contact";

      await addNoticeApi({ day, month, title, link });
      document.getElementById("formAddNotice").reset();
    });

    // Add Programme Form
    document.getElementById("formAddProg")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const number = document.getElementById("progNumber")?.value.trim() || "";
      const category = document.getElementById("progCategory")?.value || "Science";
      const title = document.getElementById("progTitle")?.value.trim() || "";
      const department = document.getElementById("progDept")?.value.trim() || title;
      const duration = document.getElementById("progDuration")?.value.trim() || "3 Years (UG)";
      const desc = document.getElementById("progDesc")?.value.trim() || "";
      const link = document.getElementById("progLink")?.value.trim() || "#apply-modal";

      await addProgrammeApi({ number, category, title, department, duration, desc, link });
      document.getElementById("formAddProg").reset();
    });

    // Add Stat Row
    document.getElementById("btnAddStatRow")?.addEventListener("click", async () => {
      await addStatApi({ value: "100%", label: "New Metric" });
    });

    // Applications Search Input & Multi-Categorization Filters
    document.getElementById("appSearchInput")?.addEventListener("input", (e) => {
      appFilters.search = (e.target.value || "").trim();
      renderApplicationsTable();
    });

    document.getElementById("filterAppStatus")?.addEventListener("change", (e) => {
      setAppStatusFilter(e.target.value);
    });

    document.getElementById("filterAppCommunity")?.addEventListener("change", (e) => {
      appFilters.community = e.target.value;
      renderApplicationsTable();
    });

    document.getElementById("filterAppDept")?.addEventListener("change", (e) => {
      appFilters.department = e.target.value;
      renderApplicationsTable();
    });

    document.getElementById("btnResetAppFilters")?.addEventListener("click", () => {
      resetAppFilters();
    });

    // Status Summary Quick Chips
    document.querySelectorAll(".app-status-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const filterVal = chip.getAttribute("data-status-filter") || "all";
        setAppStatusFilter(filterVal);
      });
    });

    // Excel Export Button
    document.getElementById("btnExportExcel")?.addEventListener("click", exportApplicationsToExcel);

    // Edit Programme Modal listeners
    document.getElementById("btnCloseEditProgModal")?.addEventListener("click", closeEditProgModal);
    document.getElementById("btnCancelEditProg")?.addEventListener("click", closeEditProgModal);

    document.getElementById("formEditProg")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const progId = document.getElementById("editProgId")?.value;
      if (!progId) return;

      const number = document.getElementById("editProgNumber")?.value.trim() || "";
      const category = document.getElementById("editProgCategory")?.value || "Science";
      const title = document.getElementById("editProgTitle")?.value.trim() || "";
      const department = document.getElementById("editProgDept")?.value.trim() || title;
      const duration = document.getElementById("editProgDuration")?.value.trim() || "";
      const desc = document.getElementById("editProgDesc")?.value.trim() || "";
      const link = document.getElementById("editProgLink")?.value.trim() || "#apply-modal";

      await editProgrammeApi(progId, { number, category, title, department, duration, desc, link });
      closeEditProgModal();
    });
  }

  async function addNoticeApi(noticeData) {
    try {
      const res = await authFetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noticeData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Bulletin notice published!", "success");
        await loadContent();
      } else {
        showToast(data.error || "Failed to add notice", "error");
      }
    } catch (err) {
      showToast("Server error: " + err.message, "error");
    }
  }

  window.deleteNotice = async function (id) {
    if (!confirm("Are you sure you want to remove this bulletin notice?")) return;
    try {
      const res = await authFetch(`/api/notices/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Notice removed", "info");
        await loadContent();
      }
    } catch (err) {
      showToast("Could not delete notice: " + err.message, "error");
    }
  };

  async function addProgrammeApi(progData) {
    try {
      const res = await authFetch("/api/programmes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(progData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Academic programme added!", "success");
        await loadContent();
      } else {
        showToast(data.error || "Failed to add programme", "error");
      }
    } catch (err) {
      showToast("Server error: " + err.message, "error");
    }
  }

  window.deleteProgramme = async function (id) {
    if (!confirm("Are you sure you want to remove this programme?")) return;
    try {
      const res = await authFetch(`/api/programmes/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Programme removed", "info");
        await loadContent();
      }
    } catch (err) {
      showToast("Could not delete programme: " + err.message, "error");
    }
  };

  async function editProgrammeApi(progId, progData) {
    try {
      const res = await authFetch(`/api/programmes/${progId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(progData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Programme updated successfully!", "success");
        await loadContent();
      } else {
        showToast(data.error || "Failed to update programme", "error");
      }
    } catch (err) {
      showToast("Server error: " + err.message, "error");
    }
  }

  window.openEditProgModal = function (progId) {
    loadDeptPageEditor(progId);
    switchTab("programmes");
    const editorEl = document.getElementById("tab-programmes");
    if (editorEl) editorEl.scrollIntoView({ behavior: "smooth" });
    showToast("Department page loaded in template editor", "info");
  };

  // ================= ONLINE ADMISSION APPLICATIONS =================


  async function loadApplications() {
    const tbody = document.getElementById("applicationsTableBody");
    try {
      const res = await authFetch("/api/applications");
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }
      applicationsList = await res.json();
      renderApplicationsTable();
    } catch (err) {
      console.warn("Error loading applications:", err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #dc2626; padding: 30px; font-weight: 500;">
          <div style="font-size: 14px; margin-bottom: 8px;">⚠️ Could not load applications: ${escapeHtml(err.message)}</div>
          <button type="button" class="btn-secondary text-xs" onclick="window.loadApplications()" style="margin: 0 auto; display: inline-flex;">↻ Retry Loading</button>
        </td></tr>`;
      }
    }
  }
  window.loadApplications = loadApplications;

  function getFilteredApplications() {
    return applicationsList.filter((a) => {
      let status = a.status || "Pending";
      if (status === "Pending Review") status = "Pending";

      // Status filter
      if (appFilters.status && appFilters.status !== "all") {
        if (status.toLowerCase() !== appFilters.status.toLowerCase()) return false;
      }

      // Community filter
      if (appFilters.community && appFilters.community !== "all") {
        const comm = String(a.community || "").toLowerCase();
        const fComm = appFilters.community.toLowerCase();
        if (!comm.includes(fComm)) return false;
      }

      // Department filter
      if (appFilters.department && appFilters.department !== "all") {
        const crs = String(a.course || "").toLowerCase();
        const fDept = appFilters.department.toLowerCase();
        if (!crs.includes(fDept)) return false;
      }

      // Search query
      if (appFilters.search) {
        const s = appFilters.search.toLowerCase();
        const name = String(a.name || "").toLowerCase();
        const course = String(a.course || "").toLowerCase();
        const mobile = String(a.mobile || "").toLowerCase();
        const email = String(a.email || "").toLowerCase();
        const father = String(a.fatherName || "").toLowerCase();
        if (!name.includes(s) && !course.includes(s) && !mobile.includes(s) && !email.includes(s) && !father.includes(s)) {
          return false;
        }
      }

      return true;
    });
  }

  function setAppStatusFilter(statusVal) {
    appFilters.status = statusVal;

    const select = document.getElementById("filterAppStatus");
    if (select) select.value = statusVal;

    document.querySelectorAll(".app-status-chip").forEach((chip) => {
      const chipVal = chip.getAttribute("data-status-filter") || "all";
      if (chipVal.toLowerCase() === statusVal.toLowerCase()) {
        chip.classList.add("active");
      } else {
        chip.classList.remove("active");
      }
    });

    renderApplicationsTable();
  }
  window.setAppStatusFilter = setAppStatusFilter;

  function resetAppFilters() {
    appFilters = {
      search: "",
      status: "all",
      community: "all",
      department: "all",
    };

    const searchInput = document.getElementById("appSearchInput");
    if (searchInput) searchInput.value = "";

    const statusSelect = document.getElementById("filterAppStatus");
    if (statusSelect) statusSelect.value = "all";

    const commSelect = document.getElementById("filterAppCommunity");
    if (commSelect) commSelect.value = "all";

    const deptSelect = document.getElementById("filterAppDept");
    if (deptSelect) deptSelect.value = "all";

    document.querySelectorAll(".app-status-chip").forEach((chip) => {
      const chipVal = chip.getAttribute("data-status-filter") || "all";
      if (chipVal === "all") chip.classList.add("active");
      else chip.classList.remove("active");
    });

    renderApplicationsTable();
    showToast("Filters reset — showing all admission records", "info");
  }
  window.resetAppFilters = resetAppFilters;

  function populateDepartmentFilterDropdown() {
    const select = document.getElementById("filterAppDept");
    if (!select) return;

    const depts = new Set();
    applicationsList.forEach((a) => {
      if (a.course && a.course.trim()) depts.add(a.course.trim());
    });
    const progs = siteContent?.programmes || [];
    progs.forEach((p) => {
      if (p.title && p.title.trim()) depts.add(p.title.trim());
    });

    const currentVal = appFilters.department || "all";
    const sortedDepts = Array.from(depts).sort();

    select.innerHTML =
      `<option value="all">All Departments / Courses (${sortedDepts.length})</option>` +
      sortedDepts
        .map(
          (d) => `<option value="${escapeHtml(d)}" ${d === currentVal ? "selected" : ""}>${escapeHtml(d)}</option>`,
        )
        .join("");
  }

  function renderApplicationsTable() {
    const tbody = document.getElementById("applicationsTableBody");
    const countLabel = document.getElementById("appsCountLabel");
    const badge = document.getElementById("badgeAppCount");
    const dashCount = document.getElementById("dashTotalApps");

    // Dynamic Counter Calculation
    let countTotal = applicationsList.length;
    let countPending = 0;
    let countJoined = 0;
    let countRejected = 0;

    applicationsList.forEach((a) => {
      const st = (a.status || "Pending").toLowerCase();
      if (st === "joined" || st === "admitted") countJoined++;
      else if (st === "rejected" || st === "rejects" || st === "declined") countRejected++;
      else countPending++;
    });

    // Update Counter Badges
    const elAll = document.getElementById("countStatusAll");
    const elPending = document.getElementById("countStatusPending");
    const elJoined = document.getElementById("countStatusJoined");
    const elRejected = document.getElementById("countStatusRejected");

    if (elAll) elAll.textContent = countTotal;
    if (elPending) elPending.textContent = countPending;
    if (elJoined) elJoined.textContent = countJoined;
    if (elRejected) elRejected.textContent = countRejected;

    if (countLabel) countLabel.textContent = countTotal;
    if (badge) badge.textContent = countTotal;
    if (dashCount) dashCount.textContent = countTotal;

    populateDepartmentFilterDropdown();

    if (!tbody) return;

    const filtered = getFilteredApplications();

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--muted); padding: 36px 20px;">
        <div style="font-size: 14px; margin-bottom: 8px; font-weight: 600;">No admission applications found matching your current filter criteria.</div>
        <button type="button" class="btn-secondary text-xs" onclick="window.resetAppFilters()" style="margin: 0 auto; display: inline-flex;">Reset Filters</button>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((a) => {
        const cleanMobile = String(a.mobile || "").replace(/\D/g, "");
        let status = a.status || "Pending";
        if (status === "Pending Review") status = "Pending";
        const statusClass = status.toLowerCase();

        return `
        <tr>
          <td><small style="color: var(--muted); font-weight: 500;">${escapeHtml(a.submittedAt || "Recent")}</small></td>
          <td>
            <strong style="color: var(--navy); font-size: 13.5px;">${escapeHtml(a.name || "Unnamed")}</strong><br />
            <small style="color: var(--muted);">${escapeHtml(a.gender || "")} · DOB: ${escapeHtml(a.dob || "N/A")}</small>
          </td>
          <td>
            <span class="badge-pill purple">${escapeHtml(a.courseType || "UG")}</span><br />
            <strong>${escapeHtml(a.course || "General")}</strong>
          </td>
          <td>
            <select class="status-badge-select status-select-${statusClass}" title="Change admission status" onchange="window.changeAppStatus('${escapeHtml(a.id)}', this.value)">
              <option value="Pending" ${status === "Pending" ? "selected" : ""}>⏳ Pending</option>
              <option value="Joined" ${status === "Joined" ? "selected" : ""}>✅ Joined</option>
              <option value="Rejected" ${status === "Rejected" ? "selected" : ""}>❌ Rejected</option>
            </select>
          </td>
          <td>
            <a href="tel:${escapeHtml(a.mobile || "")}" style="font-weight: 600; color: var(--purple);">📞 ${escapeHtml(a.mobile || "—")}</a><br />
            ${cleanMobile ? `<a href="https://wa.me/91${cleanMobile}" target="_blank" style="font-size: 11px; color: #10b981; font-weight: 600;">💬 WhatsApp</a>` : ""}
          </td>
          <td><small style="color: #475569;">${escapeHtml(a.email || "—")}</small></td>
          <td>
            <span>${escapeHtml(a.schoolOrCollege || "—")}</span><br />
            <small><strong>${escapeHtml(a.percentage || "")}</strong> ${a.marksTotal ? `(${escapeHtml(a.marksTotal)} Marks)` : ""}</small>
          </td>
          <td>
            <span class="badge-pill warning">${escapeHtml(a.community || "General")}</span><br />
            <small style="color: ${a.needsScholarship ? '#059669' : '#64748b'}; font-weight: 600;">
              ${a.needsScholarship ? "✓ Wants SC/ST Scholarship" : "No Scholarship"}
            </small>
          </td>
          <td>
            <button class="btn-action-icon" onclick="deleteApplication('${escapeHtml(a.id)}')" title="Delete application">🗑</button>
          </td>
        </tr>
      `;
      })
      .join("");
  }

  window.changeAppStatus = async function (appId, newStatus) {
    try {
      const res = await authFetch(`/api/applications/${appId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Candidate status marked as '${newStatus}'`, "success");
        const target = applicationsList.find((a) => a.id === appId);
        if (target) {
          target.status = newStatus;
        }
        renderApplicationsTable();
      } else {
        showToast(data.error || "Failed to update status", "error");
        renderApplicationsTable();
      }
    } catch (err) {
      showToast("Error updating status: " + err.message, "error");
      renderApplicationsTable();
    }
  };

  function exportApplicationsToExcel() {
    const listToExport = getFilteredApplications();
    if (!listToExport.length) {
      showToast("No admission records to export matching current filter criteria", "info");
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const fileName = `SDASC_Admissions_2026_27_${todayStr}.xlsx`;

    const headers = [
      "Application ID",
      "Date Submitted",
      "Admission Status",
      "Candidate Name",
      "Gender",
      "Date of Birth",
      "Mobile Number",
      "Email Address",
      "Course Level",
      "Programme / Course",
      "Community",
      "Wants SC/ST Scholarship",
      "School / College",
      "Marks Total",
      "Percentage",
      "Father's Name",
      "Mother's Name",
    ];

    const rows = listToExport.map((a) => {
      let status = a.status || "Pending";
      if (status === "Pending Review") status = "Pending";
      return [
        a.id || "",
        a.submittedAt || "",
        status,
        a.name || "",
        a.gender || "",
        a.dob || "",
        a.mobile || "",
        a.email || "",
        a.courseType || "UG",
        a.course || "",
        a.community || "General",
        a.needsScholarship ? "Yes" : "No",
        a.schoolOrCollege || "",
        a.marksTotal || "",
        a.percentage || "",
        a.fatherName || "",
        a.motherName || "",
      ];
    });

    // Try SheetJS (.xlsx) export
    if (typeof XLSX !== "undefined") {
      try {
        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws["!cols"] = [
          { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 10 },
          { wch: 14 }, { wch: 16 }, { wch: 26 }, { wch: 12 }, { wch: 32 },
          { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 12 }, { wch: 12 },
          { wch: 20 }, { wch: 20 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Admissions 2026-27");
        XLSX.writeFile(wb, fileName);
        showToast(`Exported ${listToExport.length} application(s) to Excel (.xlsx)!`, "success");
        return;
      } catch (err) {
        console.warn("SheetJS export encountered error, using CSV fallback:", err);
      }
    }

    // Direct Excel-compatible UTF-8 BOM CSV Fallback
    let csv = "\ufeff" + headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";
    rows.forEach((row) => {
      csv += row.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",") + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", fileName.replace(".xlsx", ".csv"));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${listToExport.length} application(s) to Excel CSV!`, "success");
  }
  window.exportApplicationsToExcel = exportApplicationsToExcel;

  window.deleteApplication = async function (id) {
    if (!confirm("Are you sure you want to remove this student application?")) return;
    try {
      const res = await authFetch(`/api/applications/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Application record deleted", "info");
        await loadApplications();
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Delete failed", "error");
      }
    } catch (err) {
      showToast("Delete failed: " + err.message, "error");
    }
  };

  // ================= PUBLIC ENQUIRIES =================
  async function loadEnquiries() {
    const tbody = document.getElementById("enquiriesTableBody");
    try {
      const res = await authFetch("/api/enquiries");
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }
      enquiriesList = await res.json();
      renderEnquiriesTable();
    } catch (err) {
      console.warn("Error loading enquiries:", err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #dc2626; padding: 30px; font-weight: 500;">
          <div style="font-size: 14px; margin-bottom: 8px;">⚠️ Could not load enquiries: ${escapeHtml(err.message)}</div>
          <button type="button" class="btn-secondary text-xs" onclick="window.loadEnquiries()" style="margin: 0 auto; display: inline-flex;">↻ Retry Loading</button>
        </td></tr>`;
      }
    }
  }
  window.loadEnquiries = loadEnquiries;

  function renderEnquiriesTable() {
    const tbody = document.getElementById("enquiriesTableBody");
    const countLabel = document.getElementById("enqCountLabel");
    const badge = document.getElementById("badgeEnqCount");
    const dashCount = document.getElementById("dashTotalEnquiries");

    if (countLabel) countLabel.textContent = enquiriesList.length;
    if (badge) badge.textContent = enquiriesList.length;
    if (dashCount) dashCount.textContent = enquiriesList.length;
    if (!tbody) return;

    if (!enquiriesList.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 30px;">No public enquiries received yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = enquiriesList
      .map((e) => `
        <tr>
          <td><small style="color: var(--muted);">${escapeHtml(e.submittedAt || "Recent")}</small></td>
          <td><strong>${escapeHtml(e.name)}</strong></td>
          <td>
            <a href="tel:${escapeHtml(e.phone)}">📞 ${escapeHtml(e.phone)}</a><br />
            <small>${escapeHtml(e.email || "")}</small>
          </td>
          <td><span class="badge-pill purple">${escapeHtml(e.subject || "General")}</span></td>
          <td style="max-width: 320px;"><small>${escapeHtml(e.message)}</small></td>
          <td>
            <button class="btn-action-icon" onclick="deleteEnquiry('${escapeHtml(e.id)}')" title="Delete enquiry">🗑</button>
          </td>
        </tr>
      `)
      .join("");
  }

  window.deleteEnquiry = async function (id) {
    if (!confirm("Are you sure you want to delete this enquiry message?")) return;
    try {
      const res = await authFetch(`/api/enquiries/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Enquiry message removed", "info");
        await loadEnquiries();
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Delete failed", "error");
      }
    } catch (err) {
      showToast("Delete failed: " + err.message, "error");
    }
  };

  async function addStatApi(statData) {
    try {
      const res = await authFetch("/api/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statData),
      });
      if (res.ok) {
        showToast("New metric row added", "success");
        await loadContent();
      }
    } catch (err) {
      showToast("Error adding stat: " + err.message, "error");
    }
  }

  window.deleteStat = async function (id) {
    try {
      const res = await authFetch(`/api/stats/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Metric removed", "info");
        await loadContent();
      }
    } catch (err) {
      showToast("Error removing stat: " + err.message, "error");
    }
  };

  window.updateStatValue = function (id, val) {
    const s = (siteContent.stats || []).find((x) => x.id === id);
    if (s) {
      s.value = val;
      debouncedSaveStats();
    }
  };

  window.updateStatLabel = function (id, lbl) {
    const s = (siteContent.stats || []).find((x) => x.id === id);
    if (s) {
      s.label = lbl;
      debouncedSaveStats();
    }
  };

  let statDebounceTimer = null;
  function debouncedSaveStats() {
    clearTimeout(statDebounceTimer);
    statDebounceTimer = setTimeout(async () => {
      await authFetch("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats: siteContent.stats }),
      });
      showToast("Statistics metrics updated in MongoDB", "success");
    }, 600);
  }

  // ================= MODAL & PHOTO MANAGEMENT =================
  function setupModals() {
    const modal = document.getElementById("photoModal");
    const closeBtn = document.getElementById("btnModalClose");
    const btnSaveCaption = document.getElementById("btnModalSaveCaption");
    const btnDelete = document.getElementById("btnModalDeletePhoto");

    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    btnSaveCaption.addEventListener("click", async () => {
      if (!activeModalPhotoId) return;
      const newLabel = document.getElementById("modalCaptionInput").value.trim();
      if (activeGalleryScope === "campus") {
        const p = (siteContent.photos || []).find((x) => x.id === activeModalPhotoId);
        if (p) {
          p.label = newLabel;
          await authFetch("/api/content", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photos: siteContent.photos }),
          });
          showToast("Photo caption updated", "success");
          modal.classList.add("hidden");
          renderGallery();
          renderDashboard();
        }
      } else {
        const prog = (siteContent.programmes || []).find((x) => x.id === activeGalleryScope);
        if (prog && prog.gallery) {
          const p = prog.gallery.find((x) => x.id === activeModalPhotoId);
          if (p) {
            p.label = newLabel;
            await authFetch(`/api/programmes/${encodeURIComponent(prog.id)}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ gallery: prog.gallery }),
            });
            showToast("Department photo caption updated", "success");
            modal.classList.add("hidden");
            renderGallery();
          }
        }
      }
    });

    btnDelete.addEventListener("click", async () => {
      if (!activeModalPhotoId) return;
      if (confirm("Permanently delete this photo from MongoDB and server?")) {
        await deletePhoto(activeModalPhotoId);
        modal.classList.add("hidden");
      }
    });
  }

  window.openPhotoModal = function (photoId) {
    activeModalPhotoId = photoId;
    let p = null;
    if (activeGalleryScope === "campus") {
      p = (siteContent.photos || []).find((x) => x.id === photoId);
    } else {
      const prog = (siteContent.programmes || []).find((x) => x.id === activeGalleryScope);
      p = prog?.gallery?.find((x) => x.id === photoId);
    }
    if (!p) {
      p = (siteContent.photos || []).find((x) => x.id === photoId);
    }
    if (!p) {
      for (const prog of (siteContent.programmes || [])) {
        p = prog.gallery?.find((x) => x.id === photoId);
        if (p) break;
      }
    }
    if (!p) return;

    const modal = document.getElementById("photoModal");
    const modalImg = document.getElementById("modalImg");
    const captionInput = document.getElementById("modalCaptionInput");

    modalImg.src = "/" + p.src.replace(/^\//, "");
    captionInput.value = p.label || "";
    modal.classList.remove("hidden");
  };

  window.deletePhoto = async function (photoId) {
    const isCampus = activeGalleryScope === "campus";
    const scopeLabel = isCampus ? "the campus homepage gallery" : "this department gallery";
    if (!confirm(`Are you sure you want to remove this photo from ${scopeLabel}?`)) return;
    try {
      const q = isCampus ? "" : `?prog_id=${encodeURIComponent(activeGalleryScope)}`;
      const res = await authFetch(`/api/photos/${photoId}${q}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Photo removed from gallery", "info");
        await loadContent();
      } else {
        showToast(data.error || "Failed to delete photo", "error");
      }
    } catch (err) {
      showToast("Server error: " + err.message, "error");
    }
  };

  // ================= SAVE HERO & GENERAL CONTENT =================
  async function saveHeroAndGeneralContent() {
    if (!siteContent) return;

    siteContent.utility = siteContent.utility || {};
    siteContent.utility.announcement = document.getElementById("fieldUtilityBanner").value.trim();

    siteContent.hero = siteContent.hero || {};
    siteContent.hero.eyebrow = document.getElementById("fieldHeroEyebrow").value.trim();
    siteContent.hero.title = document.getElementById("fieldHeroTitle").value.trim();
    siteContent.hero.copy = document.getElementById("fieldHeroCopy").value.trim();
    delete siteContent.hero.btn1Text;
    delete siteContent.hero.btn1Link;
    delete siteContent.hero.btn2Text;
    delete siteContent.hero.btn2Link;

    siteContent.about = siteContent.about || {};
    siteContent.about.title = document.getElementById("fieldAboutTitle").value.trim();
    siteContent.about.p1 = document.getElementById("fieldAboutP1").value.trim();
    siteContent.about.p2 = document.getElementById("fieldAboutP2").value.trim();
    siteContent.about.badge = document.getElementById("fieldAboutBadge").value.trim();

    siteContent.contact = siteContent.contact || {};
    siteContent.contact.phone = document.getElementById("fieldContactPhone").value.trim();
    siteContent.contact.email = document.getElementById("fieldContactEmail").value.trim();
    siteContent.contact.address = document.getElementById("fieldContactAddress").value.trim();

    try {
      const res = await authFetch("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siteContent),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("All changes saved to MongoDB!", "success");
      } else {
        showToast("Save failed", "error");
      }
    } catch (err) {
      showToast("Save error: " + err.message, "error");
    }
  }

  async function resetDemoData() {
    try {
      const res = await authFetch("/api/reset", { method: "POST" });
      if (res.ok) {
        showToast("Site content reset to original Sri Devi College data", "info");
        await loadContent();
      }
    } catch (err) {
      showToast("Reset failed: " + err.message, "error");
    }
  }

  // ================= AUTHENTICATION & LOGIN GATE =================
  async function checkAuthStatus() {
    const loginOverlay = document.getElementById("loginOverlay");
    if (!authToken) {
      showLoginScreen();
      return false;
    }

    try {
      const res = await authFetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          currentUser = data.user;
          updateUserSessionUI();
          hideLoginScreen();
          return true;
        }
      }
    } catch (e) {
      console.warn("Auth check error:", e);
    }

    // Token invalid or expired
    authToken = "";
    sessionStorage.removeItem("sdasc_admin_token");
    localStorage.removeItem("sdasc_admin_token");
    showLoginScreen();
    return false;
  }

  function showLoginScreen() {
    const loginOverlay = document.getElementById("loginOverlay");
    if (loginOverlay) loginOverlay.classList.add("active");
    document.body.classList.add("login-locked");
    const unameInput = document.getElementById("loginUsername");
    if (unameInput) setTimeout(() => unameInput.focus(), 150);
  }

  function hideLoginScreen() {
    const loginOverlay = document.getElementById("loginOverlay");
    if (loginOverlay) loginOverlay.classList.remove("active");
    document.body.classList.remove("login-locked");
  }

  function updateUserSessionUI() {
    if (!currentUser) return;
    const sessionUserName = document.getElementById("sessionUserName");
    const sessionUserRole = document.getElementById("sessionUserRole");
    const sessionScopeChip = document.getElementById("sessionScopeChip");
    const userAvatarInitial = document.getElementById("userAvatarInitial");
    if (sessionUserName) sessionUserName.textContent = currentUser.username;
    if (sessionUserRole) sessionUserRole.textContent = currentUser.role_label || currentUser.role || "Admin";
    if (sessionScopeChip) {
      sessionScopeChip.textContent = currentUser.assigned_job || (currentUser.role === "Admin" ? "User Management Only" : (currentUser.role === "Content Editor" ? "Website Content Only" : "Admissions Only"));
    }
    if (userAvatarInitial) userAvatarInitial.textContent = (currentUser.username || "A").charAt(0).toUpperCase();

    applyRolePermissions(currentUser);
  }

  function setupAuthHandlers() {
    const loginForm = document.getElementById("loginForm");
    const loginError = document.getElementById("loginError");
    const btnTogglePw = document.getElementById("btnTogglePassword");
    const loginPassword = document.getElementById("loginPassword");
    const btnLogout = document.getElementById("btnLogout");

    if (btnTogglePw && loginPassword) {
      btnTogglePw.addEventListener("click", () => {
        const isPw = loginPassword.type === "password";
        loginPassword.type = isPw ? "text" : "password";
        btnTogglePw.style.color = isPw ? "#0284c7" : "#94a3b8";
      });
    }

    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("loginUsername")?.value.trim();
        const password = document.getElementById("loginPassword")?.value;
        const btnSubmit = document.getElementById("btnLoginSubmit");

        if (!username || !password) return;

        if (loginError) loginError.style.display = "none";
        if (btnSubmit) {
          btnSubmit.disabled = true;
          btnSubmit.innerHTML = `<span>Verifying credentials...</span>`;
        }

        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          const data = await res.json();

          if (res.ok && data.success) {
            authToken = data.token;
            currentUser = data.user;
            sessionStorage.setItem("sdasc_admin_token", authToken);
            localStorage.setItem("sdasc_admin_token", authToken);
            updateUserSessionUI();
            hideLoginScreen();
            showToast(`Welcome back, ${currentUser.name}!`, "success");

            await loadInitialData();
          } else {
            if (loginError) {
              loginError.textContent = data.error || "Invalid username or password.";
              loginError.style.display = "block";
            }
          }
        } catch (err) {
          if (loginError) {
            loginError.textContent = "Server connection error. Please try again.";
            loginError.style.display = "block";
          }
        } finally {
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<span>Sign In to Console</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
          }
        }
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener("click", async () => {
        if (confirm("Are you sure you want to sign out of the Admin Console?")) {
          try {
            await authFetch("/api/auth/logout", { method: "POST" });
          } catch (e) {}
          authToken = "";
          currentUser = null;
          sessionStorage.removeItem("sdasc_admin_token");
          localStorage.removeItem("sdasc_admin_token");
          showLoginScreen();
          showToast("Signed out of administrative console", "info");
        }
      });
    }
  }

  // ================= USER & SUB-ADMIN MANAGEMENT =================


  async function loadUsers() {
    if (!authToken) return;
    try {
      const res = await authFetch("/api/users");
      if (!res.ok) return;
      const data = await res.json();
      usersList = data.users || [];
      renderUsersTable(usersList);
      const count = usersList.length;
      const b = document.getElementById("badgeUserCount");
      const l = document.getElementById("userCountLabel");
      if (b) b.textContent = count;
      if (l) l.textContent = count;
    } catch (err) {
      console.warn("Failed to load users:", err);
    }
  }

  function renderUsersTable(users) {
    const tbody = document.getElementById("usersTableBody");
    if (!tbody) return;

    if (!users || !users.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 30px;">No user accounts found.</td></tr>`;
      return;
    }

    const isSuperAdmin = Boolean(currentUser && (currentUser.is_primary_admin || currentUser.role === "Super Admin"));

    tbody.innerHTML = users
      .map((u) => {
        const isPrimary = u.is_primary_admin || u.username === "doomsday";
        const isSelf = Boolean(currentUser && currentUser.username && (currentUser.username.toLowerCase() === u.username.toLowerCase()));
        const roleClass = u.role === "Admin" ? "admin" : (u.role === "Content Editor" ? "editor" : (u.role === "Super Admin" ? "super-admin" : "sub-admin"));
        const jobDesc = u.assigned_job || (u.role === "Admin" ? "User Accounts & Security Only" : (u.role === "Content Editor" ? "Website Content & Media Only" : "Admissions & Enquiries Only"));
        const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Active";
        
        let deptHtml = `<span style="color: var(--muted); font-size: 11.5px; font-style: italic;">All / General</span>`;
        if (u.role === "Content Editor") {
          if (u.department) {
            deptHtml = `<span class="dept-chip" title="Contributor for ${escapeHtml(u.department)}">🏛️ ${escapeHtml(u.department)}</span>`;
          } else {
            deptHtml = `<span style="color: #ea580c; font-size: 11.5px; font-weight: 600;">⚠️ General Website</span>`;
          }
        } else if (u.role === "Super Admin") {
          deptHtml = `<span style="color: #b45309; font-size: 11.5px; font-weight: 600;">👑 All Departments</span>`;
        } else if (u.role === "Sub-Admin" || u.role === "Admissions Officer") {
          deptHtml = `<span style="color: #475569; font-size: 11.5px; font-weight: 500;">Admissions Dept</span>`;
        }

        let actionsHtml = "";
        if (isSuperAdmin) {
          const editBtn = `<button type="button" class="btn-edit-user" data-username="${escapeHtml(u.username)}" title="Rename User ID, change department or password">✏ Edit</button>`;
          const delBtn = (!isPrimary && !isSelf)
            ? `<button type="button" class="btn-del-user" data-username="${escapeHtml(u.username)}" title="Delete user">Delete</button>`
            : "";
          actionsHtml = `<div class="user-actions-cell">${editBtn}${delBtn}</div>`;
        } else {
          actionsHtml = isPrimary
            ? `<span style="color: var(--muted); font-size: 11.5px; font-style: italic;">Protected</span>`
            : `<button type="button" class="btn-del-user" data-username="${escapeHtml(u.username)}" title="Delete user">Delete</button>`;
        }

        return `
          <tr>
            <td>
              <strong style="color: var(--navy); font-size: 13.5px;">${escapeHtml(u.username)}</strong>
              ${isPrimary ? `<span style="font-size: 10px; color: #b45309; margin-left: 6px; font-weight: 700;">★ Super Admin</span>` : ""}
              ${isSelf ? `<span style="font-size: 10px; color: #0284c7; margin-left: 4px; font-weight: 600;">(You)</span>` : ""}
            </td>
            <td style="color: #334155; font-weight: 500;">${escapeHtml(u.name || u.username)}</td>
            <td>
              <span class="role-badge ${roleClass}">${escapeHtml(u.role_label || u.role || "Sub-Admin")}</span>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 500;">${escapeHtml(jobDesc)}</div>
            </td>
            <td>
              ${deptHtml}
            </td>
            <td style="color: var(--muted); font-size: 12.5px;">${dateStr}</td>
            <td>
              <span style="font-size: 11px; color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 2px 8px; border-radius: 4px; font-weight: 700;">
                ● Active
              </span>
            </td>
            <td>
              ${actionsHtml}
            </td>
          </tr>
        `;
      })
      .join("");

    tbody.querySelectorAll(".btn-edit-user").forEach((btn) => {
      btn.addEventListener("click", () => {
        const uname = btn.getAttribute("data-username");
        if (uname) openEditUserModal(uname);
      });
    });

    tbody.querySelectorAll(".btn-del-user").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uname = btn.getAttribute("data-username");
        if (!uname) return;
        if (confirm(`Are you sure you want to delete user account '${uname}'? This cannot be undone.`)) {
          await deleteUser(uname);
        }
      });
    });
  }

  function openEditUserModal(username) {
    const modal = document.getElementById("modalEditUser");
    const origInput = document.getElementById("editOrigUsername");
    const uInput = document.getElementById("editUsername");
    const nameInput = document.getElementById("editFullName");
    const roleSelect = document.getElementById("editRole");
    const deptSelect = document.getElementById("editDepartment");
    const deptGroup = document.getElementById("groupEditDepartment");
    const pwInput = document.getElementById("editPassword");
    const errBox = document.getElementById("editUserError");
    const phoneInput = document.getElementById("editPhone");

    if (!modal) return;
    if (errBox) errBox.style.display = "none";

    populateDepartmentDropdowns();

    const user = usersList.find((u) => u.username && u.username.toLowerCase() === username.toLowerCase());
    if (origInput) origInput.value = username;
    if (uInput) uInput.value = user ? user.username : username;
    if (nameInput) nameInput.value = user ? (user.name || user.username) : username;
    if (roleSelect) roleSelect.value = user ? (user.role || "Sub-Admin") : "Sub-Admin";
    if (deptSelect && user) deptSelect.value = user.department || "";
    if (deptGroup) deptGroup.style.display = (user && user.role === "Content Editor") ? "block" : "none";
    if (pwInput) pwInput.value = "";
    if (phoneInput) phoneInput.value = user?.phone || "";

    modal.classList.remove("hidden");
    if (uInput) setTimeout(() => uInput.focus(), 150);
  }

  async function deleteUser(username) {
    try {
      const res = await authFetch(`/api/users/${encodeURIComponent(username)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`User '${username}' deleted successfully`, "success");
        await loadUsers();
      } else {
        showToast(data.error || "Failed to delete user", "error");
      }
    } catch (e) {
      showToast("Error communicating with server", "error");
    }
  }

  function setupUserManagement() {
    const modal = document.getElementById("modalCreateUser");
    const openBtn = document.getElementById("btnOpenCreateUserModal");
    const closeBtn = document.getElementById("btnCloseCreateUserModal");
    const cancelBtn = document.getElementById("btnCancelCreateUser");
    const form = document.getElementById("formCreateUser");
    const errBox = document.getElementById("createUserError");

    const newRoleSelect = document.getElementById("newRole");
    const groupNewDept = document.getElementById("groupNewDepartment");
    if (newRoleSelect && groupNewDept) {
      newRoleSelect.addEventListener("change", () => {
        groupNewDept.style.display = (newRoleSelect.value === "Content Editor") ? "block" : "none";
      });
      groupNewDept.style.display = (newRoleSelect.value === "Content Editor") ? "block" : "none";
    }

    const editRoleSelect = document.getElementById("editRole");
    const groupEditDept = document.getElementById("groupEditDepartment");
    if (editRoleSelect && groupEditDept) {
      editRoleSelect.addEventListener("change", () => {
        groupEditDept.style.display = (editRoleSelect.value === "Content Editor") ? "block" : "none";
      });
    }

    function closeModal() {
      if (modal) modal.classList.add("hidden");
      if (form) form.reset();
      if (errBox) errBox.style.display = "none";
      if (groupNewDept && newRoleSelect) {
        groupNewDept.style.display = (newRoleSelect.value === "Content Editor") ? "block" : "none";
      }
    }

    if (openBtn && modal) {
      openBtn.addEventListener("click", () => {
        if (errBox) errBox.style.display = "none";
        populateDepartmentDropdowns();
        modal.classList.remove("hidden");
        const uInput = document.getElementById("newUsername");
        if (uInput) setTimeout(() => uInput.focus(), 150);
      });
    }

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });
    }

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("newUsername")?.value.trim().toLowerCase();
        const name = document.getElementById("newFullName")?.value.trim();
        const role = document.getElementById("newRole")?.value;
        const department = (role === "Content Editor") ? (document.getElementById("newDepartment")?.value || "") : "";
        const password = document.getElementById("newPassword")?.value;
        const submitBtn = document.getElementById("btnSubmitCreateUser");

        if (!username || !password) return;

        if (errBox) errBox.style.display = "none";
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Creating...";
        }

        try {
          const res = await authFetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, name, role, department, password }),
          });
          const data = await res.json();

          if (res.ok && data.success) {
            closeModal();
            showToast(data.message || `User '${username}' created!`, "success");
            await loadUsers();
          } else {
            if (errBox) {
              errBox.textContent = data.error || "Failed to create user account.";
              errBox.style.display = "block";
            }
          }
        } catch (err) {
          if (errBox) {
            errBox.textContent = "Server error while creating user.";
            errBox.style.display = "block";
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Create Account";
          }
        }
      });
    }

    // Modal & Form: Edit User / Rename ID / Reset Password
    const editModal = document.getElementById("modalEditUser");
    const closeEditBtn = document.getElementById("btnCloseEditUserModal");
    const cancelEditBtn = document.getElementById("btnCancelEditUser");
    const editForm = document.getElementById("formEditUser");
    const editErrBox = document.getElementById("editUserError");
    const phoneInput = document.getElementById("editPhone");

    function closeEditModal() {
      if (editModal) editModal.classList.add("hidden");
      if (editForm) editForm.reset();
      if (editErrBox) editErrBox.style.display = "none";
    }

    if (closeEditBtn) closeEditBtn.addEventListener("click", closeEditModal);
    if (cancelEditBtn) cancelEditBtn.addEventListener("click", closeEditModal);
    if (editModal) {
      editModal.addEventListener("click", (e) => {
        if (e.target === editModal) closeEditModal();
      });
    }

    if (editForm) {
      editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const origUsername = document.getElementById("editOrigUsername")?.value.trim();
        const newUsername = document.getElementById("editUsername")?.value.trim().toLowerCase();
        const name = document.getElementById("editFullName")?.value.trim();
        const role = document.getElementById("editRole")?.value;
        const department = (role === "Content Editor") ? (document.getElementById("editDepartment")?.value || "") : "";
        const password = document.getElementById("editPassword")?.value.trim();
        const submitBtn = document.getElementById("btnSubmitEditUser");

        if (!origUsername || !newUsername) return;

        if (editErrBox) editErrBox.style.display = "none";

        const payload = { new_username: newUsername, name, role, department };
        if (password) {
          payload.password = password;
        }
        if (phoneInput && phoneInput.value.trim()) {
          payload.phone = phoneInput.value.trim();
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Saving...";
        }

        try {
          const res = await authFetch(`/api/users/${encodeURIComponent(origUsername)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json();

          if (res.ok && data.success) {
            closeEditModal();
            showToast(data.message || `User account '${newUsername}' updated successfully!`, "success");

            // If the super admin updated their own account, sync session & UI immediately
            if (currentUser && currentUser.username.toLowerCase() === origUsername.toLowerCase()) {
              currentUser.username = newUsername;
              if (name) currentUser.name = name;
              if (data.user) {
                currentUser.role = data.user.role;
                currentUser.department = data.user.department;
                currentUser.role_label = data.user.role_label;
                currentUser.assigned_job = data.user.assigned_job;
              }
              updateUserSessionUI();
            }

            await loadUsers();
          } else {
            if (editErrBox) {
              editErrBox.textContent = data.error || "Failed to update user account.";
              editErrBox.style.display = "block";
            }
          }
        } catch (err) {
          if (editErrBox) {
            editErrBox.textContent = "Server error while updating user account.";
            editErrBox.style.display = "block";
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Save Changes";
          }
        }
      });
    }
  }

  // ================= UTILITIES =================
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(50px)";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Launch on DOM ready
  document.addEventListener("DOMContentLoaded", init);
})();
