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
