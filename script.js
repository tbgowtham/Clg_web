  const menuButton = document.querySelector(".menu");
      const navigation = document.querySelector(".nav-links");
      menuButton.addEventListener("click", () =>
        navigation.classList.toggle("open"),
      );
      navigation
        .querySelectorAll("a")
        .forEach((link) =>
          link.addEventListener("click", () =>
            navigation.classList.remove("open"),
          ),
        );

      const photoMosaic = document.querySelector("#photoMosaic");
      const campusPhotos = [
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

      function renderPhotoMosaic() {
        const rowSize = window.innerWidth < 600 ? 3 : 5;
        photoMosaic.innerHTML = Array.from(
          { length: Math.ceil(campusPhotos.length / rowSize) },
          (_, rowIndex) => `
            <div class="photo-mosaic-row">
              ${campusPhotos
                .slice(rowIndex * rowSize, (rowIndex + 1) * rowSize)
                .map(
                  ([src, label], photoIndex) => `
                    <button class="photo-mosaic-tile" type="button" data-photo-index="${rowIndex * rowSize + photoIndex}" aria-label="View ${label}">
                      <img src="${src}" alt="${label}" loading="lazy" />
                      <span class="photo-mosaic-label">${label}</span>
                    </button>`,
                )
                .join("")}
            </div>`,
        ).join("");
        resizePhotoMosaic();
      }

      function resizePhotoMosaic() {
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
          row.style.setProperty("--row-grow", row.contains(photos[featuredPhoto]) ? "1.35" : "1");
        });
      }

      renderPhotoMosaic();
      window.setInterval(resizePhotoMosaic, 4200);