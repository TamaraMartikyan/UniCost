import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/index.css";
import { LangProvider } from "./lib/LangContext";

createRoot(document.getElementById("root")!).render(
    <LangProvider>
        <App />
    </LangProvider>
);