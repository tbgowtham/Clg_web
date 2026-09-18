// Sridevi Arts and Science College, Ponneri — Public Portal Logic
(function () {
  "use strict";

  // Navigation & Mobile Menu
  const menuToggle = document.querySelector(".menu-toggle");
  const navLinks = document.querySelector(".nav-links");
  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => {
      navLinks.classList.toggle("open");
    });
    navLinks.querySelectorAll("a").forEach((link) =>
      link.addEventListener("click", () => navLinks.classList.remove("open"))
    );
  }

  // Global State for Programs & Filters
  let allProgrammes = [];
  let currentFilter = "all";

  // Helper function to resolve relative paths
  function resolvePath(src) {
    if (!src) return "";
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    if (src.startsWith("/")) return src;
    return "/" + src;
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

  // Modal Handlers
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
  }

  function closeModal(modal) {
    if (typeof modal === "string") modal = document.getElementById(modal);
    if (modal) {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  }

  // Global Modal Open Buttons (.btn-open-modal)
  document.addEventListener("click", (e) => {
    const openBtn = e.target.closest(".btn-open-modal");
    if (openBtn) {
      e.preventDefault();
      const targetId = openBtn.getAttribute("data-target");
      const preselectCourse = openBtn.getAttribute("data-course");
      if (targetId) {
        if (targetId === "applyModal" && preselectCourse) {
          const courseSelect = document.getElementById("appCourse");
          if (courseSelect) {
            // Check if option exists, otherwise add it
            let optExists = Array.from(courseSelect.options).some(
              (opt) => opt.value === preselectCourse
            );
            if (!optExists) {
              const newOpt = document.createElement("option");
              newOpt.value = preselectCourse;
              newOpt.textContent = preselectCourse;
              courseSelect.appendChild(newOpt);
            }
            courseSelect.value = preselectCourse;
          }
        }
        openModal(targetId);
      }
    }

    // Modal Close Buttons (.btn-close-modal, .site-modal-close)
    const closeBtn = e.target.closest(".btn-close-modal, .site-modal-close");
    if (closeBtn) {
      e.preventDefault();
      const modal = closeBtn.closest(".site-modal");
      if (modal) closeModal(modal);
    }
  });

  // Close modals when clicking backdrop
  document.querySelectorAll(".site-modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".site-modal:not(.hidden)").forEach(closeModal);
    }
  });

  // Lightbox Modal for Campus Photo Mosaic
  const lightboxModal = document.getElementById("siteLightboxModal");
  const lightboxImg = document.getElementById("siteLightboxImg");
  const lightboxCaption = document.getElementById("siteLightboxCaption");

  function openLightbox(src, caption) {
    if (!lightboxModal) return;
    lightboxImg.src = resolvePath(src);
    lightboxCaption.textContent = caption || "Campus View";
    openModal("siteLightboxModal");
  }

  // Photo Mosaic Rendering
  const defaultPhotos = [
    { src: "photo/IMG20260228131225.jpg", label: "Awards & Academic Honors Ceremony" },
    { src: "photo/IMG_20260227_142615_304.jpg", label: "Proud Convocation & Graduation Moment" },
    { src: "photo/IMG_20260701_104825_496.jpg", label: "Vibrant Campus Life at Sridevi College" },
    { src: "photo/IMG_20260701_104949.jpg", label: "Student Recognition & Felicitations" },
    { src: "photo/IMG_20260701_110148.jpg", label: "Cultural Spirit & Stage Performances" },
    { src: "photo/IMG_20260701_132844.jpg", label: "Sridevi College Central Auditorium" },
    { src: "photo/IMG_20260701_133523_953.jpg", label: "Together on Campus: Student Community" },
    { src: "photo/IMG_20260723_150208_229.jpg", label: "Interactive Classroom & Lab Learning" },
  ];

  let campusPhotosList = [...defaultPhotos];
  let featuredPhotoIndex = 0;

  function renderPhotoMosaic(photos) {
    const photoMosaic = document.querySelector("#photoMosaic");
    if (!photoMosaic) return;

    if (photos && photos.length) {
      campusPhotosList = photos.map((p) => ({
        src: p.src,
        label: p.label || "Campus Moment",
      }));
    }

    const rowSize = window.innerWidth < 600 ? 2 : 4;
    const rows = [];
    for (let i = 0; i < campusPhotosList.length; i += rowSize) {
      rows.push(campusPhotosList.slice(i, i + rowSize));
    }

    photoMosaic.innerHTML = rows
      .map(
        (row, rIdx) => `
        <div class="photo-mosaic-row">
          ${row
            .map((item, pIdx) => {
              const globalIdx = rIdx * rowSize + pIdx;
              const resolved = resolvePath(item.src);
              return `
              <button class="photo-mosaic-tile ${globalIdx === featuredPhotoIndex ? "featured" : ""}" type="button" data-index="${globalIdx}" aria-label="View ${escapeHtml(item.label)}">
                <img src="${resolved}" alt="${escapeHtml(item.label)}" loading="lazy" />
                <span class="photo-mosaic-label">${escapeHtml(item.label)}</span>
              </button>`;
            })
            .join("")}
        </div>`
      )
      .join("");

    photoMosaic.querySelectorAll(".photo-mosaic-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        const idx = parseInt(tile.getAttribute("data-index"), 10);
        if (campusPhotosList[idx]) {
          openLightbox(campusPhotosList[idx].src, campusPhotosList[idx].label);
        }
      });
    });
  }

  // Course Details Modal Popup Logic
  function openCourseDetails(prog) {
    const cmBadge = document.getElementById("cmBadge");
    const cmTitle = document.getElementById("cmTitle");
    const cmDept = document.getElementById("cmDept");
    const cmDuration = document.getElementById("cmDuration");
    const cmSeats = document.getElementById("cmSeats");
    const cmFee = document.getElementById("cmFee");
    const cmDesc = document.getElementById("cmDesc");
    const cmApplyBtn = document.getElementById("cmApplyBtn");

    if (cmBadge) cmBadge.textContent = prog.number || "DEGREE PROGRAMME";
    if (cmTitle) cmTitle.textContent = prog.title || "";
    if (cmDept) cmDept.textContent = prog.department || "Sridevi Arts & Science College";
    if (cmDuration) cmDuration.textContent = `⏱ ${prog.duration || "3 Years"}`;
    if (cmSeats) cmSeats.textContent = `💺 ${prog.seats || "100 Seats"}`;
    if (cmFee) cmFee.textContent = `💰 ${prog.fee || "Affordable Tuition"}`;
    if (cmDesc) cmDesc.textContent = prog.desc || "";

    if (cmApplyBtn) {
      cmApplyBtn.onclick = () => {
        closeModal("courseModal");
        const courseSelect = document.getElementById("appCourse");
        if (courseSelect && prog.title) {
          courseSelect.value = prog.title;
        }
        openModal("applyModal");
      };
    }

    openModal("courseModal");
  }

  // Programme Cards Rendering & Filtering
  function renderProgrammes(filter) {
    const container = document.getElementById("programmesContainer");
    if (!container) return;

    let list = allProgrammes;
    if (filter && filter !== "all") {
      list = allProgrammes.filter((p) => {
        const cat = (p.category || "").toLowerCase();
        const dept = (p.department || "").toLowerCase();
        const title = (p.title || "").toLowerCase();
        const f = filter.toLowerCase();
        return cat.includes(f) || dept.includes(f) || title.includes(f);
      });
    }

    if (!list.length) {
      container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px 0;">No programmes matching this filter.</p>`;
      return;
    }

    container.innerHTML = list
      .map((p) => {
        const imgPath = resolvePath(p.image || "assets/sdasc/departments/112226_1625242329.jpeg");
        return `
        <article class="programme-card">
          <div class="prog-thumb">
            <img src="${imgPath}" alt="${escapeHtml(p.title)}" class="prog-img" loading="lazy" onerror="this.src='photo/IMG_20260701_104825_496.jpg'" />
            <div class="prog-card-top">
              <span class="prog-badge">${escapeHtml(p.number || "COURSE")}</span>
              <span class="prog-duration-pill">${escapeHtml(p.duration || "3 Yrs")}</span>
            </div>
          </div>
          <div class="prog-body">
            <span class="prog-dept-title">${escapeHtml(p.department || "Department")}</span>
            <h3 class="prog-title">${escapeHtml(p.title)}</h3>
            <div class="prog-meta-strip">
              <span class="prog-seats">💺 ${escapeHtml(p.seats || "Available")}</span>
              <span class="prog-fee">💰 ${escapeHtml(p.fee || "Enquire")}</span>
            </div>
            <p class="prog-desc">${escapeHtml(p.desc || "")}</p>
            <div class="prog-actions">
              <button class="prog-btn-apply btn-open-modal" data-target="applyModal" data-course="${escapeHtml(p.title)}">Apply Now ✍</button>
              <button class="prog-btn-info btn-view-course" data-id="${escapeHtml(p.id)}">Details ↗</button>
            </div>
          </div>
        </article>`;
      })
      .join("");

    // Attach listeners for course details buttons
    container.querySelectorAll(".btn-view-course").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const prog = allProgrammes.find((item) => item.id === id);
        if (prog) openCourseDetails(prog);
      });
    });
  }

  // Filter Buttons
  const filterBtns = document.querySelectorAll(".filter-btn");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.getAttribute("data-filter");
      renderProgrammes(currentFilter);
    });
  });

  // Populate Course dropdown in Application Modal
  function populateApplicationDropdown(programmes) {
    const courseSelect = document.getElementById("appCourse");
    if (!courseSelect || !programmes.length) return;

    courseSelect.innerHTML = programmes
      .map((p) => `<option value="${escapeHtml(p.title)}">${escapeHtml(p.title)} — ${escapeHtml(p.seats || "")}</option>`)
      .join("");
  }

  // Render Notices / Bulletin
  function renderNotices(notices) {
    const container = document.getElementById("noticesContainer");
    if (!container || !notices) return;

    container.innerHTML = notices
      .map((n) => {
        const link = n.link || "#apply-modal";
        const isExternal = link.startsWith("http");
        return `
        <div class="notice-item">
          <div class="notice-date-box">
            <strong>${escapeHtml(n.day || "15")}</strong>
            <span>${escapeHtml(n.month || "MAR")}</span>
          </div>
          <div class="notice-content">
            <a href="${escapeHtml(link)}" class="notice-title ${link === '#apply-modal' ? 'btn-open-modal' : ''}" ${link === '#apply-modal' ? 'data-target="applyModal"' : ''} ${isExternal ? 'target="_blank" rel="noopener"' : ''}>
              ${escapeHtml(n.title)}
            </a>
          </div>
        </div>`;
      })
      .join("");
  }

  // Render Board of Trustees
  function renderManagement(management) {
    const container = document.getElementById("managementContainer");
    if (!container || !management || !management.length) return;

    container.innerHTML = management
      .map((m, idx) => {
        const photoPath = resolvePath(m.photo);
        const isFounder = idx === 0 || (m.designation && m.designation.toLowerCase().includes("father"));
        const isSec = m.designation && m.designation.toLowerCase().includes("secretary");
        const cardClass = isFounder ? "founder-card" : isSec ? "highlight-trustee" : "";

        return `
        <div class="mgmt-card ${cardClass}">
          <div class="mgmt-photo-frame">
            <img src="${photoPath}" alt="${escapeHtml(m.name)}" class="mgmt-photo" loading="lazy" onerror="this.src='photo/IMG_20260701_104825_496.jpg'" />
            <span class="mgmt-badge">${isFounder ? "FOUNDER" : isSec ? "MANAGING TRUSTEE" : "TRUSTEE"}</span>
          </div>
          <div class="mgmt-details">
            <h3>${escapeHtml(m.name)}</h3>
            <span class="mgmt-role">${escapeHtml(m.designation)}</span>
            <p>${escapeHtml(m.bio || "")}</p>
          </div>
        </div>`;
      })
      .join("");
  }

  // Render USPs
  function renderUsps(usps) {
    const container = document.getElementById("uspsContainer");
    if (!container || !usps || !usps.length) return;

    container.innerHTML = usps
      .map(
        (u) => `
        <div class="usp-card">
          <span class="usp-icon">${u.icon || "✦"}</span>
          <h3>${escapeHtml(u.title)}</h3>
          <p>${escapeHtml(u.desc)}</p>
        </div>`
      )
      .join("");
  }

  // Render Stats
  function renderStats(stats) {
    const container = document.getElementById("statsContainer");
    if (!container || !stats || !stats.length) return;

    container.innerHTML = stats
      .map(
        (s) => `
        <div class="stat-card">
          <strong class="stat-value">${escapeHtml(s.value)}</strong>
          <span class="stat-label">${escapeHtml(s.label)}</span>
        </div>`
      )
      .join("");
  }

  // Apply Content from API
  function applyContent(data) {
    if (!data) return;

    // Hero
    if (data.hero) {
      if (data.hero.eyebrow) {
        const el = document.getElementById("heroEyebrow");
        if (el) el.innerHTML = `<span class="badge-dot"></span> ${escapeHtml(data.hero.eyebrow)}`;
      }
      if (data.hero.title) {
        const el = document.getElementById("heroTitle");
        if (el) el.textContent = data.hero.title;
      }
      if (data.hero.copy) {
        const el = document.getElementById("heroCopy");
        if (el) el.textContent = data.hero.copy;
      }
    }

    // About
    if (data.about) {
      if (data.about.eyebrow) {
        const el = document.getElementById("aboutEyebrow");
        if (el) el.textContent = data.about.eyebrow;
      }
      if (data.about.title) {
        const el = document.getElementById("aboutTitle");
        if (el) el.textContent = data.about.title;
      }
      if (data.about.p1) {
        const el = document.getElementById("aboutP1");
        if (el) el.textContent = data.about.p1;
      }
      if (data.about.p2) {
        const el = document.getElementById("aboutP2");
        if (el) el.textContent = data.about.p2;
      }
    }

    // Contact
    if (data.contact) {
      const c = data.contact;
      if (c.phone) {
        const el = document.getElementById("utilityPhone");
        if (el) {
          el.textContent = c.phone;
          el.href = `tel:${c.phone.split("/")[0].trim()}`;
        }
      }
      if (c.email) {
        const el = document.getElementById("utilityEmail");
        if (el) {
          el.textContent = c.email;
          el.href = `mailto:${c.email}`;
        }
      }
      if (c.address) {
        const el = document.getElementById("utilityAddress");
        if (el) el.textContent = c.address.replace(/\n/g, ", ");
        const fa = document.getElementById("footerAddress");
        if (fa) fa.innerHTML = escapeHtml(c.address).replace(/\n/g, "<br />");
      }
      if (c.hours) {
        const el = document.getElementById("footerHours");
        if (el) el.innerHTML = escapeHtml(c.hours).replace(/\n/g, "<br />");
      }
      if (c.busRoutes) {
        const el = document.getElementById("footerBus");
        if (el) el.textContent = c.busRoutes;
      }
      if (c.copyright) {
        const el = document.getElementById("footerCopyright");
        if (el) el.textContent = c.copyright;
      }
    }

    // Stats
    if (data.stats) renderStats(data.stats);

    // Management
    if (data.management) renderManagement(data.management);

    // USPs
    if (data.usps) renderUsps(data.usps);

    // Programmes
    if (data.programmes) {
      allProgrammes = data.programmes;
      renderProgrammes(currentFilter);
      populateApplicationDropdown(allProgrammes);
    }

    // Notices
    if (data.notices) renderNotices(data.notices);

    // Photos
    if (data.photos) renderPhotoMosaic(data.photos);
  }

  // Fetch Content from CMS API
  async function loadCollegeContent() {
    try {
      const res = await fetch("/api/content");
      if (!res.ok) throw new Error("API not reachable");
      const content = await res.json();
      localStorage.setItem("sdasc_content_cache", JSON.stringify(content));
      applyContent(content);
    } catch (err) {
      console.warn("Using cached or default content:", err);
      const cached = localStorage.getItem("sdasc_content_cache");
      if (cached) {
        try {
          applyContent(JSON.parse(cached));
        } catch (e) {}
      }
    }
  }

  // Online Admission Form Submission
  const admissionForm = document.getElementById("onlineAdmissionForm");
  const appFeedback = document.getElementById("appFeedback");
  const appSubmitBtn = document.getElementById("appSubmitBtn");

  if (admissionForm) {
    admissionForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!appSubmitBtn) return;

      const originalBtnText = appSubmitBtn.textContent;
      appSubmitBtn.disabled = true;
      appSubmitBtn.textContent = "Submitting Application...";
      if (appFeedback) {
        appFeedback.style.display = "none";
        appFeedback.className = "form-feedback";
      }

      const payload = {
        courseType: document.getElementById("appCourseType")?.value || "UG",
        course: document.getElementById("appCourse")?.value || "",
        name: document.getElementById("appName")?.value.trim() || "",
        dob: document.getElementById("appDob")?.value || "",
        gender: document.getElementById("appGender")?.value || "Not Specified",
        community: document.getElementById("appCommunity")?.value || "General",
        mobile: document.getElementById("appMobile")?.value.trim() || "",
        email: document.getElementById("appEmail")?.value.trim() || "",
        fatherName: document.getElementById("appFather")?.value.trim() || "",
        motherName: document.getElementById("appMother")?.value.trim() || "",
        schoolOrCollege: document.getElementById("appSchool")?.value.trim() || "",
        marksTotal: document.getElementById("appMarks")?.value.trim() || "",
        percentage: document.getElementById("appPercentage")?.value.trim() || "",
        needsScholarship: document.getElementById("appScholarship")?.checked || false,
      };

      try {
        const res = await fetch("/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          if (appFeedback) {
            appFeedback.className = "form-feedback success";
            appFeedback.innerHTML = `
              🎉 <strong>Application Submitted Successfully!</strong><br />
              Reference ID: <strong>${escapeHtml(data.application?.id || "N/A")}</strong><br />
              ${escapeHtml(data.message)}
            `;
            appFeedback.style.display = "block";
          }
          admissionForm.reset();
        } else {
          throw new Error(data.error || "Failed to submit application");
        }
      } catch (error) {
        if (appFeedback) {
          appFeedback.className = "form-feedback error";
          appFeedback.textContent = `⚠️ Error: ${error.message}`;
          appFeedback.style.display = "block";
        }
      } finally {
        appSubmitBtn.disabled = false;
        appSubmitBtn.textContent = originalBtnText;
      }
    });
  }

  // General Enquiry Form Submission
  const enquiryForm = document.getElementById("enquiryForm");
  const enqFeedback = document.getElementById("enqFeedback");
  const enqSubmitBtn = document.getElementById("enqSubmitBtn");

  if (enquiryForm) {
    enquiryForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!enqSubmitBtn) return;

      const originalText = enqSubmitBtn.textContent;
      enqSubmitBtn.disabled = true;
      enqSubmitBtn.textContent = "Sending Message...";
      if (enqFeedback) enqFeedback.style.display = "none";

      const payload = {
        name: document.getElementById("enqName")?.value.trim() || "",
        phone: document.getElementById("enqPhone")?.value.trim() || "",
        email: document.getElementById("enqEmail")?.value.trim() || "",
        subject: document.getElementById("enqSubject")?.value || "General Enquiry",
        message: document.getElementById("enqMessage")?.value.trim() || "",
      };

      try {
        const res = await fetch("/api/enquiries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          if (enqFeedback) {
            enqFeedback.className = "form-feedback success";
            enqFeedback.textContent = `✓ ${data.message}`;
            enqFeedback.style.display = "block";
          }
          enquiryForm.reset();
        } else {
          throw new Error(data.error || "Failed to send enquiry");
        }
      } catch (err) {
        if (enqFeedback) {
          enqFeedback.className = "form-feedback error";
          enqFeedback.textContent = `⚠️ Error: ${err.message}`;
          enqFeedback.style.display = "block";
        }
      } finally {
        enqSubmitBtn.disabled = false;
        enqSubmitBtn.textContent = originalText;
      }
    });
  }

  // Initialize
  document.addEventListener("DOMContentLoaded", () => {
    loadCollegeContent();
    renderPhotoMosaic();
  });
})();