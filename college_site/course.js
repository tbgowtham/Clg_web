// Sridevi Arts and Science College — Course Full Page Template Logic
(function () {
  "use strict";

  // Global State
  let currentCourse = null;
  let allProgrammes = [];
  let allPhotos = [];
  let currentActiveSemesterIndex = 0;

  // Helper functions
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

  // Get requested Course ID from URL parameters or Path
  function getRequestedCourseId() {
    const params = new URLSearchParams(window.location.search);
    const qId = params.get("id") || params.get("course") || params.get("code") || params.get("prog");
    if (qId) return qId.trim();

    // Check path /course/<id>
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2 && pathParts[0] === "course") {
      const p = pathParts[1].replace(".html", "");
      if (p) return p.trim();
    }

    return "prog-1"; // Default to B.Com (General)
  }

  // Smart Course Knowledge Generator for any newly created course
  function enrichCourseWithSmartDefaults(c) {
    const title = (c.title || "").toLowerCase();
    const dept = (c.department || "").toLowerCase();
    const cat = (c.category || "").toLowerCase();
    const isPG = cat.includes("postgraduate") || title.includes("m.a") || title.includes("m.sc") || title.includes("m.com") || (c.duration || "").includes("2 Year");
    const isCS = cat.includes("computer") || dept.includes("computer") || title.includes("bca") || title.includes("computer");
    const isAI = title.includes("ai") || title.includes("artificial intelligence");
    const isComm = cat.includes("commerce") || dept.includes("commerce") || title.includes("b.com");
    const isMgmt = cat.includes("management") || title.includes("bba") || dept.includes("business");
    const isArts = cat.includes("arts") || title.includes("b.a") || dept.includes("english") || dept.includes("tamil");

    // Default Degree Level
    const degree_level = c.degree_level || (isPG ? "Postgraduate (PG)" : "Undergraduate (UG)");

    // Default Eligibility
    let eligibility = c.eligibility;
    if (!eligibility) {
      if (isPG) {
        eligibility = `Bachelor's Degree in the relevant or allied discipline from the University of Madras or any recognized university with minimum passing marks.`;
      } else if (isCS || isAI) {
        eligibility = `Pass in Higher Secondary (+2) Examination conducted by the Government of Tamil Nadu with Mathematics / Computer Science / Statistics or equivalent.`;
      } else if (isComm) {
        eligibility = `Pass in Higher Secondary (+2) Examination with Commerce, Accountancy, and Mathematics or Economics or equivalent.`;
      } else if (isMgmt) {
        eligibility = `Pass in Higher Secondary (+2) Examination in any stream (Science, Commerce, or Humanities) from a recognized Board.`;
      } else {
        eligibility = `Pass in Higher Secondary (+2) Examination conducted by the Government of Tamil Nadu or equivalent recognized board examination.`;
      }
    }

    // Default Overview
    const overview = c.overview || c.desc || `The ${c.title} programme at Sridevi Arts and Science College is designed in affiliation with the historic University of Madras. With experienced faculty mentors, contemporary laboratories, and continuous placement preparation, the curriculum empowers students with analytical rigor and industry-aligned competence for purposeful career trajectories.`;

    // Default Highlights
    const highlights = (c.highlights && c.highlights.length) ? c.highlights : [
      "Rigorous University of Madras accredited curriculum updated with latest academic benchmarks.",
      "Hands-on practical training in specialized department laboratories and modern computing centers.",
      "Student clubs, department seminars, industry guest lectures, and inter-collegiate symposiums.",
      "100% pre-placement coaching in quantitative aptitude, soft skills, and corporate interview readiness.",
      "Eligible for Tamil Nadu Postmatric SC/ST government scholarships and institutional merit fee concessions."
    ];

    // Default Syllabus Breakdown
    let syllabus = c.syllabus;
    if (!syllabus || !syllabus.length) {
      if (isPG) {
        syllabus = [
          {
            semester: "Semester I",
            subjects: [
              `Advanced Foundations in ${c.title} - Core I`,
              `Research Methodologies & Analysis`,
              `Specialized Core Discipline - Paper II`,
              `Elective Specialization Course I`,
              `Soft Skills & Academic Writing`
            ]
          },
          {
            semester: "Semester II",
            subjects: [
              `Theoretical Frameworks & Advanced Principles`,
              `Domain Application & Applied Studies`,
              `Interdisciplinary Elective Paper`,
              `Department Practical & Seminar Work`,
              `Human Rights & Values`
            ]
          },
          {
            semester: "Semester III",
            subjects: [
              `Contemporary Developments & Current Issues`,
              `Advanced Statistical or Quantitative Tools`,
              `Specialization Paper II`,
              `Internship Training / Field Study Report`,
              `Project Proposal & Preliminary Defense`
            ]
          },
          {
            semester: "Semester IV",
            subjects: [
              `Strategic Domain Perspectives`,
              `Master's Research Dissertation Work`,
              `Comprehensive Viva Voce Examination`,
              `Professional Ethics & Publication Seminar`
            ]
          }
        ];
      } else {
        syllabus = [
          {
            semester: "Semester I",
            subjects: [
              `Core Foundations of ${c.title} - Part I`,
              `Allied Course I & Analytical Methods`,
              `Foundation Language (Tamil / Hindi)`,
              `Communicative English & Grammar`,
              `Practical Laboratory / Workshop Session`
            ]
          },
          {
            semester: "Semester II",
            subjects: [
              `Core Principles of ${c.title} - Part II`,
              `Allied Course II & Quantitative Techniques`,
              `Foundation Language - Part II`,
              `General English for Professional Careers`,
              `Value Education & Environmental Awareness`
            ]
          },
          {
            semester: "Semester III",
            subjects: [
              `Intermediate Core Course - Part III`,
              `Applied Principles & Case Studies`,
              `Allied Specialized Discipline Paper`,
              `Department Practical Lab / Project Phase I`,
              `Soft Skills & Personality Development`
            ]
          },
          {
            semester: "Semester IV",
            subjects: [
              `Advanced Subject Modules - Part IV`,
              `Regulatory Frameworks & Industry Applications`,
              `Skill-Based Elective Paper I`,
              `Practical Laboratory / Field Study`,
              `Environmental Studies & Sustainability`
            ]
          },
          {
            semester: "Semester V",
            subjects: [
              `Specialized Elective Concentration I`,
              `Advanced Core Course - Part V`,
              `Skill-Based Elective Paper II`,
              `Mini-Project & Case Presentation`,
              `Pre-Placement Technical Bootcamp`
            ]
          },
          {
            semester: "Semester VI",
            subjects: [
              `Contemporary Trends & Modern Applications`,
              `Specialized Elective Concentration II`,
              `Entrepreneurship & Professional Ethics`,
              `Major Capstone Project Work`,
              `Comprehensive Project Viva Voce`
            ]
          }
        ];
      }
    }

    // Default Career Prospects
    let career_prospects = c.career_prospects;
    if (!career_prospects || !career_prospects.length) {
      if (isCS || isAI) {
        career_prospects = [
          "Software Development Engineer (SDE)",
          "Data Analyst & Visualization Associate",
          "Web Engineer & Cloud Trainee",
          "Systems Analyst & Technical Support",
          "IT Consultant in Corporate Hubs"
        ];
      } else if (isComm || isMgmt) {
        career_prospects = [
          "Financial & Business Analyst",
          "Corporate Operations Executive",
          "Taxation & Audit Associate",
          "Banking & Relationship Manager",
          "Enterprise Team Lead & Entrepreneur"
        ];
      } else {
        career_prospects = [
          "Professional Associate in Corporate & Public Sectors",
          "Content Specialist & Media Associate",
          "Civil Services & State PSC Officer",
          "Educational Trainer & Language Consultant",
          "Higher Studies & Academic Research Fellow"
        ];
      }
    }

    // Default Higher Studies
    let higher_studies = c.higher_studies;
    if (!higher_studies || !higher_studies.length) {
      higher_studies = isPG
        ? ["Ph.D Research Fellowship", "UGC-NET / SET Lectureship", "Post-Doctoral Studies"]
        : ["Master's Degree (M.Sc / M.Com / M.A / MCA)", "Master of Business Administration (MBA)", "Professional Certifications & Public Examinations"];
    }

    // Default Facilities
    let facilities = c.facilities;
    if (!facilities || !facilities.length) {
      facilities = [
        "Advanced Department Computing & Learning Lab equipped with modern workstations.",
        "Department Reference Section in Central Library with books, journals, and e-resources.",
        "Smart Classrooms with multimedia audio-visual lecture presentation tools.",
        "Central Placement & Employability Suites with interview chambers."
      ];
    }

    return {
      ...c,
      degree_level,
      eligibility,
      overview,
      highlights,
      syllabus,
      career_prospects,
      higher_studies,
      facilities,
      affiliation: c.affiliation || "Affiliated to University of Madras",
      medium: c.medium || "English & Tamil Mentoring",
      duration_detail: c.duration_detail || c.duration || (isPG ? "2 Years (4 Semesters)" : "3 Years (6 Semesters)"),
      slug: c.slug || c.id || "course"
    };
  }

  // Load Content from Backend API
  async function loadCoursePageData() {
    const courseId = getRequestedCourseId();

    try {
      // Fetch dynamic content from server
      const res = await fetch("/api/content");
      if (res.ok) {
        const data = await res.json();
        allProgrammes = data.programmes || [];
        allPhotos = data.photos || [];
      }
    } catch (err) {
      console.warn("Backend API not reachable, running with client-side fallback:", err);
    }

    // Find requested course
    let match = allProgrammes.find(
      (p) =>
        (p.id && p.id.toLowerCase() === courseId.toLowerCase()) ||
        (p.slug && p.slug.toLowerCase() === courseId.toLowerCase())
    );

    if (!match) {
      // Partial matching by title
      const norm = courseId.toLowerCase().replace(/[-_]/g, " ");
      match = allProgrammes.find((p) => (p.title || "").toLowerCase().includes(norm));
    }

    if (!match && allProgrammes.length > 0) {
      match = allProgrammes[0]; // Fallback to first course
    }

    if (match) {
      currentCourse = enrichCourseWithSmartDefaults(match);
    }

    renderFullCoursePage();
  }

  // Render Full Page Template
  function renderFullCoursePage() {
    if (!currentCourse) return;

    // 1. Page Title & Meta Tags
    document.title = `${currentCourse.title} — Course Details & Syllabus | Sridevi Arts & Science College, Ponneri`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.content = `${currentCourse.title} at Sridevi Arts and Science College, Ponneri. ${currentCourse.department}. Affiliated to University of Madras. Full syllabus, eligibility, career prospects, and admission details.`;
    }

    // 2. Breadcrumbs
    const bcCurrent = document.getElementById("bcCourseTitle");
    if (bcCurrent) bcCurrent.textContent = currentCourse.title;

    // 3. Hero Badges & Texts
    const heroBadge = document.getElementById("courseHeroBadge");
    if (heroBadge) heroBadge.textContent = currentCourse.number || `${(currentCourse.category || "DEGREE").toUpperCase()}`;

    const heroUniv = document.getElementById("courseHeroUniv");
    if (heroUniv) heroUniv.textContent = currentCourse.affiliation || "Affiliated to University of Madras";

    const heroTitle = document.getElementById("courseHeroTitle");
    if (heroTitle) heroTitle.textContent = currentCourse.title;

    const heroDept = document.getElementById("courseHeroDept");
    if (heroDept) heroDept.textContent = currentCourse.department || "Sridevi Arts & Science College";

    const heroDesc = document.getElementById("courseHeroDesc");
    if (heroDesc) heroDesc.textContent = currentCourse.overview || currentCourse.desc || "";

    // 4. Hero Right Card
    const heroCardImg = document.getElementById("heroCardImg");
    if (heroCardImg) {
      heroCardImg.src = resolvePath(currentCourse.image || "assets/sdasc/departments/112226_1625242329.jpeg");
      heroCardImg.alt = currentCourse.title;
    }

    const heroCardBadge = document.getElementById("heroCardBadge");
    if (heroCardBadge) heroCardBadge.textContent = currentCourse.duration_detail || currentCourse.duration || "3 Years (UG)";

    const specDegree = document.getElementById("specDegree");
    if (specDegree) specDegree.textContent = currentCourse.degree_level || "UG Degree";

    const specDuration = document.getElementById("specDuration");
    if (specDuration) specDuration.textContent = currentCourse.duration || "3 Years";

    const specAffil = document.getElementById("specAffiliation");
    if (specAffil) specAffil.textContent = "Univ. of Madras";

    const specMedium = document.getElementById("specMedium");
    if (specMedium) specMedium.textContent = currentCourse.medium || "English / Tamil";

    // 5. Populate Quick Course Switcher Dropdown in Hero
    const switcherSelect = document.getElementById("heroCourseSwitcher");
    if (switcherSelect) {
      switcherSelect.innerHTML = allProgrammes
        .map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === currentCourse.id ? "selected" : ""}>${escapeHtml(p.title)} (${escapeHtml(p.duration || "UG")})</option>`)
        .join("");

      switcherSelect.addEventListener("change", (e) => {
        const selectedId = e.target.value;
        const target = allProgrammes.find((x) => x.id === selectedId);
        if (target) {
          currentCourse = enrichCourseWithSmartDefaults(target);
          history.pushState(null, "", `course.html?id=${encodeURIComponent(target.id)}`);
          renderFullCoursePage();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }

    // 6. Fast Facts 6-Card Grid
    const factDegree = document.getElementById("factDegree");
    if (factDegree) factDegree.textContent = currentCourse.degree_level || "Undergraduate";

    const factDuration = document.getElementById("factDuration");
    if (factDuration) factDuration.textContent = currentCourse.duration_detail || "3 Years (6 Semesters)";

    const factEligShort = document.getElementById("factEligShort");
    if (factEligShort) {
      factEligShort.textContent = (currentCourse.degree_level || "").includes("Postgraduate") ? "Relevant Bachelor's Degree" : "HSC (+2) / 10+2 Passed";
    }

    const factMedium = document.getElementById("factMedium");
    if (factMedium) factMedium.textContent = currentCourse.medium || "English & Tamil Mentoring";

    const factCampus = document.getElementById("factCampus");
    if (factCampus) factCampus.textContent = "Krishnapuram, Ponneri";

    const factScholarship = document.getElementById("factScholarship");
    if (factScholarship) factScholarship.textContent = "TN SC/ST & Merit Waivers";

    // 7. Department Narrative & Checkpoints
    const narrativeTitle = document.getElementById("narrativeTitle");
    if (narrativeTitle) narrativeTitle.textContent = `About the ${currentCourse.department || currentCourse.title}`;

    const narrativeDesc = document.getElementById("narrativeDesc");
    if (narrativeDesc) narrativeDesc.textContent = currentCourse.overview || currentCourse.desc || "";

    const highlightsList = document.getElementById("highlightsList");
    if (highlightsList && currentCourse.highlights) {
      highlightsList.innerHTML = currentCourse.highlights
        .map(
          (h) => `
          <li>
            <span class="highlight-check-icon">✓</span>
            <span>${escapeHtml(h)}</span>
          </li>`
        )
        .join("");
    }

    // 8. Department Sidebar Card
    const sbDeptName = document.getElementById("sbDeptName");
    if (sbDeptName) sbDeptName.textContent = currentCourse.department || "Academic Department";

    const sbDeptProg = document.getElementById("sbDeptProg");
    if (sbDeptProg) sbDeptProg.textContent = `${currentCourse.title} · Madras Univ.`;

    const sbEligibilityText = document.getElementById("sbEligibilityText");
    if (sbEligibilityText) sbEligibilityText.textContent = currentCourse.eligibility || "";

    const sbDegreeVal = document.getElementById("sbDegreeVal");
    if (sbDegreeVal) sbDegreeVal.textContent = currentCourse.degree_level || "UG";

    const sbDurationVal = document.getElementById("sbDurationVal");
    if (sbDurationVal) sbDurationVal.textContent = currentCourse.duration || "3 Years";

    const sbAffilVal = document.getElementById("sbAffilVal");
    if (sbAffilVal) sbAffilVal.textContent = "University of Madras";

    const sbMediumVal = document.getElementById("sbMediumVal");
    if (sbMediumVal) sbMediumVal.textContent = currentCourse.medium || "Bilingual";

    // 9. Interactive Syllabus Section
    renderSyllabusSection();

    // 10. Career Prospects
    renderCareerSection();

    // 11. Department Facilities
    renderFacilitiesSection();

    // 12. Gallery Section (Signature Feature matching college web page!)
    renderCourseGalleryMosaic();

    // 13. Related Academic Programmes
    renderRelatedProgrammes();

    // 14. CTA & Modals Course Sync
    const ctaCourseName = document.getElementById("ctaCourseName");
    if (ctaCourseName) ctaCourseName.textContent = currentCourse.title;

    // Pre-fill modal data-course on apply buttons
    document.querySelectorAll(".btn-open-modal[data-target='applyModal']").forEach((btn) => {
      btn.setAttribute("data-course", currentCourse.title);
    });
  }

  // Syllabus Tabs & Semester Modules Rendering
  function renderSyllabusSection() {
    const tabsContainer = document.getElementById("semesterTabsNav");
    const modulesContainer = document.getElementById("syllabusModulesGrid");
    const syllabus = currentCourse.syllabus || [];

    if (!tabsContainer || !modulesContainer) return;

    if (!syllabus.length) {
      tabsContainer.innerHTML = "";
      modulesContainer.innerHTML = `<p style="color: #64748b; padding: 20px 0;">Curriculum details available at the department office.</p>`;
      return;
    }

    // Clamp active index
    if (currentActiveSemesterIndex >= syllabus.length) currentActiveSemesterIndex = 0;

    // Render Tabs
    tabsContainer.innerHTML = syllabus
      .map(
        (sem, idx) => `
        <button class="sem-tab-btn ${idx === currentActiveSemesterIndex ? "active" : ""}" data-index="${idx}">
          ${escapeHtml(sem.semester || `Term ${idx + 1}`)}
        </button>`
      )
      .join("");

    // Attach Tab Clicks
    tabsContainer.querySelectorAll(".sem-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-index"), 10);
        if (!isNaN(idx)) {
          currentActiveSemesterIndex = idx;
          renderSyllabusSection();
        }
      });
    });

    // Render Active Semester's Subject Cards
    const activeSem = syllabus[currentActiveSemesterIndex] || syllabus[0];
    const subjects = activeSem.subjects || [];

    modulesContainer.innerHTML = subjects
      .map((subj, idx) => {
        const isLab = subj.toLowerCase().includes("lab") || subj.toLowerCase().includes("practical");
        const isProject = subj.toLowerCase().includes("project") || subj.toLowerCase().includes("viva");
        const tag = isLab ? "Practical Lab" : isProject ? "Industry Project" : "Core Theory Paper";

        return `
        <div class="sem-course-card">
          <span class="sem-card-number">Paper ${String(idx + 1).padStart(2, "0")} · ${escapeHtml(activeSem.semester || "")}</span>
          <h4 class="sem-card-title">${escapeHtml(subj)}</h4>
          <span class="sem-card-tag">${tag}</span>
        </div>`;
      })
      .join("");
  }

  // Career Roles & Pathways Rendering
  function renderCareerSection() {
    const cloud = document.getElementById("careerRolesCloud");
    const higherStudiesList = document.getElementById("higherStudiesList");
    const sectorsList = document.getElementById("industrySectorsList");

    if (cloud && currentCourse.career_prospects) {
      cloud.innerHTML = currentCourse.career_prospects
        .map(
          (role) => `
          <div class="career-role-pill">
            <span>★</span> ${escapeHtml(role)}
          </div>`
        )
        .join("");
    }

    if (higherStudiesList && currentCourse.higher_studies) {
      higherStudiesList.innerHTML = currentCourse.higher_studies
        .map((hs) => `<li>${escapeHtml(hs)}</li>`)
        .join("");
    }

    if (sectorsList) {
      const isCS = (currentCourse.category || "").toLowerCase().includes("computer") || (currentCourse.title || "").toLowerCase().includes("bca");
      const isComm = (currentCourse.category || "").toLowerCase().includes("commerce") || (currentCourse.title || "").toLowerCase().includes("b.com");

      const sectors = isCS
        ? [
            "Information Technology (IT) conglomerates & Software Services",
            "Financial Technology (FinTech) & Banking Solutions",
            "Cloud Computing & SaaS Product Enterprises",
            "Data Analytics, AI & Automation Consultancies",
            "Government E-Governance & Digital Missions"
          ]
        : isComm
        ? [
            "Corporate Accounting & Auditing Firms (Big 4 & Regional)",
            "Commercial & Retail Banking Institutions",
            "Stock Broking, Capital Markets & Asset Management",
            "Supply Chain, Logistics & Manufacturing Hubs",
            "Taxation, GST Consultancy & Corporate Law Services"
          ]
        : [
            "Corporate Enterprises & Management Services",
            "Education, Academic Mentoring & School Pedagogy",
            "Public Service Commissions (TNPSC, SSC, UPSC)",
            "Media Houses, Publishing & Content Industries",
            "Non-Governmental Organizations & Social Upliftment"
          ];

      sectorsList.innerHTML = sectors.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
    }
  }

  // Department Facilities Rendering
  function renderFacilitiesSection() {
    const grid = document.getElementById("facilitiesGrid");
    if (!grid) return;

    const facilities = currentCourse.facilities || [];
    const iconList = ["💻", "📚", "🔬", "🎯", "🏛️", "🌐"];

    grid.innerHTML = facilities
      .map(
        (fac, idx) => `
        <div class="facility-card">
          <div class="facility-icon-wrap">${iconList[idx % iconList.length]}</div>
          <h4>Facility ${idx + 1}</h4>
          <p>${escapeHtml(fac)}</p>
        </div>`
      )
      .join("");
  }

  // ==================== GALLERY MOSAIC SECTION (MATCHING COLLEGE WEB PAGE) ====================
  let mosaicMorphTimer = null;
  let isMosaicPaused = false;
  let mosaicActiveIndex = 0;
  const MORPH_INTERVAL = 3600; // 3.6s viewing time

  function stopMosaicMorph() {
    if (mosaicMorphTimer) {
      clearInterval(mosaicMorphTimer);
      mosaicMorphTimer = null;
    }
  }

  function startMosaicMorph() {
    stopMosaicMorph();
    const photoMosaic = document.querySelector("#photoMosaic");
    if (!photoMosaic) return;

    const tiles = Array.from(photoMosaic.querySelectorAll(".photo-mosaic-tile"));
    if (tiles.length <= 1) return;

    mosaicMorphTimer = setInterval(() => {
      if (isMosaicPaused) return;
      const count = tiles.length;
      let nextIndex = Math.floor(Math.random() * count);
      if (nextIndex === mosaicActiveIndex && count > 1) {
        nextIndex = (nextIndex + 1) % count;
      }
      mosaicActiveIndex = nextIndex;
      setGalleryActiveTile(tiles[mosaicActiveIndex]);
    }, MORPH_INTERVAL);
  }

  function setGalleryActiveTile(activeTile) {
    const photoMosaic = document.querySelector("#photoMosaic");
    if (!photoMosaic || !activeTile) return;

    const rows = Array.from(photoMosaic.querySelectorAll(".photo-mosaic-row"));
    const allTiles = Array.from(photoMosaic.querySelectorAll(".photo-mosaic-tile"));
    const activeRow = activeTile.closest(".photo-mosaic-row");

    rows.forEach((r) => {
      if (r === activeRow) {
        r.style.setProperty("--row-h", "340px");
      } else {
        r.style.setProperty("--row-h", "180px");
      }
    });

    allTiles.forEach((tile) => {
      if (tile === activeTile) {
        tile.style.setProperty("--grow", "3.2");
        tile.classList.add("tile-big");
      } else if (tile.closest(".photo-mosaic-row") === activeRow) {
        tile.style.setProperty("--grow", "0.8");
        tile.classList.remove("tile-big");
      } else {
        tile.style.setProperty("--grow", "1");
        tile.classList.remove("tile-big");
      }
    });
  }

  function renderCourseGalleryMosaic() {
    const photoMosaic = document.querySelector("#photoMosaic");
    if (!photoMosaic) return;

    stopMosaicMorph();

    // Default photos if API photos list is empty
    const fallbackPhotos = [
      { src: "photo/IMG20260228131225.jpg", label: "Academic Honors & Student Felicitations" },
      { src: "photo/IMG_20260227_142615_304.jpg", label: "Annual Convocation & Degree Conferral" },
      { src: "photo/IMG_20260701_104825_496.jpg", label: "Vibrant Campus Life & Student Community" },
      { src: "photo/IMG_20260701_104949.jpg", label: "Merit Awards & Scholarship Distribution" },
      { src: "photo/IMG_20260701_110148.jpg", label: "Cultural Festivities & Stage Events" },
      { src: "photo/IMG_20260701_132844.jpg", label: "Sridevi College Central Auditorium" },
      { src: "photo/IMG_20260701_133523_953.jpg", label: "Campus Courtyard & Academic Blocks" },
      { src: "photo/IMG_20260723_150208_229.jpg", label: "Interactive Classroom & Lab Learning" }
    ];

    const displayPhotos = (allPhotos && allPhotos.length) ? allPhotos : fallbackPhotos;
    const rowSize = window.innerWidth < 600 ? 2 : 4;
    const rows = [];

    for (let i = 0; i < displayPhotos.length; i += rowSize) {
      rows.push(displayPhotos.slice(i, i + rowSize));
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
              <button class="photo-mosaic-tile" type="button" data-index="${globalIdx}" aria-label="View ${escapeHtml(item.label || "Campus View")}">
                <img src="${resolved}" alt="${escapeHtml(item.label || "Campus view")}" loading="lazy" />
                <span class="photo-mosaic-label">${escapeHtml(item.label || "Campus Moment")}</span>
              </button>`;
            })
            .join("")}
        </div>`
      )
      .join("");

    photoMosaic.querySelectorAll(".photo-mosaic-tile").forEach((tile) => {
      // Lightbox click
      tile.addEventListener("click", () => {
        const idx = parseInt(tile.getAttribute("data-index"), 10);
        if (displayPhotos[idx]) {
          openLightbox(displayPhotos[idx].src, displayPhotos[idx].label);
        }
      });

      // Hover interaction: immediately activates hovered tile
      tile.addEventListener("mouseenter", () => {
        const idx = parseInt(tile.getAttribute("data-index"), 10);
        if (!isNaN(idx)) mosaicActiveIndex = idx;
        setGalleryActiveTile(tile);
      });
    });

    photoMosaic.addEventListener("mouseenter", () => {
      isMosaicPaused = true;
    });

    photoMosaic.addEventListener("mouseleave", () => {
      isMosaicPaused = false;
    });

    // Initialize first tile active & run auto-morph sequencer
    const firstTile = photoMosaic.querySelector(".photo-mosaic-tile");
    if (firstTile) setGalleryActiveTile(firstTile);
    startMosaicMorph();
  }

  // Lightbox Modal Handlers
  function openLightbox(src, caption) {
    const lightboxModal = document.getElementById("siteLightboxModal");
    const lightboxImg = document.getElementById("siteLightboxImg");
    const lightboxCaption = document.getElementById("siteLightboxCaption");

    if (lightboxModal && lightboxImg) {
      lightboxImg.src = resolvePath(src);
      if (lightboxCaption) lightboxCaption.textContent = caption || "Campus View";
      openModal("siteLightboxModal");
    }
  }

  // Related Programmes Grid Rendering
  function renderRelatedProgrammes() {
    const grid = document.getElementById("relatedProgsGrid");
    if (!grid) return;

    // Filter out current course and show 4 related programmes
    const others = allProgrammes.filter((p) => p.id !== currentCourse.id).slice(0, 4);

    grid.innerHTML = others
      .map(
        (p) => `
        <article class="related-prog-card">
          <div class="related-prog-thumb">
            <img src="${resolvePath(p.image || "assets/sdasc/departments/112226_1625242329.jpeg")}" alt="${escapeHtml(p.title)}" loading="lazy" />
            <span class="related-prog-badge">${escapeHtml(p.duration || "3 Yrs")}</span>
          </div>
          <div class="related-prog-body">
            <span class="related-prog-dept">${escapeHtml(p.department || "Academic Department")}</span>
            <h4 class="related-prog-title">${escapeHtml(p.title)}</h4>
            <p class="related-prog-desc">${escapeHtml(p.desc || "")}</p>
            <a href="course.html?id=${escapeHtml(p.id)}" class="related-prog-btn">View Full Course Page →</a>
          </div>
        </article>`
      )
      .join("");
  }

  // Modal Handlers (Application & Lightbox)
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      isMosaicPaused = true;
    }
  }

  function closeModal(modal) {
    if (typeof modal === "string") modal = document.getElementById(modal);
    if (modal) {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      isMosaicPaused = false;
    }
  }

  // Populate Application Modal Course Dropdown
  function populateApplicationDropdown() {
    const courseSelect = document.getElementById("appCourse");
    if (!courseSelect) return;

    courseSelect.innerHTML = `<option value="" disabled>Select an academic programme</option>` +
      allProgrammes
        .map((p) => `<option value="${escapeHtml(p.title)}" ${p.id === currentCourse?.id ? "selected" : ""}>${escapeHtml(p.title)}</option>`)
        .join("");
  }

  // Setup Global Events & Listeners
  function setupEventListeners() {
    // Mobile navigation toggle
    const menuToggle = document.querySelector(".menu-toggle");
    const navLinks = document.querySelector(".nav-links");
    if (menuToggle && navLinks) {
      menuToggle.addEventListener("click", () => {
        navLinks.classList.toggle("open");
      });
      navLinks.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => navLinks.classList.remove("open"));
      });
    }

    // Modal Open Buttons (.btn-open-modal)
    document.addEventListener("click", (e) => {
      const openBtn = e.target.closest(".btn-open-modal");
      if (openBtn) {
        e.preventDefault();
        const targetId = openBtn.getAttribute("data-target");
        if (targetId) {
          populateApplicationDropdown();
          openModal(targetId);
        }
      }

      // Modal Close Buttons
      const closeBtn = e.target.closest(".btn-close-modal, .site-modal-close");
      if (closeBtn) {
        e.preventDefault();
        const modal = closeBtn.closest(".site-modal");
        if (modal) closeModal(modal);
      }
    });

    // Close on backdrop click
    document.querySelectorAll(".site-modal").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });

    // ESC to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".site-modal:not(.hidden)").forEach(closeModal);
      }
    });

    // Print / Download Syllabus Button
    const btnDownload = document.getElementById("btnDownloadSyllabus");
    if (btnDownload) {
      btnDownload.addEventListener("click", (e) => {
        e.preventDefault();
        window.print();
      });
    }

    // Online Application Form Submission
    const appForm = document.getElementById("onlineAdmissionForm");
    if (appForm) {
      appForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = appForm.querySelector("button[type='submit']");
        const originalText = submitBtn ? submitBtn.textContent : "Submit";
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Submitting Application...";
        }

        const formData = {
          courseType: document.getElementById("appCourseType")?.value || "UG",
          course: document.getElementById("appCourse")?.value || currentCourse?.title || "B.Com",
          name: document.getElementById("appName")?.value?.trim() || "",
          dob: document.getElementById("appDob")?.value || "",
          gender: document.getElementById("appGender")?.value || "Male",
          community: document.getElementById("appCommunity")?.value || "General",
          fatherName: document.getElementById("appFather")?.value?.trim() || "",
          mobile: document.getElementById("appMobile")?.value?.trim() || "",
          email: document.getElementById("appEmail")?.value?.trim() || "",
          address: document.getElementById("appAddress")?.value?.trim() || "",
          qualifyingExam: document.getElementById("appExam")?.value || "HSC / +2",
          percentageMarks: document.getElementById("appPercentage")?.value || "",
          busRequired: document.getElementById("appBus")?.value || "No",
          remarks: "Applied from dedicated course full page"
        };

        try {
          const res = await fetch("/api/admission/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
          });
          const result = await res.json();

          if (res.ok && result.success) {
            alert(`🎉 Application Submitted Successfully!\nApplication Number: ${result.application?.appNo || "SDASC-2026"}\nWe will contact you shortly.`);
            appForm.reset();
            closeModal("applyModal");
          } else {
            alert(result.error || "Submission failed. Please check your contact number and try again.");
          }
        } catch (err) {
          alert("Could not connect to admission server. Please call our admission desk: +91 9443689578.");
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
          }
        }
      });
    }

    // Handle browser back/forward buttons
    window.addEventListener("popstate", () => {
      loadCoursePageData();
    });

    // Window resize for mosaic grid
    let lastRowSize = window.innerWidth < 600 ? 2 : 4;
    window.addEventListener("resize", () => {
      const newRowSize = window.innerWidth < 600 ? 2 : 4;
      if (newRowSize !== lastRowSize) {
        lastRowSize = newRowSize;
        renderCourseGalleryMosaic();
      }
    });
  }

  // Initialize on DOM load
  document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    loadCoursePageData();
  });
})();
