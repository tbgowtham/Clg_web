// Sri Devi Arts & Science College - Admin CMS Controller
(function () {
  let siteContent = null;
  let selectedUploadFile = null;
  let activeModalPhotoId = null;

  // Authentication State
  let authToken = sessionStorage.getItem("sdasc_admin_token") || localStorage.getItem("sdasc_admin_token") || "";
  let currentUser = null;

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
    setupTabNavigation();
    setupGalleryUploader();
    setupForms();
    setupModals();

    const isAuthenticated = await checkAuthStatus();
    if (isAuthenticated) {
      await checkDbHealth();
      const tabs = currentUser?.allowed_tabs || [];
      if (tabs.includes("content") || tabs.includes("gallery") || tabs.includes("notices") || tabs.includes("programmes") || tabs.includes("stats") || tabs.includes("dashboard")) {
        await loadContent();
      }
      if (tabs.includes("applications")) {
        await loadApplications();
      }
      if (tabs.includes("enquiries")) {
        await loadEnquiries();
      }
      if (tabs.includes("users")) {
        await loadUsers();
      }
    }
  }

  // ================= ROLE-BASED ACCESS CONTROL (RBAC) =================
  function applyRolePermissions(user) {
    if (!user) return;
    
    // Determine allowed tabs
    let allowedTabs = user.allowed_tabs;
    if (!allowedTabs || !allowedTabs.length) {
      if (user.role === "Admin") allowedTabs = ["dashboard", "applications", "enquiries", "users", "preview"];
      else if (user.role === "Content Editor") allowedTabs = ["content", "gallery", "notices", "programmes", "stats", "preview"];
      else if (user.role === "Super Admin") allowedTabs = ["dashboard", "gallery", "notices", "programmes", "stats", "content", "applications", "enquiries", "users", "preview"];
      else allowedTabs = ["applications", "enquiries", "preview"]; // Sub-Admin default
    }

    user.allowed_tabs = allowedTabs;

    // Filter sidebar navigation buttons
    navTabs.forEach((tab) => {
      const tabName = tab.getAttribute("data-tab");
      const isAllowed = allowedTabs.includes(tabName);
      tab.classList.toggle("role-hidden", !isAllowed);
    });

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
      else if (user.role === "Content Editor") defaultTab = "content";
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

    document.getElementById("btnReloadPreview")?.addEventListener("click", () => {
      const frame = document.getElementById("collegeSiteFrame");
      if (frame) {
        frame.src = "/?t=" + Date.now();
        showToast("Live preview reloaded", "info");
      }
    });

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
      programmes: ["Academic Programmes", "Manage undergraduate and postgraduate course offerings"],
      stats: ["Key Statistics", "Highlight institutional achievements and metrics"],
      content: ["Hero & General Content", "Customize top announcement bar, Ponneri address, and contacts"],
      applications: ["Online Admission Applications (2026–27)", "Review student candidate registrations submitted via the website"],
      enquiries: ["Public Enquiries & Messages", "Manage questions and feedback from parents, students, and recruiters"],
      users: ["User Accounts & Permissions", "Create and manage administrative credentials and sub-admin roles"],
      preview: ["Live Site Preview", "Real-time preview of the public college website"],
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

    if (tabName === "applications") loadApplications();
    if (tabName === "enquiries") loadEnquiries();
    if (tabName === "users") loadUsers();

    if (tabName === "preview") {
      const frame = document.getElementById("collegeSiteFrame");
      if (frame) frame.src = "/?t=" + Date.now();
    }
  };

  // ================= HEALTH & CONTENT API =================
  async function checkDbHealth() {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("Health check failed");
      const data = await res.json();
      if (data.mongodb_connected) {
        dbStatusBadge.className = "db-status-chip";
        dbStatusText.textContent = "MongoDB Connected";
        document.getElementById("dashDbStatus").textContent = "Active";
      } else {
        dbStatusBadge.className = "db-status-chip offline";
        dbStatusText.textContent = "MongoDB Offline (JSON Mode)";
        document.getElementById("dashDbStatus").textContent = "JSON Fallback";
      }
    } catch (err) {
      dbStatusBadge.className = "db-status-chip offline";
      dbStatusText.textContent = "Server Offline (Local)";
      document.getElementById("dashDbStatus").textContent = "Offline";
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
      renderDashboard();
      renderGallery();
      renderNotices();
      renderProgrammes();
      renderStats();
      populateContentFields();
    }
  }

  // ================= RENDER METHODS =================
  function renderDashboard() {
    const photos = siteContent.photos || [];
    const notices = siteContent.notices || [];
    const progs = siteContent.programmes || [];

    document.getElementById("dashTotalPhotos").textContent = photos.length;
    document.getElementById("dashTotalNotices").textContent = notices.length;
    document.getElementById("dashTotalProgrammes").textContent = progs.length;

    document.getElementById("badgePhotoCount").textContent = photos.length;
    document.getElementById("badgeNoticeCount").textContent = notices.length;
    document.getElementById("badgeProgCount").textContent = progs.length;

    // Mini Gallery Strip
    const strip = document.getElementById("dashGalleryStrip");
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

  function renderGallery() {
    const photos = siteContent.photos || [];
    const grid = document.getElementById("galleryGrid");
    const countLabel = document.getElementById("galleryCountLabel");
    if (countLabel) countLabel.textContent = photos.length;

    const searchTerm = (document.getElementById("gallerySearchInput")?.value || "").toLowerCase();
    const filtered = photos.filter((p) => p.label.toLowerCase().includes(searchTerm));

    if (!filtered.length) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No campus photos found matching criteria.</div>`;
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
              <span class="photo-badge">${p.src.startsWith('uploads/') ? 'Uploaded' : 'Campus'}</span>
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
    if (!progs.length) {
      list.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">No academic programmes defined.</div>`;
      return;
    }

    list.innerHTML = progs
      .map(
        (p) => `
        <div class="prog-item" data-id="${p.id}">
          <div class="prog-info">
            <span class="badge">${escapeHtml(p.number)}</span>
            <h4>${escapeHtml(p.title)}</h4>
            <p>${escapeHtml(p.desc)}</p>
          </div>
          <button type="button" class="btn-icon-danger" title="Remove programme" onclick="deleteProgramme('${p.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>`,
      )
      .join("");
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
    setVal("fieldHeroBtn1Text", h.btn1Text || "");
    setVal("fieldHeroBtn1Link", h.btn1Link || "");
    setVal("fieldHeroBtn2Text", h.btn2Text || "");
    setVal("fieldHeroBtn2Link", h.btn2Link || "");

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

      try {
        const res = await authFetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (res.ok && data.success) {
          showToast("Photo uploaded and stored in MongoDB successfully!", "success");
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
      const number = document.getElementById("progNumber").value.trim();
      const title = document.getElementById("progTitle").value.trim();
      const desc = document.getElementById("progDesc").value.trim();
      const link = document.getElementById("progLink").value.trim() || "#contact";

      await addProgrammeApi({ number, title, desc, link });
      document.getElementById("formAddProg").reset();
    });

    // Add Stat Row
    document.getElementById("btnAddStatRow")?.addEventListener("click", async () => {
      await addStatApi({ value: "100%", label: "New Metric" });
    });

    // Applications Search Input
    document.getElementById("appSearchInput")?.addEventListener("input", renderApplicationsTable);
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

  // ================= ONLINE ADMISSION APPLICATIONS =================
  let applicationsList = [];
  let enquiriesList = [];

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

  function renderApplicationsTable() {
    const tbody = document.getElementById("applicationsTableBody");
    const countLabel = document.getElementById("appsCountLabel");
    const badge = document.getElementById("badgeAppCount");
    const dashCount = document.getElementById("dashTotalApps");

    if (countLabel) countLabel.textContent = applicationsList.length;
    if (badge) badge.textContent = applicationsList.length;
    if (dashCount) dashCount.textContent = applicationsList.length;
    if (!tbody) return;

    const searchInput = document.getElementById("appSearchInput");
    const searchTerm = (searchInput?.value || "").toLowerCase().trim();
    const filtered = applicationsList.filter((a) => {
      const name = String(a.name || "").toLowerCase();
      const course = String(a.course || "").toLowerCase();
      const mobile = String(a.mobile || "").toLowerCase();
      return name.includes(searchTerm) || course.includes(searchTerm) || mobile.includes(searchTerm);
    });

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--muted); padding: 30px;">No admission applications found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((a) => {
        const cleanMobile = String(a.mobile || "").replace(/\D/g, "");
        return `
        <tr>
          <td><small style="color: var(--muted);">${escapeHtml(a.submittedAt || "Recent")}</small></td>
          <td>
            <strong>${escapeHtml(a.name || "Unnamed")}</strong><br />
            <small style="color: var(--muted);">${escapeHtml(a.gender || "")} · DOB: ${escapeHtml(a.dob || "N/A")}</small>
          </td>
          <td>
            <span class="badge-pill purple">${escapeHtml(a.courseType || "UG")}</span><br />
            <strong>${escapeHtml(a.course || "General")}</strong>
          </td>
          <td>
            <a href="tel:${escapeHtml(a.mobile || "")}" style="font-weight: 600; color: var(--purple);">📞 ${escapeHtml(a.mobile || "—")}</a><br />
            ${cleanMobile ? `<a href="https://wa.me/91${cleanMobile}" target="_blank" style="font-size: 11px; color: #10b981;">💬 WhatsApp</a>` : ""}
          </td>
          <td><small>${escapeHtml(a.email || "—")}</small></td>
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
    const p = (siteContent.photos || []).find((x) => x.id === photoId);
    if (!p) return;

    const modal = document.getElementById("photoModal");
    const modalImg = document.getElementById("modalImg");
    const captionInput = document.getElementById("modalCaptionInput");

    modalImg.src = "/" + p.src.replace(/^\//, "");
    captionInput.value = p.label || "";
    modal.classList.remove("hidden");
  };

  window.deletePhoto = async function (photoId) {
    if (!confirm("Are you sure you want to remove this photo from the campus gallery?")) return;
    try {
      const res = await authFetch(`/api/photos/${photoId}`, { method: "DELETE" });
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
    siteContent.hero.btn1Text = document.getElementById("fieldHeroBtn1Text").value.trim();
    siteContent.hero.btn1Link = document.getElementById("fieldHeroBtn1Link").value.trim();
    siteContent.hero.btn2Text = document.getElementById("fieldHeroBtn2Text").value.trim();
    siteContent.hero.btn2Link = document.getElementById("fieldHeroBtn2Link").value.trim();

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

            // Initialize/refresh CMS data based on role permissions
            await checkDbHealth();
            const tabs = currentUser.allowed_tabs || [];
            if (tabs.includes("content") || tabs.includes("gallery") || tabs.includes("notices") || tabs.includes("programmes") || tabs.includes("stats") || tabs.includes("dashboard")) {
              await loadContent();
            }
            if (tabs.includes("applications")) {
              await loadApplications();
            }
            if (tabs.includes("enquiries")) {
              await loadEnquiries();
            }
            if (tabs.includes("users")) {
              await loadUsers();
            }
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
  let usersList = [];

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
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 30px;">No user accounts found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users
      .map((u) => {
        const isPrimary = u.is_primary_admin || u.username === "doomsday";
        const roleClass = u.role === "Admin" ? "admin" : (u.role === "Content Editor" ? "editor" : (u.role === "Super Admin" ? "super-admin" : "sub-admin"));
        const jobDesc = u.assigned_job || (u.role === "Admin" ? "User Accounts & Security Only" : (u.role === "Content Editor" ? "Website Content & Media Only" : "Admissions & Enquiries Only"));
        const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Active";
        
        return `
          <tr>
            <td>
              <strong style="color: var(--navy); font-size: 13.5px;">${escapeHtml(u.username)}</strong>
              ${isPrimary ? `<span style="font-size: 10px; color: #b45309; margin-left: 6px; font-weight: 700;">★ Super Admin</span>` : ""}
            </td>
            <td style="color: #334155; font-weight: 500;">${escapeHtml(u.name || u.username)}</td>
            <td>
              <span class="role-badge ${roleClass}">${escapeHtml(u.role_label || u.role || "Sub-Admin")}</span>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 500;">${escapeHtml(jobDesc)}</div>
            </td>
            <td style="color: var(--muted); font-size: 12.5px;">${dateStr}</td>
            <td>
              <span style="font-size: 11px; color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 2px 8px; border-radius: 4px; font-weight: 700;">
                ● Active
              </span>
            </td>
            <td>
              ${
                isPrimary
                  ? `<span style="color: var(--muted); font-size: 11.5px; font-style: italic;">Protected</span>`
                  : `<button type="button" class="btn-del-user" data-username="${escapeHtml(u.username)}" title="Delete user">Delete</button>`
              }
            </td>
          </tr>
        `;
      })
      .join("");

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

    function closeModal() {
      if (modal) modal.classList.add("hidden");
      if (form) form.reset();
      if (errBox) errBox.style.display = "none";
    }

    if (openBtn && modal) {
      openBtn.addEventListener("click", () => {
        if (errBox) errBox.style.display = "none";
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
            body: JSON.stringify({ username, name, role, password }),
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
