import "./styles.css";
import { renderAppShell } from "./components/appShell";

const app = document.getElementById("app")!;
app.innerHTML = renderAppShell();

import("./galleryApp").catch((error) => {
  console.error("Errore caricamento galleria:", error);
});
