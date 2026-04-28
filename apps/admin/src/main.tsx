import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
