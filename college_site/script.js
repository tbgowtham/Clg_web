// Sri Devi Arts and Science College - Public Portal Logic
(function () {
  // Mobile Navigation
  const menuButton = document.querySelector(".menu");
  const navigation = document.querySelector(".nav-links");
  if (menuButton && navigation) {
    menuButton.addEventListener("click", () => navigation.classList.toggle("open"));
    navigation.querySelectorAll("a").forEach((link) =>
      link.addEventListener("click", () => navigation.classList.remove("open"))
    );
  }

  // Default Campus Photos Fallback
  let campusPhotos = [
    ["photo/IMG20260228131225.jpg", "Awards and achievement"],
    ["photo/IMG_20260227_142615_304.jpg", "A proud campus moment"],
    ["photo/IMG_20260701_104825_496.jpg", "Campus life"],
    ["photo/IMG_20260701_104949.jpg", "Student recognition"],
    ["photo/IMG_20260701_110148.jpg", "Performance and spirit"],
    ["photo/IMG_20260701_132844.jpg", "Sri Devi auditorium"],
    ["photo/IMG_20260701_133523_953.jpg", "Together on campus"],
    ["photo/IMG_20260723_150208_229.jpg", "Learning beyond class"],
  ];

  let featuredPhoto = -1;
  let mosaicTimer = null;
  const photoMosaic = document.querySelector("#photoMosaic");

  function resolvePath(src) {
    if (!src) return "";
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    if (src.startsWith("/")) return src;
    return "/" + src;
  }

  // Photo Mosaic Rendering
  function renderPhotoMosaic() {
    if (!photoMosaic) return;
    const rowSize = window.innerWidth < 600 ? 3 : 5;
    photoMosaic.innerHTML = Array.from(
      { length: Math.ceil(campusPhotos.length / rowSize) },
      (_, rowIndex) => `
        <div class="photo-mosaic-row">
          ${campusPhotos
            .slice(rowIndex * rowSize, (rowIndex + 1) * rowSize)
            .map(([src, label], photoIndex) => {
              const globalIndex = rowIndex * rowSize + photoIndex;
              const resolvedSrc = resolvePath(src);
              return `
                <button class="photo-mosaic-tile" type="button" data-photo-index="${globalIndex}" aria-label="View ${escapeHtml(label)}">
                  <img src="${resolvedSrc}" alt="${escapeHtml(label)}" loading="lazy" />
                  <span class="photo-mosaic-label">${escapeHtml(label)}</span>
                </button>`;
            })
            .join("")}
        </div>`,
    ).join("");

    // Attach click listeners for lightbox
    photoMosaic.querySelectorAll(".photo-mosaic-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        const idx = parseInt(tile.getAttribute("data-photo-index"), 10);
        if (campusPhotos[idx]) {
          openLightbox(campusPhotos[idx][0], campusPhotos[idx][1]);
        }
      });
    });

    resizePhotoMosaic();
  }

  function resizePhotoMosaic() {
    if (!photoMosaic) return;
    const photos = [...photoMosaic.querySelectorAll(".photo-mosaic-tile")];
    if (!photos.length) return;
    let nextFeatured = Math.floor(Math.random() * photos.length);
    while (photos.length > 1 && nextFeatured === featuredPhoto) {
      nextFeatured = Math.floor(Math.random() * photos.length);
    }
    featuredPhoto = nextFeatured;
    photos.forEach((photo, index) => {
      const isFeatured = index === featuredPhoto;
      photo.classList.toggle("featured", isFeatured);
      photo.style.setProperty("--grow", isFeatured ? "2.8" : "1");
      photo.style.zIndex = isFeatured ? "1" : "0";
    });
    photoMosaic.querySelectorAll(".photo-mosaic-row").forEach((row) => {
      row.style.setProperty(
        "--row-grow",
        row.contains(photos[featuredPhoto]) ? "1.35" : "1",
      );
    });
  }

  // Lightbox Modal
  const lightboxModal = document.getElementById("siteLightboxModal");
  const lightboxImg = document.getElementById("siteLightboxImg");
  const lightboxCaption = document.getElementById("siteLightboxCaption");
  const lightboxClose = document.getElementById("siteLightboxClose");

  function openLightbox(src, caption) {
    if (!lightboxModal) return;
    lightboxImg.src = resolvePath(src);
    lightboxCaption.textContent = caption || "Campus Moment";
    lightboxModal.classList.remove("hidden");
    lightboxModal.setAttribute("aria-hidden", "false");
  }

  function closeLightbox() {
    if (!lightboxModal) return;
    lightboxModal.classList.add("hidden");
    lightboxModal.setAttribute("aria-hidden", "true");
  }

  if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
  if (lightboxModal) {
    lightboxModal.addEventListener("click", (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });

  // Dynamic Content Loader from CMS
  async function loadCollegeContent() {
    try {
      const res = await fetch("/api/content");
      if (!res.ok) throw new Error("API not reachable");
      const content = await res.json();
      localStorage.setItem("sridevi_public_content", JSON.stringify(content));
      applyContent(content);
    } catch (e) {
      const cached = localStorage.getItem("sridevi_public_content");
      if (cached) {
        try {
          applyContent(JSON.parse(cached));
        } catch (err) {}
      }
    }
  }

  function applyContent(data) {
    if (!data) return;

    // Utility
    if (data.utility && data.utility.announcement) {
      setElText("#utilityAnnouncement", data.utility.announcement);
    }

    // Hero
    if (data.hero) {
      if (data.hero.eyebrow) setElText("#heroEyebrow", data.hero.eyebrow);
      if (data.hero.title) setElText("#heroTitle", data.hero.title);
      if (data.hero.copy) setElText("#heroCopy", data.hero.copy);
      if (data.hero.btn1Text) setElText("#heroBtn1", data.hero.btn1Text);
      if (data.hero.btn1Link) setElAttr("#heroBtn1", "href", data.hero.btn1Link);
      if (data.hero.btn2Text) setElText("#heroBtn2", data.hero.btn2Text);
      if (data.hero.btn2Link) setElAttr("#heroBtn2", "href", data.hero.btn2Link);
    }

    // About
    if (data.about) {
      if (data.about.eyebrow) setElText("#aboutEyebrow", data.about.eyebrow);
      if (data.about.title) setElText("#aboutTitle", data.about.title);
      if (data.about.p1) setElText("#aboutP1", data.about.p1);
      if (data.about.p2) setElText("#aboutP2", data.about.p2);
    }

    // Stats
    if (Array.isArray(data.stats) && data.stats.length) {
      const statsContainer = document.getElementById("statsContainer");
      if (statsContainer) {
        statsContainer.innerHTML = data.stats
          .map(
            (s) => `
            <div class="stat">
              <strong>${escapeHtml(s.value)}</strong>
              <span>${escapeHtml(s.label)}</span>
            </div>`,
          )
          .join("");
      }
    }

    // Programmes
    if (Array.isArray(data.programmes) && data.programmes.length) {
      const progsContainer = document.getElementById("programmesContainer");
      if (progsContainer) {
        progsContainer.innerHTML = data.programmes
          .map(
            (p) => `
            <article class="programme">
              <span class="programme-number">${escapeHtml(p.number)}</span>
              <h3>${escapeHtml(p.title)}</h3>
              <p>${escapeHtml(p.desc)}</p>
              <a href="${escapeHtml(p.link || '#contact')}">View programme&nbsp; →</a>
            </article>`,
          )
          .join("");
      }
    }

    // Bulletin Notices
    if (Array.isArray(data.notices) && data.notices.length) {
      const noticesContainer = document.getElementById("noticesContainer");
      if (noticesContainer) {
        noticesContainer.innerHTML = data.notices
          .map(
            (n) => `
            <div class="notice">
              <time><b>${escapeHtml(n.day)}</b>${escapeHtml(n.month)}</time>
              <a href="${escapeHtml(n.link || '#contact')}">${escapeHtml(n.title)}</a>
            </div>`,
          )
          .join("");
      }
    }

    // Campus Photos
    if (Array.isArray(data.photos) && data.photos.length) {
      campusPhotos = data.photos.map((p) => [p.src, p.label]);
      renderPhotoMosaic();
    }

    // Contact
    if (data.contact) {
      if (data.contact.tagline) setElText("#footerTagline", data.contact.tagline);
      if (data.contact.address) {
        const addrEl = document.getElementById("footerAddress");
        if (addrEl) addrEl.innerHTML = escapeHtml(data.contact.address).replace(/\n/g, "<br />");
      }
      if (data.contact.phone || data.contact.email) {
        const contactEl = document.getElementById("footerContactInfo");
        if (contactEl) {
          contactEl.innerHTML = `${escapeHtml(data.contact.phone || "")}<br />${escapeHtml(
            data.contact.email || "",
          )}<br />${escapeHtml(data.contact.hours || "Mon–Fri, 9:00–17:00")}`;
        }
      }
      if (data.contact.copyright) setElText("#footerCopyright", data.contact.copyright);
    }
  }

  function setElText(sel, text) {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  }

  function setElAttr(sel, attr, val) {
    const el = document.querySelector(sel);
    if (el) el.setAttribute(attr, val);
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

  // Initial load
  renderPhotoMosaic();
  mosaicTimer = window.setInterval(resizePhotoMosaic, 4200);
  loadCollegeContent();
})();