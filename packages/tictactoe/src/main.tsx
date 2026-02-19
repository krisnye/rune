import { createRoot } from "react-dom/client";
import { Container, Graphics, Text } from "pixi.js";
import { extend } from "@pixi/react";
import { App } from "./App.js";

extend({ Container, Graphics, Text });

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
