// Sri Devi Arts & Science College - Admin CMS Controller
(function () {
  let siteContent = null;
  let selectedUploadFile = null;
  let activeModalPhotoId = null;

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

  // Init
  async function init() {
    setupTabNavigation();
    setupGalleryUploader();
    setupForms();
    setupModals();
    await checkDbHealth();
    await loadContent();
  }

  // ================= TAB NAVIGATION =================
  function setupTabNavigation() {
    navTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabName = tab.getAttribute("data-tab");
        switchTab(tabName);
      });
    });

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
    navTabs.forEach((t) => t.classList.toggle("active", t.getAttribute("data-tab") === tabName));
    tabPanels.forEach((p) => p.classList.toggle("active", p.id === `tab-${tabName}`));

    const titles = {
      dashboard: ["Dashboard Overview", "Manage and publish real-time content for Sri Devi Arts & Science College"],
      gallery: ["Campus Gallery & Photos", "Upload and organize high-resolution event and campus images"],
      notices: ["Campus Bulletin & Notices", "Post timely academic and cultural updates on the homepage"],
      programmes: ["Academic Programmes", "Manage undergraduate and postgraduate course offerings"],
      stats: ["Key Statistics", "Highlight Sri Devi's institutional achievements and metrics"],
      content: ["Hero & General Content", "Customize top announcement bar, headlines, about copy, and contacts"],
      preview: ["Live Site Preview", "Real-time preview of the public college website"],
    };

    if (titles[tabName]) {
      pageTitle.textContent = titles[tabName][0];
      pageSubtitle.textContent = titles[tabName][1];
    }

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
        const res = await fetch("/api/upload", {
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
  }

  async function addNoticeApi(noticeData) {
    try {
      const res = await fetch("/api/notices", {
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
      const res = await fetch(`/api/notices/${id}`, { method: "DELETE" });
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
      const res = await fetch("/api/programmes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(progData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Academic programme added!", "success");
        await loadContent();
      }
    } catch (err) {
      showToast("Server error: " + err.message, "error");
    }
  }

  window.deleteProgramme = async function (id) {
    if (!confirm("Are you sure you want to remove this programme?")) return;
    try {
      const res = await fetch(`/api/programmes/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Programme removed", "info");
        await loadContent();
      }
    } catch (err) {
      showToast("Could not delete programme: " + err.message, "error");
    }
  };

  async function addStatApi(statData) {
    try {
      const res = await fetch("/api/stats", {
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
      const res = await fetch(`/api/stats/${id}`, { method: "DELETE" });
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
      await fetch("/api/content", {
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
        await fetch("/api/content", {
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
      const res = await fetch(`/api/photos/${photoId}`, { method: "DELETE" });
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
      const res = await fetch("/api/content", {
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
      const res = await fetch("/api/reset", { method: "POST" });
      if (res.ok) {
        showToast("Site content reset to original Sri Devi College data", "info");
        await loadContent();
      }
    } catch (err) {
      showToast("Reset failed: " + err.message, "error");
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
